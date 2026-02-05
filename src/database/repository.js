/**
 * Database Repository Layer
 * All database operations abstracted here
 */

const db = require('./pool');
const { logger } = require('../utils/logger');

class Repository {
  // ============================================================
  // Guild Operations
  // ============================================================

  async upsertGuild(guildId, guildName) {
    const query = `
      INSERT INTO guilds (guild_id, guild_name)
      VALUES ($1, $2)
      ON CONFLICT (guild_id) DO UPDATE SET
        guild_name = $2,
        updated_at = NOW()
      RETURNING *
    `;
    return db.queryOne(query, [guildId, guildName]);
  }

  async getGuild(guildId) {
    const query = 'SELECT * FROM guilds WHERE guild_id = $1';
    return db.queryOne(query, [guildId]);
  }

  async updateGuildSettings(guildId, settings) {
    const query = `
      UPDATE guilds 
      SET settings = $2, updated_at = NOW()
      WHERE guild_id = $1
      RETURNING *
    `;
    return db.queryOne(query, [guildId, JSON.stringify(settings)]);
  }

  async setLogChannel(guildId, channelId) {
    const query = `
      UPDATE guilds 
      SET log_channel_id = $2, updated_at = NOW()
      WHERE guild_id = $1
    `;
    await db.query(query, [guildId, channelId]);
  }

  async setAdminRoles(guildId, roleIds) {
    const query = `
      UPDATE guilds 
      SET admin_role_ids = $2, updated_at = NOW()
      WHERE guild_id = $1
    `;
    await db.query(query, [guildId, roleIds]);
  }

  // ============================================================
  // Allowlist Operations
  // ============================================================

  async isAllowlisted(domain, guildId) {
    const query = `
      SELECT EXISTS(
        SELECT 1 FROM allowlist 
        WHERE guild_id = $1 AND domain = $2
      )
    `;
    const result = await db.queryOne(query, [guildId, domain]);
    return result.exists;
  }

  async addToAllowlist(guildId, domain, addedBy, reason = null) {
    const query = `
      INSERT INTO allowlist (guild_id, domain, added_by, reason)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (guild_id, domain) DO NOTHING
      RETURNING *
    `;
    return db.queryOne(query, [guildId, domain, addedBy, reason]);
  }

  async removeFromAllowlist(guildId, domain) {
    const query = 'DELETE FROM allowlist WHERE guild_id = $1 AND domain = $2';
    await db.query(query, [guildId, domain]);
  }

  async getAllowlist(guildId, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM allowlist 
      WHERE guild_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    return db.queryAll(query, [guildId, limit, offset]);
  }

  // ============================================================
  // Blocklist Operations
  // ============================================================

  async isBlocklisted(domain, guildId) {
    const query = `
      SELECT EXISTS(
        SELECT 1 FROM blocklist 
        WHERE guild_id = $1 AND domain = $2
      )
    `;
    const result = await db.queryOne(query, [guildId, domain]);
    return result.exists;
  }

  async addToBlocklist(guildId, domain, addedBy, reason = null) {
    const query = `
      INSERT INTO blocklist (guild_id, domain, added_by, reason)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (guild_id, domain) DO NOTHING
      RETURNING *
    `;
    return db.queryOne(query, [guildId, domain, addedBy, reason]);
  }

  async removeFromBlocklist(guildId, domain) {
    const query = 'DELETE FROM blocklist WHERE guild_id = $1 AND domain = $2';
    await db.query(query, [guildId, domain]);
  }

  async getBlocklist(guildId, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM blocklist 
      WHERE guild_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    return db.queryAll(query, [guildId, limit, offset]);
  }

  // ============================================================
  // Link Log Operations
  // ============================================================

