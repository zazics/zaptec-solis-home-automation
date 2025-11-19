1. install DietPi + software: Docker, Node, Git

sudo usermod -a -G dialout $USER

2. Install Mongo in Docker
   sudo mkdir -p /home/dietpi/mongodb-data
   docker run -d --name solis-mongodb --restart unless-stopped -p 27017:27017 -v /home/dietpi/mongodb-data:/data/db -e MONGO_INITDB_DATABASE=solis-automation mongo:3.6

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
