# Защита сервера: брандмауэр, fail2ban, ночные резервные копии. Вход по паролю остаётся как был.
# Запуск: двойной клик по "Защитить сервер.cmd". Пароль сервера спросят несколько раз.
# Чужие службы на сервере не затрагиваются.
param([string]$Server)
$ErrorActionPreference = 'Stop'
$here = Split-Path $PSScriptRoot -Parent
if (-not $Server) { $Server = Read-Host 'Сервер в виде логин@IP (например ubuntu@185.1.2.3)' }
if ($Server -notmatch '@') { throw 'Нужен формат логин@IP' }
foreach ($tool in 'ssh', 'scp') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Не найден $tool. Включите «Клиент OpenSSH» в параметрах Windows." }
}

Write-Host '== Отправляю скрипт на сервер (введите пароль сервера)'
scp -o StrictHostKeyChecking=accept-new (Join-Path $here 'deploy\harden.sh') "${Server}:/tmp/tugquiz-harden.sh"
if ($LASTEXITCODE) { throw 'Не удалось отправить скрипт. Проверьте логин и пароль.' }

Write-Host '== Применяю защиту на сервере (пароль сервера, затем пароль sudo)'
ssh -t $Server 'sudo bash /tmp/tugquiz-harden.sh; rc=$?; rm -f /tmp/tugquiz-harden.sh; exit $rc'
if ($LASTEXITCODE) { throw 'Защита завершилась с ошибкой, текст выше.' }
Write-Host 'Готово: брандмауэр и fail2ban включены, резервные копии делаются каждую ночь. Вход по паролю не менялся.'
