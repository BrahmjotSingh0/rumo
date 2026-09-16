const crypto = require('crypto');
const config = require('../config/environment');
const logger = require('./logger');

// Fire-and-forget POST to config.webhook.url for room/participant lifecycle
// events. No-op when unconfigured. Never awaited by callers - a slow or
// unreachable webhook endpoint must not hold up a socket event or API call.
async function fireWebhook(event, data) {
  if (!config.webhook.url) return;

  const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  const headers = { 'Content-Type': 'application/json' };

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
