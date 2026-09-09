const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canTransitionBatch } = require('./batchWorkflowService');

test('fluxo do lote exige preparação antes do envio', () => {
  assert.equal(canTransitionBatch('draft', 'sent'), false);
  assert.equal(canTransitionBatch('draft', 'ready'), true);
  assert.equal(canTransitionBatch('ready', 'sent'), true);
});

test('lote enviado não volta silenciosamente para preparação', () => {
  assert.equal(canTransitionBatch('sent', 'draft'), false);
  assert.equal(canTransitionBatch('sent', 'processing'), true);
  assert.equal(canTransitionBatch('approved', 'error'), true);
  assert.equal(canTransitionBatch('error', 'draft'), true);
});
