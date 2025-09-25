// v1.0.0: Safe JSON parsing utilities for Creative stage
const fs = require('fs');
const path = require('path');

/**
 * Safely parse JSON with fallback values
 * @param {string} str - JSON string to parse
 * @param {object} fallback - Fallback object if parsing fails
 * @returns {object} Parsed JSON or fallback with error info
 */
function safeJsonParse(str, fallback = {}) {
  try {
    return JSON.parse(str);
  } catch (err) {
    return { ...fallback, __error: err.message };
  }
}

/**
 * Write raw output to log file for debugging
 * @param {string} logDir - Directory to write log file
 * @param {string} filename - Name of the log file
 * @param {string} content - Content to write
 */
function writeRawLog(logDir, filename, content) {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const filePath = path.join(logDir, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  } catch (err) {
    console.warn('[JSON-UTILS] Failed to write raw log:', err.message);
    return null;
  }
}

module.exports = {
  safeJsonParse,
  writeRawLog
};
