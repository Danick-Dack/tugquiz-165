#!/usr/bin/env bash
# Обновление на сервере после того, как в /opt/tugquiz положили свежий код: зависимости, служба, HTTPS.
# Обычно не нужен: «Выложить на сервер.cmd» на компьютере делает всё сам. Данные (база, файлы) не трогаются.
#   sudo bash deploy/update.sh
set -euo pipefail
exec bash "$(dirname "$0")/install.sh" "$(cat /etc/tugquiz.domain 2>/dev/null || true)"
