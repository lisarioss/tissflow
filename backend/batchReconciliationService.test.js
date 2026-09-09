const test = require('node:test');
const assert = require('node:assert/strict');
const { parseReceivedAmount, reconciliationStatus } = require('./batchReconciliationService');

test('parseReceivedAmount aceita ponto, vírgula e arredonda para centavos', () => {
  assert.equal(parseReceivedAmount('125,49'), 12549);
  assert.equal(parseReceivedAmount(10.125), 1013);
  assert.equal(parseReceivedAmount(''), 0);
});

test('parseReceivedAmount rejeita valores inválidos ou negativos', () => {
  assert.throws(() => parseReceivedAmount('-1'), /igual ou maior/);
  assert.throws(() => parseReceivedAmount('abc'), /igual ou maior/);
});

test('reconciliationStatus diferencia pendente, parcial e quitado', () => {
  assert.equal(reconciliationStatus(10000, 0), 'pending');
  assert.equal(reconciliationStatus(10000, 9999), 'partial');
  assert.equal(reconciliationStatus(10000, 10000), 'paid');
  assert.equal(reconciliationStatus(10000, 11000), 'paid');
});
