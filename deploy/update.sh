#!/usr/bin/env bash
# Обновление на сервере после того, как в /opt/tugquiz положили свежий код: зависимости, служба, Caddy.
# Обычно не нужен: «Выложить на сервер.cmd» на компьютере делает всё сам. Данные (база, файлы) не трогаются.
#   sudo bash deploy/update.sh
set -euo pipefail
DOMAIN="$(head -1 /etc/caddy/Caddyfile 2>/dev/null | awk '{print $1}')"
exec bash "$(dirname "$0")/install.sh" "$DOMAIN"
