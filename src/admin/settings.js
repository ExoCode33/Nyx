/**
 * src/admin/settings.js
 * ─────────────────────────────────────────────
 * Settings panel — log channel & admin roles.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType } = require('discord.js');
const db = require('../db');
const { invalidateCache } = require('../logger/channel');

async function handleSettings(interaction, rest) {
  const [subAction] = rest;

  if (subAction === 'show') {
    await showSettings(interaction);
  } else if (subAction === 'set_log_channel') {
    await setLogChannelSelect(interaction);
  } else if (subAction === 'set_admin_roles') {
    await setAdminRolesSelect(interaction);
  } else if (subAction === 'log_channel_confirm') {
    await logChannelConfirm(interaction);
  } else if (subAction === 'admin_roles_confirm') {
    await adminRolesConfirm(interaction);
  }
}

async function showSettings(interaction) {
  const guild = await db.getGuild(interaction.guild.id);

  let logChannelText = 'Not set (auto-creates #nyx-logs)';
  if (guild?.log_channel_id) {
    const ch = interaction.guild.channels.cache.get(guild.log_channel_id);
    logChannelText = ch ? ch.toString() : 'Channel not found';
  }

  const adminRoles = await db.getAdminRoles(interaction.guild.id);
  let adminRolesText = 'Not set (Administrator permission only)';
  if (adminRoles.length > 0) {
    const roleNames = adminRoles
      .map(id => interaction.guild.roles.cache.get(id)?.name)
      .filter(Boolean)
      .join(', ');
    adminRolesText = roleNames || 'No valid roles';
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('⚙️ Settings')
    .addFields(
      { name: 'Log Channel', value: logChannelText, inline: false },
      { name: 'Admin Roles', value: adminRolesText, inline: false },
    )
    .setFooter({ text: 'Click a button below to change settings' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('nyx:settings:set_log_channel')
      .setLabel('Set Log Channel')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('nyx:settings:set_admin_roles')
      .setLabel('Set Admin Roles')
      .setEmoji('👥')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('nyx:main')
      .setLabel('← Back')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({ embeds: [embed], components: [row] });
}

async function setLogChannelSelect(interaction) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId('nyx:settings:log_channel_confirm')
    .setPlaceholder('Select a channel for logs')
    .setChannelTypes(ChannelType.GuildText);

  const row = new ActionRowBuilder().addComponents(select);

  await interaction.reply({ content: '**Select a channel for security logs:**', components: [row], ephemeral: true });
}

async function logChannelConfirm(interaction) {
  const channelId = interaction.values[0];
  await db.setLogChannel(interaction.guild.id, channelId);
  invalidateCache(interaction.guild.id);

  const channel = interaction.guild.channels.cache.get(channelId);

  await interaction.update({
    content: `✅ Log channel set to ${channel.toString()}`,
    components: [],
  });
}

async function setAdminRolesSelect(interaction) {
  const select = new RoleSelectMenuBuilder()
    .setCustomId('nyx:settings:admin_roles_confirm')
    .setPlaceholder('Select admin roles')
    .setMinValues(0)
    .setMaxValues(25);

  const row = new ActionRowBuilder().addComponents(select);

  await interaction.reply({
    content: '**Select which roles can access the admin panel:**\n(Leave empty to require Administrator permission only)',
    components: [row],
    ephemeral: true,
  });
}

async function adminRolesConfirm(interaction) {
  const roleIds = interaction.values;
  await db.setAdminRoles(interaction.guild.id, roleIds);

  if (roleIds.length === 0) {
    await interaction.update({
      content: `✅ Admin roles cleared. Only users with Administrator permission can use /nyx admin.`,
      components: [],
    });
  } else {
    const roleNames = roleIds.map(id => interaction.guild.roles.cache.get(id)?.name).filter(Boolean).join(', ');
    await interaction.update({
      content: `✅ Admin roles set to: ${roleNames}`,
      components: [],
    });
  }
}

module.exports = { handleSettings };
