@echo off
:: Yonetici olarak calistir: Sag tikla -> "Run as administrator"
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Yonetici olarak calistirin: Sag tikla -> "Run as administrator"
    pause
    exit /b 1
)

echo VirtualMachinePlatform ve WSL etkinlestiriliyor...
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

echo.
echo Bitti. Bilgisayari YENIDEN BASLATIN, sonra Docker Desktop acin.
pause
