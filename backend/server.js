const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const config = require('./src/config/environment');
const database = require('./src/config/database');
const logger = require('./src/utils/logger');
const socketService = require('./src/services/socketService');

// Routes
const roomRoutes = require('./src/routes/rooms');
const healthRoutes = require('./src/routes/health');
const settingsRoutes = require('./src/routes/settings');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIo(server, {
  cors: {
    origin: config.cors.origin,
    methods: ["GET", "POST"],
    credentials: config.cors.credentials
  },
  pingTimeout: config.socket.pingTimeout,
  pingInterval: config.socket.pingInterval,
  transports: config.socket.transports
});

// Security middleware. This server only ever responds with JSON (the API),
// static files (/uploads), and the Socket.IO handshake - it never renders
// the app's own HTML/JS (that's the separate frontend container/process,
// see README "How hosting works"), so there's no WebRTC/media functionality
// here for a strict CSP to break. It mainly matters for /uploads: SVG logo
// uploads can contain a <script>, and this stops it from running if that
// file is ever opened directly instead of embedded as an <img> (which reads
// the embedding page's CSP, not this one, so normal branding display is
// unaffected either way).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      imgSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // inline <style> inside an uploaded SVG, no script capability
      scriptSrc: ["'none'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  // Uploaded logos/backgrounds under /uploads are public brand assets meant
  // to be loaded by the frontend, which is commonly on a different origin
  // (different port in dev, a different subdomain in some deployments).
  // Helmet's same-origin default blocks exactly that via the browser's
  // Cross-Origin-Resource-Policy check, independent of the CORS headers below.
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Compression middleware
app.use(compression());

// CORS middleware
app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  skipSuccessfulRequests: config.rateLimit.skipSuccessfulRequests,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(logger.requestLogger);

// Uploaded logos, served at the same relative path the settings API returns
app.use('/uploads', express.static(path.resolve(config.upload.uploadPath)));

// Routes
app.use('/api/rooms', roomRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/health', healthRoutes);

// Initialize Socket.IO service
socketService.initialize(io);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: config.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await database.close();
      logger.info('Database connection closed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled promise rejection
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Uncaught exception
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await database.connect();

    // Start HTTP server
    server.listen(config.PORT, () => {
      console.log(`Rumo backend running on port ${config.PORT}`);
    });

    // Cleanup old rooms periodically
    setInterval(async () => {
      try {
        const Room = require('./src/models/Room');
        await Room.cleanup();
      } catch (error) {
        logger.error('Error during cleanup:', error);
      }
    }, 60 * 60 * 1000); // Every hour

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
