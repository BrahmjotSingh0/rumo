const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const Room = require('../models/Room');
const config = require('../config/environment');
const { fireWebhook } = require('../utils/webhooks');
const { v4: uuidv4 } = require('uuid');

class SocketService {
  constructor() {
    this.io = null;
    this.users = new Map(); // socketId -> user data
    this.rooms = new Map(); // roomId -> room data
    this.waitingParticipants = new Map(); // socketId -> waiting participant data
    this.connectionStats = new Map(); // socketId -> stats
    this.polls = new Map(); // roomId -> current poll (one at a time, null/absent if none)
  }

  initialize(io) {
    this.io = io;
    
    io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  // Host always has full control. Co-host power over other participants
  // (mute/disable-video/stop-share/kick) and over room-wide settings
  // (mute-all/chat/lock/etc) are each independently toggleable by the host -
  // see handleSetCoHostPermissions - and default to on/off respectively to
  // match what most rooms want without the host having to configure anything.
  canManageParticipants(user, roomId) {
    if (!user) return false;
    if (user.isHost) return true;
    if (user.role !== 'co-host') return false;
    const roomSettings = this.rooms.get(roomId) || {};
    return roomSettings.coHostsCanManageParticipants !== false;
  }

  canChangeRoomSettings(user, roomId) {
    if (!user) return false;
    if (user.isHost) return true;
    if (user.role !== 'co-host') return false;
    const roomSettings = this.rooms.get(roomId) || {};
    return roomSettings.coHostsCanChangeSettings === true;
  }

  // Handed to a client the moment it becomes host, and required back on
  // 'host-rejoin'. Without this, host status on rejoin was a bare boolean
  // the client could set for itself - see docs/API.md and SECURITY.md.
  signHostToken(roomId) {
    return jwt.sign({ roomId }, config.hostTokenSecret, { expiresIn: '12h' });
  }

  verifyHostToken(roomId, hostToken) {
    if (!hostToken) return false;
    try {
      const payload = jwt.verify(hostToken, config.hostTokenSecret);
      return payload.roomId === roomId;
    } catch {
      return false;
    }
  }

  handleConnection(socket) {
    this.connectionStats.set(socket.id, {
      connectedAt: Date.now(),
      messages: 0,
      bandwidth: 0,
      errors: 0
    });

    // Connection events
    socket.on('join-room', (data) => this.handleJoinRoom(socket, data));
    socket.on('leave-room', (data) => this.handleLeaveRoom(socket, data));
    
    // WebRTC signaling
    socket.on('offer', (data) => this.handleOffer(socket, data));
    socket.on('answer', (data) => this.handleAnswer(socket, data));
    socket.on('ice-candidate', (data) => this.handleIceCandidate(socket, data));
    socket.on('connection-state-change', (data) => this.handleConnectionStateChange(socket, data));
    
    // Media controls
    socket.on('toggle-audio', (data) => this.handleToggleAudio(socket, data));
    socket.on('toggle-video', (data) => this.handleToggleVideo(socket, data));
    socket.on('toggle-screen-share', (data) => this.handleToggleScreenShare(socket, data));
    socket.on('camera-flipped', (data) => this.handleCameraFlipped(socket, data));
    
    // Chat
    socket.on('send-message', (data) => this.handleSendMessage(socket, data));
    
    // Host controls
    socket.on('mute-user', (data) => this.handleMuteUser(socket, data));
    socket.on('remove-user', (data) => this.handleRemoveUser(socket, data));
    socket.on('mute-all-users', (data) => this.handleMuteAllUsers(socket, data));
    socket.on('delete-message', (data) => this.handleDeleteMessage(socket, data));
    
    // New host controls
    socket.on('mute-participant', (data) => this.handleMuteParticipant(socket, data));
    socket.on('disable-video', (data) => this.handleDisableVideo(socket, data));
    socket.on('stop-screenshare', (data) => this.handleStopScreenShare(socket, data));
    socket.on('make-cohost', (data) => this.handleMakeCoHost(socket, data));
    socket.on('remove-cohost', (data) => this.handleRemoveCoHost(socket, data));
    socket.on('kick-participant', (data) => this.handleKickParticipant(socket, data));
    socket.on('mute-all', (data) => this.handleMuteAll(socket, data));
    socket.on('toggle-chat', (data) => this.handleToggleChat(socket, data));
    socket.on('set-room-type', (data) => this.handleSetRoomType(socket, data));
    socket.on('disable-all-cameras', (data) => this.handleDisableAllCameras(socket, data));
    socket.on('disable-all-screenshares', (data) => this.handleDisableAllScreenShares(socket, data));
    socket.on('lock-meeting', (data) => this.handleLockMeeting(socket, data));
    socket.on('toggle-self-unmute', (data) => this.handleToggleSelfUnmute(socket, data));
    socket.on('toggle-participant-screenshare', (data) => this.handleToggleParticipantScreenShare(socket, data));
    socket.on('set-cohost-permissions', (data) => this.handleSetCoHostPermissions(socket, data));

    // Raise hand / reactions
    socket.on('raise-hand', (data) => this.handleRaiseHand(socket, data));
    socket.on('lower-hand', (data) => this.handleLowerHand(socket, data));
    socket.on('send-reaction', (data) => this.handleSendReaction(socket, data));
    socket.on('send-caption', (data) => this.handleSendCaption(socket, data));

    // Polls
    socket.on('create-poll', (data) => this.handleCreatePoll(socket, data));
    socket.on('vote-poll', (data) => this.handleVotePoll(socket, data));
    socket.on('close-poll', (data) => this.handleClosePoll(socket, data));

    // Private room waiting room
    socket.on('request-join', (data) => this.handleJoinRequest(socket, data));
    socket.on('host-rejoin', (data) => this.handleHostRejoin(socket, data));
    socket.on('approve-join', (data) => this.handleApproveJoin(socket, data));
    socket.on('reject-join', (data) => this.handleRejectJoin(socket, data));
    
    // Quality monitoring
    socket.on('connection-quality', (data) => this.handleConnectionQuality(socket, data));
    socket.on('network-quality', (data) => this.handleNetworkQuality(socket, data));
    
    // Disconnect
    socket.on('disconnect', (reason) => this.handleDisconnect(socket, reason));
    socket.on('error', (error) => this.handleError(socket, error));
  }

  async handleJoinRoom(socket, { roomId, userId, userName, hostToken, audioEnabled = true, videoEnabled = true, profilePicture = null, role = null }) {
    try {
      // Check if room exists in database
      const roomQuery = `SELECT * FROM "rooms" WHERE "id" = $1`;
      const roomResult = await require('../config/database').query(roomQuery, [roomId]);
      
      if (roomResult.rows.length === 0) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const room = roomResult.rows[0];

      // Check existing participants
      const participantsQuery = `
        SELECT * FROM "room_participants" 
        WHERE "room_id" = $1 AND "left_at" IS NULL
      `;
      const participantsResult = await require('../config/database').query(participantsQuery, [roomId]);
      
      if (participantsResult.rows.length >= room.max_participants) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }

      // Check if this user is already in the room from another session
      // Only check if userId is defined and not null/undefined
      const existingUserSession = userId ? Array.from(this.users.values()).find(u => 
        u.userId && u.userId === userId && u.roomId === roomId && u.socketId !== socket.id
      ) : null;

      if (existingUserSession) {
        // Notify the old session
        this.io.to(existingUserSession.socketId).emit('session-replaced', {
          message: 'You joined from another window/device',
          newSocketId: socket.id
        });

        // Remove old session
        const oldSocket = this.io.sockets.sockets.get(existingUserSession.socketId);
        if (oldSocket) {
          await this.removeUserFromRoom(oldSocket, 'session-replaced');
          oldSocket.disconnect(true);
        }

        logger.info(`User ${userId} (${userName}) switching from socket ${existingUserSession.socketId} to ${socket.id}`);
      }

      // Determine if this user should be host: either the room is empty (first
      // joiner), or they present a hostToken previously issued for this exact
      // room. A bare client-asserted "isHost" boolean is never trusted here -
      // see signHostToken/verifyHostToken above.
      const shouldBeHost = participantsResult.rows.length === 0 || this.verifyHostToken(roomId, hostToken);

      // Initialize room settings only the first time this room is seen. Every
      // join after that (guest, approved-from-waiting-room, host rejoin) must
      // leave existing settings alone - this used to reset them to defaults
      // on every join, which silently turned private rooms back public and
      // undid mute-all/chat-disabled the moment anyone else joined.
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, {
          isPrivate: false,
          allMuted: false,
          allCamerasOff: false,
          allScreenSharesOff: false,
          chatEnabled: true,
          isLocked: false,
          allowSelfUnmute: true,
          allowParticipantScreenShare: true,
          coHostsCanManageParticipants: true,
          coHostsCanChangeSettings: false
        });
      }
      const roomSettings = this.rooms.get(roomId);

