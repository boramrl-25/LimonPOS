@echo off
chcp 65001 >nul
setlocal
set ROOT=%~dp0
cd /d "%ROOT%"

echo.
echo ========================================
echo   LimonPOS - Railway + Vercel Deploy
echo ========================================
echo.

REM 1) Railway (Backend) - hata olsa da Vercel'e gec (call ile batch devam eder)
echo [1/2] Railway ^(Backend^) deploy...
cd /d "%ROOT%backend"
if defined RAILWAY_TOKEN echo RAILWAY_TOKEN kullaniliyor.
call railway up --detach
if errorlevel 1 (
    echo Railway atlandi - giris yok. Once: railway login veya RAILWAY_TOKEN verin.
) else (
    echo Backend deploy tetiklendi ^(Railway^).
)
echo.

REM 2) Vercel (Backoffice)
echo [2/2] Vercel (Backoffice) deploy...
cd /d "%ROOT%pos-backoffice"
call vercel --prod
if errorlevel 1 (
    echo Vercel hatasi. Once: vercel link
) else (
    echo Backoffice deploy tamamlandi ^(Vercel^).
)

echo.
echo Bitti. Railway + Vercel dashboard'lardan build durumunu takip edin.
