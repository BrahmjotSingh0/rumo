-- Rumo database schema
-- PostgreSQL schema for a guest-based (no accounts) video meeting app.
-- Everyone who joins a room is a guest identified by a display name; the
-- first person into a room (or whoever a host transfers to) becomes host.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Rooms table
CREATE TABLE "rooms" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "room_code" VARCHAR(20) UNIQUE NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "host_id" UUID, -- ephemeral id of the creating session, not a persisted account
    "max_participants" INTEGER DEFAULT 50,
    "is_locked" BOOLEAN DEFAULT false,
    "password_hash" VARCHAR(255),
    "is_recording" BOOLEAN DEFAULT false,
    "recording_url" TEXT,
    "status" VARCHAR(20) DEFAULT 'active' CHECK ("status" IN ('active', 'ended', 'scheduled')),
    "scheduled_at" TIMESTAMP WITH TIME ZONE,
    "started_at" TIMESTAMP WITH TIME ZONE,
    "ended_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Room participants (always guests - identified by name for the life of the session)
CREATE TABLE "room_participants" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "room_id" UUID NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
    "guest_name" VARCHAR(150) NOT NULL,
    "socket_id" VARCHAR(100),
    "is_host" BOOLEAN DEFAULT false,
    "is_moderator" BOOLEAN DEFAULT false,
    "audio_enabled" BOOLEAN DEFAULT true,
    "video_enabled" BOOLEAN DEFAULT true,
    "screen_sharing" BOOLEAN DEFAULT false,
    "connection_quality" INTEGER DEFAULT 100,
    "joined_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP WITH TIME ZONE,
    "duration_minutes" INTEGER DEFAULT 0
);

-- Chat messages
CREATE TABLE "chat_messages" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "room_id" UUID NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
    "participant_id" UUID NOT NULL REFERENCES "room_participants"("id") ON DELETE CASCADE,
    "message_type" VARCHAR(20) DEFAULT 'text' CHECK ("message_type" IN ('text', 'emoji', 'file', 'system')),
    "content" TEXT NOT NULL,
    "file_url" TEXT,
    "file_name" VARCHAR(255),
    "file_size" INTEGER,
    "is_private" BOOLEAN DEFAULT false,
    "target_participant_id" UUID REFERENCES "room_participants"("id"),
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Meeting sessions (for analytics)
CREATE TABLE "meeting_sessions" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "room_id" UUID NOT NULL REFERENCES "rooms"("id") ON DELETE CASCADE,
    "total_participants" INTEGER DEFAULT 0,
    "max_concurrent_participants" INTEGER DEFAULT 0,
    "total_messages" INTEGER DEFAULT 0,
    "total_duration_minutes" INTEGER DEFAULT 0,
    "screen_share_duration_minutes" INTEGER DEFAULT 0,
    "recording_duration_minutes" INTEGER DEFAULT 0,
    "quality_issues_count" INTEGER DEFAULT 0,
    "disconnection_count" INTEGER DEFAULT 0,
    "started_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP WITH TIME ZONE
);

-- Connection logs (for debugging and analytics)
CREATE TABLE "connection_logs" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "room_id" UUID REFERENCES "rooms"("id") ON DELETE CASCADE,
    "participant_id" UUID REFERENCES "room_participants"("id") ON DELETE CASCADE,
    "event_type" VARCHAR(50) NOT NULL,
    "event_data" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- WebRTC stats (for performance monitoring)
CREATE TABLE "webrtc_stats" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "participant_id" UUID NOT NULL REFERENCES "room_participants"("id") ON DELETE CASCADE,
    "peer_connection_id" VARCHAR(100),
    "stats_type" VARCHAR(50),
    "audio_stats" JSONB,
    "video_stats" JSONB,
    "connection_stats" JSONB,
    "bandwidth_stats" JSONB,
    "recorded_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX "idx_rooms_status" ON "rooms"("status");
CREATE INDEX "idx_rooms_created_at" ON "rooms"("created_at");
CREATE INDEX "idx_room_participants_room_id" ON "room_participants"("room_id");
CREATE INDEX "idx_room_participants_socket_id" ON "room_participants"("socket_id");
CREATE INDEX "idx_chat_messages_room_id" ON "chat_messages"("room_id");
CREATE INDEX "idx_chat_messages_created_at" ON "chat_messages"("created_at");
CREATE INDEX "idx_connection_logs_room_id" ON "connection_logs"("room_id");
CREATE INDEX "idx_connection_logs_created_at" ON "connection_logs"("created_at");
CREATE INDEX "idx_webrtc_stats_participant_id" ON "webrtc_stats"("participant_id");
CREATE INDEX "idx_webrtc_stats_recorded_at" ON "webrtc_stats"("recorded_at");

-- Trigger for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updated_at" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON "rooms"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Branding settings (single row). Lets the admin panel at /admin override
-- app name, tagline, description, logo, and accent color without editing
-- frontend/public/branding.json. No row means "not configured through the
-- admin panel yet" - the frontend falls back to branding.json / its defaults.
CREATE TABLE "branding_settings" (
    "id" SMALLINT PRIMARY KEY DEFAULT 1,
    "app_name" VARCHAR(100),
    "tagline" VARCHAR(200),
    "description" VARCHAR(300),
    "logo_icon" VARCHAR(500),
    "logo_full" VARCHAR(500),
    "primary_color" VARCHAR(7),
    -- { "chat": true, "screenShare": true, ... } - which optional features/host
    -- controls are exposed in the UI at all. Missing keys default to enabled;
    -- see backend/src/config/features.js for the full list and defaults.
    "features" JSONB,
    -- [{ "id": "uuid", "url": "/uploads/backgrounds/....jpg", "name": "Office" }]
    -- admin-managed virtual background choices offered to every participant,
    -- in addition to whatever they upload for themselves in a given call.
    "background_presets" JSONB,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "branding_settings_single_row" CHECK ("id" = 1)
);

CREATE TRIGGER update_branding_settings_updated_at BEFORE UPDATE ON "branding_settings"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries
CREATE VIEW "active_rooms" AS
SELECT
    r."id",
    r."room_code",
    r."title",
    COUNT(rp."id") as "participant_count",
    r."created_at"
FROM "rooms" r
LEFT JOIN "room_participants" rp ON r."id" = rp."room_id" AND rp."left_at" IS NULL
WHERE r."status" = 'active'
GROUP BY r."id", r."room_code", r."title", r."created_at";

CREATE VIEW "room_analytics" AS
SELECT
    r."id",
    r."room_code",
    r."title",
    COUNT(DISTINCT rp."id") as "total_participants",
    COUNT(DISTINCT cm."id") as "total_messages",
    EXTRACT(EPOCH FROM (COALESCE(r."ended_at", CURRENT_TIMESTAMP) - r."started_at"))/60 as "duration_minutes"
FROM "rooms" r
LEFT JOIN "room_participants" rp ON r."id" = rp."room_id"
LEFT JOIN "chat_messages" cm ON r."id" = cm."room_id"
GROUP BY r."id", r."room_code", r."title", r."started_at", r."ended_at";
