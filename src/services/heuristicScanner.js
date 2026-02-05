/**
 * Heuristic URL Scanner
 * Pattern-based threat detection with scoring system
 */

const { URL } = require('url');
const config = require('../../config');

// Known brand names for typosquatting detection
const BRANDS = [
  'google', 'facebook', 'twitter', 'instagram', 'discord', 'youtube',
  'netflix', 'amazon', 'apple', 'microsoft', 'paypal', 'ebay',
  'steam', 'roblox', 'twitch', 'github', 'reddit', 'snapchat',
  'linkedin', 'dropbox', 'spotify', 'tiktok', 'zoom', 'slack'
];

// Suspicious path keywords
const SUSPICIOUS_KEYWORDS = [
  'login', 'signin', 'sign-in', 'verify', 'confirm', 'update',
  'secure', 'account', 'bank', 'wallet', 'password', 'suspended',
  'locked', 'authenticate', 'validation', 'security', 'billing'
];

// Unusual TLDs (common legitimate TLDs excluded)
const COMMON_TLDS = new Set([
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'io', 'co', 'dev',
  'app', 'ai', 'ca', 'uk', 'de', 'fr', 'au', 'br', 'in', 'ru',
  'jp', 'kr', 'cn', 'us', 'mx', 'es', 'it', 'nl', 'se', 'no'
]);

class HeuristicScanner {
  /**
   * Normalize leetspeak to regular text
   */
  deLeet(text) {
    return text
      .replace(/0/g, 'o')
      .replace(/1/g, 'i')
      .replace(/3/g, 'e')
      .replace(/4/g, 'a')
      .replace(/5/g, 's')
      .replace(/7/g, 't')
      .replace(/@/g, 'a')
      .replace(/\$/g, 's');
  }

  /**
   * Calculate Levenshtein distance for typosquatting detection
   */
  levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(
            dp[i - 1][j],     // deletion
            dp[i][j - 1],     // insertion
            dp[i - 1][j - 1]  // substitution
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Check for typosquatting
   */
  checkTyposquatting(hostname) {
    const parts = hostname.split('.');
    const deLeeted = this.deLeet(hostname);

    for (const brand of BRANDS) {
      for (const part of parts) {
        const cleanPart = this.deLeet(part.toLowerCase());
        
        // Exact match is fine
        if (cleanPart === brand) continue;
        
        // Skip very short parts
        if (cleanPart.length < 3) continue;

        // Check edit distance
        const distance = this.levenshtein(cleanPart, brand);
        
        // Distance of 1-2 is suspicious typosquatting
        if (distance > 0 && distance <= 2) {
          return {
            detected: true,
            brand,
            variation: part,
            distance
          };
        }

        // Check for brand as substring (e.g., "goggle-login.com")
        if (cleanPart.includes(brand) && cleanPart !== brand) {
          return {
            detected: true,
            brand,
            variation: part,
            type: 'substring'
          };
        }
      }
    }

    return { detected: false };
  }

  /**
   * Scan URL and calculate heuristic score
   */
  scan(url) {
    const signals = [];
    let score = 0;
    const details = {};

    // Parse URL
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      signals.push('UNPARSEABLE_URL');
      return { score: 50, signals, details: { error: 'Invalid URL' } };
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const parts = hostname.split('.');
    const path = parsed.pathname;
    const fullUrl = url.toLowerCase();

    // 1. IP Address (20 points)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      score += 20;
      signals.push('IP_ADDRESS');
      details.ipAddress = hostname;
    }

    // 2. Excessive Subdomains (15 points)
    if (parts.length > 4) {
      score += 15;
      signals.push('MANY_SUBDOMAINS');
      details.subdomainCount = parts.length;
    }

    // 3. Very Long URL (15 points)
    if (url.length > 200) {
      score += 15;
      signals.push('LONG_URL');
      details.urlLength = url.length;
    }

    // 4. Unusual TLD (10 points)
    const tld = parts[parts.length - 1];
    if (tld && !COMMON_TLDS.has(tld)) {
      score += 10;
      signals.push('UNUSUAL_TLD');
      details.tld = tld;
    }

    // 5. Typosquatting (35 points - high severity)
    const typosquatResult = this.checkTyposquatting(hostname);
    if (typosquatResult.detected) {
      score += 35;
      signals.push('TYPOSQUATTING');
      details.typosquatting = typosquatResult;
    }

    // 6. Suspicious Path Keywords (15 points)
    const foundKeywords = SUSPICIOUS_KEYWORDS.filter(kw => 
      path.toLowerCase().includes(kw)
    );
    if (foundKeywords.length > 0) {
      score += 15;
      signals.push('SUSPICIOUS_PATH');
      details.suspiciousKeywords = foundKeywords;
    }

    // 7. Obfuscated/Hex Path (15 points)
    const cleanPath = path.replace(/\//g, '');
    if (/^[a-f0-9]{20,}$/i.test(cleanPath)) {
      score += 15;
      signals.push('OBFUSCATED_PATH');
      details.obfuscatedPath = true;
    }

    // 8. Multiple @ symbols (25 points - URL obfuscation trick)
    const atCount = (fullUrl.match(/@/g) || []).length;
    if (atCount > 1) {
      score += 25;
      signals.push('MULTIPLE_AT_SYMBOLS');
      details.atSymbolCount = atCount;
    }

    // 9. Port numbers in unusual ranges (10 points)
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
      score += 10;
      signals.push('UNUSUAL_PORT');
      details.port = parsed.port;
    }

    // 10. Homograph attack detection (Unicode lookalikes)
    if (/[а-яА-Я]/.test(hostname) || /[α-ω]/.test(hostname)) {
      score += 30;
      signals.push('HOMOGRAPH_ATTACK');
      details.homograph = true;
    }

    // 11. Shortened path that looks like a redirect
    if (path.length < 10 && /^\/[a-zA-Z0-9]{6,8}$/.test(path)) {
      score += 5;
      signals.push('POTENTIAL_SHORTENER');
    }

    // Determine severity level based on thresholds
    if (score >= config.heuristics.deleteThreshold) {
      signals.push('HEURISTIC_CRITICAL');
    } else if (score >= config.heuristics.quarantineThreshold) {
      signals.push('HEURISTIC_QUARANTINE');
    } else if (score >= config.heuristics.warnThreshold) {
      signals.push('HEURISTIC_WARN');
    }

    return {
      score,
      signals,
      details
    };
  }
}

module.exports = new HeuristicScanner();
