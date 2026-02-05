/**
 * Ready Event Handler
 * Fired when bot successfully connects to Discord
 */

const { ActivityType } = require('discord.js');
const { logger } = require('../utils/logger');
const repository = require('../database/repository');

module.exports = {
  name: 'ready',
  once: true,
  
  async execute(client) {
    logger.info({
      username: client.user.tag,
      id: client.user.id,
      guildCount: client.guilds.cache.size,
      userCount: client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)
    }, 'Bot is ready');

    // Set bot activity
    client.user.setActivity({
      name: 'for malicious links 🛡️',
      type: ActivityType.Watching
    });

    // Register all guilds in database
    for (const [guildId, guild] of client.guilds.cache) {
      try {
        await repository.upsertGuild(guildId, guild.name);
        logger.debug({ guildId, guildName: guild.name }, 'Guild registered');
      } catch (error) {
        logger.error({
          error: error.message,
          guildId,
          guildName: guild.name
        }, 'Failed to register guild');
      }
    }

    // Periodic cache cleanup (every 15 minutes)
    setInterval(async () => {
      try {
        await repository.cleanExpiredCache();
        logger.debug('Cache cleanup completed');
      } catch (error) {
        logger.error({ error: error.message }, 'Cache cleanup failed');
      }
    }, 15 * 60 * 1000);

    logger.info('Bot initialization complete');
  }
};
