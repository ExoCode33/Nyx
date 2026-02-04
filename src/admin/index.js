/**
 * src/admin/index.js
 * ─────────────────────────────────────────────
 * Admin panel command + interaction router.
 */

const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');
const { showMainMenu } = require('./mainMenu');
const { handleAllowlist } = require('./allowlist');
const { handleBlocklist } = require('./blocklist');
const { handleReview } = require('./review');
const { handleReputation } = require('./reputation');
const { handleSettings } = require('./settings');

async function isAdmin(interaction) {
  if (interaction.memberPermissions.has('Administrator')) return true;

  const adminRoles = await db.getAdminRoles(interaction.guild.id);
  if (adminRoles.length === 0) return false;

  return interaction.member.roles.cache.some(r => adminRoles.includes(r.id));
}

const data = new SlashCommandBuilder()
  .setName('nyx')
  .setDescription('Open Nyx admin panel')
  .addSubcommand(sub =>
    sub.setName('admin').setDescription('Manage link security settings')
  );

async function execute(interaction) {
  if (!await isAdmin(interaction)) {
    return interaction.reply({
      content: '❌ You need Administrator permissions or an admin role to use this command.',
      ephemeral: true,
    });
  }

  await showMainMenu(interaction);
}

async function handleInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isStringSelectMenu() &&
      !interaction.isChannelSelectMenu() && !interaction.isRoleSelectMenu() &&
      !interaction.isUserSelectMenu() && !interaction.isModalSubmit()) {
    return;
  }

  if (!await isAdmin(interaction)) {
    return interaction.reply({
      content: '❌ You need admin permissions.',
      ephemeral: true,
    });
  }

  const [action, section, ...rest] = interaction.customId.split(':');

  if (action !== 'nyx') return;

  if (section === 'main') {
    await showMainMenu(interaction, true);
  } else if (section === 'allowlist') {
    await handleAllowlist(interaction, rest);
  } else if (section === 'blocklist') {
    await handleBlocklist(interaction, rest);
  } else if (section === 'review') {
    await handleReview(interaction, rest);
  } else if (section === 'reputation') {
    await handleReputation(interaction, rest);
  } else if (section === 'settings') {
    await handleSettings(interaction, rest);
  }
}

module.exports = { data, execute, handleInteraction };
