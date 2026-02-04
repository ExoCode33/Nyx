/**
 * src/enforcement/rateLimiter.js
 * ─────────────────────────────────────────────
 * In-memory sliding-window rate limiter.
 */

const config = require('../../config');

const windows = new Map();

function recordAndCheck(userId, guildId) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const cutoff = now - config.rateLimitWindowMs;

  let timestamps = windows.get(key);
  if (!timestamps) {
    timestamps = [];
    windows.set(key, timestamps);
  }

  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }

  timestamps.push(now);

  return timestamps.length > config.rateLimitMax;
}

module.exports = { recordAndCheck };
