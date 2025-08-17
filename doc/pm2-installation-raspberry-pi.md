# PM2 Installation and Configuration for Raspberry Pi

This guide provides step-by-step instructions for installing and configuring PM2 (Process Manager 2) on Raspberry Pi to run the Zaptec-Solis Home Automation application as a production service.

## What is PM2?

PM2 is a production process manager for Node.js applications with built-in load balancer. It allows you to keep applications alive forever, reload them without downtime, and facilitate common system admin tasks.

### Key Features:
- **Process Management**: Keep your app alive forever
- **Auto Restart**: Restart application on crashes
- **Log Management**: Centralized logging with log rotation
- **Monitoring**: Real-time monitoring dashboard
- **Startup Scripts**: Auto-start on system boot
- **Zero Downtime Deployments**: Update without interruption

## Prerequisites

- Raspberry Pi with Raspberry Pi OS installed
- Node.js and npm installed
- Zaptec-Solis application already built and configured

## Installation Steps

### 1. Install PM2 Globally

```bash
# Install PM2 globally using npm
sudo npm install -g pm2

# Verify installation
pm2 --version
```

### 2. Create PM2 Ecosystem Configuration

Create a PM2 ecosystem file for your application:

```bash
# Navigate to your project directory
cd /home/pi/zaptec-solis-home-automation

# Create ecosystem configuration file
nano ecosystem.config.js
```

Add the following configuration:

```javascript
module.exports = {
  apps: [{
    name: 'zaptec-solis-automation',
    script: 'dist/main.js',
    cwd: '/home/pi/zaptec-solis-home-automation',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 5000,
    autorestart: true,
    kill_timeout: 5000
  }]
};
```

### 3. Build and Prepare Application

```bash
# Build the application
npm run build

# Ensure logs directory exists
mkdir -p logs

# Set proper permissions
chmod +x dist/main.js
```

### 4. Start Application with PM2

```bash
# Start the application using ecosystem file
pm2 start ecosystem.config.js --env production

# Or start directly (alternative method)
pm2 start dist/main.js --name "zaptec-solis-automation" --env production

# Check application status
pm2 status
pm2 list
```

### 5. Configure Auto-Start on Boot

```bash
# Generate startup script for current user
pm2 startup

# Follow the instruction displayed (usually requires sudo)
# Example output will show a command like:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u pi --hp /home/pi

# Execute the suggested command with sudo

# Save current PM2 process list
pm2 save
```

### 6. Configure Log Rotation

```bash
# Install PM2 log rotation module
pm2 install pm2-logrotate

# Configure log rotation settings
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 10
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:rotateModule true
```

## PM2 Management Commands

### Basic Process Management

```bash
# Start application
pm2 start ecosystem.config.js

# Stop application
pm2 stop zaptec-solis-automation

# Restart application
pm2 restart zaptec-solis-automation

# Reload application (zero downtime)
pm2 reload zaptec-solis-automation

# Delete application from PM2
pm2 delete zaptec-solis-automation

# Stop all applications
pm2 stop all

# Restart all applications
pm2 restart all
```

### Monitoring and Logs

```bash
# Show application status
pm2 status
pm2 list

# Monitor applications in real-time
pm2 monit

# View logs
pm2 logs zaptec-solis-automation

# View logs in real-time
pm2 logs zaptec-solis-automation --lines 50

# Clear logs
pm2 flush

# Show application information
pm2 show zaptec-solis-automation

# Show application metrics
pm2 describe zaptec-solis-automation
```

### Process Control

```bash
# Send signal to process
pm2 sendSignal SIGUSR2 zaptec-solis-automation

# Reset restart count
pm2 reset zaptec-solis-automation

# Scale application (create multiple instances)
pm2 scale zaptec-solis-automation 2
```

## Environment-Specific Configuration

### Development Environment

For development with auto-restart on file changes:

```javascript
// ecosystem.config.js - development section
env_development: {
  NODE_ENV: 'development',
  PORT: 3000,
  watch: true,
  ignore_watch: ['node_modules', 'logs', 'dist'],
  watch_options: {
    followSymlinks: false
  }
}
```

Start with: `pm2 start ecosystem.config.js --env development`

### Production Environment

For production with optimized settings:

```javascript
// ecosystem.config.js - production section
env_production: {
  NODE_ENV: 'production',
  PORT: 3000,
  instances: 1,  // or 'max' for cluster mode
  exec_mode: 'fork',  // or 'cluster'
  max_memory_restart: '500M',
  node_args: '--max-old-space-size=512'
}
```

