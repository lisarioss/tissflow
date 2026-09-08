const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sessionVersionMatches, validateNewPassword, loginFailureState, accountIsLocked } = require('./authSecurityService');

test('sessionVersionMatches invalida tokens emitidos antes da troca de senha', () => {
  assert.equal(sessionVersionMatches(2, 2), true);
  assert.equal(sessionVersionMatches(1, 2), false);
  assert.equal(sessionVersionMatches(undefined, 0), true);
});

test('validateNewPassword exige pelo menos 12 caracteres', () => {
  assert.match(validateNewPassword('senha-curta'), /12 caracteres/);
  assert.equal(validateNewPassword('senha-segura-123'), null);
});

test('loginFailureState bloqueia a conta na quinta falha por 15 minutos', () => {
  const now = Date.parse('2026-09-08T15:00:00.000Z');
  assert.deepEqual(loginFailureState(3, now), { attempts: 4, lockedUntil: null });
  const blocked = loginFailureState(4, now);
  assert.equal(blocked.attempts, 5);
  assert.equal(blocked.lockedUntil, '2026-09-08T15:15:00.000Z');
  assert.equal(accountIsLocked(blocked.lockedUntil, now), true);
  assert.equal(accountIsLocked(blocked.lockedUntil, now + 16 * 60000), false);
});
