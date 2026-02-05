/**
 * Message Create Event Handler
 * Main watchdog loop - scans every message for links
 */

const urlScanner = require('../services/urlScanner');
const enforcement = require('../services/enforcement');
const rateLimiter = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');

// URL regex pattern
const URL_PATTERN = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi;

module.exports = {
  name: 'messageCreate',
  
  async execute(message) {
    // DEBUG: Log every single message received
    console.log('===========================================');
    console.log('📨 MESSAGE RECEIVED');
    console.log('Content:', message.content);
    console.log('Author:', message.author.tag);
    console.log('Is Bot:', message.author.bot);
    console.log('Has Guild:', !!message.guild);
    console.log('Guild ID:', message.guild?.id);
    console.log('Channel ID:', message.channel?.id);
    console.log('===========================================');

    // Ignore bot messages and DMs
    if (!message.guild) {
      console.log('⏭️ SKIPPED: No guild (DM message)');
      return;
    }

    if (message.author.bot) {
      console.log('⏭️ SKIPPED: Bot message');
      return;
    }

    console.log('✅ MESSAGE ELIGIBLE FOR SCANNING');

    // Extract URLs from message
    const urls = message.content.match(URL_PATTERN);
    console.log('🔍 URL EXTRACTION RESULT:', urls);

    if (!urls || urls.length === 0) {
      console.log('⏭️ NO URLs FOUND in message');
      return;
    }

    // Remove duplicates
    const uniqueUrls = [...new Set(urls)];
    console.log('🔗 UNIQUE URLs to scan:', uniqueUrls);

    logger.info({
      userId: message.author.id,
      guildId: message.guild.id,
      channelId: message.channel.id,
      urlCount: uniqueUrls.length
    }, 'Processing message with URLs');

    // Check rate limit
    console.log('⏱️ Checking rate limit...');
    const isLimited = rateLimiter.isRateLimited(
      message.author.id,
      message.guild.id
    );

    if (isLimited) {
      console.log('🚫 RATE LIMITED!');
      logger.warn({
        userId: message.author.id,
        guildId: message.guild.id
      }, 'Rate limit exceeded');

      try {
        await message.reply({
          content: '⚠️ You are posting links too quickly. Please slow down.',
          allowedMentions: { repliedUser: false }
        });
      } catch (error) {
        console.error('❌ Failed to send rate limit message:', error);
      }

      // Still scan the links but mark as rate limited
      const scanResult = {
        originalUrl: uniqueUrls[0],
        resolvedUrl: uniqueUrls[0],
        originalDomain: urlScanner.extractDomain(uniqueUrls[0]),
        resolvedDomain: urlScanner.extractDomain(uniqueUrls[0]),
        signals: ['RATE_LIMIT_EXCEEDED'],
        heuristicScore: 30,
        safeBrowsingMatch: false,
        threatTypes: [],
        domainAgeDays: null,
        isAllowed: false,
        isBlocked: false
      };

      await enforcement.enforce(message, scanResult);
      return;
    }

    console.log('✅ NOT RATE LIMITED - Proceeding with scan');

    // Scan each URL
    for (const url of uniqueUrls) {
      console.log('-------------------------------------------');
      console.log('🔎 SCANNING URL:', url);
      
      try {
        // Scan the URL
        console.log('📡 Calling urlScanner.scan()...');
        const scanResult = await urlScanner.scan(url, message.guild.id);
        
        console.log('📊 SCAN COMPLETE:', {
          domain: scanResult.resolvedDomain,
          score: scanResult.heuristicScore,
          signals: scanResult.signals,
          isBlocked: scanResult.isBlocked,
          isAllowed: scanResult.isAllowed
        });

        // Enforce based on scan result
        console.log('⚖️ Calling enforcement.enforce()...');
        const enforcementResult = await enforcement.enforce(message, scanResult);
        
        console.log('✅ ENFORCEMENT COMPLETE:', {
          tier: enforcementResult.tier.label,
          action: enforcementResult.actionTaken,
          success: enforcementResult.success
        });

      } catch (error) {
        console.error('❌ ERROR PROCESSING URL:', {
          url,
          error: error.message,
          stack: error.stack
        });
        
        logger.error({
          error: error.message,
          url,
          userId: message.author.id,
          guildId: message.guild.id
        }, 'Error processing URL');
      }
    }
    
    console.log('===========================================');
    console.log('🏁 MESSAGE PROCESSING COMPLETE');
    console.log('===========================================');
  }
};
