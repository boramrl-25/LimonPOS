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

REM --- Backend terminali ---
echo  [1/2] Backend baslatiliyor (port 3002)...
start "LimonPOS Backend" cmd /k "cd /d "%BACKEND%" && echo. && echo [Backend] Baslatiliyor... && npm start"

REM Kisa bekleme (backend once ayaga kalksın)
timeout /t 4 /nobreak > nul

REM --- Backoffice terminali ---
echo  [2/2] Backoffice baslatiliyor (port 3000)...
start "LimonPOS Backoffice" cmd /k "cd /d "%BACKOFFICE%" && echo. && echo [Backoffice] Baslatiliyor... && npm run dev"

echo.
echo  =============================================
echo   Hazir! Tarayicida ac:
echo   http://localhost:3000/pos/login
echo  =============================================
echo.
pause
