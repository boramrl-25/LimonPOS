@echo off
title LimonPOS Local Backend
cd /d "%~dp0backend"
echo Local Backend - Hetzner DB - http://localhost:3002
node server.js
pause
