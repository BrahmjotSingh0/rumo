const express = require('express');
const database = require('../config/database');
const socketService = require('../services/socketService');
const config = require('../config/environment');

const router = express.Router();

// Basic health check
router.get('/', async (req, res) => {
  try {
    const dbHealth = await database.healthCheck();
    const socketStats = socketService.getStats();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.NODE_ENV,
      version: require('../../package.json').version,
      database: dbHealth,
      socket: socketStats,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    };

    // Determine overall health status
    if (dbHealth.status !== 'healthy') {
      health.status = 'unhealthy';
      return res.status(503).json(health);
    }

    res.json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Detailed health check
router.get('/detailed', async (req, res) => {
  try {
    const dbHealth = await database.healthCheck();
    const socketStats = socketService.getStats();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.NODE_ENV,
      version: require('../../package.json').version,
      
      // Database health
      database: {
        ...dbHealth,
        connectionPool: {
          total: database.pool?.totalCount || 0,
          idle: database.pool?.idleCount || 0,
          waiting: database.pool?.waitingCount || 0
        }
      },
      
      // Socket.IO health
      socket: {
        ...socketStats,
        namespace: '/',
        adapter: 'memory'
      },
      
      // System health
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid
      },
      
      // Application health
      application: {
        name: 'Rumo',
        description: 'Video Conferencing Platform',
        features: {
          webrtc: true,
          chat: true,
          screenShare: true,
          recording: false
        }
      }
    };

    // Check critical components
    const criticalIssues = [];
    
    if (dbHealth.status !== 'healthy') {
      criticalIssues.push('Database connection failed');
      health.status = 'unhealthy';
    }
    
    if (process.memoryUsage().heapUsed > 1024 * 1024 * 1024) { // 1GB
      criticalIssues.push('High memory usage detected');
      health.status = 'degraded';
    }
    
    if (criticalIssues.length > 0) {
      health.issues = criticalIssues;
    }

    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Readiness check (for Kubernetes)
router.get('/ready', async (req, res) => {
  try {
    const dbHealth = await database.healthCheck();
    
    if (dbHealth.status === 'healthy') {
      res.json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not ready', reason: 'Database not available' });
    }
  } catch (error) {
    res.status(503).json({ status: 'not ready', reason: error.message });
  }
});

// Liveness check (for Kubernetes)
router.get('/live', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

module.exports = router;