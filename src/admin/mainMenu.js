/**
 * src/admin/mainMenu.js
 * ─────────────────────────────────────────────
 * Main menu of the admin panel.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function showMainMenu(interaction, isUpdate = false) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🌙 Nyx Admin Panel')
    .setDescription('Manage link security settings for this server.')
    .addFields(
      { name: '🛡️ Allowlist', value: 'Manage trusted domains', inline: true },
      { name: '🚫 Blocklist', value: 'Manage blocked domains', inline: true },
      { name: '🔍 Review Queue', value: 'Review quarantined links', inline: true },
      { name: '📊 User Reputation', value: 'Check user link stats', inline: true },
      { name: '⚙️ Settings', value: 'Configure log channel & admin roles', inline: true },
    )
    .setFooter({ text: 'Select an option below' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('nyx:allowlist:show')
      .setLabel('Allowlist')
      .setEmoji('🛡️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('nyx:blocklist:show')
      .setLabel('Blocklist')
      .setEmoji('🚫')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('nyx:review:show')
      .setLabel('Review Queue')
      .setEmoji('🔍')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('nyx:reputation:show')
      .setLabel('User Reputation')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('nyx:settings:show')
      .setLabel('Settings')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Secondary),
  );

  if (isUpdate) {
    await interaction.update({ embeds: [embed], components: [row] });
  } else {
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }
}

module.exports = { showMainMenu };
