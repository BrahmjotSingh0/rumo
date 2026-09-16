const crypto = require('crypto');
const config = require('../config/environment');
const logger = require('./logger');

// One-line human summary per event, used for the Slack/Discord formats below
// (their incoming-webhook APIs expect a chat message, not a JSON envelope).
function summarize(event, data) {
  switch (event) {
    case 'room.created':
      return `New Rumo room created: "${data.title}" (${data.roomCode})`;
    case 'room.ended':
      return `Rumo room ended: ${data.roomCode}`;
    case 'participant.joined':
      return `${data.name} joined a Rumo room${data.isHost ? ' as host' : ''}`;
    case 'participant.left':
      return `${data.name} left a Rumo room${data.reason ? ` (${data.reason})` : ''}`;
    default:
      return `Rumo event: ${event}`;
  }
}

// Same event/data going out regardless of format - only the envelope differs,
// so a self-hoster can point WEBHOOK_URL straight at a Slack or Discord
// incoming webhook (WEBHOOK_FORMAT=slack/discord) with no adapter in
// between, or keep the full structured payload (the default) for their own
// receiver.
function buildPayload(event, data) {
  if (config.webhook.format === 'slack') {
    return { text: summarize(event, data) };
  }
  if (config.webhook.format === 'discord') {
    return { content: summarize(event, data) };
  }
  return { event, data, timestamp: new Date().toISOString() };
}

// Fire-and-forget POST to config.webhook.url for room/participant lifecycle
// events. No-op when unconfigured. Never awaited by callers - a slow or
// unreachable webhook endpoint must not hold up a socket event or API call.
async function fireWebhook(event, data) {
  if (!config.webhook.url) return;

  const payload = JSON.stringify(buildPayload(event, data));
  const headers = { 'Content-Type': 'application/json' };

  // Slack/Discord don't verify this, but it's harmless to send and keeps
  // the signing behavior consistent regardless of format.
  if (config.webhook.secret) {
    headers['X-Rumo-Signature'] = crypto
      .createHmac('sha256', config.webhook.secret)
      .update(payload)
      .digest('hex');
  }

  try {
    const response = await fetch(config.webhook.url, { method: 'POST', headers, body: payload });
    if (!response.ok) {
      logger.warn(`Webhook delivery failed for ${event}: ${response.status}`);
    }
  } catch (error) {
    logger.warn(`Webhook delivery error for ${event}:`, error.message);
  }
}

module.exports = { fireWebhook };
