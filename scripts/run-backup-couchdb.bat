@echo off
echo ========================================
echo CouchDB Backup - Zaptec Solis
echo ========================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0backup-couchdb.ps1"

echo.
echo ========================================
echo Backup termine!
echo Appuyez sur une touche pour fermer...
pause >nul
