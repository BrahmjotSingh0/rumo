const express = require('express');
const { body, param, validationResult } = require('express-validator');
const Room = require('../models/Room');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Create a new room
router.post('/', [
  body('title').optional().isLength({ min: 1, max: 255 }).trim(),
  body('maxParticipants').optional().isInt({ min: 2, max: 100 }),
  body('password').optional().isLength({ min: 4, max: 50 })
], handleValidationErrors, async (req, res) => {
  try {
    const { title = 'Quick Meeting', maxParticipants = 50, password } = req.body;
    const hostId = uuidv4(); // In production, this would come from authentication
    
    const room = await Room.create({
      title,
      hostId,
      maxParticipants,
      password
    });
    
    logger.info('Room created:', { roomId: room.id, roomCode: room.room_code });
    
    res.status(201).json({
      success: true,
      data: {
        id: room.id,
        roomCode: room.room_code,
        title: room.title,
        hostId,
        maxParticipants: room.max_participants,
        createdAt: room.created_at
      }
    });
  } catch (error) {
    logger.error('Error creating room:', error);
    res.status(500).json({
      error: 'Failed to create room',
      message: error.message
    });
  }
});

// Get room by ID
router.get('/:roomId', [
  param('roomId').isUUID().withMessage('Invalid room ID format')
], handleValidationErrors, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    
    if (!room) {
      return res.status(404).json({
        error: 'Room not found'
      });
    }
    
    const participants = await Room.getParticipants(room.id);
    
    res.json({
      success: true,
      data: {
        id: room.id,
        roomCode: room.room_code,
        title: room.title,
        hostId: room.host_id,
        hostName: room.host_name,
        maxParticipants: room.max_participants,
        status: room.status,
        participantCount: participants.length,
        participants: participants.map(p => ({
          id: p.id,
          name: p.guest_name || p.display_name,
          isHost: p.is_host,
          joinedAt: p.joined_at
        })),
        createdAt: room.created_at,
        startedAt: room.started_at
      }
    });
  } catch (error) {
    logger.error('Error fetching room:', error);
    res.status(500).json({
      error: 'Failed to fetch room',
      message: error.message
    });
  }
});

// Get room by code
router.get('/code/:roomCode', [
  param('roomCode').isLength({ min: 9, max: 11 }).withMessage('Invalid room code format')
], handleValidationErrors, async (req, res) => {
  try {
    const room = await Room.findByCode(req.params.roomCode);
    
    if (!room) {
      return res.status(404).json({
        error: 'Room not found'
      });
    }
    
    const participants = await Room.getParticipants(room.id);
    
    res.json({
      success: true,
      data: {
        id: room.id,
        roomCode: room.room_code,
        title: room.title,
        hostId: room.host_id,
        hostName: room.host_name,
        maxParticipants: room.max_participants,
        status: room.status,
        participantCount: participants.length,
        createdAt: room.created_at,
        startedAt: room.started_at
      }
    });
  } catch (error) {
    logger.error('Error fetching room by code:', error);
    res.status(500).json({
      error: 'Failed to fetch room',
      message: error.message
    });
  }
});

// Update room status
router.patch('/:roomId/status', [
  param('roomId').isUUID().withMessage('Invalid room ID format'),
  body('status').isIn(['active', 'ended', 'scheduled']).withMessage('Invalid status')
], handleValidationErrors, async (req, res) => {
  try {
    const { status } = req.body;
    const endedAt = status === 'ended' ? new Date() : null;
    
    const room = await Room.updateStatus(req.params.roomId, status, endedAt);
    
    if (!room) {
      return res.status(404).json({
        error: 'Room not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        id: room.id,
        status: room.status,
        endedAt: room.ended_at,
        updatedAt: room.updated_at
      }
    });
  } catch (error) {
    logger.error('Error updating room status:', error);
    res.status(500).json({
      error: 'Failed to update room status',
      message: error.message
    });
  }
});

// Get room analytics
router.get('/:roomId/analytics', [
  param('roomId').isUUID().withMessage('Invalid room ID format')
], handleValidationErrors, async (req, res) => {
  try {
    const analytics = await Room.getRoomAnalytics(req.params.roomId);
    
    if (!analytics) {
      return res.status(404).json({
        error: 'Room not found'
      });
    }
    
    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    logger.error('Error fetching room analytics:', error);
    res.status(500).json({
      error: 'Failed to fetch room analytics',
      message: error.message
    });
  }
});

// Get active rooms
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    
    const rooms = await Room.getActiveRooms();
    const paginatedRooms = rooms.slice(offset, offset + parseInt(limit));
    
    res.json({
      success: true,
      data: {
        rooms: paginatedRooms,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: rooms.length,
          pages: Math.ceil(rooms.length / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching active rooms:', error);
    res.status(500).json({
      error: 'Failed to fetch active rooms',
      message: error.message
    });
  }
});

// Delete room (end meeting)
router.delete('/:roomId', [
  param('roomId').isUUID().withMessage('Invalid room ID format')
], handleValidationErrors, async (req, res) => {
  try {
    const room = await Room.updateStatus(req.params.roomId, 'ended', new Date());
    
    if (!room) {
      return res.status(404).json({
        error: 'Room not found'
      });
    }
    
    logger.info('Room ended:', { roomId: room.id, roomCode: room.room_code });
    
    res.json({
      success: true,
      message: 'Room ended successfully',
      data: {
        id: room.id,
        status: room.status,
        endedAt: room.ended_at
      }
    });
  } catch (error) {
    logger.error('Error ending room:', error);
    res.status(500).json({
      error: 'Failed to end room',
      message: error.message
    });
  }
});

module.exports = router;