/**
 * Enforcement Service
 * Executes enforcement actions based on tier level
 */

const { EmbedBuilder } = require('discord.js');
const { TIERS, determineEnforcementTier } = require('../../config/tiers');
const repository = require('../database/repository');
const { logger, logEnforcement } = require('../utils/logger');
const config = require('../../config');

class EnforcementService {
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
          actionTaken = 'allowed';
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
   * Handle WARN tier
   */
  async handleWarn(message, scanResult, tier) {
    const embed = new EmbedBuilder()
      .setColor(tier.color)
      .setTitle(`${tier.emoji} Suspicious Link Detected`)
      .setDescription(tier.description)
      .addFields(
        { 
          name: 'Domain', 
          value: `\`${scanResult.resolvedDomain}\``, 
          inline: true 
        },
        { 
          name: 'Risk Score', 
          value: `${scanResult.heuristicScore}/100`, 
          inline: true 
        }
      )
      .setFooter({ text: 'This warning will be automatically removed' })
      .setTimestamp();

    // Add signals if present
    if (scanResult.signals.length > 0) {
      const signalsText = scanResult.signals
        .filter(s => !s.startsWith('HEURISTIC_'))
        .map(s => `• ${s.replace(/_/g, ' ')}`)
        .join('\n');
      
      if (signalsText) {
        embed.addFields({ 
          name: 'Risk Factors', 
          value: signalsText || 'None', 
          inline: false 
        });
      }
    }

    try {
      const warnMessage = await message.channel.send({ embeds: [embed] });

      // Auto-delete warning after TTL
      if (config.enforcement.warnMessageTtlMs > 0) {
        setTimeout(async () => {
          try {
            await warnMessage.delete();
          } catch (error) {
            // Message might already be deleted
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
    try {
      await message.delete();
    } catch (error) {
      logger.warn({ messageId: message.id }, 'Could not delete quarantined message');
    }

    // Create quarantine notification with spoiler-tagged link
    const embed = new EmbedBuilder()
      .setColor(tier.color)
      .setTitle(`${tier.emoji} Link Quarantined`)
      .setDescription(tier.description)
      .addFields(
        { 
          name: 'Posted by', 
          value: `<@${message.author.id}>`, 
          inline: true 
        },
        { 
          name: 'Channel', 
          value: `<#${message.channel.id}>`, 
          inline: true 
        },
        { 
          name: 'Risk Score', 
          value: `${scanResult.heuristicScore}/100`, 
          inline: true 
        },
        { 
          name: 'Domain', 
          value: `\`${scanResult.resolvedDomain}\``, 
          inline: false 
        },
        { 
          name: 'Link (Click to reveal)', 
          value: `||${scanResult.originalUrl}||`, 
          inline: false 
        }
      )
      .setFooter({ text: 'Moderators can review this in the admin panel' })
      .setTimestamp();

    // Add risk factors
    if (scanResult.signals.length > 0) {
      const signalsText = scanResult.signals
        .filter(s => !s.startsWith('HEURISTIC_'))
        .map(s => `• ${s.replace(/_/g, ' ')}`)
        .join('\n');
      
      if (signalsText) {
        embed.addFields({ 
          name: 'Risk Factors', 
          value: signalsText, 
          inline: false 
        });
      }
    }

    try {
      await message.channel.send({ embeds: [embed] });

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
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(tier.color)
        .setTitle(`${tier.emoji} Malicious Link Removed`)
        .setDescription(
          `A link you posted in **${message.guild.name}** was detected as malicious and has been removed.`
        )
        .addFields(
          { 
            name: 'Domain', 
            value: `\`${scanResult.resolvedDomain}\``, 
            inline: true 
          },
          { 
            name: 'Risk Score', 
            value: `${scanResult.heuristicScore}/100`, 
            inline: true 
          }
        )
        .addFields({
          name: 'What should I do?',
          value: '• Verify links before sharing\n• Avoid clicking suspicious links\n• Contact server moderators if you believe this was a mistake'
        })
        .setFooter({ text: 'This action was taken automatically by Nyx Security' })
        .setTimestamp();

      // Add threat information
      if (scanResult.threatTypes.length > 0) {
        dmEmbed.addFields({
          name: 'Detected Threats',
          value: scanResult.threatTypes.map(t => `• ${t}`).join('\n'),
          inline: false
        });
      }

      await message.author.send({ embeds: [dmEmbed] });
    } catch (error) {
      // User might have DMs disabled
      logger.debug({ userId: message.author.id }, 'Could not send DM to user');
    }

    // Send notification in channel
    try {
      const channelEmbed = new EmbedBuilder()
        .setColor(tier.color)
        .setTitle(`${tier.emoji} Malicious Link Removed`)
        .setDescription(`A message from <@${message.author.id}> contained a malicious link and was removed.`)
        .addFields(
          { 
            name: 'Domain', 
            value: `\`${scanResult.resolvedDomain}\``, 
            inline: true 
          },
          { 
            name: 'Reason', 
            value: scanResult.signals[0]?.replace(/_/g, ' ') || 'Security threat', 
            inline: true 
          }
        )
        .setFooter({ text: 'Nyx Security' })
        .setTimestamp();

      await message.channel.send({ embeds: [channelEmbed] });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to send deletion notification');
    }

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
