/**
 * config/defaults.js
 * ─────────────────────────────────────────────
 * Every tunable value in one place.
 * All values can be overridden via env vars.
 */

module.exports = {
  // ── Scanner ──────────────────────────────
  redirectTimeoutMs: 5000,      // max ms to follow redirect chains
  domainAgeDays: 30,            // domains younger than this are suspicious
  heuristicWarnThreshold: 40,   // score >= this  →  warn
  heuristicDeleteThreshold: 70, // score >= this  →  delete

  // ── Rate limiter ─────────────────────────
  rateLimitMax: 3,              // max links in one window before flag
  rateLimitWindowMs: 60000,     // sliding-window length (ms)

  // ── Enforcement ──────────────────────────
  warnTTLMs: 30000,             // how long warn embeds stay (0 = forever)
};
