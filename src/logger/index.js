/**
 * src/logger/index.js
 * ─────────────────────────────────────────────
 * Builds rich embeds and posts to log channel.
 */

const { EmbedBuilder } = require('discord.js');
const { TIERS } = require('../../config/tiers');
const db = require('../db');
const { getLogChannel } = require('./channel');

async function logVerdict(message, verdict, tier, actionTaken) {
  const logCh = await getLogChannel(message.guild);
  if (!logCh) return;

  const stats = await db.getUserStats(message.author.id, message.guild.id);

  const color = tier ? tier.color : 0x10B981;
  const emoji = tier ? tier.emoji : '🟢';
  const label = tier ? tier.label : 'SAFE';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} ${label} • \`${verdict.resolvedDomain}\``)
    .setTimestamp();

  if (tier) {
    embed.setDescription(tier.description);
  } else {
    embed.setDescription('✅ Link passed all checks.');
  }

  const accountAge = Math.floor((Date.now() - message.author.createdTimestamp) / (1000 * 60 * 60 * 24));
  embed.addFields({
    name: 'User',
    value: [
      `**Name**  ${message.author.displayName}`,
      `**ID**    \`${message.author.id}\``,
      `**Account age**  ${accountAge} days`,
    ].join('\n'),
    inline: true,
  });

  const total = stats.total_links || 0;
  const safeCount = stats.safe_links || 0;
  const badCount = (stats.warned_links || 0) + (stats.quarantined_links || 0) + (stats.deleted_links || 0);
  const rate = total > 0 ? ((safeCount / total) * 100).toFixed(0) : '—';

  embed.addFields({
    name: 'Stats',
    value: [
      `**Total links**  ${total}`,
      `**Clean**        ${safeCount}`,
      `**Flagged**      ${badCount}`,
      `**Safety rate**  ${rate}%`,
    ].join('\n'),
    inline: true,
  });

  if (verdict.signals.length > 0) {
    embed.addFields({
      name: 'Signals',
      value: verdict.signals.map(s => `\`${s}\``).join('  '),
      inline: false,
    });
  }

  const linkDisplay = tier ? `||${verdict.originalUrl}||` : verdict.originalUrl;
  embed.addFields({ name: 'Link', value: linkDisplay, inline: false });

  if (verdict.resolvedUrl && verdict.resolvedUrl !== verdict.originalUrl) {
    const resolvedDisplay = tier ? `||${verdict.resolvedUrl}||` : verdict.resolvedUrl;
    embed.addFields({ name: 'Resolves to', value: resolvedDisplay, inline: false });
  }

  if (verdict.domainAgeDays !== null) {
    embed.addFields({
      name: 'Domain age',
      value: `${verdict.domainAgeDays} day${verdict.domainAgeDays === 1 ? '' : 's'}`,
      inline: true,
    });
  }

  if (actionTaken) {
    embed.addFields({ name: 'Action', value: `\`${actionTaken}\``, inline: true });
  }

  embed.addFields({
    name: 'Location',
    value: `${message.channel.toString()}  •  [Jump](${message.url})`,
    inline: false,
  });

  embed.setFooter({
    text: `${message.guild.name}  •  Nyx v1.0`,
    iconURL: message.author.displayAvatarURL(),
  });

  let content = '';
  if (tier && tier.label === 'DELETE') {
    const pings = message.guild.roles.cache
      .filter(r => r.permissions.has('Administrator') && r.mentionable)
      .map(r => r.toString())
      .join(' ');
    if (pings) content = `🚨 **Security alert**  ${pings}\n`;
  }

  await logCh.send({ content, embeds: [embed] });
}

module.exports = { logVerdict };
