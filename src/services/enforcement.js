/**
 * Enforcement Service
 * Executes enforcement actions based on tier level
 * All actions are logged to the log channel with professional embeds
 */

const { EmbedBuilder } = require('discord.js');
const { TIERS, determineEnforcementTier } = require('../../config/tiers');
const repository = require('../database/repository');
const { logger, logEnforcement } = require('../utils/logger');
const config = require('../../config');

class EnforcementService {
  /**
   * Send notification to log channel if configured
   */
  async sendToLogChannel(guild, embed) {
    try {
      const guildData = await repository.getGuild(guild.id);
      
      if (!guildData || !guildData.log_channel_id) {
        return; // No log channel configured
      }

      const logChannel = await guild.channels.fetch(guildData.log_channel_id);
      
      if (logChannel) {
        await logChannel.send({ embeds: [embed] });
      }
    } catch (error) {
      logger.debug({ error: error.message }, 'Could not send to log channel');
    }
  }

  /**
   * Execute enforcement action based on scan result
   */
  async enforce(message, scanResult) {
    const tier = determineEnforcementTier(scanResult);
    
    logger.info({
      userId: message.author.id,
      guildId: message.guild.id,
      tier: tier.label,
      domain: scanResult.resolvedDomain
    }, `Enforcing ${tier.label} tier`);

    let actionTaken = 'none';

    try {
      switch (tier.label) {
        case 'SAFE':
          actionTaken = await this.handleSafe(message, scanResult, tier);
          break;
          
        case 'WARN':
          actionTaken = await this.handleWarn(message, scanResult, tier);
          break;
          
        case 'QUARANTINE':
          actionTaken = await this.handleQuarantine(message, scanResult, tier);
          break;
          
        case 'DELETE':
          actionTaken = await this.handleDelete(message, scanResult, tier);
          break;
      }

      // Log to database
      await this.logAction(message, scanResult, tier, actionTaken);
      
      // Update user statistics
      await repository.updateUserStats(
        message.author.id,
        message.guild.id,
        tier.label
      );

      logEnforcement(
        actionTaken,
        scanResult,
        tier,
        message.guild.id,
        message.author.id,
        message.id
      );

      return { tier, actionTaken, success: true };
    } catch (error) {
      logger.error({
        error: error.message,
        userId: message.author.id,
        tier: tier.label
      }, 'Enforcement action failed');

      return { tier, actionTaken: 'failed', success: false, error: error.message };
    }
  }

  /**
   * Handle SAFE tier - Log to channel only
   */
  async handleSafe(message, scanResult, tier) {
    const embed = new EmbedBuilder()
      .setColor(tier.color)
      .setTitle(`${tier.emoji} Safe Link Scanned`)
      .setDescription('Link passed all security checks')
      .addFields(
        { 
          name: '👤 User', 
          value: `<@${message.author.id}>`, 
          inline: true 
        },
        { 
          name: '📍 Channel', 
          value: `<#${message.channel.id}>`, 
          inline: true 
        },
        { 
          name: '📊 Risk Score', 
          value: `${scanResult.heuristicScore}/100`, 
          inline: true 
        },
        { 
          name: '🌐 Domain', 
          value: `\`${scanResult.resolvedDomain}\``, 
          inline: false 
        }
      )
      .setFooter({ text: 'Nyx Security • No action required' })
      .setTimestamp();

    // Add scan details
    const details = [];
    if (scanResult.redirectHops > 0) {
      details.push(`🔄 Redirects: ${scanResult.redirectHops}`);
    }
    if (scanResult.domainAgeDays !== null) {
      details.push(`📅 Domain Age: ${scanResult.domainAgeDays} days`);
    }
    if (scanResult.safeBrowsingMatch === false) {
      details.push(`🛡️ Safe Browsing: Clear`);
    }

    if (details.length > 0) {
      embed.addFields({
        name: '🔍 Scan Details',
        value: details.join('\n'),
        inline: false
      });
    }

    await this.sendToLogChannel(message.guild, embed);
    return 'logged';
  }

