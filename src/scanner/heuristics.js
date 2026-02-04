/**
 * src/scanner/heuristics.js
 * ─────────────────────────────────────────────
 * Pattern-based URL scoring (typosquats, suspicious TLDs, etc.)
 */

const { URL } = require('url');

const BRANDS = [
  'google', 'facebook', 'twitter', 'instagram', 'discord',
  'youtube', 'netflix', 'amazon', 'apple', 'microsoft',
  'paypal', 'ebay', 'steam', 'roblox', 'twitch',
  'github', 'reddit', 'snapchat', 'linkedin', 'dropbox',
];

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function deLeet(str) {
  return str
    .replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e')
    .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
    .replace(/@/g, 'a');
}

function scoreUrl(rawUrl) {
  const signals = [];
  let score = 0;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    signals.push('UNPARSEABLE');
    return { score: 25, signals };
  }

  const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const parts = hostname.split('.');
  const path = parsed.pathname;
  const full = rawUrl.toLowerCase();

  // ── excessive subdomains ──
  if (parts.length > 4) {
    score += 10;
    signals.push('MANY_SUBDOMAINS');
  }

  // ── very long URL ──
  if (rawUrl.length > 200) {
    score += 15;
    signals.push('LONG_URL');
  }

  // ── IP address ──
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    score += 20;
    signals.push('IP_ADDRESS');
  }

  // ── unusual TLD ──
  const commonTLDs = new Set([
    'com', 'org', 'net', 'edu', 'gov', 'io', 'co', 'dev', 'app',
    'ca', 'uk', 'de', 'fr', 'au', 'br', 'in', 'ru', 'jp', 'kr',
  ]);
  const tld = parts[parts.length - 1];
  if (!commonTLDs.has(tld)) {
    score += 10;
    signals.push('UNUSUAL_TLD');
  }

  // ── typosquat ──
  const deLeeted = deLeet(hostname);
  for (const brand of BRANDS) {
    for (const label of parts) {
      const cleanLabel = deLeet(label);
      if (cleanLabel === brand) continue;
      if (cleanLabel.length < 3) continue;
      if (levenshtein(cleanLabel, brand) <= 2 && cleanLabel !== brand) {
        score += 30;
        signals.push('TYPOSQUAT');
        break;
      }
    }
    if (signals.includes('TYPOSQUAT')) break;
  }

  // ── suspicious path ──
  const suspiciousPathTokens = ['login', 'signin', 'verify', 'confirm', 'update', 'secure', 'account', 'bank'];
  for (const token of suspiciousPathTokens) {
    if (path.toLowerCase().includes(token)) {
      score += 10;
      signals.push('SUSPICIOUS_PATH');
      break;
    }
  }

  // ── obfuscated path ──
  if (/^[a-f0-9]{20,}$/i.test(path.replace(/\//g, ''))) {
    score += 15;
    signals.push('OBFUSCATED_PATH');
  }

  // ── multiple @ ──
  if ((full.match(/@/g) || []).length > 1) {
    score += 25;
    signals.push('MULTIPLE_AT');
  }

  return { score, signals };
}

module.exports = { scoreUrl };
