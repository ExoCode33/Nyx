/**
 * src/admin/review.js
 * ─────────────────────────────────────────────
 * Review queue management.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const db = require('../db');

async function handleReview(interaction, rest) {
  const [subAction] = rest;

  if (subAction === 'show') {
    await showReviewQueue(interaction);
  } else if (subAction === 'accept') {
    await showAcceptDropdown(interaction);
  } else if (subAction === 'deny') {
    await showDenyDropdown(interaction);
  } else if (subAction === 'accept_confirm') {
    await acceptConfirm(interaction);
  } else if (subAction === 'deny_confirm') {
    await denyConfirm(interaction);
  }
}

async function showReviewQueue(interaction) {
  const pending = await db.getPendingReviews(interaction.guild.id);

  const embed = new EmbedBuilder()
    .setColor(0xF97316)
    .setTitle('🔍 Review Queue')
    .setDescription(pending.length === 0 ? 'No links pending review.' : `**${pending.length}** link${pending.length === 1 ? '' : 's'} awaiting review`);

  if (pending.length > 0) {
    let description = '';
    for (const item of pending.slice(0, 10)) {
      const userTag = `<@${item.user_id}>`;
      const signals = (item.signals || []).join(', ') || 'none';
      const timestamp = Math.floor(new Date(item.created_at).getTime() / 1000);
      description += `**ID: ${item.id}** • ${userTag}\n`;
      description += `URL: ||${item.original_url}||\n`;
      description += `Signals: ${signals} • Score: ${item.heuristic_score}\n`;
      description += `Posted: <t:${timestamp}:R>\n\n`;
    }
    embed.setDescription(description);

    if (pending.length > 10) {
      embed.setFooter({ text: `Showing 1-10 of ${pending.length}` });
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('nyx:review:accept')
      .setLabel('Accept Domains')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(pending.length === 0),
    new ButtonBuilder()
      .setCustomId('nyx:review:deny')
      .setLabel('Deny Domains')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(pending.length === 0),
    new ButtonBuilder()
      .setCustomId('nyx:main')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({ embeds: [embed], components: [row] });
}

async function showAcceptDropdown(interaction) {
  const pending = await db.getPendingReviews(interaction.guild.id);

  if (pending.length === 0) {
    return interaction.reply({ content: '⚠️ No links to accept.', ephemeral: true });
  }

  const options = pending.slice(0, 25).map(item => {
    const domain = item.original_url.replace(/^https?:\/\//, '').split('/')[0];
    return {
      label: `ID: ${item.id} - ${domain}`,
      value: String(item.id),
      description: `Score: ${item.heuristic_score}`,
    };
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId('nyx:review:accept_confirm')
    .setPlaceholder('Select links to approve')
    .setMinValues(1)
    .setMaxValues(Math.min(options.length, 25))
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  await interaction.reply({ content: '**Select links to approve:**', components: [row], ephemeral: true });
}

async function showDenyDropdown(interaction) {
  const pending = await db.getPendingReviews(interaction.guild.id);

  if (pending.length === 0) {
    return interaction.reply({ content: '⚠️ No links to deny.', ephemeral: true });
  }

  const options = pending.slice(0, 25).map(item => {
    const domain = item.original_url.replace(/^https?:\/\//, '').split('/')[0];
    return {
      label: `ID: ${item.id} - ${domain}`,
      value: String(item.id),
      description: `Score: ${item.heuristic_score}`,
    };
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId('nyx:review:deny_confirm')
    .setPlaceholder('Select links to deny')
    .setMinValues(1)
    .setMaxValues(Math.min(options.length, 25))
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  await interaction.reply({ content: '**Select links to deny:**', components: [row], ephemeral: true });
}

async function acceptConfirm(interaction) {
  const ids = interaction.values.map(Number);

  for (const id of ids) {
    await db.resolveReview(id, 'approved', interaction.user.id);

    const entry = await db.getReviewById(id);
    if (entry) {
      const channel = interaction.guild.channels.cache.get(entry.channel_id);
      if (channel) {
        await channel.send(
          `✅ **Link approved by ${interaction.user.displayName}:**\n${entry.original_url}`
        );
      }
    }
  }

  await interaction.update({
    content: `✅ Approved ${ids.length} link${ids.length === 1 ? '' : 's'}.`,
    components: [],
  });
}

async function denyConfirm(interaction) {
  const ids = interaction.values.map(Number);

  for (const id of ids) {
    await db.resolveReview(id, 'deleted', interaction.user.id);
  }

  await interaction.update({
    content: `🚫 Denied ${ids.length} link${ids.length === 1 ? '' : 's'}.`,
    components: [],
  });
}

module.exports = { handleReview };
