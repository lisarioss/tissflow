const test = require('node:test');
const assert = require('node:assert/strict');
const { createPasswordReset, hashResetToken, resetTokenIsValid } = require('./passwordResetService');

test('cria token aleatório armazenável somente como hash', () => {
  const reset = createPasswordReset(new Date('2026-09-10T12:00:00Z'));
  assert.notEqual(reset.token, reset.tokenHash);
  assert.equal(hashResetToken(reset.token), reset.tokenHash);
});

test('token expira e não pode ser reutilizado', () => {
  const record = { expiresAt: '2026-09-10T12:30:00.000Z', usedAt: null };
  assert.equal(resetTokenIsValid(record, new Date('2026-09-10T12:29:59Z')), true);
  assert.equal(resetTokenIsValid(record, new Date('2026-09-10T12:30:00Z')), false);
  assert.equal(resetTokenIsValid({ ...record, usedAt: '2026-09-10T12:10:00Z' }, new Date('2026-09-10T12:20:00Z')), false);
});
