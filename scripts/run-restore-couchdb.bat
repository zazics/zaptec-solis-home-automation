@echo off
echo ========================================
echo CouchDB Restore - Zaptec Solis
echo ========================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0restore-couchdb.ps1"

echo.
echo Appuyez sur une touche pour fermer...
pause >nul
