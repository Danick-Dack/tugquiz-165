#!/usr/bin/env bash
# Установка и обновление TugQuiz на Ubuntu/Debian-сервере. Запуск из папки проекта (обычно /opt/tugquiz):
#   sudo bash deploy/install.sh [домен]
# Без домена берётся адрес вида 1-2-3-4.sslip.io: он сам указывает на IP сервера, регистрировать ничего не нужно.
# Ставит Node.js 22 и службу systemd. HTTPS: если на сервере уже работает nginx, встраивается в него (другие сайты
# не трогаются) и берёт сертификат через certbot; иначе ставит Caddy. Повторный запуск = обновление;
# данные (база, загрузки) лежат отдельно в /var/lib/tugquiz и не трогаются.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR=/var/lib/tugquiz

if [ "$(id -u)" -ne 0 ]; then echo "Запустите через sudo"; exit 1; fi
if ! command -v apt-get >/dev/null; then echo "Нужен Ubuntu или Debian (apt-get не найден)"; exit 1; fi
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

echo "== Пакеты"
# Чужой репозиторий на сервере может сменить название — это не повод прерывать установку.
apt-get update -y --allow-releaseinfo-change-label || apt-get update -y || echo "apt-get update с ошибкой — продолжаю с имеющимися списками пакетов"
apt-get install -y curl ca-certificates gnupg

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  IP4="$(curl -4fsS --max-time 10 https://api.ipify.org || true)"
  [ -n "$IP4" ] || { echo "Не удалось узнать IPv4 сервера. Укажите домен: sudo bash deploy/install.sh мой.домен"; exit 1; }
  DOMAIN="${IP4//./-}.sslip.io"
fi

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  echo "== Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Кто держит порты 80/443: nginx (встроимся в него), Caddy (наш прежний) или кто-то чужой (остановка с пояснением).
LISTEN="$(ss -ltnp 2>/dev/null | awk '$4 ~ /:(80|443)$/' || true)"
if echo "$LISTEN" | grep -q nginx; then MODE=nginx
elif [ -z "$(echo "$LISTEN" | grep -v caddy || true)" ]; then MODE=caddy
else
  echo "Порты 80/443 заняты программой, с которой установка не умеет работать:"; echo "$LISTEN"
  echo "Если это apache, настройте обратный прокси на порт приложения вручную или освободите порты."; exit 1
fi
echo "== HTTPS через: $MODE"

# Свободный локальный порт для приложения (на сервере могут быть другие службы).
PORT=""
for p in $(seq 8080 8120); do
  if ! ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$p$"; then PORT=$p; break; fi
  # порт занят, но это наша же служба при обновлении
  if systemctl is-active --quiet tugquiz 2>/dev/null && grep -q "PORT=$p " /etc/systemd/system/tugquiz.service 2>/dev/null; then PORT=$p; break; fi
done
[ -n "$PORT" ] || { echo "Не нашёл свободный порт в диапазоне 8080-8120"; exit 1; }

echo "== Приложение (порт $PORT)"
id tugquiz >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin tugquiz
mkdir -p "$DATA_DIR"
chown -R tugquiz:tugquiz "$DATA_DIR"
# База (хеши паролей, ключ ИИ) — только для службы: другие программы и сайты на сервере её не прочитают.
chmod 700 "$DATA_DIR"
find "$DATA_DIR" -maxdepth 1 -type f -name 'tugquiz.db*' -exec chmod 600 {} +
# Код читают все, а менять может только root (служба не перепишет сама себя, даже если её взломают).
chown -R root:root "$APP_DIR"
chmod -R u=rwX,go=rX "$APP_DIR"
cd "$APP_DIR"
npm ci --omit=dev --no-audit --no-fund

cat > /etc/systemd/system/tugquiz.service <<EOF
[Unit]
Description=TugQuiz SL165
After=network.target

[Service]
User=tugquiz
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production PORT=$PORT HOST=127.0.0.1 TQ_DATA=$DATA_DIR
EnvironmentFile=-/etc/tugquiz.env
ExecStart=$(command -v node) server/index.js
Restart=always
RestartSec=3
# Песочница: служба видит только свой код (чтение) и папку данных (запись), без прав root и доступа к чужому.
UMask=0077
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DATA_DIR
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK
CapabilityBoundingSet=
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
MemoryMax=1G
TasksMax=200
LimitNOFILE=8192

[Install]
WantedBy=multi-user.target
EOF
echo "$DOMAIN" > /etc/tugquiz.domain
systemctl daemon-reload
systemctl enable tugquiz >/dev/null 2>&1
systemctl restart tugquiz

echo "== Проверка приложения"
for i in $(seq 1 15); do curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 1; done
curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" || { echo "Сайт не запустился. Логи:"; journalctl -u tugquiz -n 30 --no-pager; exit 1; }