  /**
   * Handle WARN tier
   */
  async handleWarn(message, scanResult, tier) {
    // Send warning in the channel
    const channelEmbed = new EmbedBuilder()
      .setColor(tier.color)
      .setTitle(`${tier.emoji} Suspicious Link Detected`)
      .setDescription('⚠️ This link shows suspicious patterns. Proceed with caution.')
      .addFields(
        { 
          name: '🌐 Domain', 
          value: `\`${scanResult.resolvedDomain}\``, 
          inline: true 
        },
        { 
          name: '📊 Risk Score', 
          value: `${scanResult.heuristicScore}/100`, 
          inline: true 
        }
      )
      .setFooter({ text: 'This warning will be automatically removed after 5 minutes' })
      .setTimestamp();

    // Add risk factors
    if (scanResult.signals.length > 0) {
      const signalsText = scanResult.signals
        .filter(s => !s.startsWith('HEURISTIC_'))
        .map(s => `⚠️ ${s.replace(/_/g, ' ')}`)
        .join('\n');
      
      if (signalsText) {
        channelEmbed.addFields({ 
          name: '🚨 Risk Factors', 
          value: signalsText, 
          inline: false 
        });
      }
    }

    try {
      const warnMessage = await message.channel.send({ embeds: [channelEmbed] });

      // Send detailed log to log channel
      const logEmbed = new EmbedBuilder()
        .setColor(tier.color)
        .setTitle(`${tier.emoji} Warning Issued`)
        .setDescription('Suspicious link detected and flagged')
        .addFields(
          { name: '👤 User', value: `<@${message.author.id}>`, inline: true },
          { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true },
          { name: '📊 Risk Score', value: `${scanResult.heuristicScore}/100`, inline: true },
          { name: '🌐 Domain', value: `\`${scanResult.resolvedDomain}\``, inline: false },
          { name: '🔗 Original URL', value: `||${scanResult.originalUrl}||`, inline: false }
        )
        .setFooter({ text: 'Nyx Security • Action: Warning posted' })
        .setTimestamp();

      // Add risk factors to log
      if (scanResult.signals.length > 0) {
        const signalsText = scanResult.signals.map(s => `• ${s.replace(/_/g, ' ')}`).join('\n');
        logEmbed.addFields({ 
          name: '🚨 Detected Risk Factors', 
          value: signalsText, 
          inline: false 
        });
      }

      // Add scan details
      const details = [];
      if (scanResult.redirectHops > 0) {
        details.push(`🔄 Redirect Hops: ${scanResult.redirectHops}`);
      }
      if (scanResult.domainAgeDays !== null) {
        details.push(`📅 Domain Age: ${scanResult.domainAgeDays} days`);
      }
      if (details.length > 0) {
        logEmbed.addFields({
          name: '🔍 Additional Details',
          value: details.join('\n'),
          inline: false
        });
      }

      await this.sendToLogChannel(message.guild, logEmbed);

      // Auto-delete warning after TTL
      if (config.enforcement.warnMessageTtlMs > 0) {
        setTimeout(async () => {
          try {
            await warnMessage.delete();
          } catch (error) {
            logger.debug({ messageId: warnMessage.id }, 'Could not delete warn message');
          }
        }, config.enforcement.warnMessageTtlMs);
      }

      return 'warned';
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to send warning');
      return 'warn_failed';
    }
  }