  async logLink(data) {
    const query = `
      INSERT INTO link_logs (
        guild_id, channel_id, message_id, user_id,
        original_url, resolved_url, original_domain, resolved_domain,
        tier, signals, heuristic_score, safe_browsing_match,
        threat_types, domain_age_days, action_taken
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `;
    
    const result = await db.queryOne(query, [
      data.guildId,
      data.channelId,
      data.messageId,
      data.userId,
      data.originalUrl,
      data.resolvedUrl,
      data.originalDomain,
      data.resolvedDomain,
      data.tier,
      data.signals,
      data.heuristicScore,
      data.safeBrowsingMatch,
      data.threatTypes,
      data.domainAgeDays,
      data.actionTaken
    ]);
    
    return result.id;
  }

  async getLinkLogs(guildId, limit = 100, offset = 0) {
    const query = `
      SELECT * FROM link_logs 
      WHERE guild_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    return db.queryAll(query, [guildId, limit, offset]);
  }

  async getLinkLogsByUser(guildId, userId, limit = 50) {
    const query = `
      SELECT * FROM link_logs 
      WHERE guild_id = $1 AND user_id = $2 
      ORDER BY created_at DESC 
      LIMIT $3
    `;
    return db.queryAll(query, [guildId, userId, limit]);
  }

  // ============================================================
  // User Statistics Operations
  // ============================================================

  async updateUserStats(userId, guildId, tier) {
    const query = 'SELECT update_user_stats($1, $2, $3)';
    await db.query(query, [userId, guildId, tier]);
  }

  async getUserStats(userId, guildId) {
    const query = `
      SELECT * FROM user_stats 
      WHERE user_id = $1 AND guild_id = $2
    `;
    return db.queryOne(query, [userId, guildId]);
  }

  async getTopUsers(guildId, limit = 10) {
    const query = `
      SELECT * FROM user_stats 
      WHERE guild_id = $1 
      ORDER BY total_links DESC 
      LIMIT $2
    `;
    return db.queryAll(query, [guildId, limit]);
  }

  async getProblematicUsers(guildId, limit = 10) {
    const query = `
      SELECT * FROM user_stats 
      WHERE guild_id = $1 AND (quarantined_links > 0 OR deleted_links > 0)
      ORDER BY reputation_score ASC, deleted_links DESC 
      LIMIT $2
    `;
    return db.queryAll(query, [guildId, limit]);
  }

  // ============================================================
  // Review Queue Operations
  // ============================================================

  async addToReviewQueue(data) {
    const query = `
      INSERT INTO review_queue (
        guild_id, channel_id, message_id, user_id,
        original_url, resolved_url, original_domain, resolved_domain,
        signals, heuristic_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;
    
    const result = await db.queryOne(query, [
      data.guildId,
      data.channelId,
      data.messageId,
      data.userId,
      data.originalUrl,
      data.resolvedUrl,
      data.originalDomain,
      data.resolvedDomain,
      data.signals,
      data.heuristicScore
    ]);
    
    return result.id;
  }

  async getPendingReviews(guildId, limit = 50) {
    const query = `
      SELECT * FROM review_queue 
      WHERE guild_id = $1 AND status = 'pending' 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    return db.queryAll(query, [guildId, limit]);
  }

  async updateReviewStatus(id, status, reviewedBy, action) {
    const query = `
      UPDATE review_queue 
      SET status = $2, reviewed_by = $3, review_action = $4, reviewed_at = NOW()
      WHERE id = $1
    `;
    await db.query(query, [id, status, reviewedBy, action]);
  }

  // ============================================================
  // Cache Operations
  // ============================================================

  async getCached(key) {
    const query = `
      SELECT value FROM cache 
      WHERE key = $1 AND expires_at > NOW()
    `;
    const result = await db.queryOne(query, [key]);
    return result ? result.value : null;
  }

  async setCache(key, value, ttlSeconds) {
    const query = `
      INSERT INTO cache (key, value, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '1 second' * $3)
      ON CONFLICT (key) DO UPDATE SET
        value = $2,
        expires_at = NOW() + INTERVAL '1 second' * $3
    `;
    await db.query(query, [key, JSON.stringify(value), ttlSeconds]);
  }

  async cleanExpiredCache() {
    await db.query('SELECT clean_expired_cache()');
  }
}

module.exports = new Repository();
