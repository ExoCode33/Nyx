/**
 * src/scanner/domainAge.js
 * ─────────────────────────────────────────────
 * WHOIS lookup to determine domain age in days.
 */

const whois = require('whois-json');

const CREATION_FIELDS = [
  'creationDate', 'creation_date',
  'registrationDate', 'registration_date',
  'created', 'registered',
];

function extractCreationDate(record) {
  for (const field of CREATION_FIELDS) {
    const val = record[field];
    if (!val) continue;

    const raw = Array.isArray(val) ? val[0] : val;
    const date = new Date(raw);
    if (!isNaN(date.getTime())) return date;
  }
  return null;
}

async function getDomainAgeDays(domain) {
  try {
    const record = await whois(domain);
    const created = extractCreationDate(record);
    if (!created) return null;

    const nowMs = Date.now();
    const diffMs = nowMs - created.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  } catch {
    return null;
  }
}

module.exports = { getDomainAgeDays };
