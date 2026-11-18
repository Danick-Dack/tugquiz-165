# Выкладка TugQuiz на свой сервер с компьютера Windows. Код с GitHub не нужен: архив уходит по SSH.
# Запуск: двойной клик по "Выложить на сервер.cmd" или
#   powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1 root@1.2.3.4 [домен]
# Пароль сервера спросит ssh (вводится вслепую). Повторный запуск = обновление сайта, база не трогается.
param([string]$Server, [string]$Domain = '')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not $Server) { $Server = Read-Host 'Сервер в виде логин@IP (например root@185.1.2.3)' }
if ($Server -notmatch '@') { $Server = "root@$Server" }
if (-not $PSBoundParameters.ContainsKey('Domain')) { $Domain = (Read-Host 'Домен, например tugquiz.dedyn.io (Enter - без домена, адрес по IP)').Trim() }
if ($Domain -and $Domain -notmatch '^[a-z0-9.-]+$') { throw "Странный домен: $Domain" }
foreach ($tool in 'git', 'ssh', 'scp') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Не найден $tool. Установите Git для Windows / OpenSSH." }
}
if (git status --porcelain) { Write-Warning 'Есть незафиксированные изменения: в архив попадёт только последний коммит.' }

$tar = Join-Path $env:TEMP 'tugquiz.tar'
git archive --format=tar -o $tar HEAD
# Фронтенд уходит на сервер сжатым (исходник на сайте нечитаем); без esbuild — как есть.
if (Test-Path 'node_modules\esbuild') {
  $stage = Join-Path $env:TEMP 'tugquiz-stage'
  if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
  New-Item -ItemType Directory $stage | Out-Null
  tar -xf $tar -C $stage
  node deploy\minify.mjs $stage
  if ($LASTEXITCODE) { throw 'Не удалось сжать фронтенд.' }
  Remove-Item $tar
  tar -cf $tar -C $stage .
  Remove-Item -Recurse -Force $stage
} else { Write-Warning 'esbuild не установлен (npm install): фронтенд уйдёт несжатым.' }
Write-Host '== Отправляю проект на сервер (введите пароль сервера)'
scp -o StrictHostKeyChecking=accept-new $tar "${Server}:/tmp/tugquiz.tar"
if ($LASTEXITCODE) { throw 'Не удалось отправить архив. Проверьте адрес, логин и пароль.' }
Remove-Item $tar

$sudo = if ($Server -like 'root@*') { '' } else { 'sudo ' }
$cmd = "set -e; ${sudo}rm -rf /opt/tugquiz; ${sudo}mkdir -p /opt/tugquiz; ${sudo}tar -xf /tmp/tugquiz.tar -C /opt/tugquiz; rm -f /tmp/tugquiz.tar; ${sudo}bash /opt/tugquiz/deploy/install.sh $Domain"
Write-Host '== Устанавливаю на сервере (ещё раз пароль; займёт 1-3 минуты)'
ssh -t $Server $cmd
if ($LASTEXITCODE) { throw 'Установка завершилась с ошибкой, текст выше.' }
