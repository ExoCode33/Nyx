/**
 * Redirect Resolver Service
 * Follows HTTP redirect chains to discover final destination
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const config = require('../../config');
const { logger } = require('../utils/logger');

class RedirectResolver {
  constructor() {
    this.maxHops = config.scanner.redirectMaxHops;
    this.timeout = config.scanner.redirectTimeoutMs;
  }

  /**
   * Make a HEAD request and check for redirects
   */
  async headRequest(url) {
    return new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = new URL(url);
      } catch (error) {
        return reject(new Error('Invalid URL'));
      }

      const transport = parsed.protocol === 'https:' ? https : http;
      const options = {
        method: 'HEAD',
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NyxBot/2.0; +https://github.com/nyx-bot)'
        }
      };

      const req = transport.request(url, options, (res) => {
        const location = res.headers.location;
        
        // Check for redirect status codes
        if (location && res.statusCode >= 300 && res.statusCode < 400) {
          try {
            // Resolve relative URLs
            const redirectUrl = new URL(location, url).href;
            resolve({ 
              redirect: true, 
              url: redirectUrl,
              statusCode: res.statusCode 
            });
          } catch (error) {
            reject(new Error('Invalid redirect location'));
          }
        } else {
          resolve({ 
            redirect: false, 
            url, 
            statusCode: res.statusCode 
          });
        }
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.end();
    });
  }

  /**
   * Resolve full redirect chain
   */
  async resolve(url) {
    const chain = [url];
    let currentUrl = url;
    let hopCount = 0;

    while (hopCount < this.maxHops) {
      try {
        const result = await this.headRequest(currentUrl);
        
        if (!result.redirect) {
          // No more redirects
          break;
        }

        currentUrl = result.url;
        chain.push(currentUrl);
        hopCount++;

        // Detect redirect loops
        if (chain.filter(u => u === currentUrl).length > 1) {
          logger.warn({ url, chain }, 'Redirect loop detected');
          break;
        }
      } catch (error) {
        // Stop on error but return what we have
        logger.debug({ url, error: error.message }, 'Redirect resolution stopped');
        break;
      }
    }

    const finalUrl = chain[chain.length - 1];
    let finalDomain = null;

    try {
      const parsed = new URL(finalUrl);
      finalDomain = parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch (error) {
      logger.warn({ finalUrl }, 'Could not parse final URL');
    }

    return {
      originalUrl: url,
      finalUrl,
      finalDomain,
      chain,
      hops: chain.length - 1,
      maxHopsReached: hopCount >= this.maxHops
    };
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch (error) {
      return null;
    }
  }
}

module.exports = new RedirectResolver();
