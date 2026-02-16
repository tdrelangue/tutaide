@echo off
title Tut'aide - Desktop App
echo ================================
echo    Tut'aide - Application Bureau
echo ================================
echo.

:: Use junction path to avoid apostrophe issues with Rust compiler
if not exist "C:\tutaide-dev" (
    echo Creation du lien symbolique...
    powershell -Command "New-Item -ItemType Junction -Path 'C:\tutaide-dev' -Target '%~dp0' -Force" >nul 2>&1
)

cd /d "C:\tutaide-dev"

echo Arret des processus Node existants...
taskkill /F /IM node.exe 2>nul

echo.
echo Demarrage de l'application Tauri...
echo (Next.js se lance automatiquement)
echo.
echo Appuyez sur Ctrl+C pour arreter
echo ================================
echo.

npm run tauri:dev

pause
