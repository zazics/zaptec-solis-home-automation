@echo off
echo ========================================
echo MongoDB Restore - Zaptec Solis
echo ========================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0restore-mongo.ps1"

echo.
echo Appuyez sur une touche pour fermer...
pause >nul