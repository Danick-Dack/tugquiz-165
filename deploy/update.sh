#!/usr/bin/env bash
# Обновление на сервере: забрать свежий код, поставить зависимости, перезапустить. Данные (база, файлы) не трогаются.
#   sudo bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
npm ci --omit=dev
systemctl restart tugquiz
echo "Обновлено. Логи: journalctl -u tugquiz -f"
