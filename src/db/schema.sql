-- schema.sql
-- Single-file schema for Nyx bot
-- Run this once on a fresh database to create all tables

-- ═══════════════════════════════════════════════════════════
-- Guilds
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS guilds (
  guild_id         BIGINT PRIMARY KEY,
  guild_name       TEXT NOT NULL,
  log_channel_id   BIGINT,
  admin_role_ids   BIGINT[] DEFAULT '{}',
  joined_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- Allowlist & Blocklist
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS allowlist (
  id        SERIAL PRIMARY KEY,
  domain    TEXT NOT NULL,
  guild_id  BIGINT NOT NULL,
  added_by  BIGINT NOT NULL,
  reason    TEXT,
  added_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (domain, guild_id)
);

CREATE TABLE IF NOT EXISTS blocklist (
  id        SERIAL PRIMARY KEY,
  domain    TEXT NOT NULL,
  guild_id  BIGINT NOT NULL,
  added_by  BIGINT NOT NULL,
  reason    TEXT,
  added_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (domain, guild_id)
);

-- ═══════════════════════════════════════════════════════════
-- Link Logs (audit trail)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS link_logs (
  id              SERIAL PRIMARY KEY,
  message_id      BIGINT,
  user_id         BIGINT NOT NULL,
  guild_id        BIGINT NOT NULL,
  channel_id      BIGINT NOT NULL,
  original_url    TEXT NOT NULL,
  resolved_url    TEXT,
  original_domain TEXT NOT NULL,
  resolved_domain TEXT,
  status          TEXT NOT NULL,  -- safe | warned | quarantined | deleted
  tier            TEXT,           -- WARN | QUARANTINE | DELETE | null
  signals         TEXT[],
  heuristic_score INT DEFAULT 0,
  action_taken    TEXT,
  posted_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_link_logs_guild  ON link_logs (guild_id);
CREATE INDEX IF NOT EXISTS idx_link_logs_user   ON link_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_link_logs_posted ON link_logs (posted_at);

-- ═══════════════════════════════════════════════════════════
-- User Stats (reputation tracking)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_stats (
  user_id           BIGINT NOT NULL,
  guild_id          BIGINT NOT NULL,
  total_links       INT DEFAULT 0,
  safe_links        INT DEFAULT 0,
  warned_links      INT DEFAULT 0,
  quarantined_links INT DEFAULT 0,
  deleted_links     INT DEFAULT 0,
  last_updated      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, guild_id)
);

-- ═══════════════════════════════════════════════════════════
-- Review Queue (quarantined links awaiting mod decision)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS review_queue (
  id              SERIAL PRIMARY KEY,
  guild_id        BIGINT NOT NULL,
  channel_id      BIGINT NOT NULL,
  user_id         BIGINT NOT NULL,
  original_url    TEXT NOT NULL,
  resolved_url    TEXT,
  signals         TEXT[],
  heuristic_score INT DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | deleted
  reviewed_by     BIGINT,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_guild_status ON review_queue (guild_id, status);
