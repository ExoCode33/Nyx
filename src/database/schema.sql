-- Nyx Watchdog Database Schema
-- PostgreSQL 14+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Guilds Table
-- Stores Discord server configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS guilds (
  guild_id BIGINT PRIMARY KEY,
  guild_name TEXT NOT NULL,
  log_channel_id BIGINT,
  admin_role_ids BIGINT[] DEFAULT '{}',
  enabled BOOLEAN DEFAULT TRUE,
  settings JSONB DEFAULT '{}',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_guilds_enabled ON guilds(enabled);

-- ============================================================
-- Allowlist Table
-- Domains that bypass all scanning
-- ============================================================
CREATE TABLE IF NOT EXISTS allowlist (
  id SERIAL PRIMARY KEY,
  guild_id BIGINT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  added_by BIGINT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guild_id, domain)
);

CREATE INDEX idx_allowlist_guild ON allowlist(guild_id);
CREATE INDEX idx_allowlist_domain ON allowlist(domain);

-- ============================================================
-- Blocklist Table
-- Domains that trigger immediate deletion
-- ============================================================
CREATE TABLE IF NOT EXISTS blocklist (
  id SERIAL PRIMARY KEY,
  guild_id BIGINT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  added_by BIGINT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(guild_id, domain)
);

CREATE INDEX idx_blocklist_guild ON blocklist(guild_id);
CREATE INDEX idx_blocklist_domain ON blocklist(domain);

-- ============================================================
-- Link Logs Table
-- Audit trail of all scanned links
-- ============================================================
CREATE TABLE IF NOT EXISTS link_logs (
  id BIGSERIAL PRIMARY KEY,
  guild_id BIGINT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  channel_id BIGINT NOT NULL,
  message_id BIGINT,
  user_id BIGINT NOT NULL,
  original_url TEXT NOT NULL,
  resolved_url TEXT,
  original_domain TEXT NOT NULL,
  resolved_domain TEXT,
  tier TEXT NOT NULL,
  signals TEXT[],
  heuristic_score INTEGER DEFAULT 0,
  safe_browsing_match BOOLEAN DEFAULT FALSE,
  threat_types TEXT[],
  domain_age_days INTEGER,
  action_taken TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_link_logs_guild ON link_logs(guild_id);
CREATE INDEX idx_link_logs_user ON link_logs(user_id);
CREATE INDEX idx_link_logs_tier ON link_logs(tier);
CREATE INDEX idx_link_logs_created ON link_logs(created_at DESC);
CREATE INDEX idx_link_logs_domain ON link_logs(resolved_domain);

-- ============================================================
-- User Statistics Table
-- Reputation tracking per user per guild
-- ============================================================
CREATE TABLE IF NOT EXISTS user_stats (
  user_id BIGINT NOT NULL,
  guild_id BIGINT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  total_links INTEGER DEFAULT 0,
  safe_links INTEGER DEFAULT 0,
  warned_links INTEGER DEFAULT 0,
  quarantined_links INTEGER DEFAULT 0,
  deleted_links INTEGER DEFAULT 0,
  reputation_score INTEGER DEFAULT 100,
  last_link_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, guild_id)
);

CREATE INDEX idx_user_stats_guild ON user_stats(guild_id);
CREATE INDEX idx_user_stats_reputation ON user_stats(reputation_score DESC);

-- ============================================================
-- Review Queue Table
-- Quarantined links awaiting moderator review
-- ============================================================
CREATE TABLE IF NOT EXISTS review_queue (
  id SERIAL PRIMARY KEY,
  guild_id BIGINT NOT NULL REFERENCES guilds(guild_id) ON DELETE CASCADE,
  channel_id BIGINT NOT NULL,
  message_id BIGINT,
  user_id BIGINT NOT NULL,
  original_url TEXT NOT NULL,
  resolved_url TEXT,
  original_domain TEXT NOT NULL,
  resolved_domain TEXT,
  signals TEXT[],
  heuristic_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  reviewed_by BIGINT,
  review_action TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_review_queue_guild_status ON review_queue(guild_id, status);
CREATE INDEX idx_review_queue_created ON review_queue(created_at DESC);

-- ============================================================
-- Cache Table
-- Generic cache for API results
-- ============================================================
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cache_expires ON cache(expires_at);

-- ============================================================
-- Triggers for automatic timestamp updates
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guilds_updated_at
  BEFORE UPDATE ON guilds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_stats_updated_at
  BEFORE UPDATE ON user_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Function to clean expired cache entries
-- ============================================================
CREATE OR REPLACE FUNCTION clean_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Function to update user statistics
-- ============================================================
CREATE OR REPLACE FUNCTION update_user_stats(
  p_user_id BIGINT,
  p_guild_id BIGINT,
  p_tier TEXT
)
RETURNS void AS $$
BEGIN
  INSERT INTO user_stats (user_id, guild_id, total_links, last_link_at)
  VALUES (p_user_id, p_guild_id, 1, NOW())
  ON CONFLICT (user_id, guild_id) DO UPDATE SET
    total_links = user_stats.total_links + 1,
    safe_links = user_stats.safe_links + CASE WHEN p_tier = 'SAFE' THEN 1 ELSE 0 END,
    warned_links = user_stats.warned_links + CASE WHEN p_tier = 'WARN' THEN 1 ELSE 0 END,
    quarantined_links = user_stats.quarantined_links + CASE WHEN p_tier = 'QUARANTINE' THEN 1 ELSE 0 END,
    deleted_links = user_stats.deleted_links + CASE WHEN p_tier = 'DELETE' THEN 1 ELSE 0 END,
    reputation_score = GREATEST(0, 
      100 
      - (CASE WHEN p_tier = 'WARN' THEN 5 ELSE 0 END)
      - (CASE WHEN p_tier = 'QUARANTINE' THEN 15 ELSE 0 END)
      - (CASE WHEN p_tier = 'DELETE' THEN 30 ELSE 0 END)
    ),
    last_link_at = NOW();
END;
$$ LANGUAGE plpgsql;
