@echo off
title LimonPOS Offline - Backend + Backoffice
echo Backend: http://localhost:3002
echo Backoffice: http://localhost:3000
echo.
echo Tablet Primary URL (hotspot): http://192.168.137.1:3002/api/
echo Firewall acik degilse: scripts\firewall-allow-backend.ps1 (Yonetici olarak)
echo.
cd /d "%~dp0backend"
start "LimonPOS Backend" cmd /k node server.js
timeout /t 3 /nobreak >nul
cd /d "%~dp0pos-backoffice"
start "LimonPOS Backoffice" cmd /k "set PORT=3000 && npm run dev"
echo.
echo Tarayicida ac: http://localhost:3000
pause
