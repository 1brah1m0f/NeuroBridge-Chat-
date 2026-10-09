@echo off
chcp 65001 >nul
title AI IMPOSTOR: SPACE SHIP server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js tapılmadı. Onu https://nodejs.org saytından yükləyin ^(LTS versiyası^).
  echo   Node.js was not found. Install it from https://nodejs.org ^(LTS version^).
  echo.
  pause
  exit /b 1
)
node server\server.js
echo.
echo   Server dayandı / Server stopped.
pause
