/**
 * src/enforcement/actions.js
 * ─────────────────────────────────────────────
 * Three concrete enforcement actions.
 */

const { EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { TIERS } = require('../../config/tiers');

async function warn(message, verdict) {
  const embed = new EmbedBuilder()
    .setColor(TIERS.WARN.color)
    .setTitle(`${TIERS.WARN.emoji} Suspicious Link Detected`)
    .setDescription(TIERS.WARN.description)
    .addFields(
      { name: 'Domain', value: `\`${verdict.resolvedDomain}\``, inline: true },
      { name: 'Signals', value: verdict.signals.join(', ') || 'none', inline: true },
    )
    .setFooter({ text: 'This warning will be removed automatically.' })
    .setTimestamp();

  try {
    const warnMsg = await message.channel.send({ embeds: [embed] });

    if (config.warnTTLMs > 0) {
      setTimeout(async () => {
        try { await warnMsg.delete(); } catch { }
      }, config.warnTTLMs);
    }

    return 'warn_posted';
  } catch (e) {
    console.error('⚠️  warn action failed:', e.message);
    return 'warn_failed';
  }
}

async function quarantine(message, verdict) {
  try {
    await message.delete();
  } catch { }

  const spoilerLink = `||${verdict.originalUrl}||`;

  const embed = new EmbedBuilder()
    .setColor(TIERS.QUARANTINE.color)
    .setTitle(`${TIERS.QUARANTINE.emoji} Link Quarantined`)
    .setDescription(TIERS.QUARANTINE.description)
    .addFields(
      { name: 'Posted by', value: `<@${message.author.id}>`, inline: true },
      { name: 'Domain', value: `\`${verdict.resolvedDomain}\``, inline: true },
      { name: 'Signals', value: verdict.signals.join(', ') || 'none', inline: false },
      { name: 'Link', value: spoilerLink, inline: false },
    )
    .setFooter({ text: 'Moderators can review this via /nyx admin → Review Queue' })
    .setTimestamp();

  try {
    await message.channel.send({ embeds: [embed] });
    return 'quarantine_posted';
  } catch (e) {
    console.error('⚠️  quarantine action failed:', e.message);
    return 'quarantine_failed';
  }
}

async function deleteMsgAndNotify(message, verdict) {
  let deleted = false;
  try {
    await message.delete();
    deleted = true;
  } catch (e) {
    console.error('⚠️  delete action failed:', e.message);
  }

  try {
    const embed = new EmbedBuilder()
      .setColor(TIERS.DELETE.color)
      .setTitle('🚫 Your message was removed')
      .setDescription(
        `A link in your message in **${message.guild.name}** was detected as malicious and has been removed.`
      )
      .addFields(
        { name: 'Domain', value: `\`${verdict.resolvedDomain}\``, inline: true },
        { name: 'Signals', value: verdict.signals.join(', '), inline: true },
      )
      .addFields({
        name: 'What now?',
        value: '• Double-check links before sharing.\n• If you think this is a mistake, contact a server mod.',
      })
      .setTimestamp();

    await message.author.send({ embeds: [embed] });
  } catch { }

  return deleted ? 'message_deleted' : 'delete_failed';
}

module.exports = { warn, quarantine, deleteMsgAndNotify };
