@echo off
REM quick-deploy.bat - Build Windows + rebuild natif sur IOT

echo === Building TypeScript on Windows ===
call npm run build

echo.
echo === Deploying to IOT ===
set IOT_HOST=root@192.168.0.61
set IOT_PATH=/root/zaptec-solis-home-automation

scp -r dist package*.json .env %IOT_HOST%:%IOT_PATH%/

echo.
echo === Rebuilding only native modules on IOT (fast) ===
ssh %IOT_HOST% "cd %IOT_PATH% && npm ci --omit=dev && npm rebuild serialport tp-link-tapo-connect"

echo.
echo === Restarting service ===
ssh %IOT_HOST% "cd %IOT_PATH% && pm2 restart zaptec-solis || node dist/main.js"

echo === Deployment complete! ===
