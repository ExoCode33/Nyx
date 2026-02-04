/**
 * src/scanner/redirectResolver.js
 * ─────────────────────────────────────────────
 * Follows HTTP redirect chains and returns the final URL.
 */

const https = require('https');
const http  = require('http');
const { URL } = require('url');
const config = require('../../config');

const MAX_HOPS = 10;

function headRequest(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;

    const req = transport.request(url, { method: 'HEAD' }, (res) => {
      const loc = res.headers.location;
      if (loc && res.statusCode >= 300 && res.statusCode < 400) {
        resolve(new URL(loc, url).href);
      } else {
        resolve(null);
      }
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.setTimeout(timeoutMs);
    req.end();
  });
}

async function resolveUrl(url) {
  let current = url;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    try {
      const next = await headRequest(current, config.redirectTimeoutMs);
      if (!next) break;
      current = next;
    } catch {
      break;
    }
  }

  let finalDomain;
  try {
    finalDomain = new URL(current).hostname.replace(/^www\./, '');
  } catch {
    finalDomain = null;
  }

  return { finalUrl: current, finalDomain };
}

module.exports = { resolveUrl };
