# Скачать свежую копию данных TugQuiz (база и загрузки) с сервера на этот компьютер.
# Запуск: двойной клик по "Скачать копию данных.cmd". Копия лежит в Документы\TugQuiz-backups\дата.
param([string]$Server)
$ErrorActionPreference = 'Stop'
if (-not $Server) { $Server = Read-Host 'Сервер в виде логин@IP (например ubuntu@185.1.2.3)' }
$dest = Join-Path $env:USERPROFILE ("Documents\TugQuiz-backups\" + (Get-Date -Format 'yyyy-MM-dd_HHmm'))
New-Item -ItemType Directory -Force $dest | Out-Null

Write-Host '== Делаю свежую копию на сервере'
ssh -t $Server 'sudo /usr/local/bin/tugquiz-backup'
if ($LASTEXITCODE) { throw 'Не удалось сделать копию. Если сервер ещё не защищён, сначала запустите «Защитить сервер.cmd».' }

Write-Host '== Скачиваю'
scp -r "${Server}:/var/backups/tugquiz/latest/." $dest
if ($LASTEXITCODE) { throw 'Не удалось скачать.' }
$db = Join-Path $dest 'tugquiz.db'
if (-not (Test-Path $db) -or (Get-Item $db).Length -lt 1024) { throw 'Файл базы не скачался.' }
Get-ChildItem $dest | ForEach-Object { '{0,-16} {1,10:N0} КБ' -f $_.Name, ($_.Length / 1KB) }
Write-Host "Готово: $dest"
Start-Process explorer.exe $dest
