/**
 * Database Initialization Script
 * Run this to set up the database schema
 */

const fs = require('fs');
const path = require('path');
const db = require('./pool');
const { logger } = require('../utils/logger');

async function initialize() {
  try {
    logger.info('Starting database initialization...');

    // Connect to database
    await db.connect();

    // Read schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute schema
    logger.info('Executing schema...');
    await db.query(schema);

    logger.info('✅ Database initialized successfully');
    
    // Verify tables
    const result = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    logger.info('Created tables:');
    result.rows.forEach(row => {
      logger.info(`  - ${row.table_name}`);
    });

    await db.disconnect();
    process.exit(0);

  } catch (error) {
    logger.error({ error: error.message }, 'Database initialization failed');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  initialize();
}

module.exports = { initialize };
