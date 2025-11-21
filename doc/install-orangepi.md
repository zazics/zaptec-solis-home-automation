# install NVM, Node, npm

sudo apt update
sudo apt install -y curl

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm --version

nvm install 23
nvm use 23
nvm alias default 23

# Install PM2

npm install -g pm2
pm2 startup

# install Docker

sudo apt install docker.io

# Install CouchDB

sudo mkdir -p /opt/couchdb/data
mkdir -p ~/couchdb-config
cat > ~/couchdb-config/local.ini << EOF
[chttpd]
port = 5984
bind_address = 0.0.0.0

[log]
level = info

[couchdb]
max_document_size = 8mb
EOF

docker run -d \
 --name couchdb \
 --restart=unless-stopped \
 -p 5984:5984 \
 -e COUCHDB_USER=admin \
 -e COUCHDB_PASSWORD=admin \
 -v couchdb_data:/opt/couchdb/data \
 -v ~/couchdb-config:/opt/couchdb/etc/local.d \
 --memory=256m \
 treehouses/rpi-couchdb:2.3.1

# IMPORTANT: Le flag --restart=unless-stopped garantit que CouchDB redemarrera automatiquement
# apres un reboot de l'OrangePi

# Install Project

git clone https://github.com/zazics/zaptec-solis-home-automation.git
cd zaptec-solis-home-automation

# Configure CouchDB databases

# Rendre le script exécutable

chmod +x scripts/setup-couchdb.sh

# Exécuter le script de configuration

./scripts/setup-couchdb.sh

# Vérifier la création des bases

curl http://admin:admin@localhost:5984/\_all_dbs

# Configure environment for CouchDB

cat > .env << EOF
DATABASE_TYPE=couchdb
COUCHDB_URL=http://admin:admin@localhost:5984
EOF

# Deploy compiled artifacts Via GitHub Actions

1. Pushez votre code sur GitHub
2. GitHub Actions compile automatiquement pour ARM32v7 (workflow: build-arm.yml)
3. Téléchargez l'artifact 'arm-build.zip' depuis Actions → Build for ARM → Artifacts
4. Décompressez et copiez les fichiers sur l'Orange Pi:

```bash
# Depuis Windows (après avoir décompressé arm-build.zip)
scp -r dist node_modules package.json root@192.168.0.61:/root/zaptec-solis-home-automation/
```

# Start application

pm2 start ecosystem.config.js --env production
