@echo off
title Tut'aide - Dev Server
echo ================================
echo    Tut'aide - Serveur de dev
echo ================================
echo.

cd /d "%~dp0"

echo Arret des processus Node existants...
taskkill /F /IM node.exe 2>nul

echo.
echo Demarrage du serveur de developpement...
echo.
echo Le site sera accessible sur: http://localhost:3000
echo.
echo Appuyez sur Ctrl+C pour arreter le serveur
echo ================================
echo.

npm run dev

pause
