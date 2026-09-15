const database = require('../config/database');

class Room {
  static async create({ title, hostId, maxParticipants = 50, password = null }) {
    const roomCode = this.generateRoomCode();
    const query = `
      INSERT INTO "rooms" ("room_code", "title", "host_id", "max_participants", "password_hash")
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [roomCode, title, hostId, maxParticipants, password];
    const result = await database.query(query, values);
    return result.rows[0];
  }

  // host_name reflects whoever currently holds host status in room_participants,
  // since host can transfer during a meeting - it's not a fixed identity.
  static async findById(id) {
    const query = `
      SELECT r.*,
        (SELECT rp."guest_name" FROM "room_participants" rp
          WHERE rp."room_id" = r."id" AND rp."is_host" = true AND rp."left_at" IS NULL
          LIMIT 1) as "host_name"
      FROM "rooms" r
      WHERE r."id" = $1
    `;

    const result = await database.query(query, [id]);
    return result.rows[0];
  }

  static async findByCode(roomCode) {
    const query = `
      SELECT r.*,
        (SELECT rp."guest_name" FROM "room_participants" rp
          WHERE rp."room_id" = r."id" AND rp."is_host" = true AND rp."left_at" IS NULL
          LIMIT 1) as "host_name"
      FROM "rooms" r
      WHERE r."room_code" = $1
    `;

    const result = await database.query(query, [roomCode]);
    return result.rows[0];
  }

  static async getActiveRooms() {
    const query = `
      SELECT * FROM "active_rooms"
      ORDER BY "created_at" DESC
    `;

    const result = await database.query(query);
    return result.rows;
  }

  static async updateStatus(id, status, endedAt = null) {
    const query = `
      UPDATE "rooms"
      SET "status" = $1, "ended_at" = $2, "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = $3
      RETURNING *
    `;

    const result = await database.query(query, [status, endedAt, id]);
    return result.rows[0];
  }

  static async addParticipant({ roomId, guestName, socketId, isHost = false }) {
    const query = `
      INSERT INTO "room_participants"
      ("room_id", "guest_name", "socket_id", "is_host")
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const values = [roomId, guestName, socketId, isHost];
    const result = await database.query(query, values);
    return result.rows[0];
  }

  static async removeParticipant(socketId) {
    const query = `
      UPDATE "room_participants"
      SET "left_at" = CURRENT_TIMESTAMP,
          "duration_minutes" = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "joined_at"))/60
      WHERE "socket_id" = $1 AND "left_at" IS NULL
      RETURNING *
    `;

    const result = await database.query(query, [socketId]);
    return result.rows[0];
  }

  static async getParticipants(roomId) {
    const query = `
      SELECT * FROM "room_participants"
      WHERE "room_id" = $1 AND "left_at" IS NULL
      ORDER BY "joined_at" ASC
    `;

    const result = await database.query(query, [roomId]);
    return result.rows;
  }

  static async updateParticipantMedia(socketId, { audioEnabled, videoEnabled, screenSharing }) {
    const query = `
      UPDATE "room_participants"
      SET "audio_enabled" = COALESCE($1, "audio_enabled"),
          "video_enabled" = COALESCE($2, "video_enabled"),
          "screen_sharing" = COALESCE($3, "screen_sharing")
      WHERE "socket_id" = $4 AND "left_at" IS NULL
      RETURNING *
    `;

    const values = [audioEnabled, videoEnabled, screenSharing, socketId];
    const result = await database.query(query, values);
    return result.rows[0];
  }

  static async transferHost(roomId, newHostSocketId) {
    await database.transaction(async (client) => {
      // Remove host status from current host
      await client.query(`
        UPDATE "room_participants"
        SET "is_host" = false
        WHERE "room_id" = $1 AND "is_host" = true AND "left_at" IS NULL
      `, [roomId]);

      // Set new host
      await client.query(`
        UPDATE "room_participants"
        SET "is_host" = true
        WHERE "room_id" = $1 AND "socket_id" = $2 AND "left_at" IS NULL
      `, [roomId, newHostSocketId]);
    });
  }

  static async getRoomAnalytics(roomId) {
    const query = `
      SELECT * FROM "room_analytics"
      WHERE "id" = $1
    `;

    const result = await database.query(query, [roomId]);
    return result.rows[0];
  }

  static generateRoomCode() {
    // Generate a 9-character room code (3 groups of 3 characters)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 9; i++) {
      if (i > 0 && i % 3 === 0) result += '-';
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static async cleanup() {
    // Clean up old rooms and participants
    const query = `
      UPDATE "rooms"
      SET "status" = 'ended', "ended_at" = CURRENT_TIMESTAMP
      WHERE "status" = 'active'
      AND "created_at" < NOW() - INTERVAL '24 hours'
    `;

    await database.query(query);
  }
}

module.exports = Room;
