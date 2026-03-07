@echo off
REM Railway deploy - once you've run "railway login" and "railway link" in backend folder
cd /d "%~dp0backend"
railway whoami >nul 2>&1
if errorlevel 1 (
    echo.
    echo Railway'e giris yapilmamis.
    echo Su komutu calistirin: railway login
    echo Tarayici acilacak, giris yapin. Sonra bu dosyayi tekrar calistirin.
    echo.
    pause
    exit /b 1
)
echo Railway'e deploy gonderiliyor...
railway up
if errorlevel 1 (
    echo Hata. Ilk kez: cd backend ^&^& railway link
    pause
    exit /b 1
)
echo Tamam. Railway dashboard'dan build durumunu kontrol edin.
pause
