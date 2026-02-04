/**
 * src/admin/blocklist.js
 * ─────────────────────────────────────────────
 * Blocklist management screen.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../db');

async function handleBlocklist(interaction, rest) {
  const [subAction] = rest;

  if (subAction === 'show') {
    await showBlocklist(interaction);
  } else if (subAction === 'add') {
    await showAddModal(interaction);
  } else if (subAction === 'remove') {
    await showRemoveDropdown(interaction);
  } else if (subAction === 'remove_confirm') {
    await removeConfirm(interaction);
  } else if (subAction === 'add_submit') {
    await addSubmit(interaction);
  }
}

async function showBlocklist(interaction) {
  const list = await db.getBlocklist(interaction.guild.id);

  const embed = new EmbedBuilder()
    .setColor(0xEF4444)
    .setTitle('🚫 Blocklist')
    .setDescription(list.length === 0 ? 'No domains in the blocklist.' : `**${list.length}** blocked domain${list.length === 1 ? '' : 's'}`);

  if (list.length > 0) {
    const page = list.slice(0, 10);
    for (const row of page) {
      embed.addFields({
        name: `🔴 ${row.domain}`,
        value: row.reason || '*no reason*',
        inline: false,
      });
    }
    if (list.length > 10) {
      embed.setFooter({ text: `Showing 1-10 of ${list.length}` });
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('nyx:blocklist:add')
      .setLabel('Add Domain')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('nyx:blocklist:remove')
      .setLabel('Remove Domain')
      .setEmoji('➖')
      .setStyle(ButtonStyle.Success)
      .setDisabled(list.length === 0),
    new ButtonBuilder()
      .setCustomId('nyx:main')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({ embeds: [embed], components: [row] });
}

async function showAddModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('nyx:blocklist:add_submit')
    .setTitle('Add Domain to Blocklist');

  const domainInput = new TextInputBuilder()
    .setCustomId('domain')
    .setLabel('Domain or URL')
    .setPlaceholder('malicious-site.com')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason (optional)')
    .setPlaceholder('Why is this domain blocked?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(domainInput),
    new ActionRowBuilder().addComponents(reasonInput),
  );

  await interaction.showModal(modal);
}

async function addSubmit(interaction) {
  const domainRaw = interaction.fields.getTextInputValue('domain');
  const reason = interaction.fields.getTextInputValue('reason') || null;

  const domain = cleanDomain(domainRaw);

  const result = await db.addBlocklist(domain, interaction.guild.id, interaction.user.id, reason);

  if (result.ok) {
    await interaction.reply({ content: `🚫 \`${domain}\` added to blocklist.`, ephemeral: true });
  } else {
    await interaction.reply({ content: `⚠️ \`${domain}\` is already in the blocklist.`, ephemeral: true });
  }
}

async function showRemoveDropdown(interaction) {
  const list = await db.getBlocklist(interaction.guild.id);

  if (list.length === 0) {
    return interaction.reply({ content: '⚠️ No domains to remove.', ephemeral: true });
  }

  const options = list.slice(0, 25).map(row => ({
    label: row.domain,
    value: row.domain,
    description: row.reason ? row.reason.slice(0, 100) : 'No reason',
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId('nyx:blocklist:remove_confirm')
    .setPlaceholder('Select a domain to remove')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  await interaction.reply({ content: '**Select a domain to remove:**', components: [row], ephemeral: true });
}

async function removeConfirm(interaction) {
  const domain = interaction.values[0];
  const removed = await db.removeBlocklist(domain, interaction.guild.id);

  if (removed) {
    await interaction.update({ content: `✅ \`${domain}\` removed from blocklist.`, components: [] });
  } else {
    await interaction.update({ content: `⚠️ \`${domain}\` not found.`, components: [] });
  }
}

function cleanDomain(input) {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  return d;
}

module.exports = { handleBlocklist };
