const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePrivacyRequest, validatePrivacyResolution } = require('./privacyRequestService');

test('valida solicitação de direito do titular', () => {
  assert.deepEqual(validatePrivacyRequest({ type: 'access', requestedBy: ' Responsável ', notes: 'Pedido formal' }), { type: 'access', requestedBy: 'Responsável', notes: 'Pedido formal' });
  assert.throws(() => validatePrivacyRequest({ type: 'invalid', requestedBy: 'Pessoa' }), /válido/);
});

test('conclusão exige justificativa e análise pode permanecer aberta', () => {
  assert.equal(validatePrivacyResolution({ status: 'under_review' }).status, 'under_review');
  assert.throws(() => validatePrivacyResolution({ status: 'denied', resolution: '' }), /justificativa/);
  assert.equal(validatePrivacyResolution({ status: 'fulfilled', resolution: 'Exportação entregue.' }).resolution, 'Exportação entregue.');
});
