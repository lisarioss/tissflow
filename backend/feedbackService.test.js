const test = require('node:test');
const assert = require('node:assert/strict');
const { feedbackDateBelongsToGuide } = require('./feedbackService');

test('aceita a data registrada entre as sessões da guia', () => {
  const guide = { sessions_json: JSON.stringify([{ date: '2026-08-03' }, { date: '2026-08-10' }]), competence: '2026-08' };
  assert.equal(feedbackDateBelongsToGuide(guide, '2026-08-10'), true);
});

test('rejeita outra data mesmo dentro da competência quando a guia tem sessões', () => {
  const guide = { sessions_json: JSON.stringify([{ date: '2026-08-03' }]), competence: '2026-08' };
  assert.equal(feedbackDateBelongsToGuide(guide, '2026-08-04'), false);
});

test('usa a competência para guias antigas sem sessões cadastradas', () => {
  assert.equal(feedbackDateBelongsToGuide({ sessions_json: '[]', competence: '2026-08' }, '2026-08-22'), true);
  assert.equal(feedbackDateBelongsToGuide({ sessions_json: '[]', competence: '2026-08' }, '2026-09-01'), false);
});
