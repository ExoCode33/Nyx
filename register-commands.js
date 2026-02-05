/**
 * Register Slash Commands with Discord
 * Run this script after deploying to register commands globally
 */

const { REST, Routes } = require('discord.js');
const config = require('./config');
const { logger } = require('./src/utils/logger');

const commands = [];
const fs = require('fs');
const path = require('path');

// Load all commands
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    commands.push(command.data.toJSON());
    logger.info({ command: command.data.name }, 'Loaded command for registration');
  }
}

const rest = new REST().setToken(config.discord.token);

async function registerCommands() {
  try {
    logger.info(`Registering ${commands.length} slash commands...`);

    const data = await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: commands },
    );

    logger.info(`Successfully registered ${data.length} commands globally`);
    
    data.forEach(cmd => {
      logger.info({ commandId: cmd.id, commandName: cmd.name }, 'Registered command');
    });

    process.exit(0);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to register commands');
    process.exit(1);
  }
}

registerCommands();
