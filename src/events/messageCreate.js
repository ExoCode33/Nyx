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
    // Ignore bot messages and DMs
    if (!message.guild || message.author.bot) return;

    // Extract URLs from message
    const urls = message.content.match(URL_PATTERN);
    if (!urls || urls.length === 0) return;

    // Remove duplicates
    const uniqueUrls = [...new Set(urls)];

    logger.debug({
      userId: message.author.id,
      guildId: message.guild.id,
      channelId: message.channel.id,
      urlCount: uniqueUrls.length
    }, 'Processing message with URLs');

    // Check rate limit
    const isLimited = rateLimiter.isRateLimited(
      message.author.id,
      message.guild.id
    );

    if (isLimited) {
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
        // Ignore if we can't send the message
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

    // Scan each URL
    for (const url of uniqueUrls) {
      try {
        // Scan the URL
        const scanResult = await urlScanner.scan(url, message.guild.id);

        // Enforce based on scan result
        await enforcement.enforce(message, scanResult);

      } catch (error) {
        logger.error({
          error: error.message,
          url,
          userId: message.author.id,
          guildId: message.guild.id
        }, 'Error processing URL');
      }
    }
  }
};
