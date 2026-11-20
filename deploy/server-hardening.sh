#!/usr/bin/env bash
# Общая защита сервера (весь сервер, не только TugQuiz/NeuroPrep). Запуск: sudo bash deploy/server-hardening.sh
# Безопасно запускать повторно. Вход по паролю в SSH остаётся включённым — так решил владелец сервера.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Запустите через sudo"; exit 1; }

echo "== apt: снова получать обновления безопасности"
# Чужой PPA (ondrej/php) сменил название, и apt перестал обновлять списки пакетов — принимаем смену названия.
DEBIAN_FRONTEND=noninteractive apt-get update -y --allow-releaseinfo-change-label </dev/null >/dev/null && echo "списки пакетов обновлены"

echo "== nginx: только TLS 1.2/1.3, версия nginx не показывается"
sed -i -E 's/^(\s*)ssl_protocols .*/\1ssl_protocols TLSv1.2 TLSv1.3;/' /etc/nginx/nginx.conf
sed -i -E 's/^(\s*)#\s*server_tokens off;/\1server_tokens off;/' /etc/nginx/nginx.conf
nginx -t && systemctl reload nginx

echo "== SSH: меньше попыток на соединение, без проброса X11, быстрый обрыв зависших входов"
cat > /etc/ssh/sshd_config.d/10-hardening.conf <<'EOF'
# Защита SSH (вход по паролю оставлен намеренно — решение владельца сервера).
MaxAuthTries 4
LoginGraceTime 30
X11Forwarding no
PermitEmptyPasswords no
MaxStartups 10:30:60
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
sshd -t && systemctl reload ssh

echo "== fail2ban: SSH-подбор — бан на час, повторные нарушители — на неделю"
DEBIAN_FRONTEND=noninteractive apt-get install -y fail2ban </dev/null >/dev/null
cat > /etc/fail2ban/jail.d/10-hardening.conf <<'EOF'
[sshd]
enabled  = true
maxretry = 5
findtime = 600
bantime  = 3600

# Кого забанили 3 раза за сутки (SSH или подбор входа на сайтах) — бан на неделю на все порты.
[recidive]
enabled  = true
logpath  = /var/log/fail2ban.log
findtime = 86400
bantime  = 604800
maxretry = 3
EOF
systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban
sleep 2
fail2ban-client status
