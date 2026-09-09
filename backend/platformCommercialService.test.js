const test = require('node:test');
const assert = require('node:assert/strict');
const { daysUntil, commercialMetrics, spreadsheetCell, commercialCsv } = require('./platformCommercialService');

const plans = { essential: { monthlyPriceCents: 14900 }, professional: { monthlyPriceCents: 29900 }, network: { monthlyPriceCents: 59900 } };

test('calcula MRR, projeção anual e potencial dos testes separadamente', () => {
  const metrics = commercialMetrics([
    { planCode: 'professional', effectiveStatus: 'active' },
    { planCode: 'essential', effectiveStatus: 'active' },
    { planCode: 'network', effectiveStatus: 'trialing', trialEnd: '2026-09-12' }
  ], plans, '2026-09-09');
  assert.equal(metrics.mrrCents, 44800);
  assert.equal(metrics.arrCents, 537600);
  assert.equal(metrics.trialPotentialCents, 59900);
});

test('alerta apenas testes que vencem nos próximos sete dias', () => {
  const metrics = commercialMetrics([
    { id: 'hoje', planCode: 'essential', effectiveStatus: 'trialing', trialEnd: '2026-09-09' },
    { id: 'sete', planCode: 'essential', effectiveStatus: 'trialing', trialEnd: '2026-09-16' },
    { id: 'oito', planCode: 'essential', effectiveStatus: 'trialing', trialEnd: '2026-09-17' },
    { id: 'ativo', planCode: 'essential', effectiveStatus: 'active', trialEnd: '2026-09-10' }
  ], plans, '2026-09-09');
  assert.deepEqual(metrics.expiringTrials.map(item => item.id), ['hoje', 'sete']);
  assert.equal(daysUntil('2026-09-16', '2026-09-09'), 7);
});

test('CSV comercial neutraliza fórmulas e não contém dados clínicos', () => {
  assert.equal(spreadsheetCell('=1+1'), '"\'=1+1"');
  const csv = commercialCsv([{ name: 'Clínica', unit: 'Centro', cnpj: '123', adminEmail: 'admin@clinica.com', plan: { name: 'Essencial' }, effectiveStatus: 'active', patients: 3, users: 2, patientName: 'Nome clínico sigiloso' }]);
  assert.match(csv, /Contato administrativo/);
  assert.doesNotMatch(csv, /Nome clínico sigiloso/);
});
