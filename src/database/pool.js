/**
 * PostgreSQL Connection Pool
 * Handles database connections with retry logic and health checks
 */

const { Pool } = require('pg');
const config = require('../config');
const { logger, logError } = require('./logger');

class Database {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  /**
   * Initialize database connection pool
   */
  async connect() {
    try {
      this.pool = new Pool({
        connectionString: config.database.url,
        ...config.database.pool,
        ssl: config.isProduction ? { rejectUnauthorized: false } : false
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;
      logger.info('Database connected successfully');

      // Setup error handlers
      this.pool.on('error', (err) => {
        logError(err, { component: 'database_pool' });
      });

      return this.pool;
    } catch (error) {
      logError(error, { component: 'database_connect' });
      throw error;
    }
  }

  /**
   * Execute a query
   */
  async query(text, params = []) {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    try {
      const start = Date.now();
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      if (duration > 1000) {
        logger.warn({ query: text, duration }, 'Slow query detected');
      }

      return result;
    } catch (error) {
      logError(error, { component: 'database_query', query: text });
      throw error;
    }
  }

  /**
   * Execute query and return first row
   */
  async queryOne(text, params = []) {
    const result = await this.query(text, params);
    return result.rows[0] || null;
  }

  /**
   * Execute query and return all rows
   */
  async queryAll(text, params = []) {
    const result = await this.query(text, params);
    return result.rows;
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction(callback) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check database health
   */
  async healthCheck() {
    try {
      await this.query('SELECT 1');
      return { healthy: true, connected: this.isConnected };
    } catch (error) {
      return { healthy: false, connected: false, error: error.message };
    }
  }

  /**
   * Close all connections
   */
  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      logger.info('Database disconnected');
    }
  }
}

module.exports = new Database();
