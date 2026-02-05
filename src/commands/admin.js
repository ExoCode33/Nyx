/**
 * Admin Command
 * Slash command for server administrators
 */

const { 
  SlashCommandBuilder, 
  EmbedBuilder,
  PermissionFlagsBits 
} = require('discord.js');
const repository = require('../database/repository');
const { logger } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nyx')
    .setDescription('Nyx Watchdog administration commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('View server link security statistics')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('allowlist')
        .setDescription('Manage allowlisted domains')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'Add', value: 'add' },
              { name: 'Remove', value: 'remove' },
              { name: 'List', value: 'list' }
            )
        )
        .addStringOption(option =>
          option
            .setName('domain')
            .setDescription('Domain name (e.g., example.com)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('reason')
            .setDescription('Reason for allowlisting')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('blocklist')
        .setDescription('Manage blocklisted domains')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'Add', value: 'add' },
              { name: 'Remove', value: 'remove' },
              { name: 'List', value: 'list' }
            )
        )
        .addStringOption(option =>
          option
            .setName('domain')
            .setDescription('Domain name (e.g., malicious-site.com)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('reason')
            .setDescription('Reason for blocklisting')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('review')
        .setDescription('View quarantined links pending review')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('user')
        .setDescription('View user link statistics')
        .addUserOption(option =>
          option
            .setName('target')
            .setDescription('User to view statistics for')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'stats':
          await this.handleStats(interaction);
          break;
        case 'allowlist':
          await this.handleAllowlist(interaction);
          break;
        case 'blocklist':
          await this.handleBlocklist(interaction);
          break;
        case 'review':
          await this.handleReview(interaction);
          break;
        case 'user':
          await this.handleUserStats(interaction);
          break;
      }
    } catch (error) {
      logger.error({
        error: error.message,
        subcommand,
        guildId: interaction.guildId
      }, 'Admin command error');

      await interaction.reply({
        content: '❌ An error occurred while processing your request.',
        ephemeral: true
      });
    }
  },

  async handleStats(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const logs = await repository.getLinkLogs(interaction.guildId, 1000);
    
    const stats = {
      total: logs.length,
      safe: logs.filter(l => l.tier === 'SAFE').length,
      warned: logs.filter(l => l.tier === 'WARN').length,
      quarantined: logs.filter(l => l.tier === 'QUARANTINE').length,
      deleted: logs.filter(l => l.tier === 'DELETE').length
    };

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📊 Server Link Security Statistics')
      .setDescription(`Statistics for **${interaction.guild.name}**`)
      .addFields(
        { 
          name: '🔗 Total Links Scanned', 
          value: stats.total.toString(), 
          inline: true 
        },
        { 
          name: '✅ Safe Links', 
          value: stats.safe.toString(), 
          inline: true 
        },
        { 
          name: '⚠️ Warnings', 
          value: stats.warned.toString(), 
          inline: true 
        },
        { 
          name: '🟠 Quarantined', 
          value: stats.quarantined.toString(), 
          inline: true 
        },
        { 
          name: '🔴 Deleted', 
          value: stats.deleted.toString(), 
          inline: true 
        },
        {
          name: '📈 Detection Rate',
          value: stats.total > 0 
            ? `${((stats.deleted + stats.quarantined) / stats.total * 100).toFixed(1)}%`
            : '0%',
          inline: true
        }
      )
      .setFooter({ text: 'Statistics based on last 1000 scanned links' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },

  async handleAllowlist(interaction) {
    const action = interaction.options.getString('action');
    const domain = interaction.options.getString('domain');
    const reason = interaction.options.getString('reason');

    if (action === 'list') {
      await interaction.deferReply({ ephemeral: true });
      const entries = await repository.getAllowlist(interaction.guildId, 20);

      if (entries.length === 0) {
        await interaction.editReply('No domains in allowlist.');
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x10B981)
        .setTitle('✅ Allowlisted Domains')
        .setDescription(entries.map(e => `• \`${e.domain}\`${e.reason ? ` - ${e.reason}` : ''}`).join('\n'))
        .setFooter({ text: `Showing ${entries.length} entries` });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (!domain) {
      await interaction.reply({
        content: '❌ Domain is required for this action.',
        ephemeral: true
      });
      return;
    }

    if (action === 'add') {
      await repository.addToAllowlist(
        interaction.guildId,
        domain,
        interaction.user.id,
        reason
      );

      await interaction.reply({
        content: `✅ Added \`${domain}\` to allowlist.`,
        ephemeral: true
      });
    } else if (action === 'remove') {
      await repository.removeFromAllowlist(interaction.guildId, domain);

      await interaction.reply({
        content: `✅ Removed \`${domain}\` from allowlist.`,
        ephemeral: true
      });
    }
  },

  async handleBlocklist(interaction) {
    const action = interaction.options.getString('action');
    const domain = interaction.options.getString('domain');
    const reason = interaction.options.getString('reason');

    if (action === 'list') {
      await interaction.deferReply({ ephemeral: true });
      const entries = await repository.getBlocklist(interaction.guildId, 20);

      if (entries.length === 0) {
        await interaction.editReply('No domains in blocklist.');
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xEF4444)
        .setTitle('🔴 Blocklisted Domains')
        .setDescription(entries.map(e => `• \`${e.domain}\`${e.reason ? ` - ${e.reason}` : ''}`).join('\n'))
        .setFooter({ text: `Showing ${entries.length} entries` });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (!domain) {
      await interaction.reply({
        content: '❌ Domain is required for this action.',
        ephemeral: true
      });
      return;
    }

    if (action === 'add') {
      await repository.addToBlocklist(
        interaction.guildId,
        domain,
        interaction.user.id,
        reason
      );

      await interaction.reply({
        content: `✅ Added \`${domain}\` to blocklist.`,
        ephemeral: true
      });
    } else if (action === 'remove') {
      await repository.removeFromBlocklist(interaction.guildId, domain);

      await interaction.reply({
        content: `✅ Removed \`${domain}\` from blocklist.`,
        ephemeral: true
      });
    }
  },

  async handleReview(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const pending = await repository.getPendingReviews(interaction.guildId, 10);

    if (pending.length === 0) {
      await interaction.editReply('✅ No links pending review.');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xF97316)
      .setTitle('🔶 Quarantined Links Pending Review')
      .setDescription(
        pending.map((item, i) => 
          `**${i + 1}.** \`${item.resolved_domain}\` - <@${item.user_id}>\n` +
          `Score: ${item.heuristic_score}/100 | ||${item.original_url}||`
        ).join('\n\n')
      )
      .setFooter({ text: 'Use the web dashboard for detailed review options' });

    await interaction.editReply({ embeds: [embed] });
  },

  async handleUserStats(interaction) {
    const user = interaction.options.getUser('target');
    await interaction.deferReply({ ephemeral: true });

    const stats = await repository.getUserStats(user.id, interaction.guildId);

    if (!stats) {
      await interaction.editReply(`No link data found for ${user.username}.`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📊 Link Statistics for ${user.username}`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: '🔗 Total Links', value: stats.total_links.toString(), inline: true },
        { name: '✅ Safe', value: stats.safe_links.toString(), inline: true },
        { name: '⚠️ Warned', value: stats.warned_links.toString(), inline: true },
        { name: '🟠 Quarantined', value: stats.quarantined_links.toString(), inline: true },
        { name: '🔴 Deleted', value: stats.deleted_links.toString(), inline: true },
        { name: '⭐ Reputation', value: stats.reputation_score.toString() + '/100', inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
