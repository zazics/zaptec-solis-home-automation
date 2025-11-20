module.exports = {
  apps: [
    {
      name: 'zaptec-solis-automation',
      script: 'dist/main.js',
      cwd: '/root/zaptec-solis-home-automation',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PORT: 17041
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 17041
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
    }
  ]
};
