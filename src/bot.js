/**
 * src/bot.js
 * ─────────────────────────────────────────────
 * Main entry-point for Nyx bot.
 */

const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const config = require('../config');
const db = require('./db');
const { scanUrl } = require('./scanner');
const { enforce } = require('./enforcement');
const { logVerdict } = require('./logger');
const { TIERS } = require('../config/tiers');
const adminPanel = require('./admin');

const URL_RE = /https?:\/\/[^\s]+/g;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ═══════════════════════════════════════════════════════════
// READY
// ═══════════════════════════════════════════════════════════
client.once('ready', async () => {
  console.log(`✅  Logged in as ${client.user.tag}`);

  // Register slash command
  const rest = new REST().setToken(config.discordToken);

  try {
    const deployed = await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: [adminPanel.data.toJSON()] }
    );
    console.log(`⚡  Registered ${deployed.length} slash command(s) globally.`);
  } catch (e) {
    console.error('❌  Failed to register slash commands:', e.message);
  }
});

// ═══════════════════════════════════════════════════════════
// GUILD CREATE
// ═══════════════════════════════════════════════════════════
client.on('guildCreate', async (guild) => {
  await db.upsertGuild(guild.id, guild.name);
  console.log(`🏠  Joined guild: ${guild.name} (${guild.id})`);
});

// ═══════════════════════════════════════════════════════════
// MESSAGE CREATE — main watchdog loop
// ═══════════════════════════════════════════════════════════
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;

  const urls = message.content.match(URL_RE);
  if (!urls || urls.length === 0) return;

  const unique = [...new Set(urls)];

  for (const url of unique) {
    try {
      const verdict = await scanUrl(url, message.guild.id);

      await enforce(message, verdict);

      const chosenTier = pickTier(verdict);

      await logVerdict(message, verdict, chosenTier, null);
    } catch (e) {
      console.error(`❌  Error processing URL ${url}:`, e);
    }
  }
});

function pickTier(verdict) {
  const order = [TIERS.DELETE, TIERS.QUARANTINE, TIERS.WARN];
  for (const tier of order) {
    if (tier.triggers.some(t => verdict.signals.includes(t))) return tier;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// INTERACTION CREATE — slash commands + admin panel
// ═══════════════════════════════════════════════════════════
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'nyx') {
      await adminPanel.execute(interaction);
    }
  } else {
    await adminPanel.handleInteraction(interaction);
  }
});

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════
client.login(config.discordToken).catch((e) => {
  console.error('❌  Login failed:', e.message);
  process.exit(1);
});
