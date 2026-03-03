@echo off
title LimonPOS
echo LimonPOS baslatiliyor...
echo Eski islemler kapatiliyor...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /F /PID %%a 2>nul
timeout /t 2 /nobreak >nul
echo.
echo Backend: http://localhost:3002
echo Web: http://localhost:3000
echo.
cd /d "%~dp0"
call npm start
pause
