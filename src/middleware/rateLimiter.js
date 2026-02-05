/**
 * Rate Limiter
 * Prevents spam and tracks suspicious user behavior
 */

const config = require('../../config');
const { logger } = require('../utils/logger');

class RateLimiter {
  constructor() {
    this.limits = new Map();
    this.maxLinks = config.rateLimit.maxLinks;
    this.windowMs = config.rateLimit.windowMs;
    this.cleanupInterval = config.rateLimit.cleanupIntervalMs;
    
    // Periodically clean up expired entries
    this.startCleanup();
  }

  /**
   * Generate key for rate limit tracking
   */
  generateKey(userId, guildId) {
    return `${guildId}:${userId}`;
  }

  /**
   * Check if user is rate limited
   */
  isRateLimited(userId, guildId) {
    const key = this.generateKey(userId, guildId);
    const now = Date.now();
    
    if (!this.limits.has(key)) {
      // First link from this user
      this.limits.set(key, {
        count: 1,
        windowStart: now,
        violations: 0
      });
      return false;
    }

    const userData = this.limits.get(key);
    const windowExpired = (now - userData.windowStart) >= this.windowMs;

    if (windowExpired) {
      // Window expired, reset counter
      userData.count = 1;
      userData.windowStart = now;
      return false;
    }

    // Within window
    userData.count++;

    if (userData.count > this.maxLinks) {
      userData.violations++;
      
      logger.warn({
        userId,
        guildId,
        count: userData.count,
        violations: userData.violations
      }, 'Rate limit exceeded');
      
      return true;
    }

    return false;
  }

  /**
   * Get user's current rate limit status
   */
  getStatus(userId, guildId) {
    const key = this.generateKey(userId, guildId);
    const userData = this.limits.get(key);
    
    if (!userData) {
      return {
        count: 0,
        remaining: this.maxLinks,
        violations: 0,
        resetAt: null
      };
    }

    const now = Date.now();
    const windowExpired = (now - userData.windowStart) >= this.windowMs;

    if (windowExpired) {
      return {
        count: 0,
        remaining: this.maxLinks,
        violations: userData.violations,
        resetAt: null
      };
    }

    return {
      count: userData.count,
      remaining: Math.max(0, this.maxLinks - userData.count),
      violations: userData.violations,
      resetAt: new Date(userData.windowStart + this.windowMs)
    };
  }

  /**
   * Reset rate limit for a user
   */
  reset(userId, guildId) {
    const key = this.generateKey(userId, guildId);
    this.limits.delete(key);
  }

  /**
   * Get violation count for a user
   */
  getViolationCount(userId, guildId) {
    const key = this.generateKey(userId, guildId);
    const userData = this.limits.get(key);
    return userData ? userData.violations : 0;
  }

  /**
   * Periodic cleanup of expired entries
   */
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, userData] of this.limits.entries()) {
        const age = now - userData.windowStart;
        
        // Remove entries older than 10 minutes
        if (age > this.windowMs * 10) {
          this.limits.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug({ cleaned, total: this.limits.size }, 'Rate limiter cleanup');
      }
    }, this.cleanupInterval);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalUsers: this.limits.size,
      maxLinks: this.maxLinks,
      windowMs: this.windowMs
    };
  }
}

module.exports = new RateLimiter();
