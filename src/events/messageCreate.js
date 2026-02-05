/**
 * Message Create Event Handler - ABSOLUTE MINIMAL TEST
 */

module.exports = {
  name: 'messageCreate',
  
  async execute(message) {
    // Log to Railway
    console.log('🔔🔔🔔 EVENT FIRED! Message:', message.content);
    
    // Don't ignore anything for testing
    try {
      await message.react('✅');
      console.log('✅ Reacted successfully');
    } catch (error) {
      console.error('❌ React failed:', error.message);
    }
  }
};