      // Apply room-wide restrictions for non-host/co-host users
      let finalAudioEnabled = audioEnabled;
      let finalVideoEnabled = videoEnabled;
      
      if (!shouldBeHost && role !== 'co-host') {
        if (roomSettings.allMuted) {
          finalAudioEnabled = false;
        }
        if (roomSettings.allCamerasOff) {
          finalVideoEnabled = false;
        }
      }

      // Join socket room
      socket.join(roomId);

      // Add participant to database with their audio/video preferences
      const addParticipantQuery = `
        INSERT INTO "room_participants" 
        ("room_id", "guest_name", "socket_id", "is_host", "audio_enabled", "video_enabled")
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      
      const participantResult = await require('../config/database').query(addParticipantQuery, [
        roomId, userName, socket.id, shouldBeHost, finalAudioEnabled, finalVideoEnabled
      ]);
      const participant = participantResult.rows[0];

      // Store user data with profile picture
      const userData = {
        id: participant.id,
        userId,
        socketId: socket.id,
        name: userName,
        profilePicture,
        role,
        roomId,
        isHost: shouldBeHost,
        audioEnabled: finalAudioEnabled,
        videoEnabled: finalVideoEnabled,
        screenSharing: false,
        handRaised: false,
        joinedAt: new Date()
      };
      
      this.users.set(socket.id, userData);

      // Get all current participants including this one
      const allParticipantsQuery = `
        SELECT * FROM "room_participants" 
        WHERE "room_id" = $1 AND "left_at" IS NULL
        ORDER BY "joined_at" ASC
      `;
      const allParticipantsResult = await require('../config/database').query(allParticipantsQuery, [roomId]);
      
      // Map participants with their profile data from in-memory store
      const allParticipants = allParticipantsResult.rows.map(p => {
        const userDataInMemory = this.users.get(p.socket_id);
        return {
          id: p.id,
          socketId: p.socket_id,
          name: p.guest_name,
          profilePicture: userDataInMemory?.profilePicture || null,
          role: userDataInMemory?.role || null,
          isHost: p.is_host,
          audioEnabled: p.audio_enabled,
          videoEnabled: p.video_enabled,
          screenSharing: p.screen_sharing,
          handRaised: userDataInMemory?.handRaised || false
        };
      });

      // Notify others about new participant (send to everyone in room)
      socket.to(roomId).emit('user-joined', {
        id: participant.id,
        socketId: socket.id,
        name: userName,
        profilePicture,
        role,
        isHost: shouldBeHost,
        audioEnabled: audioEnabled,
        videoEnabled: videoEnabled,
        screenSharing: false
      });

      // Send ALL participants to new user (including others)
      const otherParticipants = allParticipants.filter(p => p.socketId !== socket.id);
      socket.emit('room-users', otherParticipants);

      // Send current room settings to the new participant
      socket.emit('room-settings', roomSettings);

      // Send the active poll, if any, so a mid-poll joiner sees it immediately
      const activePoll = this.polls.get(roomId);
      if (activePoll) {
        socket.emit('poll-created', this.serializePoll(activePoll));
      }

      // Tell the joining client their own host status - this is the only
      // place a client learns whether it's host, since there's no account
      // system to derive it from on the REST side. hostToken is only ever
      // sent to the socket that earned it, never broadcast to the room.
      socket.emit('host-status', {
        isHost: shouldBeHost,
        hostToken: shouldBeHost ? this.signHostToken(roomId) : null
      });

      // Also send updated participant list to everyone else
      socket.to(roomId).emit('participant-list-updated', allParticipants);

      logger.info(`${userName} joined room ${roomId} as ${shouldBeHost ? 'host' : 'participant'} (${allParticipants.length} total)`);

      this.updateConnectionStats(socket.id, 'join-room');
      fireWebhook('participant.joined', { roomId, participantId: participant.id, name: userName, isHost: shouldBeHost });
      
    } catch (error) {
      logger.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  }

  async handleLeaveRoom(socket) {
    await this.removeUserFromRoom(socket);
  }

  handleOffer(socket, { target, offer, metadata }) {
    try {
      socket.to(target).emit('offer', {
        sender: socket.id,
        offer,
        metadata: metadata || {},
        timestamp: Date.now()
      });
      
      this.updateConnectionStats(socket.id, 'offer', offer);
      logger.socketEvent('offer', { from: socket.id, to: target });
      
    } catch (error) {
      logger.error('Error handling offer:', error);
      socket.emit('webrtc-error', { type: 'offer-failed', error: error.message });
    }
  }

  handleAnswer(socket, { target, answer, metadata }) {
    try {
      socket.to(target).emit('answer', {
        sender: socket.id,
        answer,
        metadata: metadata || {},
        timestamp: Date.now()
      });
      
      this.updateConnectionStats(socket.id, 'answer', answer);
      logger.socketEvent('answer', { from: socket.id, to: target });
      
    } catch (error) {
      logger.error('Error handling answer:', error);
      socket.emit('webrtc-error', { type: 'answer-failed', error: error.message });
    }
  }

  handleIceCandidate(socket, { target, candidate }) {
    try {
      socket.to(target).emit('ice-candidate', {
        sender: socket.id,
        candidate,
        timestamp: Date.now()
      });
      
      this.updateConnectionStats(socket.id, 'ice-candidate', candidate);
      
    } catch (error) {
      logger.error('Error handling ICE candidate:', error);
      socket.emit('webrtc-error', { type: 'ice-failed', error: error.message });
    }
  }

  handleConnectionStateChange(socket, { target, state }) {
    socket.to(target).emit('peer-connection-state', {
      sender: socket.id,
      state,
      timestamp: Date.now()
    });
    
    logger.webrtcEvent('connection-state-change', socket.id, { target, state });
  }

  async handleToggleAudio(socket, { roomId, enabled }) {
    try {
      const user = this.users.get(socket.id);
      if (!user) return;

      if (enabled && !this.canManageParticipants(user, roomId)) {
        const roomSettings = this.rooms.get(roomId);
        if (roomSettings?.allowSelfUnmute === false) {
          this.io.to(socket.id).emit('force-mute', {
            reason: 'self-unmute-disabled',
            timestamp: Date.now()
          });
          return;
        }
      }

      user.audioEnabled = enabled;
      await Room.updateParticipantMedia(socket.id, { audioEnabled: enabled });
      socket.to(roomId).emit('user-audio-toggle', {
        userId: user.id,
        socketId: socket.id,
        enabled
      });
    } catch (error) {
      logger.error('Error toggling audio:', error);
    }
  }

  async handleToggleVideo(socket, { roomId, enabled }) {
    try {
      const user = this.users.get(socket.id);
      if (user) {
        user.videoEnabled = enabled;
        await Room.updateParticipantMedia(socket.id, { videoEnabled: enabled });
        socket.to(roomId).emit('user-video-toggle', { 
          userId: user.id,
          socketId: socket.id, 
          enabled 
        });
      }
    } catch (error) {
      logger.error('Error toggling video:', error);
    }
  }

  async handleToggleScreenShare(socket, { roomId, enabled, quality }) {
    try {
      const user = this.users.get(socket.id);
      if (!user) return;

      if (enabled && !this.canManageParticipants(user, roomId)) {
        const roomSettings = this.rooms.get(roomId);
        if (roomSettings?.allowParticipantScreenShare === false) {
          this.io.to(socket.id).emit('force-stop-screenshare', {
            reason: 'screenshare-disabled',
            timestamp: Date.now()
          });
          return;
        }
      }

      user.screenSharing = enabled;
      await Room.updateParticipantMedia(socket.id, { screenSharing: enabled });
      socket.to(roomId).emit('user-screen-share', {
        userId: user.id,
        socketId: socket.id,
        enabled,
        quality: quality || 'high',
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error toggling screen share:', error);
    }
  }

  async handleCameraFlipped(socket, { roomId, facingMode, trackId }) {
    try {
      const user = this.users.get(socket.id);
      if (user) {
        logger.info(`User ${user.id} flipped camera to ${facingMode}`);
        // Broadcast to other users in the room
        socket.to(roomId).emit('camera-flipped', {
          userId: user.id,
          socketId: socket.id,
          facingMode,
          trackId,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      logger.error('Error handling camera flip:', error);
    }
  }

  handleSendMessage(socket, { roomId, message, userName, profilePicture, type = 'text' }) {
    try {
      // Rate limiting
      const stats = this.connectionStats.get(socket.id);
      if (stats) {
        const now = Date.now();
        if (!stats.lastMessageTime) stats.lastMessageTime = now;
        if (!stats.messageCount) stats.messageCount = 0;
        
        // Reset counter every minute
        if (now - stats.lastMessageTime > 60000) {
          stats.messageCount = 0;
          stats.lastMessageTime = now;
        }
        
        if (stats.messageCount >= 30) {
          socket.emit('rate-limit-exceeded', { type: 'chat' });
          return;
        }
        
        stats.messageCount++;
      }

      const chatMessage = {
        id: uuidv4(),
        userId: this.users.get(socket.id)?.id,
        userName,
        profilePicture: profilePicture || null,
        message: message.substring(0, 500), // Limit message length
        type,
        timestamp: new Date()
      };

      this.io.to(roomId).emit('new-message', chatMessage);
      this.updateConnectionStats(socket.id, 'message', chatMessage);
      
    } catch (error) {
      logger.error('Error sending message:', error);
    }
  }

  async handleMuteUser(socket, { roomId, targetUserId }) {
    try {
      const host = this.users.get(socket.id);
      if (!host?.isHost) return;

      const targetUser = Array.from(this.users.values())
        .find(u => u.id === targetUserId);
      
      if (targetUser) {
        this.io.to(targetUser.socketId).emit('force-mute');
        socket.to(roomId).emit('user-audio-toggle', { 
          userId: targetUserId,
          socketId: targetUser.socketId,
          enabled: false 
        });
        
        await Room.updateParticipantMedia(targetUser.socketId, { audioEnabled: false });
      }
    } catch (error) {
      logger.error('Error muting user:', error);
    }
  }

  async handleRemoveUser(socket, { targetUserId }) {
    try {
      const host = this.users.get(socket.id);
      if (!host?.isHost) return;

      const targetUser = Array.from(this.users.values())
        .find(u => u.id === targetUserId);
      
      if (targetUser) {
        this.io.to(targetUser.socketId).emit('removed-from-room');
        this.io.sockets.sockets.get(targetUser.socketId)?.disconnect();
      }
    } catch (error) {
      logger.error('Error removing user:', error);
    }
  }

  handleMuteAllUsers(socket, { roomId }) {
    try {
      const host = this.users.get(socket.id);
      if (!host?.isHost) return;

      // Mute all users except host
      Array.from(this.users.values())
        .filter(user => user.roomId === roomId && !user.isHost)
        .forEach(user => {
          this.io.to(user.socketId).emit('force-mute');
        });
      
      socket.to(roomId).emit('all-users-muted');
    } catch (error) {
      logger.error('Error muting all users:', error);
    }
  }

  handleDeleteMessage(socket, { roomId, messageId }) {
    try {
      const host = this.users.get(socket.id);
      if (!host?.isHost) return;

      this.io.to(roomId).emit('message-deleted', { messageId });
    } catch (error) {
      logger.error('Error deleting message:', error);
    }
  }

  handleConnectionQuality(socket, data) {
    const user = this.users.get(socket.id);
    if (user) {
      socket.to(user.roomId).emit('user-connection-quality', {
        userId: user.id,
        socketId: socket.id,
        quality: data
      });
    }
  }

  handleNetworkQuality(socket, { roomId, stats }) {
    const user = this.users.get(socket.id);
    if (user) {
      socket.to(roomId).emit('user-network-quality', {
        userId: user.id,
        socketId: socket.id,
        stats,
        timestamp: Date.now()
      });
    }
  }

  // New Host Control Handlers
  async handleMuteParticipant(socket, { roomId, targetSocketId }) {
    try {
      const host = this.users.get(socket.id);

      if (!this.canManageParticipants(host, roomId)) {
        socket.emit('error', { message: 'You do not have permission to mute participants' });
        return;
      }

      const targetUser = this.users.get(targetSocketId);
      
      if (targetUser && targetUser.roomId === roomId) {
        targetUser.audioEnabled = false;
        
        // Notify target user to mute
        this.io.to(targetSocketId).emit('force-mute', {
          by: host.name,
          timestamp: Date.now()
        });
        
        // Update database
        await Room.updateParticipantMedia(targetSocketId, { audioEnabled: false });
        
        // Notify all users
        this.io.to(roomId).emit('user-audio-toggle', {
          userId: targetUser.id,
          socketId: targetSocketId,
          enabled: false
        });
        
        logger.info(`${host.name} muted ${targetUser.name} in room ${roomId}`);
      }
    } catch (error) {
      logger.error('Error muting participant:', error);
      socket.emit('error', { message: 'Failed to mute participant' });
    }
  }

  async handleDisableVideo(socket, { roomId, targetSocketId }) {
    try {
      const host = this.users.get(socket.id);
      if (!this.canManageParticipants(host, roomId)) {
        socket.emit('error', { message: 'You do not have permission to disable video' });
        return;
      }

      const targetUser = this.users.get(targetSocketId);
      if (targetUser && targetUser.roomId === roomId) {
        targetUser.videoEnabled = false;
        
        // Notify target user to disable video
        this.io.to(targetSocketId).emit('force-video-off', {
          by: host.name,
          timestamp: Date.now()
        });
        
        // Update database
        await Room.updateParticipantMedia(targetSocketId, { videoEnabled: false });
        
        // Notify all users
        this.io.to(roomId).emit('user-video-toggle', {
          userId: targetUser.id,
          socketId: targetSocketId,
          enabled: false
        });
        
        logger.info(`${host.name} disabled video for ${targetUser.name} in room ${roomId}`);
      }
    } catch (error) {
      logger.error('Error disabling video:', error);
      socket.emit('error', { message: 'Failed to disable video' });
    }
  }

  async handleStopScreenShare(socket, { roomId, targetSocketId }) {
    try {
      const host = this.users.get(socket.id);
      if (!this.canManageParticipants(host, roomId)) {
        socket.emit('error', { message: 'You do not have permission to stop screen share' });
        return;
      }

      const targetUser = this.users.get(targetSocketId);
      if (targetUser && targetUser.roomId === roomId) {
        targetUser.screenSharing = false;
        
        // Notify target user to stop screen share
        this.io.to(targetSocketId).emit('force-stop-screenshare', {
          by: host.name,
          timestamp: Date.now()
        });
        
        // Update database
        await Room.updateParticipantMedia(targetSocketId, { screenSharing: false });
        
        // Notify all users
        this.io.to(roomId).emit('user-screen-share', {
          userId: targetUser.id,
          socketId: targetSocketId,
          enabled: false
        });
        
        logger.info(`${host.name} stopped screen share for ${targetUser.name} in room ${roomId}`);
      }
    } catch (error) {
      logger.error('Error stopping screen share:', error);
      socket.emit('error', { message: 'Failed to stop screen share' });
    }
  }

  async handleMakeCoHost(socket, { roomId, targetSocketId }) {
    try {
      const host = this.users.get(socket.id);
      if (!host?.isHost) {
        socket.emit('error', { message: 'Only host can make co-hosts' });
        return;
      }

      const targetUser = this.users.get(targetSocketId);
      if (targetUser && targetUser.roomId === roomId) {
        targetUser.role = 'co-host';
        
        // Notify target user
        this.io.to(targetSocketId).emit('role-changed', {
          role: 'co-host',
          by: host.name,
          timestamp: Date.now()
        });
        
        // Notify all users
        this.io.to(roomId).emit('participant-role-updated', {
          userId: targetUser.id,
          socketId: targetSocketId,
          role: 'co-host',
          name: targetUser.name
        });
        
        logger.info(`${host.name} made ${targetUser.name} a co-host in room ${roomId}`);
      }
    } catch (error) {
      logger.error('Error making co-host:', error);
      socket.emit('error', { message: 'Failed to make co-host' });
    }
  }

  async handleRemoveCoHost(socket, { roomId, targetSocketId }) {
    try {
      const host = this.users.get(socket.id);
      if (!host?.isHost) {
        socket.emit('error', { message: 'Only host can remove co-hosts' });
        return;
      }

      const targetUser = this.users.get(targetSocketId);
      if (targetUser && targetUser.roomId === roomId) {
        targetUser.role = 'participant';
        
        // Notify target user
        this.io.to(targetSocketId).emit('role-changed', {
          role: 'participant',
          by: host.name,
          timestamp: Date.now()
        });
        
        // Notify all users
        this.io.to(roomId).emit('participant-role-updated', {
          userId: targetUser.id,
          socketId: targetSocketId,
          role: 'participant',
          name: targetUser.name
        });
        
        logger.info(`${host.name} removed co-host status from ${targetUser.name} in room ${roomId}`);
      }
    } catch (error) {
      logger.error('Error removing co-host:', error);
      socket.emit('error', { message: 'Failed to remove co-host' });
    }
  }

  async handleKickParticipant(socket, { roomId, targetSocketId }) {
    try {
      const host = this.users.get(socket.id);
      if (!this.canManageParticipants(host, roomId)) {
        socket.emit('error', { message: 'You do not have permission to remove participants' });
        return;
      }

      const targetUser = this.users.get(targetSocketId);
      if (targetUser && targetUser.roomId === roomId) {
        // Notify target user before disconnect
        this.io.to(targetSocketId).emit('kicked-from-room', {
          by: host.name,
          timestamp: Date.now()
        });
        
        // Remove from room
        await this.removeUserFromRoom(this.io.sockets.sockets.get(targetSocketId), 'kicked');
        
        // Disconnect them
        this.io.sockets.sockets.get(targetSocketId)?.disconnect(true);
        
        logger.info(`${host.name} kicked ${targetUser.name} from room ${roomId}`);
      }
    } catch (error) {
      logger.error('Error kicking participant:', error);
      socket.emit('error', { message: 'Failed to kick participant' });
    }
  }

  async handleMuteAll(socket, { roomId, enabled }) {
    try {
      const host = this.users.get(socket.id);
      if (!this.canChangeRoomSettings(host, roomId)) {
        socket.emit('error', { message: 'You do not have permission to change room settings' });
        return;
      }

      // Update room settings to enforce muting for new participants
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, {});
      }
      const roomSettings = this.rooms.get(roomId);
      roomSettings.allMuted = enabled;

      if (enabled) {
        // Mute all participants except host and co-hosts
        const participants = Array.from(this.users.values())
          .filter(user => user.roomId === roomId && !user.isHost && user.role !== 'co-host');
        
        for (const participant of participants) {
          participant.audioEnabled = false;
          
          this.io.to(participant.socketId).emit('force-mute', {
            by: host.name,
            reason: 'mute-all',
            timestamp: Date.now()
          });
          
          await Room.updateParticipantMedia(participant.socketId, { audioEnabled: false });
        }
      }
      // When enabled=false, we don't force unmute, just allow users to unmute themselves
      
      // Notify all users
      this.io.to(roomId).emit('all-participants-muted', {
        enabled,
        by: host.name,
        timestamp: Date.now()
      });
      
      logger.info(`${host.name} ${enabled ? 'muted' : 'unmuted'} all participants in room ${roomId}`);
    } catch (error) {
      logger.error('Error muting all:', error);
      socket.emit('error', { message: 'Failed to mute all' });
    }
  }

  handleToggleChat(socket, { roomId, enabled }) {
    try {
      const host = this.users.get(socket.id);
      if (!this.canChangeRoomSettings(host, roomId)) {
        socket.emit('error', { message: 'You do not have permission to change room settings' });
        return;
      }

      // Update room settings in memory
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, {});
      }
      const roomSettings = this.rooms.get(roomId);
      roomSettings.chatEnabled = enabled;

      // Notify all users
      this.io.to(roomId).emit('chat-status-changed', {
        enabled,
        by: host.name,
        timestamp: Date.now()
      });
      
      logger.info(`${host.name} ${enabled ? 'enabled' : 'disabled'} chat in room ${roomId}`);
    } catch (error) {
      logger.error('Error toggling chat:', error);
      socket.emit('error', { message: 'Failed to toggle chat' });
    }
  }

  handleSetRoomType(socket, { roomId, isPrivate }) {
    try {
      const host = this.users.get(socket.id);
      if (!this.canChangeRoomSettings(host, roomId)) {
        socket.emit('error', { message: 'You do not have permission to change room settings' });
        return;
      }

      // Store room type in memory or database
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, {});
      }
      const roomData = this.rooms.get(roomId);
      roomData.isPrivate = isPrivate;
      
      // Notify all users
      this.io.to(roomId).emit('room-type-changed', {
        isPrivate,
        by: host.name,
        timestamp: Date.now()
      });
      
      logger.info(`${host.name} changed room ${roomId} to ${isPrivate ? 'private' : 'public'}`);
    } catch (error) {
      logger.error('Error setting room type:', error);
      socket.emit('error', { message: 'Failed to set room type' });
    }
  }

  async handleDisableAllCameras(socket, { roomId, enabled }) {
    try {
      const host = this.users.get(socket.id);
      if (!this.canChangeRoomSettings(host, roomId)) {
        socket.emit('error', { message: 'You do not have permission to change room settings' });
        return;
      }

      // Update room settings to enforce camera disable for new participants
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, {});
      }
      const roomSettings = this.rooms.get(roomId);
      roomSettings.allCamerasOff = enabled;

      if (enabled) {
        // Disable cameras for all participants except host and co-hosts
        const participants = Array.from(this.users.values())
          .filter(user => user.roomId === roomId && !user.isHost && user.role !== 'co-host');
        
        for (const participant of participants) {
          participant.videoEnabled = false;
          
          this.io.to(participant.socketId).emit('force-video-off', {
            by: host.name,
            reason: 'disable-all',
            timestamp: Date.now()
          });
          
          await Room.updateParticipantMedia(participant.socketId, { videoEnabled: false });
        }
      }
      // When enabled=false, we don't force cameras on, just allow users to turn them on themselves
      
      // Notify all users
      this.io.to(roomId).emit('all-cameras-disabled', {
        enabled,
        by: host.name,
        timestamp: Date.now()
      });
      
      logger.info(`${host.name} ${enabled ? 'disabled' : 'enabled'} all cameras in room ${roomId}`);
    } catch (error) {
      logger.error('Error disabling all cameras:', error);
      socket.emit('error', { message: 'Failed to disable all cameras' });
    }
  }

  async handleDisableAllScreenShares(socket, { roomId, enabled }) {
    try {
      const host = this.users.get(socket.id);
      if (!this.canChangeRoomSettings(host, roomId)) {
        socket.emit('error', { message: 'You do not have permission to change room settings' });
        return;
      }

      // Update room settings to prevent screen sharing for new participants
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, {});
      }
      const roomSettings = this.rooms.get(roomId);
      roomSettings.allScreenSharesOff = enabled;

      if (enabled) {
        // Disable screen shares for all participants except host and co-hosts
        const participants = Array.from(this.users.values())
          .filter(user => user.roomId === roomId && !user.isHost && user.role !== 'co-host');
        
        for (const participant of participants) {
          participant.screenSharing = false;
          
          this.io.to(participant.socketId).emit('force-stop-screenshare', {
            by: host.name,
            reason: 'disable-all',
            timestamp: Date.now()
          });
          
          await Room.updateParticipantMedia(participant.socketId, { screenSharing: false });
        }
      }
      // When enabled=false, we don't force screen shares back on
      
      // Notify all users
      this.io.to(roomId).emit('all-screenshares-disabled', {
        enabled,
        by: host.name,
        timestamp: Date.now()
      });
      
      logger.info(`${host.name} ${enabled ? 'disabled' : 'enabled'} all screen shares in room ${roomId}`);
    } catch (error) {
      logger.error('Error disabling all screen shares:', error);
      socket.emit('error', { message: 'Failed to disable all screen shares' });
    }
  }

  handleLockMeeting(socket, { roomId, locked }) {
    try {
      const host = this.users.get(socket.id);
      if (!this.canChangeRoomSettings(host, roomId)) {
        socket.emit('error', { message: 'You do not have permission to change room settings' });
        return;
      }

      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, {});
      }
      this.rooms.get(roomId).isLocked = locked;

      this.io.to(roomId).emit('meeting-lock-changed', {
        locked,
        by: host.name,
        timestamp: Date.now()
      });

      logger.info(`${host.name} ${locked ? 'locked' : 'unlocked'} room ${roomId}`);
    } catch (error) {
      logger.error('Error locking meeting:', error);
      socket.emit('error', { message: 'Failed to lock meeting' });
    }
  }

  handleToggleSelfUnmute(socket, { roomId, enabled }) {
    try {
      const host = this.users.get(socket.id);
      if (!this.canChangeRoomSettings(host, roomId)) {
        socket.emit('error', { message: 'You do not have permission to change room settings' });
        return;
      }

      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, {});
      }
      this.rooms.get(roomId).allowSelfUnmute = enabled;

      this.io.to(roomId).emit('self-unmute-permission-changed', {
        enabled,
        by: host.name,
        timestamp: Date.now()
      });

      logger.info(`${host.name} ${enabled ? 'allowed' : 'disallowed'} self-unmute in room ${roomId}`);
    } catch (error) {
      logger.error('Error toggling self-unmute permission:', error);
      socket.emit('error', { message: 'Failed to change self-unmute permission' });
    }
  }

  handleToggleParticipantScreenShare(socket, { roomId, enabled }) {
    try {
      const host = this.users.get(socket.id);
      if (!this.canChangeRoomSettings(host, roomId)) {
        socket.emit('error', { message: 'You do not have permission to change room settings' });
        return;
      }

      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, {});
      }
      this.rooms.get(roomId).allowParticipantScreenShare = enabled;

      this.io.to(roomId).emit('participant-screenshare-permission-changed', {
        enabled,
        by: host.name,
        timestamp: Date.now()
      });

      logger.info(`${host.name} ${enabled ? 'allowed' : 'disallowed'} participant screen share in room ${roomId}`);
    } catch (error) {
      logger.error('Error toggling participant screen share permission:', error);
      socket.emit('error', { message: 'Failed to change screen share permission' });
    }
  }

  // Host-only (not gated by canChangeRoomSettings): a co-host granting itself
  // or other co-hosts more power would be a privilege escalation, so only the
  // actual host can change what co-hosts are allowed to do.
  handleSetCoHostPermissions(socket, { roomId, canManageParticipants, canChangeSettings }) {
    try {
      const host = this.users.get(socket.id);
      if (!host?.isHost) {
        socket.emit('error', { message: 'Only the host can change co-host permissions' });
        return;
      }

      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, {});
      }
      const roomSettings = this.rooms.get(roomId);
      if (typeof canManageParticipants === 'boolean') {
        roomSettings.coHostsCanManageParticipants = canManageParticipants;
      }
      if (typeof canChangeSettings === 'boolean') {
        roomSettings.coHostsCanChangeSettings = canChangeSettings;
      }

      this.io.to(roomId).emit('co-host-permissions-changed', {
        coHostsCanManageParticipants: roomSettings.coHostsCanManageParticipants,
        coHostsCanChangeSettings: roomSettings.coHostsCanChangeSettings,
        by: host.name,
        timestamp: Date.now()
      });

      logger.info(`${host.name} updated co-host permissions in room ${roomId}`);
    } catch (error) {
      logger.error('Error setting co-host permissions:', error);
      socket.emit('error', { message: 'Failed to change co-host permissions' });
    }
  }

  handleRaiseHand(socket, { roomId }) {
    try {
      const user = this.users.get(socket.id);
      if (!user) return;

      user.handRaised = true;
      this.io.to(roomId).emit('hand-raised', {
        socketId: socket.id,
        userName: user.name,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error raising hand:', error);
    }
  }

  handleLowerHand(socket, { roomId, targetSocketId }) {
    try {
      const user = this.users.get(socket.id);
      if (!user) return;

      // Anyone can lower their own hand; host/co-host can lower someone else's.
      const target = targetSocketId && targetSocketId !== socket.id ? targetSocketId : socket.id;
      if (target !== socket.id && !this.canManageParticipants(user, roomId)) {
        socket.emit('error', { message: 'You do not have permission to lower someone else\'s hand' });
        return;
      }

      const targetUser = this.users.get(target);
      if (targetUser) targetUser.handRaised = false;

      this.io.to(roomId).emit('hand-lowered', {
        socketId: target,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error lowering hand:', error);
    }
  }

  handleSendReaction(socket, { roomId, emoji }) {
    try {
      const user = this.users.get(socket.id);
      if (!user) return;

      // Small fixed set - reactions are decorative, not user-generated text,
      // so there's no reason to accept arbitrary strings here.
      const ALLOWED_REACTIONS = ['👍', '👏', '❤️', '😂', '🎉', '👋'];
      if (!ALLOWED_REACTIONS.includes(emoji)) return;

      this.io.to(roomId).emit('reaction-received', {
        socketId: socket.id,
        userName: user.name,
        emoji,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error sending reaction:', error);
    }
  }

  // Relays one participant's own live-caption line (recognized client-side
  // from their own mic, see frontend/src/hooks/useLiveCaptions.js) to the
  // room. Ephemeral - never persisted, unlike chat messages.
  handleSendCaption(socket, { roomId, text }) {
    try {
      const user = this.users.get(socket.id);
      if (!user || !text) return;

      this.io.to(roomId).emit('caption-received', {
        socketId: socket.id,
        userName: user.name,
        text: String(text).slice(0, 300),
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error sending caption:', error);
    }
  }

  // Sends vote counts, never who voted for what - participants can see the
  // poll is live and how it's trending without their individual choice being
  // broadcast to everyone else in the room.
  serializePoll(poll) {
    return {
      id: poll.id,
      question: poll.question,
      options: poll.options.map(o => ({ text: o.text, votes: o.votes.size })),
      isOpen: poll.isOpen,
      totalVoters: new Set(poll.options.flatMap(o => Array.from(o.votes))).size,
      createdBy: poll.createdBy
    };
  }

  handleCreatePoll(socket, { roomId, question, options }) {
    try {
      const host = this.users.get(socket.id);
      if (!this.canChangeRoomSettings(host, roomId)) {
        socket.emit('error', { message: 'You do not have permission to create a poll' });
        return;
      }

      const cleanQuestion = String(question || '').trim().slice(0, 300);
      const cleanOptions = Array.isArray(options)
        ? options.map(o => String(o || '').trim().slice(0, 150)).filter(Boolean).slice(0, 10)
        : [];

      if (!cleanQuestion || cleanOptions.length < 2) {
        socket.emit('error', { message: 'A poll needs a question and at least 2 options' });
        return;
      }

      const poll = {
        id: uuidv4(),
        question: cleanQuestion,
        options: cleanOptions.map(text => ({ text, votes: new Set() })),
        isOpen: true,
        createdBy: host.name
      };
      this.polls.set(roomId, poll);

      this.io.to(roomId).emit('poll-created', this.serializePoll(poll));
      logger.info(`${host.name} created a poll in room ${roomId}`);
    } catch (error) {
      logger.error('Error creating poll:', error);
      socket.emit('error', { message: 'Failed to create poll' });
    }
  }

  handleVotePoll(socket, { roomId, optionIndex }) {
    try {
      const user = this.users.get(socket.id);
      if (!user) return;

      const poll = this.polls.get(roomId);
      if (!poll || !poll.isOpen) {
        socket.emit('error', { message: 'There is no open poll to vote in' });
        return;
      }
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) {
        return;
      }

      // Single-choice: clear any previous vote from this socket first.
      poll.options.forEach(o => o.votes.delete(socket.id));
      poll.options[optionIndex].votes.add(socket.id);

      this.io.to(roomId).emit('poll-updated', this.serializePoll(poll));
    } catch (error) {
      logger.error('Error voting in poll:', error);
    }
  }

  handleClosePoll(socket, { roomId }) {
    try {
      const host = this.users.get(socket.id);
      if (!this.canChangeRoomSettings(host, roomId)) {
        socket.emit('error', { message: 'You do not have permission to close the poll' });
        return;
      }

      const poll = this.polls.get(roomId);
      if (!poll) return;

      poll.isOpen = false;
      this.io.to(roomId).emit('poll-closed', this.serializePoll(poll));
      logger.info(`${host.name} closed the poll in room ${roomId}`);
    } catch (error) {
      logger.error('Error closing poll:', error);
      socket.emit('error', { message: 'Failed to close poll' });
    }
  }

  async handleHostRejoin(socket, { roomId, userId, userName, profilePicture, role, audioEnabled, videoEnabled, hostToken }) {
    try {
      await this.handleJoinRoom(socket, {
        roomId,
        userId,
        userName,
        hostToken,
        audioEnabled,
        videoEnabled,
        profilePicture,
        role
      });
    } catch (error) {
      logger.error('Error handling host rejoin:', error);
      socket.emit('error', { message: 'Failed to rejoin as host' });
    }
  }

  async handleJoinRequest(socket, { roomId, userName, profilePicture, audioEnabled, videoEnabled, pin, hostToken }) {
    try {
      // PIN gate applies to everyone, including the first joiner - if the
      // room has a PIN set, whoever set it knows it. Enforced here (not just
      // the /verify-pin REST courtesy check) so it can't be skipped by
      // talking to the socket directly.
      const pinOk = await Room.verifyPin(roomId, pin);
      if (!pinOk) {
        socket.emit('error', { message: 'Incorrect PIN' });
        return;
      }

      // Check if room exists and get participants
      const existingParticipants = Array.from(this.users.values())
        .filter(user => user.roomId === roomId);

      // If room is empty (no participants), this is the first person (host) - allow direct join
      if (existingParticipants.length === 0) {
        await this.handleJoinRoom(socket, { roomId, userName, profilePicture, audioEnabled, videoEnabled, hostToken });
        return;
      }

      // Check room settings
      const roomSettings = this.rooms.get(roomId);

      if (roomSettings?.isLocked) {
        socket.emit('error', { message: 'This meeting is locked by the host.' });
        return;
      }

      // If room is not private, allow direct join
      if (!roomSettings || !roomSettings.isPrivate) {
        await this.handleJoinRoom(socket, { roomId, userName, profilePicture, audioEnabled, videoEnabled, hostToken });
        return;
      }

      // Room is private and has participants - add to waiting list
      const waitingData = {
        socketId: socket.id,
        roomId,
        userName,
        profilePicture,
        audioEnabled,
        videoEnabled,
        timestamp: Date.now()
      };

      this.waitingParticipants.set(socket.id, waitingData);

      // Notify participant they're waiting
      socket.emit('waiting-for-approval', {
        message: 'Waiting for host approval...',
        timestamp: Date.now()
      });

      // Notify all hosts and co-hosts in the room
      const hostsAndCoHosts = existingParticipants
        .filter(user => user.isHost || user.role === 'co-host');

      if (hostsAndCoHosts.length === 0) {
        // No host/co-host in room - this shouldn't happen but handle gracefully
        logger.warn(`Private room ${roomId} has no host - allowing join`);
        this.waitingParticipants.delete(socket.id);
        await this.handleJoinRoom(socket, { roomId, userName, profilePicture, audioEnabled, videoEnabled, hostToken });
        return;
      }

      hostsAndCoHosts.forEach(host => {
        logger.info(`Sending join-request to ${host.name} (${host.socketId})`);
        this.io.to(host.socketId).emit('join-request', {
          socketId: socket.id,
          userName,
          profilePicture,
          timestamp: Date.now()
        });
      });

      logger.info(`${userName} (${socket.id}) requested to join private room ${roomId}. Notified ${hostsAndCoHosts.length} host(s)/co-host(s)`);
    } catch (error) {
      logger.error('Error handling join request:', error);
      socket.emit('error', { message: 'Failed to request join' });
    }
  }

  async handleApproveJoin(socket, { targetSocketId }) {
    try {
      const host = this.users.get(socket.id);
      if (!host?.isHost && host?.role !== 'co-host') {
        socket.emit('error', { message: 'Only host or co-host can approve join requests' });
        return;
      }

      const waitingData = this.waitingParticipants.get(targetSocketId);
      if (!waitingData) {
        socket.emit('error', { message: 'Join request not found' });
        return;
      }

      // Remove from waiting list
      this.waitingParticipants.delete(targetSocketId);

      // Notify participant they're approved
      this.io.to(targetSocketId).emit('join-approved', {
        by: host.name,
        timestamp: Date.now()
      });

      // Proceed with normal join
      const targetSocket = this.io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        await this.handleJoinRoom(targetSocket, {
          roomId: waitingData.roomId,
          userName: waitingData.userName,
          profilePicture: waitingData.profilePicture,
          audioEnabled: waitingData.audioEnabled,
          videoEnabled: waitingData.videoEnabled
        });
      }

      logger.info(`${host.name} approved ${waitingData.userName} to join room ${waitingData.roomId}`);
    } catch (error) {
      logger.error('Error approving join:', error);
      socket.emit('error', { message: 'Failed to approve join' });
    }
  }

  async handleRejectJoin(socket, { targetSocketId }) {
    try {
      const host = this.users.get(socket.id);
      if (!host?.isHost && host?.role !== 'co-host') {
        socket.emit('error', { message: 'Only host or co-host can reject join requests' });
        return;
      }

      const waitingData = this.waitingParticipants.get(targetSocketId);
      if (!waitingData) {
        socket.emit('error', { message: 'Join request not found' });
        return;
      }

      // Remove from waiting list
      this.waitingParticipants.delete(targetSocketId);

      // Notify participant they're rejected
      this.io.to(targetSocketId).emit('join-rejected', {
        by: host.name,
        message: 'Your request to join was declined',
        timestamp: Date.now()
      });

      logger.info(`${host.name} rejected ${waitingData.userName} from joining room ${waitingData.roomId}`);
    } catch (error) {
      logger.error('Error rejecting join:', error);
      socket.emit('error', { message: 'Failed to reject join' });
    }
  }

  async handleDisconnect(socket, reason) {
    // Clean up waiting participants
    if (this.waitingParticipants.has(socket.id)) {
      this.waitingParticipants.delete(socket.id);
    }

    await this.removeUserFromRoom(socket, reason);
    
    this.users.delete(socket.id);
    this.connectionStats.delete(socket.id);
  }

  handleError(socket, error) {
    logger.error('Socket error:', { socketId: socket.id, error });
    const stats = this.connectionStats.get(socket.id);
    if (stats) stats.errors++;
  }

  async removeUserFromRoom(socket, reason = 'disconnect') {
    try {
      const user = this.users.get(socket.id);
      if (!user) return;

      // Remove from database
      await Room.removeParticipant(socket.id);

      // Notify others
      socket.to(user.roomId).emit('user-left', {
        userId: user.id,
        socketId: socket.id,
        reason,
        timestamp: Date.now()
      });
      fireWebhook('participant.left', { roomId: user.roomId, participantId: user.id, name: user.name, reason });

      // Handle host transfer if needed
      if (user.isHost) {
        const participants = await Room.getParticipants(user.roomId);
        if (participants.length > 0) {
          const newHost = participants[0];
          await Room.transferHost(user.roomId, newHost.socket_id);

          this.io.to(user.roomId).emit('new-host', {
            hostId: newHost.id,
            socketId: newHost.socket_id,
            hostName: newHost.guest_name,
            timestamp: Date.now()
          });

          // Give the newly-promoted host their own signed token privately -
          // 'new-host' above is broadcast to the whole room, so the token
          // itself never goes in that payload.
          const newHostUser = this.users.get(newHost.socket_id);
          if (newHostUser) newHostUser.isHost = true;
          this.io.to(newHost.socket_id).emit('host-status', {
            isHost: true,
            hostToken: this.signHostToken(user.roomId)
          });
        }
      }

      socket.leave(user.roomId);

    } catch (error) {
      logger.error('Error removing user from room:', error);
    }
  }

  updateConnectionStats(socketId, type, data) {
    const stats = this.connectionStats.get(socketId);
    if (stats) {
      stats.messages++;
      if (data) {
        stats.bandwidth += JSON.stringify(data).length;
      }
    }
  }

  getStats() {
    return {
      connectedUsers: this.users.size,
      activeRooms: this.rooms.size,
      totalConnections: this.connectionStats.size
    };
  }
}

module.exports = new SocketService();