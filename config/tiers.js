/**
 * config/tiers.js
 * ─────────────────────────────────────────────
 * Defines the three enforcement tiers.
 *   WARN        – post a warning embed, keep the message
 *   QUARANTINE  – delete message, add to review queue
 *   DELETE      – delete immediately, log, DM user
 */

const TIERS = {
  WARN: {
    label: 'WARN',
    emoji: '🟡',
    color: 0xF59E0B,
    description: 'Suspicious link detected – proceed with caution.',
    triggers: [
      'YOUNG_DOMAIN',
      'RATE_LIMIT_HIT',
      'HEURISTIC_LOW',
    ],
  },

  QUARANTINE: {
    label: 'QUARANTINE',
    emoji: '🟠',
    color: 0xF97316,
    description: 'Link quarantined – pending moderator review.',
    triggers: [
      'HEURISTIC_HIGH',
      'YOUNG_DOMAIN_PLUS',
    ],
  },

  DELETE: {
    label: 'DELETE',
    emoji: '🔴',
    color: 0xEF4444,
    description: 'Malicious link detected – message removed.',
    triggers: [
      'SAFE_BROWSING_MATCH',
      'BLOCKLIST_HIT',
      'HEURISTIC_CRITICAL',
    ],
  },
};

module.exports = { TIERS };
