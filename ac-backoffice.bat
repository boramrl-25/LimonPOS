@echo off
title LimonPOS Backoffice
cd /d "%~dp0pos-backoffice"
echo Backoffice baslatiliyor: http://localhost:3000
echo Tarayici 5 sn sonra acilacak...
start "" cmd /k "npm run dev"
timeout /t 5 /nobreak >nul
start http://localhost:3000
echo Tarayici acilmadiysa elle ac: http://localhost:3000
pause
