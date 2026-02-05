/**
 * Enforcement Tier Configuration
 * Defines the three-tier enforcement system
 */

const TIERS = {
  SAFE: {
    level: 0,
    label: 'SAFE',
    emoji: '✅',
    color: 0x10B981,
    description: 'Link passed all security checks'
  },

  WARN: {
    level: 1,
    label: 'WARN',
    emoji: '⚠️',
    color: 0xF59E0B,
    description: 'Suspicious link detected - proceed with caution',
    triggers: [
      'YOUNG_DOMAIN',
      'RATE_LIMIT_EXCEEDED',
      'HEURISTIC_WARN'
    ]
  },

  QUARANTINE: {
    level: 2,
    label: 'QUARANTINE',
    emoji: '🔶',
    color: 0xF97316,
    description: 'Potentially dangerous link - pending moderator review',
    triggers: [
      'HEURISTIC_QUARANTINE',
      'YOUNG_DOMAIN_WITH_SIGNALS',
      'MULTIPLE_RISK_FACTORS'
    ]
  },

  DELETE: {
    level: 3,
    label: 'DELETE',
    emoji: '🛑',
    color: 0xEF4444,
    description: 'Malicious link detected - message removed for safety',
    triggers: [
      'SAFE_BROWSING_THREAT',
      'BLOCKLIST_MATCH',
      'HEURISTIC_CRITICAL',
      'KNOWN_MALWARE',
      'PHISHING_DETECTED'
    ]
  }
};

/**
 * Determine enforcement tier based on scan results
 */
function determineEnforcementTier(scanResult) {
  const { signals, isBlocked, isAllowed } = scanResult;

  // Allowlist always bypasses
  if (isAllowed) {
    return TIERS.SAFE;
  }

  // Check DELETE tier triggers first (highest priority)
  if (isBlocked || TIERS.DELETE.triggers.some(t => signals.includes(t))) {
    return TIERS.DELETE;
  }

  // Check QUARANTINE tier triggers
  if (TIERS.QUARANTINE.triggers.some(t => signals.includes(t))) {
    return TIERS.QUARANTINE;
  }

  // Check WARN tier triggers
  if (TIERS.WARN.triggers.some(t => signals.includes(t))) {
    return TIERS.WARN;
  }

  // No triggers matched
  return TIERS.SAFE;
}

module.exports = {
  TIERS,
  determineEnforcementTier
};
