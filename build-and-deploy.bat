@echo off
REM build-and-deploy.bat - Cross-compile et déployer sur IOT

echo === Building for Linux ARM (with cache) ===
docker buildx build --platform linux/arm/v7 --load -t zaptec-solis-build -f Dockerfile.build --cache-from type=local,src=.docker-cache --cache-to type=local,dest=.docker-cache .

echo.
echo === Extracting build artifacts ===
docker create --name temp-container zaptec-solis-build
docker cp temp-container:/app/dist ./dist-linux
docker cp temp-container:/app/node_modules ./node_modules-linux
docker rm temp-container

echo.
echo === Deploying to IOT ===
set IOT_HOST=root@192.168.0.61
set IOT_PATH=/root/zaptec-solis-home-automation

REM Copier dist et node_modules compilés pour Linux
scp -r dist-linux %IOT_HOST%:%IOT_PATH%/dist
scp -r node_modules-linux %IOT_HOST%:%IOT_PATH%/node_modules
scp package.json %IOT_HOST%:%IOT_PATH%/
scp .env %IOT_HOST%:%IOT_PATH%/

echo.
echo === Restarting service on IOT ===
ssh %IOT_HOST% "cd %IOT_PATH% && pm2 restart zaptec-solis || node dist/main.js"

echo.
echo === Cleaning up local artifacts ===
rmdir /s /q dist-linux
rmdir /s /q node_modules-linux

echo.
echo === Deployment complete! ===
