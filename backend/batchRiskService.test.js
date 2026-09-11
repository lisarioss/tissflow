const test = require('node:test');
const assert = require('node:assert/strict');
const { batchRiskReasons, riskReviewIsCurrent } = require('./batchRiskService');

test('calcula riscos do lote usando o histórico financeiro e dos procedimentos', () => {
  assert.deepEqual(batchRiskReasons({
    billedCents: 100000,
    glosaCents: 12500,
    threshold: 10,
    procedureGlosaCounts: { Psicoterapia: 3, Fonoaudiologia: 1 }
  }), ['Convênio com 12,5% de glosa', 'Psicoterapia: procedimento com 3 glosas anteriores']);
});

test('não cria alerta sem histórico suficiente', () => {
  assert.deepEqual(batchRiskReasons({
    billedCents: 0,
    glosaCents: 5000,
    threshold: 10,
    procedureGlosaCounts: { Psicoterapia: 1 }
  }), []);
});

test('remove duplicidades de procedimentos selecionados', () => {
  assert.deepEqual(batchRiskReasons({
    billedCents: 100000,
    glosaCents: 0,
    procedureGlosaCounts: { Psicoterapia: 2 }
  }), ['Psicoterapia: procedimento com 2 glosas anteriores']);
});

test('considera atual somente a revisão com os mesmos riscos', () => {
  assert.equal(riskReviewIsCurrent(['Risco B', 'Risco A'], ['Risco A', 'Risco B'], '2026-09-10T10:00:00Z'), true);
  assert.equal(riskReviewIsCurrent(['Risco A'], ['Risco A', 'Risco novo'], '2026-09-10T10:00:00Z'), false);
  assert.equal(riskReviewIsCurrent([], [], null), false);
});
