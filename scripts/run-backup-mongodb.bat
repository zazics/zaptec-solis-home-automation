@echo off
echo ========================================
echo MongoDB Backup - Zaptec Solis
echo ========================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0backup-mongo.ps1"

echo.
echo ========================================
echo Backup termine!
echo Appuyez sur une touche pour fermer...
pause >nul