  /**
   * Handle QUARANTINE tier
   */
  async handleQuarantine(message, scanResult, tier) {
    // Delete original message
    let messageDeleted = false;
    try {
      await message.delete();
      messageDeleted = true;
    } catch (error) {
      logger.warn({ messageId: message.id }, 'Could not delete quarantined message');
    }

    // Send comprehensive log to log channel
    const logEmbed = new EmbedBuilder()
      .setColor(tier.color)
      .setTitle(`${tier.emoji} Link Quarantined`)
      .setDescription('⚠️ Potentially dangerous link detected and removed for review')
      .addFields(
        { 
          name: '👤 User', 
          value: `<@${message.author.id}>`, 
          inline: true 
        },
        { 
          name: '📍 Channel', 
          value: `<#${message.channel.id}>`, 
          inline: true 
        },
        { 
          name: '📊 Risk Score', 
          value: `${scanResult.heuristicScore}/100`, 
          inline: true 
        },
        { 
          name: '🌐 Original Domain', 
          value: `\`${scanResult.originalDomain}\``, 
          inline: true 
        },
        { 
          name: '🎯 Resolved Domain', 
          value: `\`${scanResult.resolvedDomain}\``, 
          inline: true 
        },
        {
          name: '✅ Message Deleted',
          value: messageDeleted ? 'Yes' : 'Failed',
          inline: true
        },
        { 
          name: '🔗 Original URL', 
          value: `||${scanResult.originalUrl}||`, 
          inline: false 
        }
      )
      .setFooter({ text: 'Nyx Security • Action: Quarantined for review' })
      .setTimestamp();

    // Add risk factors
    if (scanResult.signals.length > 0) {
      const signalsText = scanResult.signals
        .filter(s => !s.startsWith('HEURISTIC_'))
        .map(s => `🚨 ${s.replace(/_/g, ' ')}`)
        .join('\n');
      
      if (signalsText) {
        logEmbed.addFields({ 
          name: '⚠️ Risk Factors Detected', 
          value: signalsText, 
          inline: false 
        });
      }
    }

    // Add scan details
    const details = [];
    if (scanResult.redirectHops > 0) {
      details.push(`🔄 Redirects: ${scanResult.redirectHops} hops`);
    }
    if (scanResult.domainAgeDays !== null) {
      details.push(`📅 Domain Age: ${scanResult.domainAgeDays} days`);
    }
    if (scanResult.heuristicDetails) {
      const heurDetails = Object.entries(scanResult.heuristicDetails)
        .filter(([key, val]) => val !== undefined && key !== 'error')
        .map(([key, val]) => `• ${key}: ${JSON.stringify(val)}`)
        .join('\n');
      if (heurDetails) {
        details.push(`\n**Heuristic Details:**\n${heurDetails}`);
      }
    }

    if (details.length > 0) {
      logEmbed.addFields({
        name: '🔍 Scan Details',
        value: details.join('\n'),
        inline: false
      });
    }

    logEmbed.addFields({
      name: '📋 Next Steps',
      value: '• Use `/nyx review` to see quarantined links\n• Moderators can review and take action\n• Link has been removed from the channel',
      inline: false
    });

    try {
      await this.sendToLogChannel(message.guild, logEmbed);

      // Add to review queue
      await repository.addToReviewQueue({
        guildId: message.guild.id,
        channelId: message.channel.id,
        messageId: message.id,
        userId: message.author.id,
        originalUrl: scanResult.originalUrl,
        resolvedUrl: scanResult.resolvedUrl,
        originalDomain: scanResult.originalDomain,
        resolvedDomain: scanResult.resolvedDomain,
        signals: scanResult.signals,
        heuristicScore: scanResult.heuristicScore
      });

      return 'quarantined';
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to send quarantine notification');
      return 'quarantine_failed';
    }
  }

  /**
   * Handle DELETE tier
   */
  async handleDelete(message, scanResult, tier) {
    // Delete the message
    let messageDeleted = false;
    try {
      await message.delete();
      messageDeleted = true;
    } catch (error) {
      logger.warn({ messageId: message.id }, 'Could not delete malicious message');
    }

    // Send DM to user
    let dmSent = false;
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(tier.color)
        .setTitle(`${tier.emoji} Malicious Link Removed`)
        .setDescription(
          `🚨 A link you posted in **${message.guild.name}** was detected as malicious and has been automatically removed for your safety.`
        )
        .addFields(
          { 
            name: '🌐 Domain', 
            value: `\`${scanResult.resolvedDomain}\``, 
            inline: true 
          },
          { 
            name: '📊 Risk Score', 
            value: `${scanResult.heuristicScore}/100`, 
            inline: true 
          }
        )
        .addFields({
          name: '⚠️ What should you do?',
          value: '• ✅ Verify links before sharing\n• ❌ Avoid clicking suspicious links\n• 📞 Contact server moderators if you believe this was a mistake\n• 🛡️ Run a security scan on your device',
          inline: false
        })
        .setFooter({ text: 'Nyx Security • Automated Protection' })
        .setTimestamp();

      // Add threat information
      if (scanResult.threatTypes.length > 0) {
        dmEmbed.addFields({
          name: '🚨 Detected Threats',
          value: scanResult.threatTypes.map(t => `• ${t}`).join('\n'),
          inline: false
        });
      }

      await message.author.send({ embeds: [dmEmbed] });
      dmSent = true;
    } catch (error) {
      logger.debug({ userId: message.author.id }, 'Could not send DM to user');
    }

