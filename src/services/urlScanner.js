/**
 * URL Scanner Orchestrator
 * Coordinates all scanning services and aggregates results
 */

const heuristicScanner = require('./heuristicScanner');
const redirectResolver = require('./redirectResolver');
const safeBrowsing = require('./safeBrowsing');
const domainAge = require('./domainAge');
const repository = require('../database/repository');
const { logger } = require('../utils/logger');
const config = require('../../config');

class URLScanner {
  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    return redirectResolver.extractDomain(url);
  }

  /**
   * Comprehensive URL scan with all services
   */
  async scan(url, guildId) {
    const startTime = Date.now();
    const originalDomain = this.extractDomain(url);

    logger.debug({ url, guildId }, 'Starting URL scan');

    // Check allowlist/blocklist first (fastest checks)
    const [isAllowed, isBlocked] = await Promise.all([
      repository.isAllowlisted(originalDomain, guildId),
      repository.isBlocklisted(originalDomain, guildId)
    ]);

    // If allowlisted, skip all other checks
    if (isAllowed) {
      logger.debug({ url, domain: originalDomain }, 'URL allowlisted, skipping scan');
      return {
        originalUrl: url,
        resolvedUrl: url,
        originalDomain,
        resolvedDomain: originalDomain,
        signals: [],
        heuristicScore: 0,
        safeBrowsingMatch: false,
        threatTypes: [],
        domainAgeDays: null,
        isAllowed: true,
        isBlocked: false,
        scanDuration: Date.now() - startTime
      };
    }

    // If blocklisted, return immediately with critical signal
    if (isBlocked) {
      logger.info({ url, domain: originalDomain }, 'URL blocklisted');
      return {
        originalUrl: url,
        resolvedUrl: url,
        originalDomain,
        resolvedDomain: originalDomain,
        signals: ['BLOCKLIST_MATCH'],
        heuristicScore: 100,
        safeBrowsingMatch: false,
        threatTypes: [],
        domainAgeDays: null,
        isAllowed: false,
        isBlocked: true,
        scanDuration: Date.now() - startTime
      };
    }

    // Run all scans in parallel for performance
    const [
      redirectResult,
      heuristicResult,
      safeBrowsingResult
    ] = await Promise.all([
      config.features.redirectResolution 
        ? redirectResolver.resolve(url)
        : Promise.resolve({ finalUrl: url, finalDomain: originalDomain, hops: 0 }),
      config.features.heuristicScanning
        ? Promise.resolve(heuristicScanner.scan(url))
        : Promise.resolve({ score: 0, signals: [], details: {} }),
      config.features.safeBrowsing
        ? safeBrowsing.checkUrl(url)
        : Promise.resolve({ isThreat: false, threatTypes: [] })
    ]);

    const resolvedDomain = redirectResult.finalDomain || originalDomain;
    const signals = [...heuristicResult.signals];

    // Check if resolved domain is different and needs separate checks
    let resolvedBlocked = false;
    let resolvedSafeBrowsing = { isThreat: false, threatTypes: [] };
    
    if (resolvedDomain !== originalDomain) {
      [resolvedBlocked, resolvedSafeBrowsing] = await Promise.all([
        repository.isBlocklisted(resolvedDomain, guildId),
        config.features.safeBrowsing 
          ? safeBrowsing.checkUrl(redirectResult.finalUrl)
          : Promise.resolve({ isThreat: false, threatTypes: [] })
      ]);
    }

    // Add Safe Browsing signals
    if (safeBrowsingResult.isThreat || resolvedSafeBrowsing.isThreat) {
      signals.push('SAFE_BROWSING_THREAT');
      
      // Add specific threat type signals
      const allThreats = [
        ...safeBrowsingResult.threatTypes,
        ...resolvedSafeBrowsing.threatTypes
      ];
      
      if (allThreats.includes('MALWARE')) signals.push('KNOWN_MALWARE');
      if (allThreats.includes('SOCIAL_ENGINEERING')) signals.push('PHISHING_DETECTED');
    }

    // Add blocklist signal for resolved domain
    if (resolvedBlocked) {
      signals.push('BLOCKLIST_MATCH');
    }

    // Check domain age (only for resolved domain)
    let domainAgeResult = { ageDays: null, isYoung: false };
    if (config.features.whoisLookup && resolvedDomain) {
      domainAgeResult = await domainAge.getDomainAge(resolvedDomain);
      
      if (domainAgeResult.isYoung) {
        signals.push('YOUNG_DOMAIN');
        
        // If young domain has multiple other risk signals, elevate severity
        const riskSignals = signals.filter(s => 
          ['SUSPICIOUS_PATH', 'UNUSUAL_TLD', 'MANY_SUBDOMAINS', 
           'IP_ADDRESS', 'TYPOSQUATTING'].includes(s)
        );
        
        if (riskSignals.length >= 2) {
          signals.push('YOUNG_DOMAIN_WITH_SIGNALS');
        }
      }
    }

    // Check for multiple risk factors
    const highRiskSignals = signals.filter(s =>
      ['TYPOSQUATTING', 'IP_ADDRESS', 'SUSPICIOUS_PATH', 
       'UNUSUAL_TLD', 'YOUNG_DOMAIN'].includes(s)
    );
    
    if (highRiskSignals.length >= 3) {
      signals.push('MULTIPLE_RISK_FACTORS');
    }

    const scanDuration = Date.now() - startTime;

    const result = {
      originalUrl: url,
      resolvedUrl: redirectResult.finalUrl,
      originalDomain,
      resolvedDomain,
      redirectHops: redirectResult.hops,
      signals: [...new Set(signals)], // Remove duplicates
      heuristicScore: heuristicResult.score,
      heuristicDetails: heuristicResult.details,
      safeBrowsingMatch: safeBrowsingResult.isThreat || resolvedSafeBrowsing.isThreat,
      threatTypes: [
        ...new Set([
          ...safeBrowsingResult.threatTypes,
          ...resolvedSafeBrowsing.threatTypes
        ])
      ],
      domainAgeDays: domainAgeResult.ageDays,
      isAllowed: false,
      isBlocked: resolvedBlocked,
      scanDuration
    };

    logger.debug({ 
      url, 
      domain: resolvedDomain,
      score: result.heuristicScore, 
      signals: result.signals,
      duration: scanDuration 
    }, 'Scan completed');

    return result;
  }

  /**
   * Batch scan multiple URLs
   */
  async scanBatch(urls, guildId) {
    const results = await Promise.allSettled(
      urls.map(url => this.scan(url, guildId))
    );

    return results.map((result, index) => ({
      url: urls[index],
      success: result.status === 'fulfilled',
      ...(result.status === 'fulfilled'
        ? result.value
        : { error: result.reason.message })
    }));
  }
}

module.exports = new URLScanner();
