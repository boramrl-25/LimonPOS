@echo off
cd /d C:\Users\Dell\LimonPOS\backend
start "LimonPOS Backend" cmd /k node server.js

cd /d C:\Users\Dell\LimonPOS\pos-backoffice
start "LimonPOS Web" cmd /k npm run dev

