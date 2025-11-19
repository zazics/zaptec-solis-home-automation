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
 -p 5984:5984 \
 -e COUCHDB_USER=admin \
 -e COUCHDB_PASSWORD=admin \
 -v couchdb_data:/opt/couchdb/data \
 -v ~/couchdb-config:/opt/couchdb/etc/local.d \
 --memory=256m \
 treehouses/rpi-couchdb:2.3.1

# Install Project

git clone https://github.com/zazics/zaptec-solis-home-automation.git
cd zaptec-solis-home-automation
npm i