if [ "$MODE" = nginx ]; then
  echo "== nginx + HTTPS (другие сайты не трогаются)"
  apt-get install -y certbot python3-certbot-nginx
  cat > /etc/nginx/sites-available/tugquiz <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name $DOMAIN;
  server_tokens off;
  client_max_body_size 60m;
  client_header_timeout 20s;
  large_client_header_buffers 4 16k;
  limit_conn tq_conn 1500;
  # Вход и регистрация: не больше 30 попыток в минуту с одного адреса (школа за одним Wi-Fi укладывается).
  location ~ ^/api/(login|register|forgot|reset)\$ {
    access_log /var/log/nginx/tugquiz-auth.log;
    limit_req zone=tq_auth burst=30 nodelay;
    limit_req_status 429;
    include snippets/tugquiz-proxy.conf;
  }
  location / {
    include snippets/tugquiz-proxy.conf;
  }
}
EOF
  mkdir -p /etc/nginx/snippets
  # IP клиента nginx пишет сам и затирает то, что прислал клиент: подделать адрес и обойти лимиты нельзя.
  cat > /etc/nginx/snippets/tugquiz-proxy.conf <<EOF
proxy_pass http://127.0.0.1:$PORT;
proxy_http_version 1.1;
proxy_set_header Host \$host;
proxy_set_header X-Real-IP \$remote_addr;
proxy_set_header X-Forwarded-For \$remote_addr;
proxy_set_header X-Forwarded-Proto \$scheme;
proxy_set_header Upgrade \$http_upgrade;
proxy_set_header Connection \$connection_upgrade;
proxy_read_timeout 3600s;
EOF
  cat > /etc/nginx/conf.d/tugquiz-limits.conf <<'EOF'
limit_req_zone $binary_remote_addr zone=tq_auth:10m rate=30r/m;
limit_conn_zone $binary_remote_addr zone=tq_conn:10m;
EOF
  # Переменная для WebSocket: объявляем один раз (если у сервера её ещё нет).
  if ! grep -rqs 'connection_upgrade' /etc/nginx/nginx.conf /etc/nginx/conf.d /etc/nginx/sites-enabled; then
    cat > /etc/nginx/conf.d/tugquiz-ws.conf <<'EOF'
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
EOF
  fi
  ln -sf /etc/nginx/sites-available/tugquiz /etc/nginx/sites-enabled/tugquiz
  nginx -t
  systemctl reload nginx
  if ! certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect; then
    echo "Сертификат получить не удалось. Сайт пока доступен по http://$DOMAIN"
    echo "Проверьте, что $DOMAIN указывает на этот сервер (nslookup $DOMAIN) и порт 80 открыт у хостера."
  fi
  nginx -t && systemctl reload nginx
  echo "== fail2ban: бан адресов, которые продолжают долбить вход после отказов"
  # Отказ 429 значит, что лимит уже исчерпан; кто шлёт сотни таких запросов за 10 минут — бот, его режет файрвол.
  # Порог высокий (600), чтобы школа за одним Wi-Fi не попала под бан. Ботов с тысяч VPN-адресов держат лимиты на аккаунт в самом сайте.
  apt-get install -y fail2ban >/dev/null || true
  if [ -d /etc/fail2ban ]; then
    cat > /etc/fail2ban/filter.d/sl165-auth.conf <<'F2B'
[Definition]
failregex = ^<HOST> \S+ \S+ \[[^\]]+\] "POST /api/(?:login|register|forgot|reset)[^"]*" 429 
ignoreregex =
F2B
    touch /var/log/nginx/tugquiz-auth.log
    cat > /etc/fail2ban/jail.d/tugquiz-auth.conf <<'F2B'
[tugquiz-auth]
enabled  = true
port     = http,https
filter   = sl165-auth
logpath  = /var/log/nginx/tugquiz-auth.log
maxretry = 600
findtime = 600
bantime  = 3600
F2B
    systemctl enable fail2ban >/dev/null 2>&1 || true
    systemctl restart fail2ban || echo "fail2ban не перезапустился — проверьте: sudo fail2ban-client status"
  fi
else
  echo "== Caddy + HTTPS"
  if ! command -v caddy >/dev/null; then
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y
    apt-get install -y caddy
  fi
  cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
  encode gzip
  request_body {
    max_size 60MB
  }
  reverse_proxy 127.0.0.1:$PORT
}
EOF
  if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80,443/tcp; fi
  systemctl enable caddy >/dev/null 2>&1
  systemctl restart caddy
fi

echo
echo "Готово: https://$DOMAIN"
echo "(если сертификат ещё выпускается, подождите минуту)"
echo "Код для регистрации учителей: $(journalctl -u tugquiz -n 50 --no-pager | grep -oE 'SL165-[0-9A-Z]+' | tail -1)"
echo "Первый зарегистрированный на сайте станет администратором."
