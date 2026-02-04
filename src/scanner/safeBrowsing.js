/**
 * src/scanner/safeBrowsing.js
 * ─────────────────────────────────────────────
 * Google Safe Browsing v4 API wrapper.
 */

const https = require('https');
const config = require('../../config');

const ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';

async function checkUrl(url) {
  const payload = JSON.stringify({
    client: { clientId: 'nyx', clientVersion: '1.0' },
    threatInfo: {
      threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
      platformTypes: ['ANY_PLATFORM'],
      threatEntryTypes: ['URL'],
      threatEntries: [{ url }],
    },
  });

  return new Promise((resolve) => {
    const reqUrl = `${ENDPOINT}?key=${config.safeBrowsingKey}`;
    const parsed = new URL(reqUrl);

    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.matches && data.matches.length > 0) {
              const types = [...new Set(data.matches.map(m => m.threatType))];
              resolve({ isThreat: true, threatTypes: types });
            } else {
              resolve({ isThreat: false, threatTypes: [] });
            }
          } catch {
            resolve({ isThreat: false, threatTypes: [] });
          }
        });
      }
    );

    req.on('error', () => resolve({ isThreat: false, threatTypes: [] }));
    req.write(payload);
    req.end();
  });
}

module.exports = { checkUrl };
