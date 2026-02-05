/**
 * Google Safe Browsing API Service
 * Checks URLs against Google's threat database
 */

const https = require('https');
const config = require('../../config');
const repository = require('../database/repository');
const { logger } = require('../utils/logger');

class SafeBrowsingService {
  constructor() {
    this.apiKey = config.apis.safeBrowsingKey;
    this.endpoint = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
    this.enabled = config.features.safeBrowsing && this.apiKey;
    this.cacheTtl = config.enforcement.safeBrowsingCacheTtlSeconds;
  }

  /**
   * Check if Safe Browsing is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Check URL against Safe Browsing API
   */
  async checkUrl(url) {
    if (!this.enabled) {
      return {
        isThreat: false,
        threatTypes: [],
        source: 'disabled'
      };
    }

    // Check cache first
    const cacheKey = `safebrowsing:${url}`;
    const cached = await repository.getCached(cacheKey);
    
    if (cached) {
      logger.debug({ url }, 'Safe Browsing cache hit');
      return { ...cached, source: 'cache' };
    }

    // Make API request
    try {
      const result = await this.apiCheck(url);
      
      // Cache the result
      await repository.setCache(cacheKey, result, this.cacheTtl);
      
      return { ...result, source: 'api' };
    } catch (error) {
      logger.error({ error: error.message, url }, 'Safe Browsing API error');
      
      // Return safe on error to avoid false positives
      return {
        isThreat: false,
        threatTypes: [],
        error: error.message,
        source: 'error'
      };
    }
  }

  /**
   * Make API request to Safe Browsing
   */
  async apiCheck(url) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        client: {
          clientId: 'nyx-watchdog',
          clientVersion: '2.0.0'
        },
        threatInfo: {
          threatTypes: [
            'MALWARE',
            'SOCIAL_ENGINEERING',
            'UNWANTED_SOFTWARE',
            'POTENTIALLY_HARMFUL_APPLICATION'
          ],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }]
        }
      });

      const requestUrl = `${this.endpoint}?key=${this.apiKey}`;
      const parsed = new URL(requestUrl);

      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 5000
      };

      const req = https.request(options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              return reject(new Error(`API returned status ${res.statusCode}`));
            }

            const data = JSON.parse(body);

            if (data.matches && data.matches.length > 0) {
              const threatTypes = [...new Set(data.matches.map(m => m.threatType))];
              resolve({
                isThreat: true,
                threatTypes,
                matches: data.matches
              });
            } else {
              resolve({
                isThreat: false,
                threatTypes: []
              });
            }
          } catch (error) {
            reject(new Error('Failed to parse API response'));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('API request timeout'));
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(payload);
      req.end();
    });
  }

  /**
   * Batch check multiple URLs
   */
  async checkUrls(urls) {
    const results = await Promise.allSettled(
      urls.map(url => this.checkUrl(url))
    );

    return results.map((result, index) => ({
      url: urls[index],
      ...(result.status === 'fulfilled' 
        ? result.value 
        : { isThreat: false, threatTypes: [], error: result.reason.message })
    }));
  }
}

module.exports = new SafeBrowsingService();
