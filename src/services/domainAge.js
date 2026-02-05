/**
 * Domain Age Service
 * WHOIS lookup to determine domain registration age
 */

const whois = require('whois-json');
const config = require('../../config');
const repository = require('../database/repository');
const { logger } = require('../utils/logger');

class DomainAgeService {
  constructor() {
    this.enabled = config.features.whoisLookup;
    this.cacheTtlHours = config.scanner.whoisCacheTtlHours;
    this.threshold = config.scanner.domainAgeThresholdDays;
    
    // Possible creation date field names in WHOIS records
    this.creationFields = [
      'creationDate',
      'creation_date',
      'created',
      'registrationDate',
      'registration_date',
      'registered',
      'domainRegistrationDate',
      'created_date'
    ];
  }

  /**
   * Extract creation date from WHOIS record
   */
  extractCreationDate(record) {
    for (const field of this.creationFields) {
      const value = record[field];
      
      if (!value) continue;

      // Handle array values (some registrars return arrays)
      const dateValue = Array.isArray(value) ? value[0] : value;
      
      try {
        const date = new Date(dateValue);
        
        // Validate date
        if (!isNaN(date.getTime()) && date.getFullYear() > 1990) {
          return date;
        }
      } catch (error) {
        // Try next field
        continue;
      }
    }

    return null;
  }

  /**
   * Calculate domain age in days
   */
  calculateAgeDays(creationDate) {
    const now = new Date();
    const diffMs = now.getTime() - creationDate.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  }

  /**
   * Get domain age with caching
   */
  async getDomainAge(domain) {
    if (!this.enabled) {
      return {
        ageDays: null,
        isYoung: false,
        source: 'disabled'
      };
    }

    // Check cache first
    const cacheKey = `whois:${domain}`;
    const cached = await repository.getCached(cacheKey);
    
    if (cached) {
      logger.debug({ domain }, 'WHOIS cache hit');
      return { ...cached, source: 'cache' };
    }

    // Perform WHOIS lookup
    try {
      const record = await whois(domain, { timeout: 5000 });
      const creationDate = this.extractCreationDate(record);

      if (!creationDate) {
        logger.debug({ domain }, 'Could not extract creation date from WHOIS');
        
        const result = {
          ageDays: null,
          isYoung: false,
          error: 'Creation date not found'
        };
        
        // Cache negative result for shorter time
        await repository.setCache(cacheKey, result, 3600); // 1 hour
        
        return { ...result, source: 'lookup' };
      }

      const ageDays = this.calculateAgeDays(creationDate);
      const isYoung = ageDays < this.threshold;

      const result = {
        ageDays,
        isYoung,
        creationDate: creationDate.toISOString()
      };

      // Cache for configured time
      await repository.setCache(
        cacheKey, 
        result, 
        this.cacheTtlHours * 3600
      );

      return { ...result, source: 'lookup' };
    } catch (error) {
      logger.debug({ domain, error: error.message }, 'WHOIS lookup failed');
      
      const result = {
        ageDays: null,
        isYoung: false,
        error: error.message
      };
      
      // Cache error for short time to avoid hammering
      await repository.setCache(cacheKey, result, 1800); // 30 minutes
      
      return { ...result, source: 'error' };
    }
  }

  /**
   * Check if domain is young (below threshold)
   */
  async isYoungDomain(domain) {
    const result = await this.getDomainAge(domain);
    return result.isYoung;
  }

  /**
   * Batch check multiple domains
   */
  async checkDomains(domains) {
    const results = await Promise.allSettled(
      domains.map(domain => this.getDomainAge(domain))
    );

    return results.map((result, index) => ({
      domain: domains[index],
      ...(result.status === 'fulfilled'
        ? result.value
        : { ageDays: null, isYoung: false, error: result.reason.message })
    }));
  }
}

module.exports = new DomainAgeService();
