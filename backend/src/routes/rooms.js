const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const { body, param, validationResult } = require('express-validator');
const Room = require('../models/Room');
const logger = require('../utils/logger');
const config = require('../config/environment');
const { v4: uuidv4 } = require('uuid');
const { fireWebhook } = require('../utils/webhooks');

const router = express.Router();

// Files shared in chat. Same trust level as chat itself (no accounts, so no
// per-user ownership) - anyone in a room can already send arbitrary text,
// this just extends that to small files. Not virus-scanned; self-hosters
// running this for the public should be aware files are served back as-is.
const ALLOWED_CHAT_FILE_TYPES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'application/zip': '.zip',
  'application/msword': '.doc',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx'
};
const chatUploadDir = path.join(config.upload.uploadPath, 'chat');
fs.mkdirSync(chatUploadDir, { recursive: true });

const uploadChatFile = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, chatUploadDir),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${ALLOWED_CHAT_FILE_TYPES[file.mimetype] || ''}`)
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, Boolean(ALLOWED_CHAT_FILE_TYPES[file.mimetype]))
});

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
  body('password').optional().isLength({ min: 4, max: 50 }),
  body('scheduledAt').optional().isISO8601().withMessage('scheduledAt must be an ISO 8601 date')
], handleValidationErrors, async (req, res) => {
  try {
    const { title = 'Quick Meeting', maxParticipants = 50, password, scheduledAt } = req.body;
    const hostId = uuidv4(); // In production, this would come from authentication

    const room = await Room.create({
      title,
      hostId,
      maxParticipants,
      password,
      scheduledAt: scheduledAt || null
    });

    logger.info('Room created:', { roomId: room.id, roomCode: room.room_code });
    fireWebhook('room.created', { roomId: room.id, roomCode: room.room_code, title: room.title });

    res.status(201).json({
      success: true,
      data: {
        id: room.id,
        roomCode: room.room_code,
        title: room.title,
        hostId,
        maxParticipants: room.max_participants,
        hasPassword: !!room.password_hash,
        scheduledAt: room.scheduled_at,
        status: room.status,
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
        hasPassword: !!room.password_hash,
        scheduledAt: room.scheduled_at,
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

// Verify a room's PIN before letting PreJoin proceed. Rooms without a PIN
// set always pass (see Room.verifyPin). This is a courtesy pre-check for
// the UI - the socket join itself re-checks the same PIN server-side, so
// bypassing this endpoint doesn't get you into a PIN-protected room.
router.post('/:roomId/verify-pin', [
  param('roomId').isUUID().withMessage('Invalid room ID format'),
  body('pin').optional().isLength({ max: 50 })
], handleValidationErrors, async (req, res) => {
  try {
    const ok = await Room.verifyPin(req.params.roomId, req.body.pin);
    if (!ok) {
      return res.status(401).json({ error: 'Incorrect PIN' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Error verifying room PIN:', error);
    res.status(500).json({
      error: 'Failed to verify PIN',
      message: error.message
    });
  }
});

// Upload a file to share in a room's chat. Returns a URL to pass as
// fileUrl in the 'send-message' socket event (type: 'file').
router.post('/:roomId/files', [
  param('roomId').isUUID().withMessage('Invalid room ID format')
], handleValidationErrors, (req, res) => {
  uploadChatFile.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded, or the file type is not supported' });
    }

    try {
      const room = await Room.findById(req.params.roomId);
      if (!room) {
        // req.file.path is always destination + our own crypto.randomUUID()
        // filename (see uploadChatFile above) - the caller's original
        // filename never reaches it. This check is defense in depth rather
        // than trusting that invariant forever: refuse to unlink anything
        // outside the chat upload directory instead of passing the path
        // straight through.
        const resolved = path.resolve(req.file.path);
        if (resolved.startsWith(path.resolve(chatUploadDir) + path.sep)) {
          fs.unlink(resolved, () => {});
        }
        return res.status(404).json({ error: 'Room not found' });
      }

      res.status(201).json({
        url: `/uploads/chat/${req.file.filename}`,
        name: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype
      });
    } catch (error) {
      logger.error('Error uploading chat file:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });
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

    if (status === 'ended') {
      fireWebhook('room.ended', { roomId: room.id, roomCode: room.room_code });
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
    fireWebhook('room.ended', { roomId: room.id, roomCode: room.room_code });

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