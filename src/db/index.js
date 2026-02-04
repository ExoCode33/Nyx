/**
 * src/db/index.js
 * ─────────────────────────────────────────────
 * PostgreSQL connection pool + all query helpers.
 * Nothing else should touch pg directly.
 */

const { Pool } = require('pg');
const config   = require('../../config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('❌  Unexpected pg pool error:', err);
});

async function query(sql, params) {
  return pool.query(sql, params);
}

// ═══════════════════════════════════════════════════════════
// GUILDS
// ═══════════════════════════════════════════════════════════
async function upsertGuild(guildId, guildName) {
  await query(`
    INSERT INTO guilds (guild_id, guild_name)
    VALUES ($1, $2)
    ON CONFLICT (guild_id) DO UPDATE SET guild_name = EXCLUDED.guild_name
  `, [guildId, guildName]);
}

async function getGuild(guildId) {
  const { rows } = await query('SELECT * FROM guilds WHERE guild_id = $1', [guildId]);
  return rows[0] || null;
}

async function setLogChannel(guildId, channelId) {
  await query('UPDATE guilds SET log_channel_id = $1 WHERE guild_id = $2', [channelId, guildId]);
}

async function setAdminRoles(guildId, roleIds) {
  await query('UPDATE guilds SET admin_role_ids = $1 WHERE guild_id = $2', [roleIds, guildId]);
}

async function getAdminRoles(guildId) {
  const { rows } = await query('SELECT admin_role_ids FROM guilds WHERE guild_id = $1', [guildId]);
  return rows[0]?.admin_role_ids || [];
}

// ═══════════════════════════════════════════════════════════
// ALLOWLIST
// ═══════════════════════════════════════════════════════════
async function addAllowlist(domain, guildId, addedBy, reason) {
  try {
    await query(`
      INSERT INTO allowlist (domain, guild_id, added_by, reason)
      VALUES ($1, $2, $3, $4)
    `, [domain.toLowerCase(), guildId, addedBy, reason || null]);
    return { ok: true };
  } catch (e) {
    if (e.code === '23505') return { ok: false, reason: 'already_exists' };
    throw e;
  }
}

async function removeAllowlist(domain, guildId) {
  const { rowCount } = await query(
    'DELETE FROM allowlist WHERE domain = $1 AND guild_id = $2',
    [domain.toLowerCase(), guildId]
  );
  return rowCount > 0;
}

async function isAllowed(domain, guildId) {
  const { rows } = await query(
    'SELECT 1 FROM allowlist WHERE domain = $1 AND guild_id = $2',
    [domain.toLowerCase(), guildId]
  );
  return rows.length > 0;
}

async function getAllowlist(guildId) {
  const { rows } = await query(
    'SELECT * FROM allowlist WHERE guild_id = $1 ORDER BY domain',
    [guildId]
  );
  return rows;
}

// ═══════════════════════════════════════════════════════════
// BLOCKLIST
// ═══════════════════════════════════════════════════════════
async function addBlocklist(domain, guildId, addedBy, reason) {
  try {
    await query(`
      INSERT INTO blocklist (domain, guild_id, added_by, reason)
      VALUES ($1, $2, $3, $4)
    `, [domain.toLowerCase(), guildId, addedBy, reason || null]);
    return { ok: true };
  } catch (e) {
    if (e.code === '23505') return { ok: false, reason: 'already_exists' };
    throw e;
  }
}

async function removeBlocklist(domain, guildId) {
  const { rowCount } = await query(
    'DELETE FROM blocklist WHERE domain = $1 AND guild_id = $2',
    [domain.toLowerCase(), guildId]
  );
  return rowCount > 0;
}

async function isBlocked(domain, guildId) {
  const { rows } = await query(
    'SELECT 1 FROM blocklist WHERE domain = $1 AND guild_id = $2',
    [domain.toLowerCase(), guildId]
  );
  return rows.length > 0;
}

async function getBlocklist(guildId) {
  const { rows } = await query(
    'SELECT * FROM blocklist WHERE guild_id = $1 ORDER BY domain',
    [guildId]
  );
  return rows;
}

// ═══════════════════════════════════════════════════════════
// LINK LOGS
// ═══════════════════════════════════════════════════════════
async function insertLinkLog(entry) {
  await query(`
    INSERT INTO link_logs
      (message_id, user_id, guild_id, channel_id,
       original_url, resolved_url, original_domain, resolved_domain,
       status, tier, signals, heuristic_score, action_taken)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  `, [
    entry.messageId, entry.userId, entry.guildId, entry.channelId,
    entry.originalUrl, entry.resolvedUrl || null,
    entry.originalDomain, entry.resolvedDomain || null,
    entry.status, entry.tier || null,
    entry.signals || [], entry.heuristicScore || 0,
    entry.actionTaken || null,
  ]);
}

// ═══════════════════════════════════════════════════════════
// USER STATS
// ═══════════════════════════════════════════════════════════
async function bumpUserStat(userId, guildId, statusCol) {
  await query(`
    INSERT INTO user_stats (user_id, guild_id, total_links, ${statusCol})
    VALUES ($1, $2, 1, 1)
    ON CONFLICT (user_id, guild_id) DO UPDATE SET
      total_links  = user_stats.total_links + 1,
      ${statusCol} = user_stats.${statusCol} + 1,
      last_updated = NOW()
  `, [userId, guildId]);
}

async function getUserStats(userId, guildId) {
  const { rows } = await query(
    'SELECT * FROM user_stats WHERE user_id = $1 AND guild_id = $2',
    [userId, guildId]
  );
  return rows[0] || {
    total_links: 0, safe_links: 0, warned_links: 0,
    quarantined_links: 0, deleted_links: 0,
  };
}

// ═══════════════════════════════════════════════════════════
// REVIEW QUEUE
// ═══════════════════════════════════════════════════════════
async function addToReviewQueue(entry) {
  const { rows } = await query(`
    INSERT INTO review_queue
      (guild_id, channel_id, user_id, original_url, resolved_url, signals, heuristic_score)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING id
  `, [
    entry.guildId, entry.channelId, entry.userId,
    entry.originalUrl, entry.resolvedUrl || null,
    entry.signals || [], entry.heuristicScore || 0,
  ]);
  return rows[0].id;
}

async function getPendingReviews(guildId) {
  const { rows } = await query(
    "SELECT * FROM review_queue WHERE guild_id = $1 AND status = 'pending' ORDER BY created_at ASC",
    [guildId]
  );
  return rows;
}

async function resolveReview(reviewId, decision, reviewedBy) {
  await query(`
    UPDATE review_queue
    SET status = $1, reviewed_by = $2, reviewed_at = NOW()
    WHERE id = $3
  `, [decision, reviewedBy, reviewId]);
}

async function getReviewById(reviewId) {
  const { rows } = await query('SELECT * FROM review_queue WHERE id = $1', [reviewId]);
  return rows[0] || null;
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════
module.exports = {
  pool, query,
  upsertGuild, getGuild, setLogChannel, setAdminRoles, getAdminRoles,
  addAllowlist, removeAllowlist, isAllowed, getAllowlist,
  addBlocklist, removeBlocklist, isBlocked, getBlocklist,
  insertLinkLog,
  bumpUserStat, getUserStats,
  addToReviewQueue, getPendingReviews, resolveReview, getReviewById,
};
