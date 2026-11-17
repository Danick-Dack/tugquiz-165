#!/usr/bin/env bash
# Установка и обновление TugQuiz на Ubuntu/Debian-сервере. Запуск из папки проекта (обычно /opt/tugquiz):
#   sudo bash deploy/install.sh [домен]
# Без домена берётся адрес вида 1-2-3-4.sslip.io: он сам указывает на IP сервера, регистрировать ничего не нужно.
# Ставит Node.js 22 и Caddy (сам получает HTTPS-сертификат), создаёт службу systemd. Повторный запуск = обновление;
# данные (база, загрузки) лежат отдельно в /var/lib/tugquiz и не трогаются.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR=/var/lib/tugquiz

if [ "$(id -u)" -ne 0 ]; then echo "Запустите через sudo"; exit 1; fi
if ! command -v apt-get >/dev/null; then echo "Нужен Ubuntu или Debian (apt-get не найден)"; exit 1; fi

echo "== Пакеты"
apt-get update -y
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

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

# Порты 80 и 443 нужны Caddy. Если их держит другой веб-сервер, Caddy не запустится.
BUSY="$(ss -ltnp 2>/dev/null | awk '$4 ~ /:(80|443)$/' | grep -v caddy || true)"
if [ -n "$BUSY" ]; then
  echo "Порты 80/443 заняты другой программой:"; echo "$BUSY"
  echo "Остановите её (например: systemctl disable --now nginx apache2) и запустите установку снова."; exit 1
fi

if ! command -v caddy >/dev/null; then
  echo "== Caddy"
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "== Приложение"
id tugquiz >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin tugquiz
mkdir -p "$DATA_DIR"
chown -R tugquiz:tugquiz "$DATA_DIR"
chmod -R a+rX "$APP_DIR"
cd "$APP_DIR"
npm ci --omit=dev --no-audit --no-fund

cat > /etc/systemd/system/tugquiz.service <<EOF
[Unit]
Description=TugQuiz SL165
After=network.target

[Service]
User=tugquiz
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production PORT=8080 HOST=127.0.0.1 TQ_DATA=$DATA_DIR
ExecStart=$(command -v node) server/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
  encode gzip
  request_body {
    max_size 60MB
  }
  reverse_proxy 127.0.0.1:8080
}
EOF

if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80,443/tcp; fi

systemctl daemon-reload
systemctl enable tugquiz caddy >/dev/null 2>&1
systemctl restart tugquiz
systemctl restart caddy

echo "== Проверка"
for i in $(seq 1 15); do curl -fsS -o /dev/null http://127.0.0.1:8080/ && break; sleep 1; done
curl -fsS -o /dev/null http://127.0.0.1:8080/ || { echo "Сайт не запустился. Логи:"; journalctl -u tugquiz -n 30 --no-pager; exit 1; }

echo
echo "Готово: https://$DOMAIN"
echo "(первое открытие может занять до минуты, пока Caddy получает HTTPS-сертификат)"
echo "Код для регистрации учителей: $(journalctl -u tugquiz -n 50 --no-pager | grep -o 'SL165-[0-9]*' | tail -1)"
echo "Первый зарегистрированный на сайте станет администратором."
