/**
 * Nyx Watchdog Bot - Main Entry Point
 * Production-ready Discord link security bot
 */

const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const config = require('../config');
const db = require('./database/pool');
const { logger, logError } = require('./utils/logger');

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await shutdown();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await shutdown();
});

process.on('unhandledRejection', (error) => {
  logError(error, { type: 'unhandledRejection' });
});

process.on('uncaughtException', (error) => {
  logError(error, { type: 'uncaughtException' });
  process.exit(1);
});

async function shutdown() {
  try {
    if (client) {
      client.destroy();
    }
    await db.disconnect();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logError(error, { component: 'shutdown' });
    process.exit(1);
  }
}

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  presence: {
    status: 'online'
  }
});

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath)
    .filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    try {
      const command = require(path.join(commandsPath, file));
      if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
        logger.info({ command: command.data.name }, 'Loaded command');
      }
    } catch (error) {
      logError(error, { component: 'command_loader', file });
    }
  }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath)
  .filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  try {
    const event = require(path.join(eventsPath, file));
    
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
    
    logger.info({ 
      event: event.name, 
      once: event.once || false 
    }, 'Loaded event');
  } catch (error) {
    logError(error, { component: 'event_loader', file });
  }
}

// Command interaction handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    logError(error, { 
      component: 'command_execute',
      commandName: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guildId
    });

    const errorMessage = {
      content: '❌ An error occurred while executing this command.',
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

// Main initialization
async function main() {
  try {
    logger.info('Starting Nyx Watchdog Bot...');
    
    // Connect to database
    logger.info('Connecting to database...');
    await db.connect();
    
    // Login to Discord
    logger.info('Logging in to Discord...');
    await client.login(config.discord.token);
    
  } catch (error) {
    logError(error, { component: 'initialization' });
    process.exit(1);
  }
}

// Start the bot
main();

module.exports = { client };
