/**
 * Structured Logging System
 * Using Pino for high-performance JSON logging
 */

const pino = require('pino');
const config = require('../../config');

const logger = pino({
  level: config.logLevel,
  transport: config.isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname'
    }
  } : undefined
});

/**
 * Create a child logger with context
 */
function createLogger(context) {
  return logger.child(context);
}

/**
 * Log scan result
 */
function logScan(scanResult, tier, guildId, userId) {
  logger.info({
    event: 'link_scanned',
    guildId,
    userId,
    domain: scanResult.resolvedDomain,
    tier: tier.label,
    signals: scanResult.signals,
    score: scanResult.heuristicScore
  }, `Link scanned: ${scanResult.resolvedDomain} -> ${tier.label}`);
}

/**
 * Log enforcement action
 */
function logEnforcement(action, scanResult, tier, guildId, userId, messageId) {
  logger.info({
    event: 'enforcement_action',
    action,
    guildId,
    userId,
    messageId,
    domain: scanResult.resolvedDomain,
    tier: tier.label,
    signals: scanResult.signals
  }, `Enforcement: ${action} on ${scanResult.resolvedDomain}`);
}

/**
 * Log admin action
 */
function logAdminAction(action, adminId, guildId, details) {
  logger.info({
    event: 'admin_action',
    action,
    adminId,
    guildId,
    ...details
  }, `Admin action: ${action}`);
}

/**
 * Log error with context
 */
function logError(error, context) {
  logger.error({
    event: 'error',
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code
    },
    ...context
  }, error.message);
}

module.exports = {
  logger,
  createLogger,
  logScan,
  logEnforcement,
  logAdminAction,
  logError
};
