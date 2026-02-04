/**
 * src/admin/reputation.js
 * ─────────────────────────────────────────────
 * User reputation screen.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder } = require('discord.js');
const db = require('../db');

async function handleReputation(interaction, rest) {
  const [subAction] = rest;

  if (subAction === 'show') {
    await showReputationSelect(interaction);
  } else if (subAction === 'view') {
    await viewUserStats(interaction);
  }
}

async function showReputationSelect(interaction) {
  const select = new UserSelectMenuBuilder()
    .setCustomId('nyx:reputation:view')
    .setPlaceholder('Select a user to view stats');

  const row1 = new ActionRowBuilder().addComponents(select);

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('nyx:main')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({
    content: '📊 **User Reputation** — Select a user to view their link statistics:',
    components: [row1, row2],
    embeds: [],
  });
}

async function viewUserStats(interaction) {
  const userId = interaction.values[0];
  const user = await interaction.guild.members.fetch(userId);

  const stats = await db.getUserStats(userId, interaction.guild.id);

  const total = stats.total_links;
  const safe = stats.safe_links || 0;
  const bad = (stats.warned_links || 0) + (stats.quarantined_links || 0) + (stats.deleted_links || 0);
  const rate = total > 0 ? ((safe / total) * 100).toFixed(0) : '100';

  let color = 0x10B981;
  if (rate < 95) color = 0x84CC16;
  if (rate < 80) color = 0xF59E0B;
  if (rate < 60) color = 0xEF4444;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📊 Stats for ${user.displayName}`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: 'Total links', value: String(total), inline: true },
      { name: 'Safe', value: String(safe), inline: true },
      { name: 'Flagged', value: String(bad), inline: true },
      { name: 'Warned', value: String(stats.warned_links || 0), inline: true },
      { name: 'Quarantined', value: String(stats.quarantined_links || 0), inline: true },
      { name: 'Deleted', value: String(stats.deleted_links || 0), inline: true },
      { name: 'Safety rate', value: `${rate}%`, inline: false },
    )
    .setFooter({ text: `ID: ${userId}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('nyx:reputation:show')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({ embeds: [embed], components: [row], content: null });
}

module.exports = { handleReputation };
