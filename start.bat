@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js не установлен. Скачайте версию 22 или новее: https://nodejs.org
  pause & exit /b 1
)
if not exist node_modules (
  echo Первый запуск: ставлю зависимости...
  call npm install --omit=dev || (echo Не удалось установить зависимости. & pause & exit /b 1)
)
set TQ_OPEN=1
node server/index.js
echo.
echo Сервер остановлен.
pause
