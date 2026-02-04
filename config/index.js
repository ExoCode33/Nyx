/**
 * config/index.js
 * ─────────────────────────────────────────────
 * Single entry-point for all configuration.
 * Reads .env, merges with defaults, exports a frozen object.
 */

require('dotenv').config();
const defaults = require('./defaults');

const config = Object.freeze({
  // ── Discord ──────────────────────────────
  discordToken: process.env.DISCORD_TOKEN,

  // ── Google ───────────────────────────────
  safeBrowsingKey: process.env.SAFE_BROWSING_API_KEY,

  // ── Database ─────────────────────────────
  databaseUrl: process.env.DATABASE_URL,

  // ── Scanner ──────────────────────────────
  redirectTimeoutMs:        Number(process.env.REDIRECT_TIMEOUT_MS)        || defaults.redirectTimeoutMs,
  domainAgeDays:            Number(process.env.DOMAIN_AGE_DAYS)            || defaults.domainAgeDays,
  heuristicWarnThreshold:   Number(process.env.HEURISTIC_WARN_THRESHOLD)   || defaults.heuristicWarnThreshold,
  heuristicDeleteThreshold: Number(process.env.HEURISTIC_DELETE_THRESHOLD) || defaults.heuristicDeleteThreshold,

  // ── Rate limiter ─────────────────────────
  rateLimitMax:      Number(process.env.RATE_LIMIT_MAX)   || defaults.rateLimitMax,
  rateLimitWindowMs: Number(process.env.RATE_WINDOW_MS)   || defaults.rateLimitWindowMs,

  // ── Enforcement ──────────────────────────
  warnTTLMs: Number(process.env.WARN_TTL_MS) || defaults.warnTTLMs,
});

// ── Startup guard ──
const required = ['discordToken', 'safeBrowsingKey', 'databaseUrl'];
for (const key of required) {
  if (!config[key]) {
    console.error(`❌  Missing required env var: ${key}`);
    process.exit(1);
  }
}

module.exports = config;
