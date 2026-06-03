const crypto = require('crypto');

function generateKey() {
  return crypto.randomBytes(32);
}

function generateIV() {
  return crypto.randomBytes(16);
}

function generateToken() {
  return 'fd_' + crypto.randomBytes(24).toString('hex');
}

function createCipher(key, iv) {
  return crypto.createCipheriv('aes-256-cbc', key, iv);
}

function createDecipher(key, iv) {
  return crypto.createDecipheriv('aes-256-cbc', key, iv);
}

function calculateBwLimit(fileSize) {
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;
  if (fileSize < 10 * MB) return 3 * GB;
  if (fileSize < 500 * MB) return 10 * GB;
  return 15 * GB;
}

module.exports = { generateKey, generateIV, generateToken, createCipher, createDecipher, calculateBwLimit };
