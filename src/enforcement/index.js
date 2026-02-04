/**
 * src/enforcement/index.js
 * ─────────────────────────────────────────────
 * Tier selection engine + action dispatch.
 */

const { TIERS } = require('../../config/tiers');
const db = require('../db');
const { recordAndCheck } = require('./rateLimiter');
const { warn, quarantine, deleteMsgAndNotify } = require('./actions');

const TIER_ORDER = [TIERS.DELETE, TIERS.QUARANTINE, TIERS.WARN];

const ACTION_MAP = {
  DELETE: deleteMsgAndNotify,
  QUARANTINE: quarantine,
  WARN: warn,
};

const STAT_COL = {
  DELETE: 'deleted_links',
  QUARANTINE: 'quarantined_links',
  WARN: 'warned_links',
};

async function enforce(message, verdict) {
  const guildId = message.guild.id;
  const userId = message.author.id;
  const channelId = message.channel.id;

  if (verdict.isAllowed) {
    await persist(message, verdict, 'safe', null, 'allowed');
    return;
  }

  if (recordAndCheck(userId, guildId)) {
    if (!verdict.signals.includes('RATE_LIMIT_HIT')) {
      verdict.signals.push('RATE_LIMIT_HIT');
    }
  }

  let chosenTier = null;
  for (const tier of TIER_ORDER) {
    const overlap = tier.triggers.some(t => verdict.signals.includes(t));
    if (overlap) {
      chosenTier = tier;
      break;
    }
  }

  if (!chosenTier) {
    await persist(message, verdict, 'safe', null, 'safe');
    return;
  }

  const actionFn = ACTION_MAP[chosenTier.label];
  const actionLog = await actionFn(message, verdict);

  if (chosenTier.label === 'QUARANTINE') {
    await db.addToReviewQueue({
      guildId,
      channelId,
      userId,
      originalUrl: verdict.originalUrl,
      resolvedUrl: verdict.resolvedUrl,
      signals: verdict.signals,
      heuristicScore: verdict.heuristicScore,
    });
  }

  const statusLabel = chosenTier.label.toLowerCase() + 'ed';
  await persist(message, verdict, statusLabel, chosenTier.label, actionLog);
}

async function persist(message, verdict, status, tier, actionTaken) {
  const guildId = message.guild.id;

  await db.insertLinkLog({
    messageId: message.id,
    userId: message.author.id,
    guildId,
    channelId: message.channel.id,
    originalUrl: verdict.originalUrl,
    resolvedUrl: verdict.resolvedUrl,
    originalDomain: verdict.originalDomain,
    resolvedDomain: verdict.resolvedDomain,
    status,
    tier,
    signals: verdict.signals,
    heuristicScore: verdict.heuristicScore,
    actionTaken,
  });

  const col = STAT_COL[tier] || 'safe_links';
  await db.bumpUserStat(message.author.id, guildId, col);
}

module.exports = { enforce };
