const crypto = require('crypto');

function createPasswordReset(now = new Date(), ttlMinutes = 30) {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashResetToken(token), expiresAt: new Date(now.getTime() + ttlMinutes * 60000).toISOString() };
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function resetTokenIsValid(record, now = new Date()) {
  return Boolean(record && !record.usedAt && new Date(record.expiresAt).getTime() > now.getTime());
}

module.exports = { createPasswordReset, hashResetToken, resetTokenIsValid };
