#!/usr/bin/env bash
# Установка TugQuiz на чистый Ubuntu/Debian-сервер. Запуск из папки проекта:
#   sudo bash deploy/install.sh sl165quiz.duckdns.org
# Ставит Node.js 22, Caddy (сам получает HTTPS-сертификат), создаёт службу systemd.
set -euo pipefail

DOMAIN="${1:?Укажите домен: sudo bash deploy/install.sh sl165quiz.duckdns.org}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR=/var/lib/tugquiz

if [ "$(id -u)" -ne 0 ]; then echo "Запустите через sudo"; exit 1; fi

echo "== Пакеты"
apt-get update -y
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  echo "== Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  echo "== Caddy"
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "== Приложение"
id tugquiz >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin tugquiz
mkdir -p "$DATA_DIR"
chown -R tugquiz:tugquiz "$DATA_DIR"
cd "$APP_DIR"
npm ci --omit=dev

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
systemctl enable --now tugquiz
systemctl reload caddy || systemctl restart caddy

echo
echo "Готово: https://$DOMAIN"
echo "Код для регистрации учителей: $(journalctl -u tugquiz -n 20 --no-pager | grep -o 'SL165-[0-9]*' | tail -1)"
echo "Первый зарегистрированный на сайте станет администратором."
