/**
 * src/logger/channel.js
 * ─────────────────────────────────────────────
 * Resolves the log channel for a guild.
 */

const db = require('../db');

const cache = new Map();

async function getLogChannel(guild) {
  if (cache.has(guild.id)) return cache.get(guild.id);

  const channel = await resolve(guild);
  cache.set(guild.id, channel);
  return channel;
}

function invalidateCache(guildId) {
  cache.delete(guildId);
}

async function resolve(guild) {
  const settings = await db.getGuild(guild.id);
  if (settings?.log_channel_id) {
    const ch = guild.channels.cache.get(settings.log_channel_id);
    if (ch && ch.isTextBased() && ch.permissionsFor(guild.members.me).has('SendMessages')) {
      return ch;
    }
  }

  const existing = guild.channels.cache.find(
    c => c.isTextBased() && c.name.toLowerCase() === 'nyx-logs'
  );
  if (existing) {
    await db.setLogChannel(guild.id, existing.id);
    return existing;
  }

  try {
    const overwrites = [
      { id: guild.roles.everyone, deny: ['ViewChannel'] },
      { id: guild.members.me, allow: ['ViewChannel', 'SendMessages', 'EmbedLinks'] },
    ];

    for (const role of guild.roles.cache.values()) {
      if (role.permissions.has('Administrator')) {
        overwrites.push({ id: role, allow: ['ViewChannel'] });
      }
    }

    const ch = await guild.channels.create({
      name: 'nyx-logs',
      type: 0,
      topic: '🌙 Nyx security logs',
      permissionOverwrites: overwrites,
      reason: 'Auto-created by Nyx',
    });

    await db.setLogChannel(guild.id, ch.id);
    return ch;
  } catch (e) {
    console.error(`❌  Could not create #nyx-logs in ${guild.name}:`, e.message);
    return null;
  }
}

module.exports = { getLogChannel, invalidateCache };
