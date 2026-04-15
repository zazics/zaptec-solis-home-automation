1. install DietPi + software: Docker, Node, Git

sudo usermod -a -G dialout $USER

sudo apt install -y curl

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm --version

nvm install 23
nvm use 23
nvm alias default 23

2. Install Mongo in Docker
   SEE OTHER INSTALL MONGODB

3. PM2
   sudo npm install -g pm2
   pm2 startup

4. App
   git clone project
   cd /home/pi/zaptec-solis-home-automation
   mkdir -p logs
   npm i
   npm run build
   pm2 start ecosystem.config.js --env production
