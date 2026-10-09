// Writes start-server.bat with CRLF line endings (cmd.exe is happiest with them).
const fs = require('fs');
const path = require('path');
const lines = [
  '@echo off',
  'chcp 65001 >nul',
  'title AMONG STARS server',
  'cd /d "%~dp0"',
  'where node >nul 2>nul',
  'if errorlevel 1 (',
  '  echo.',
  '  echo   Node.js tapılmadı. Onu https://nodejs.org saytından yükləyin ^(LTS versiyası^).',
  '  echo   Node.js was not found. Install it from https://nodejs.org ^(LTS version^).',
  '  echo.',
  '  pause',
  '  exit /b 1',
  ')',
  'node server\\server.js',
  'echo.',
  'echo   Server dayandı / Server stopped.',
  'pause',
  '',
];
fs.writeFileSync(path.join(__dirname, '..', '..', 'start-server.bat'), lines.join('\r\n'), 'utf8');
console.log('written');
