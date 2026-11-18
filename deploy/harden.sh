#!/usr/bin/env bash
# Защита сервера и резервные копии TugQuiz. Безопасно для других служб на сервере: ничего не отключает и не удаляет.
#   sudo bash harden.sh [--ssh-keys-only]
# Что делает:
#  1. fail2ban: блокирует адреса, которые подбирают пароль SSH.
#  2. ufw: закрывает всё входящее, кроме портов, которые УЖЕ слушаются снаружи (то есть работа других служб не меняется),
#     плюс 22/80/443. Для SSH включён лимит частоты подключений.
#  3. Ежедневная резервная копия базы и загрузок в /var/backups/tugquiz (хранится 14 дней), команда tugquiz-backup.
#  4. С флагом --ssh-keys-only: вход по SSH только по ключу, с автооткатом через 4 минуты, если вход по ключу не подтверждён.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Запустите через sudo"; exit 1; }
OWNER="${SUDO_USER:-root}"
KEYS_ONLY=0; [ "${1:-}" = "--ssh-keys-only" ] && KEYS_ONLY=1
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

echo "== Пакеты"
apt-get update -y
apt-get install -y fail2ban ufw unattended-upgrades

echo "== fail2ban"
cat > /etc/fail2ban/jail.d/tugquiz.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban

echo "== Резервные копии"
echo "$OWNER" > /etc/tugquiz.backup-owner
cat > /usr/local/bin/tugquiz-backup <<'EOF'
#!/usr/bin/env bash
# Резервная копия TugQuiz: целостная копия базы (SQLite VACUUM INTO) и загрузки. Хранится 14 дней.
set -euo pipefail
D=/var/lib/tugquiz; B=/var/backups/tugquiz; OWNER="$(cat /etc/tugquiz.backup-owner 2>/dev/null || echo root)"
OUT="$B/$(date +%Y-%m-%d_%H%M%S)"
umask 077; mkdir -p "$OUT"
# Базу читает её владелец (tugquiz), чтобы root не создал рядом свои файлы -wal/-shm и не сломал службу.
DBOWNER="$(stat -c %U "$D/tugquiz.db")"
TMP="$(mktemp -d)"; chown "$DBOWNER" "$TMP"; trap 'rm -rf "$TMP"' EXIT
runuser -u "$DBOWNER" -- env NODE_NO_WARNINGS=1 DB="$D/tugquiz.db" OUTDB="$TMP/tugquiz.db" node -e "
const { DatabaseSync } = require('node:sqlite');
new DatabaseSync(process.env.DB).exec(\"VACUUM INTO '\" + process.env.OUTDB + \"'\");
const c = new DatabaseSync(process.env.OUTDB);
if (Object.values(c.prepare('PRAGMA integrity_check').get())[0] !== 'ok') { console.error('Копия базы повреждена'); process.exit(1); }
console.log('база: ok, пользователей:', c.prepare('SELECT COUNT(*) n FROM users').get().n, ', квизов:', c.prepare('SELECT COUNT(*) n FROM quizzes').get().n);
" || { rm -rf "$OUT"; echo 'Копия базы не создана'; exit 1; }
mv "$TMP/tugquiz.db" "$OUT/tugquiz.db"
[ -d "$D/uploads" ] && tar -C "$D" -czf "$OUT/uploads.tgz" uploads
ln -sfn "$OUT" "$B/latest"
find "$B" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
chown -R "$OWNER:$OWNER" "$B"
echo "Копия: $OUT ($(du -sh "$OUT" | cut -f1))"
EOF
chmod 755 /usr/local/bin/tugquiz-backup
echo '30 3 * * * root /usr/local/bin/tugquiz-backup >> /var/log/tugquiz-backup.log 2>&1' > /etc/cron.d/tugquiz-backup
chmod 644 /etc/cron.d/tugquiz-backup
mkdir -p /var/backups/tugquiz
/usr/local/bin/tugquiz-backup

echo "== Брандмауэр (ufw)"
# Порты, слушающие не только локально: их оставляем открытыми, чтобы другие службы сервера работали как раньше.
open_ports() { ss -H -ltn 2>/dev/null | awk '{print $4}' | grep -vE '^(127\.|\[::1\])' | sed 's/.*://' | sort -un; }
for p in 22 80 443 $(open_ports); do
  [ "$p" = 22 ] && ufw limit 22/tcp >/dev/null || ufw allow "$p/tcp" >/dev/null
done
# UDP: тоже оставляем то, что уже слушается снаружи (кроме служебных DNS/DHCP/NTP/mDNS).
for p in $(ss -H -lun 2>/dev/null | awk '{print $4}' | grep -vE '^(127\.|\[::1\])' | sed 's/.*://' | sort -un | grep -vxE '53|67|68|123|546|5353|\*'); do ufw allow "$p/udp" >/dev/null || true; done
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw --force enable >/dev/null
for p in 3306 5432 6379 27017 11211; do
  ss -H -ltn | awk '{print $4}' | grep -qE "^(0\.0\.0\.0|\*|\[::\]):$p$" && echo "ВНИМАНИЕ: порт $p (база данных) открыт в интернет. Лучше слушать только 127.0.0.1."
done

if [ "$KEYS_ONLY" = 1 ]; then
  echo "== SSH только по ключу"
  KEYFILE="$(getent passwd "$OWNER" | cut -d: -f6)/.ssh/authorized_keys"
  [ -s "$KEYFILE" ] || { echo "У $OWNER нет ключей в $KEYFILE, пароль не отключаю."; exit 1; }
  rm -f /tmp/tugquiz-ssh-ok
  # 00-: файл читается первым, а в sshd побеждает первое значение (у облачных образов есть 50-cloud-init.conf с паролем).
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/00-tugquiz.conf
  if sshd -t; then
    systemctl reload ssh || systemctl reload sshd
    # Автооткат: если за 4 минуты не подтвердят вход по ключу (файл /tmp/tugquiz-ssh-ok), пароль снова разрешается.
    systemd-run --quiet --on-active=240 --unit="tugquiz-ssh-rollback-$(date +%s)" /bin/bash -c \
      '[ -f /tmp/tugquiz-ssh-ok ] || { rm -f /etc/ssh/sshd_config.d/00-tugquiz.conf; systemctl reload ssh || systemctl reload sshd; }'
    echo "Вход по паролю отключён (откат через 4 минуты, если вход по ключу не подтвердится)."
  else
    rm -f /etc/ssh/sshd_config.d/00-tugquiz.conf
    echo "Конфигурация SSH не прошла проверку, изменения отменены."; exit 1
  fi
fi

echo
echo "== Итог"
ufw status | head -20
fail2ban-client status sshd 2>/dev/null | head -5 || true
[ -f /var/run/reboot-required ] && echo "Нужна перезагрузка сервера для обновления ядра: sudo reboot (сайт поднимется сам)."
echo "Резервная копия делается каждую ночь в 03:30. Скачать на компьютер: «Скачать копию данных.cmd»."
