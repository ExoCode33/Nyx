/**
 * Guild Create Event Handler
 * Fired when bot joins a new server
 */

const { EmbedBuilder } = require('discord.js');
const { logger } = require('../utils/logger');
const repository = require('../database/repository');

module.exports = {
  name: 'guildCreate',
  
  async execute(guild) {
    logger.info({
      guildId: guild.id,
      guildName: guild.name,
      memberCount: guild.memberCount
    }, 'Joined new guild');

    // Register guild in database
    try {
      await repository.upsertGuild(guild.id, guild.name);
    } catch (error) {
      logger.error({
        error: error.message,
        guildId: guild.id
      }, 'Failed to register new guild');
      return;
    }

    // Try to send welcome message
    try {
      // Find a suitable channel to send the welcome message
      const channel = guild.systemChannel 
        || guild.channels.cache.find(c => 
          c.type === 0 && // Text channel
          c.permissionsFor(guild.members.me).has(['SendMessages', 'EmbedLinks'])
        );

      if (!channel) {
        logger.warn({ guildId: guild.id }, 'No suitable channel for welcome message');
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🛡️ Nyx Watchdog - Link Security Bot')
        .setDescription(
          'Thank you for adding Nyx! I will protect your server from malicious links automatically.'
        )
        .addFields(
          {
            name: '🔍 What I Do',
            value: '• Scan all links posted in your server\n• Block malicious and phishing sites\n• Detect suspicious patterns\n• Track user reputation',
            inline: false
          },
          {
            name: '⚙️ Getting Started',
            value: '• Use `/nyx admin` to access the admin panel\n• Configure admin roles and log channels\n• Manage allowlist/blocklist\n• Review quarantined links',
            inline: false
          },
          {
            name: '📊 Enforcement Tiers',
            value: '🟢 **Safe** - Link passes all checks\n⚠️ **Warn** - Suspicious patterns detected\n🟠 **Quarantine** - Potentially dangerous, needs review\n🔴 **Delete** - Confirmed malicious threat',
            inline: false
          },
          {
            name: '🔒 Permissions Required',
            value: '• Manage Messages (to delete malicious links)\n• Send Messages & Embed Links\n• Read Message History',
            inline: false
          }
        )
        .setFooter({ 
          text: 'Nyx Watchdog v2.0 | Open source security for Discord' 
        })
        .setTimestamp();

      await channel.send({ embeds: [embed] });

    } catch (error) {
      logger.error({
        error: error.message,
        guildId: guild.id
      }, 'Failed to send welcome message');
    }
  }
};
