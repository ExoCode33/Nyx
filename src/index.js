/**
 * Nyx Watchdog Bot - Main Entry Point
 * Production-ready Discord link security bot
 */

const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, REST, Routes } = require('discord.js');
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

/**
 * Initialize database schema if needed
 */
async function initDatabaseIfNeeded() {
  try {
    // Check if tables exist
    const result = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'guilds'
      );
    `);

    if (result.rows[0].exists) {
      logger.info('Database tables already exist');
      return;
    }

    // Tables don't exist, initialize schema
    logger.info('Initializing database schema...');
    const schemaPath = path.join(__dirname, 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await db.query(schema);
    
    logger.info('✅ Database schema initialized successfully');

    // Verify tables
    const tables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    logger.info('Created tables:');
    tables.rows.forEach(row => {
      logger.info(`  - ${row.table_name}`);
    });

  } catch (error) {
    logError(error, { component: 'database_init' });
    throw error;
  }
}

/**
 * Register slash commands with Discord
 */
async function registerCommands() {
  try {
    logger.info('Registering slash commands with Discord...');

    const commands = [];
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
      const command = require(path.join(commandsPath, file));
      if (command.data) {
        commands.push(command.data.toJSON());
      }
    }

    const rest = new REST().setToken(config.discord.token);

    const data = await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: commands },
    );

    logger.info(`✅ Successfully registered ${data.length} slash commands`);
    
    data.forEach(cmd => {
      logger.info(`  - /${cmd.name}`);
    });

  } catch (error) {
    logError(error, { component: 'command_registration' });
    // Don't throw - bot can still work without slash commands registered
    logger.warn('Failed to register commands, but bot will continue');
  }
}

// Create Discord client
console.log('🤖 Creating Discord client...');
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

console.log('✅ Client created with intents:', [
  'Guilds',
  'GuildMessages', 
  'MessageContent'
]);

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
        console.log(`✅ Loaded command: ${command.data.name}`);
      }
    } catch (error) {
      console.error(`❌ Failed to load command ${file}:`, error.message);
      logError(error, { component: 'command_loader', file });
    }
  }
}

// Load events
console.log('\n📂 Loading events...');
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath)
  .filter(file => file.endsWith('.js'));

console.log(`Found ${eventFiles.length} event files:`, eventFiles);

for (const file of eventFiles) {
  try {
    console.log(`\n🔄 Loading event file: ${file}`);
    const event = require(path.join(eventsPath, file));
    
    console.log(`   - Event name: ${event.name}`);
    console.log(`   - Once: ${event.once || false}`);
    console.log(`   - Has execute: ${typeof event.execute === 'function'}`);
    
    if (event.once) {
      client.once(event.name, (...args) => {
        console.log(`🔔 Event triggered (ONCE): ${event.name}`);
        event.execute(...args);
      });
    } else {
      client.on(event.name, (...args) => {
        console.log(`🔔 Event triggered: ${event.name}`);
        event.execute(...args);
      });
    }
    
    console.log(`✅ Event registered: ${event.name}`);
    logger.info({ event: event.name, once: event.once || false }, 'Loaded event');
  } catch (error) {
    console.error(`❌ Failed to load event ${file}:`, error.message);
    logError(error, { component: 'event_loader', file });
  }
}

console.log('\n✅ All events loaded\n');

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
    console.log('\n🚀 Starting Nyx Watchdog Bot...\n');
    
    // Connect to database
    logger.info('Connecting to database...');
    await db.connect();
    
    // Initialize database schema if needed
    await initDatabaseIfNeeded();
    
    // Register slash commands with Discord
    await registerCommands();
    
    // Login to Discord
    logger.info('Logging in to Discord...');
    console.log('\n🔐 Logging in to Discord...\n');
    await client.login(config.discord.token);
    
    console.log('\n✅ Login successful!\n');
    
  } catch (error) {
    console.error('\n❌ Fatal error during initialization:', error);
    logError(error, { component: 'initialization' });
    process.exit(1);
  }
}

// Start the bot
main();

module.exports = { client };
