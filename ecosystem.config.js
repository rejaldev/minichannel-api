// PM2 Ecosystem Configuration for MiniChannel Backend
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [{
    name: 'anekabuana-backend',
    script: 'npm',
    args: 'start',
    interpreter: 'none',
    
    // Instance configuration
    instances: 1,
    exec_mode: 'fork',
    
    // Environment
    env: {
      NODE_ENV: 'production',
    },
    
    // Memory management
    max_memory_restart: '300M',
    
    // Restart policy
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Logging
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Advanced features
    kill_timeout: 5000,
    listen_timeout: 5000,
    shutdown_with_message: true,
  }]
};