    // Send comprehensive log to log channel
    const logEmbed = new EmbedBuilder()
      .setColor(tier.color)
      .setTitle(`${tier.emoji} Malicious Link Removed`)
      .setDescription('🚨 **HIGH RISK** - Malicious link detected and immediately removed')
      .addFields(
        { 
          name: '👤 User', 
          value: `<@${message.author.id}>`, 
          inline: true 
        },
        { 
          name: '📍 Channel', 
          value: `<#${message.channel.id}>`, 
          inline: true 
        },
        { 
          name: '📊 Risk Score', 
          value: `**${scanResult.heuristicScore}/100**`, 
          inline: true 
        },
        { 
          name: '🌐 Original Domain', 
          value: `\`${scanResult.originalDomain}\``, 
          inline: true 
        },
        { 
          name: '🎯 Resolved Domain', 
          value: `\`${scanResult.resolvedDomain}\``, 
          inline: true 
        },
        {
          name: '⚡ Actions Taken',
          value: `${messageDeleted ? '✅' : '❌'} Message Deleted\n${dmSent ? '✅' : '❌'} User Notified`,
          inline: true
        },
        { 
          name: '🔗 Malicious URL', 
          value: `||${scanResult.originalUrl}||`, 
          inline: false 
        }
      )
      .setFooter({ text: 'Nyx Security • Action: Immediate Removal' })
      .setTimestamp();

    // Add threat types
    if (scanResult.threatTypes.length > 0) {
      logEmbed.addFields({
        name: '☠️ Threat Classification',
        value: scanResult.threatTypes.map(t => `🔴 ${t}`).join('\n'),
        inline: false
      });
    }

    // Add risk factors
    if (scanResult.signals.length > 0) {
      const signalsText = scanResult.signals.map(s => `🚨 ${s.replace(/_/g, ' ')}`).join('\n');
      logEmbed.addFields({ 
        name: '⚠️ Detection Signals', 
        value: signalsText, 
        inline: false 
      });
    }

    // Add scan details
    const details = [];
    if (scanResult.redirectHops > 0) {
      details.push(`🔄 Redirect Chain: ${scanResult.redirectHops} hops`);
    }
    if (scanResult.domainAgeDays !== null) {
      details.push(`📅 Domain Age: ${scanResult.domainAgeDays} days`);
    }
    if (scanResult.safeBrowsingMatch) {
      details.push(`🛡️ Google Safe Browsing: ⚠️ MATCHED`);
    }

    if (details.length > 0) {
      logEmbed.addFields({
        name: '🔍 Technical Details',
        value: details.join('\n'),
        inline: false
      });
    }

    await this.sendToLogChannel(message.guild, logEmbed);

    return messageDeleted ? 'deleted' : 'delete_failed';
  }

  /**
   * Log enforcement action to database
   */
  async logAction(message, scanResult, tier, actionTaken) {
    try {
      await repository.logLink({
        guildId: message.guild.id,
        channelId: message.channel.id,
        messageId: message.id,
        userId: message.author.id,
        originalUrl: scanResult.originalUrl,
        resolvedUrl: scanResult.resolvedUrl,
        originalDomain: scanResult.originalDomain,
        resolvedDomain: scanResult.resolvedDomain,
        tier: tier.label,
        signals: scanResult.signals,
        heuristicScore: scanResult.heuristicScore,
        safeBrowsingMatch: scanResult.safeBrowsingMatch,
        threatTypes: scanResult.threatTypes,
        domainAgeDays: scanResult.domainAgeDays,
        actionTaken
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to log enforcement action');
    }
  }
}

module.exports = new EnforcementService();
