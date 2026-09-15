module.exports = {
  apps: [{
    name: 'rumo-backend',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    ignore_watch: ['node_modules', 'logs', '.git', 'uploads'],
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    min_uptime: '10s',
    max_restarts: 10
  }]
}