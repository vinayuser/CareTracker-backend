/**
 * PM2 process file for production.
 *
 * Usage (from backend/):
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 logs caretraker-api
 */
module.exports = {
  apps: [
    {
      name: 'caretraker-api',
      script: 'app.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 15,
      min_uptime: '10s',
      max_memory_restart: '512M',
      listen_timeout: 15000,
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        NODE_PORT: 5000,
        FRONTEND_URL: 'https://caretraker.com',
        API_BASE_URL: 'https://caretraker.com',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
