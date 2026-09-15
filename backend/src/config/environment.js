// Load environment variables
if (process.env.NODE_ENV === 'production') {
  require('dotenv').config({ path: '.env.production' });
} else {
  require('dotenv').config();
}

const config = {
  // Server Configuration
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 5000,
  
  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'rumo',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 20,
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 2000
  },

  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5174',
    credentials: process.env.CORS_CREDENTIALS === 'true'
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS === 'true'
  },

  // Socket.IO Configuration
  socket: {
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT) || 60000,
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL) || 25000,
    transports: ['websocket', 'polling']
  },

  // File Upload Configuration
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB
    uploadPath: process.env.UPLOAD_PATH || './uploads',
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
  },

  // Shared secret required to change branding settings via /api/settings and
  // the /admin panel. Leave unset to disable those write endpoints entirely.
  adminSetupToken: process.env.ADMIN_SETUP_TOKEN || '',

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log'
  },

  // WebRTC Configuration
  webrtc: {
    stunServers: (process.env.STUN_SERVERS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
      .split(',').map(url => ({ urls: url.trim() })),
    turnServers: process.env.TURN_SERVERS ? 
      process.env.TURN_SERVERS.split(',').map(server => {
        const [urls, username, credential] = server.split('|');
        return { urls: urls.trim(), username, credential };
      }) : []
  },

  // Redis Configuration (for scaling)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || null
  },

  // Monitoring Configuration
  monitoring: {
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
    metricsEnabled: process.env.METRICS_ENABLED === 'true'
  },

  // Meeting Configuration
  meeting: {
    maxParticipants: 50,
    maxRoomDuration: 24 * 60 * 60 * 1000, // 24 hours
    chatRateLimit: {
      maxMessages: 30,
      windowMs: 60000 // 1 minute
    },
    recordingEnabled: false
  }
};

// Validation
const requiredEnvVars = ['DB_USER', 'DB_PASSWORD'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  process.exit(1);
}

module.exports = config;