## Monitoring and Maintenance

### Health Checks

Create a simple health check script:

```bash
# Create health check script
nano /home/pi/scripts/health-check.sh
```

```bash
#!/bin/bash

# Health check script for Zaptec-Solis application
APP_NAME="zaptec-solis-automation"
LOG_FILE="/home/pi/zaptec-solis-home-automation/logs/health-check.log"

# Check if process is running
if pm2 status | grep -q "$APP_NAME.*online"; then
    echo "$(date): $APP_NAME is running" >> $LOG_FILE
    
    # Optional: Check HTTP endpoint
    if curl -f http://localhost:3000/automation/status > /dev/null 2>&1; then
        echo "$(date): $APP_NAME HTTP endpoint is responsive" >> $LOG_FILE
    else
        echo "$(date): WARNING - $APP_NAME HTTP endpoint not responding" >> $LOG_FILE
        pm2 restart $APP_NAME
    fi
else
    echo "$(date): ERROR - $APP_NAME is not running, attempting restart" >> $LOG_FILE
    pm2 restart $APP_NAME
fi
```

```bash
# Make script executable
chmod +x /home/pi/scripts/health-check.sh

# Add to crontab for regular checks
crontab -e

# Add this line to run health check every 5 minutes:
# */5 * * * * /home/pi/scripts/health-check.sh
```

### System Resource Monitoring

```bash
# Monitor system resources
pm2 monit

# Check memory usage
pm2 show zaptec-solis-automation | grep memory

# Check CPU usage
htop

# Check disk usage
df -h
```

## Troubleshooting

### Common Issues

1. **Application won't start**
   ```bash
   # Check logs for errors
   pm2 logs zaptec-solis-automation --err
   
   # Check if port is available
   sudo netstat -tlnp | grep :3000
   
   # Verify Node.js version
   node --version
   ```

2. **High memory usage**
   ```bash
   # Check memory consumption
   pm2 show zaptec-solis-automation
   
   # Reduce memory limit in ecosystem.config.js
   max_memory_restart: '256M'
   ```

3. **Auto-start not working**
   ```bash
   # Regenerate startup script
   pm2 unstartup
   pm2 startup
   
   # Re-save process list
   pm2 save
   ```

4. **Permission issues**
   ```bash
   # Fix ownership
   sudo chown -R pi:pi /home/pi/zaptec-solis-home-automation
   
   # Fix permissions
   chmod 755 dist/main.js
   ```

### Log Analysis

```bash
# Check application logs
tail -f /home/pi/zaptec-solis-home-automation/logs/zaptec-solis-automation.log

# Check PM2 logs
pm2 logs zaptec-solis-automation --lines 100

# Check system logs
sudo journalctl -u pm2-pi -f
```

## Security Considerations

### User Permissions

```bash
# Run PM2 as non-root user (recommended)
# Avoid using sudo for PM2 commands in production

# Create dedicated user for application (optional)
sudo useradd -m -s /bin/bash zaptec
sudo usermod -a -G dialout zaptec  # For RS485 access
```

### Firewall Configuration

```bash
# Configure UFW firewall (if needed)
sudo ufw allow 3000/tcp  # Allow application port
sudo ufw enable
```

## Best Practices

1. **Always use ecosystem files** for configuration management
2. **Set memory limits** to prevent system crashes
3. **Configure log rotation** to manage disk space
4. **Use health checks** for automatic recovery
5. **Monitor resource usage** regularly
6. **Keep PM2 updated**: `sudo npm update -g pm2`
7. **Use non-root user** for better security
8. **Test restart scenarios** before deployment

## Updating the Application

```bash
# Stop application
pm2 stop zaptec-solis-automation

# Pull latest code
git pull origin main

# Install dependencies
npm install

# Build application
npm run build

# Restart with PM2
pm2 restart zaptec-solis-automation

# Verify deployment
pm2 status
pm2 logs zaptec-solis-automation --lines 20
```

## Backup and Recovery

```bash
# Backup PM2 configuration
pm2 save
cp ~/.pm2/dump.pm2 /backup/location/

# Backup ecosystem file
cp ecosystem.config.js /backup/location/

# Restore PM2 processes
pm2 resurrect
```

This documentation provides comprehensive guidance for deploying and managing the Zaptec-Solis Home Automation application using PM2 on Raspberry Pi in a production environment.