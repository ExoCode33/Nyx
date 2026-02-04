/**
 * src/scanner/index.js
 * ─────────────────────────────────────────────
 * Scanner orchestrator — runs all checks in parallel.
 */

const { URL } = require('url');
const config = require('../../config');
const db = require('../db');
const { resolveUrl } = require('./redirectResolver');
const { checkUrl } = require('./safeBrowsing');
const { getDomainAgeDays } = require('./domainAge');
const { scoreUrl } = require('./heuristics');

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

async function scanUrl(rawUrl, guildId) {
  const originalDomain = extractDomain(rawUrl);

  const [resolved, safeBrowse, heuristic, allowed, blocked] = await Promise.all([
    resolveUrl(rawUrl),
    checkUrl(rawUrl),
    Promise.resolve(scoreUrl(rawUrl)),
    db.isAllowed(originalDomain, guildId),
    db.isBlocked(originalDomain, guildId),
  ]);

  const resolvedDomain = resolved.finalDomain || originalDomain;

  let resolvedBlocked = false;
  let resolvedSB = { isThreat: false, threatTypes: [] };
  if (resolvedDomain !== originalDomain) {
    [resolvedBlocked, resolvedSB] = await Promise.all([
      db.isBlocked(resolvedDomain, guildId),
      checkUrl(resolved.finalUrl),
    ]);
  }

  const signals = [...heuristic.signals];

  if (safeBrowse.isThreat || resolvedSB.isThreat) {
    signals.push('SAFE_BROWSING_MATCH');
  }
  if (blocked || resolvedBlocked) {
    signals.push('BLOCKLIST_HIT');
  }

  const ageDays = await getDomainAgeDays(resolvedDomain);
  if (ageDays !== null && ageDays < config.domainAgeDays) {
    signals.push('YOUNG_DOMAIN');
  }

  const warnSignals = ['YOUNG_DOMAIN', 'MANY_SUBDOMAINS', 'LONG_URL',
                       'IP_ADDRESS', 'UNUSUAL_TLD', 'SUSPICIOUS_PATH', 'OBFUSCATED_PATH'];
  const warnCount = signals.filter(s => warnSignals.includes(s)).length;
  if (signals.includes('YOUNG_DOMAIN') && warnCount >= 2) {
    signals.push('YOUNG_DOMAIN_PLUS');
  }

  if (heuristic.score >= config.heuristicDeleteThreshold) {
    signals.push('HEURISTIC_CRITICAL');
  } else if (heuristic.score >= config.heuristicWarnThreshold) {
    const mid = (config.heuristicWarnThreshold + config.heuristicDeleteThreshold) / 2;
    signals.push(heuristic.score >= mid ? 'HEURISTIC_HIGH' : 'HEURISTIC_LOW');
  }

  return {
    originalUrl: rawUrl,
    resolvedUrl: resolved.finalUrl,
    originalDomain,
    resolvedDomain,
    signals,
    heuristicScore: heuristic.score,
    safeBrowsingHit: safeBrowse.isThreat || resolvedSB.isThreat,
    threatTypes: [...new Set([...safeBrowse.threatTypes, ...resolvedSB.threatTypes])],
    domainAgeDays: ageDays,
    isAllowed: allowed,
    isBlocked: blocked || resolvedBlocked,
  };
}

module.exports = { scanUrl };
