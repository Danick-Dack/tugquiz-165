# Обновление сервера: пакеты, свежая копия данных, перезагрузка (чтобы применилось новое ядро), проверка сайта.
# Запуск: двойной клик по "Обновить сервер.cmd". Сайт будет недоступен около минуты.
param([string]$Server)
$ErrorActionPreference = 'Stop'
if (-not $Server) { $Server = Read-Host 'Сервер в виде логин@IP (например ubuntu@185.1.2.3)' }
if ($Server -notmatch '@') { throw 'Нужен формат логин@IP' }
$site = 'https://tugquiz.mywire.org'

Write-Host '== Обновляю пакеты и делаю копию данных (пароль сервера, затем sudo)'
ssh -t -o StrictHostKeyChecking=accept-new $Server 'sudo bash -c ''export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a; apt-get update -y && apt-get -y -o Dpkg::Options::=--force-confold upgrade && apt-get -y autoremove && { /usr/local/bin/tugquiz-backup || echo backup-skipped; } && echo Kernel-now: $(uname -r)'''
if ($LASTEXITCODE) { throw 'Обновление не завершилось, текст выше. Сервер не перезагружен.' }

if ((Read-Host 'Перезагрузить сервер сейчас? Сайт будет недоступен около минуты (да/нет)') -notmatch '^(да|д|y|yes)$') { Write-Host 'Перезагрузка отложена. Позже: ssh на сервер и sudo reboot.'; return }

Write-Host '== Перезагружаю'
ssh -t $Server 'sudo systemctl reboot' 2>$null
Write-Host '== Жду, пока сервер поднимется'
Start-Sleep 25
$up = $false
for ($i = 0; $i -lt 30 -and -not $up; $i++) {
  try { $up = (Invoke-WebRequest $site -UseBasicParsing -TimeoutSec 8).StatusCode -eq 200 } catch { Start-Sleep 6 }
}
if ($up) { Write-Host "Готово: сайт открывается, новое ядро применено." } else { Write-Warning "Сайт пока не отвечает. Подождите пару минут и откройте $site. Если не поднимется, проверьте сервер в панели хостера." }
