# MongoDB Troubleshooting Guide

## Database Corruption Issues

If you encounter connection errors like `MongoNetworkError: connection closed` or see WiredTiger corruption errors in logs, the database may be corrupted.

### Symptoms of Database Corruption

- Connection errors: `MongoNetworkError: connection closed`
- WiredTiger errors in logs: `WiredTiger error (-31802)`, `WT_PANIC: WiredTiger library panic`
- Fatal assertions: `Fatal Assertion 50853`
- Process aborts: `Got signal: 6 (Aborted)`

### Diagnostic Commands

```bash
# Check container status
docker ps | grep solis-mongodb

# View recent logs
docker logs --tail 50 solis-mongodb

# Follow logs in real-time
docker logs -f solis-mongodb

# Test database connection
docker exec -it solis-mongodb mongo --eval 'db.runCommand({ connectionStatus: 1 })'
```

### Repair Procedures

#### Option 1: Repair Database (Quick Fix)

```bash
# Stop the MongoDB container
docker stop solis-mongodb

# Attempt to repair the database
docker run --rm -v /home/dietpi/mongodb-data:/data/db mongo:3.6 mongod --repair --dbpath /data/db

# Restart the container
docker start solis-mongodb

# Verify it's working
docker logs solis-mongodb
```

#### Option 2: Complete Recreation (Recommended for severe corruption)

```bash
# Stop and remove the existing container
docker stop solis-mongodb
docker rm solis-mongodb

# Backup corrupted data (just in case)
sudo mv /home/dietpi/mongodb-data /home/dietpi/mongodb-data-corrupted-$(date +%Y%m%d)

# Create fresh data directory
sudo mkdir -p /home/dietpi/mongodb-data
sudo chown $USER:$USER /home/dietpi/mongodb-data

# Recreate the MongoDB container
docker run -d \
  --name solis-mongodb \
  --restart unless-stopped \
  -p 27017:27017 \
  -v /home/dietpi/mongodb-data:/data/db \
  -e MONGO_INITDB_DATABASE=solis-automation \
  mongo:3.6

# Verify container is running
docker ps | grep solis-mongodb
docker logs solis-mongodb
```

#### Option 3: Upgrade to MongoDB 4.4 (Best long-term solution)

```bash
# Stop and remove the existing container
docker stop solis-mongodb
docker rm solis-mongodb

# Backup old data
sudo mv /home/dietpi/mongodb-data /home/dietpi/mongodb-data-3.6-backup

# Create fresh data directory
sudo mkdir -p /home/dietpi/mongodb-data
sudo chown $USER:$USER /home/dietpi/mongodb-data

# Create new container with MongoDB 4.4 (latest ARM-compatible version)
docker run -d \
  --name solis-mongodb \
  --restart unless-stopped \
  -p 27017:27017 \
  -v /home/dietpi/mongodb-data:/data/db \
  -e MONGO_INITDB_DATABASE=solis-automation \
  mongo:4.4

# Verify installation
docker ps | grep solis-mongodb
docker logs solis-mongodb
```

### Post-Repair Verification

```bash
# Connect to MongoDB shell
docker exec -it solis-mongodb mongo

# Inside MongoDB shell:
use solis-automation
show collections
db.solisdatas.countDocuments()
db.zaptecdatas.countDocuments()

# Test a simple query
db.solisdatas.find().sort({timestamp: -1}).limit(1)
exit
```

### Prevention Tips

1. **Regular Backups**: Set up automated backups using mongodump
   ```bash
   # Create backup script
   docker exec solis-mongodb mongodump --out /data/db/backup-$(date +%Y%m%d)
   ```

2. **Monitor Disk Space**: Ensure sufficient space on `/home/dietpi/mongodb-data`
   ```bash
   df -h /home/dietpi/mongodb-data
   ```

3. **Check Container Health**: Regularly monitor container logs
   ```bash
   docker logs --tail 100 solis-mongodb | grep -i error
   ```

4. **Proper Shutdown**: Always stop containers gracefully
   ```bash
   docker stop solis-mongodb  # Wait for graceful shutdown
   docker kill solis-mongodb  # Only if stop doesn't work
   ```

### Emergency Recovery

If database becomes completely unusable:

1. Stop the application to prevent further corruption
2. Backup whatever data is recoverable
3. Recreate the database (Option 2 or 3 above)
4. The application will start collecting fresh data immediately

### Useful Commands Reference

```bash
# Container management
docker start solis-mongodb        # Start container
docker stop solis-mongodb         # Stop container
docker restart solis-mongodb      # Restart container
docker logs solis-mongodb         # View logs

# Database operations
docker exec -it solis-mongodb mongo                    # Connect to shell
docker exec solis-mongodb mongo --eval 'db.stats()'   # Get DB stats
docker exec solis-mongodb mongodump --out /backup     # Create backup

# Data directory management
sudo du -sh /home/dietpi/mongodb-data                  # Check data size
sudo ls -la /home/dietpi/mongodb-data                  # List data files
```

### When to Use Each Option

- **Option 1 (Repair)**: First try for minor corruption, fastest recovery
- **Option 2 (Recreation)**: Severe corruption, need fresh start with same MongoDB version
- **Option 3 (Upgrade)**: Best for long-term stability, includes version upgrade

Choose based on the severity of corruption and your recovery time requirements.