/**
 * Configuration Management System
 * Centralized configuration with validation and defaults
 */

require('dotenv').config();

class Config {
  constructor() {
    this.validateRequired();
    this.loadConfig();
  }

  validateRequired() {
    const required = [
      'DISCORD_TOKEN',
      'DISCORD_CLIENT_ID',
      'DATABASE_URL'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  loadConfig() {
    // Discord
    this.discord = {
      token: process.env.DISCORD_TOKEN,
      clientId: process.env.DISCORD_CLIENT_ID
    };

    // Database
    this.database = {
      url: process.env.DATABASE_URL,
      pool: {
        min: parseInt(process.env.DB_POOL_MIN) || 2,
        max: parseInt(process.env.DB_POOL_MAX) || 10,
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS) || 30000,
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS) || 5000
      }
    };

    // External APIs
    this.apis = {
      safeBrowsingKey: process.env.SAFE_BROWSING_API_KEY || null
    };

    // Scanner Settings
    this.scanner = {
      redirectTimeoutMs: parseInt(process.env.REDIRECT_TIMEOUT_MS) || 5000,
      redirectMaxHops: parseInt(process.env.REDIRECT_MAX_HOPS) || 10,
      domainAgeThresholdDays: parseInt(process.env.DOMAIN_AGE_THRESHOLD_DAYS) || 30,
      whoisCacheTtlHours: parseInt(process.env.WHOIS_CACHE_TTL_HOURS) || 24
    };

    // Heuristic Thresholds
    this.heuristics = {
      warnThreshold: parseInt(process.env.HEURISTIC_WARN_THRESHOLD) || 25,
      quarantineThreshold: parseInt(process.env.HEURISTIC_QUARANTINE_THRESHOLD) || 50,
      deleteThreshold: parseInt(process.env.HEURISTIC_DELETE_THRESHOLD) || 75
    };

    // Rate Limiting
    this.rateLimit = {
      maxLinks: parseInt(process.env.RATE_LIMIT_MAX_LINKS) || 5,
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
      cleanupIntervalMs: parseInt(process.env.RATE_LIMIT_CLEANUP_INTERVAL_MS) || 300000
    };

    // Enforcement
    this.enforcement = {
      warnMessageTtlMs: parseInt(process.env.WARN_MESSAGE_TTL_MS) || 300000,
      safeBrowsingCacheTtlSeconds: parseInt(process.env.SAFE_BROWSING_CACHE_TTL_SECONDS) || 3600
    };

    // Feature Flags
    this.features = {
      safeBrowsing: process.env.ENABLE_SAFE_BROWSING === 'true',
      whoisLookup: process.env.ENABLE_WHOIS_LOOKUP === 'true',
      redirectResolution: process.env.ENABLE_REDIRECT_RESOLUTION === 'true',
      heuristicScanning: process.env.ENABLE_HEURISTIC_SCANNING === 'true'
    };

    // Environment
    this.env = process.env.NODE_ENV || 'development';
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.isDevelopment = this.env === 'development';
    this.isProduction = this.env === 'production';
  }

  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this);
  }
}

module.exports = new Config();
