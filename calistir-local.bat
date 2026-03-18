@echo off
title LimonPOS - Local Baslatici
color 0A
echo.
echo  =============================================
echo   LimonPOS - Local Backend + Backoffice
echo  =============================================
echo.

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "BACKOFFICE=%ROOT%pos-backoffice"

REM --- 3002 portunu temizle ---
echo  [0/3] Port 3002 kontrol ediliyor...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3002 " ^| findstr "LISTENING"') do (
    echo  Port 3002 kullaniliyor (PID: %%a), kapatiliyor...
    taskkill /PID %%a /F >nul 2>&1
)

REM --- node_modules kontrol ---
echo  [1/3] node_modules kontrol ediliyor...
if not exist "%BACKEND%\node_modules" (
    echo  node_modules bulunamadi, npm install yapiliyor...
    cd /d "%BACKEND%" && npm install
)

REM --- Backend terminali ---
echo  [2/3] Backend baslatiliyor (port 3002)...
start "LimonPOS Backend" cmd /k "cd /d "%BACKEND%" && echo. && echo Backend baslatiliyor... && node server.js"

timeout /t 4 /nobreak > nul

REM --- Backoffice terminali ---
echo  [3/3] Backoffice baslatiliyor (port 3000)...
start "LimonPOS Backoffice" cmd /k "cd /d "%BACKOFFICE%" && echo. && echo Backoffice baslatiliyor... && npm run dev"

echo.
echo  =============================================
echo   http://localhost:3000/pos/login
echo  =============================================
echo.
pause
