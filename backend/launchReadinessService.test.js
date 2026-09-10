const test = require('node:test');
const assert = require('node:assert/strict');
const { launchReadiness } = require('./launchReadinessService');

test('aprova publicação somente quando todas as dependências estão prontas', () => {
  const result = launchReadiness({ production: true, billingConfigured: true, passwordResetConfigured: true, demoEnabled: false, dataDirectoryConfigured: true, legalSettings: { legalName: 'TISSFlow Ltda', cnpj: '1', supportEmail: 's@x.com', privacyEmail: 'p@x.com' } });
  assert.equal(result.ready, true); assert.equal(result.completed, result.total);
});

test('lista pendências sem revelar segredos de configuração', () => {
  const result = launchReadiness({ demoEnabled: true, legalSettings: {} });
  assert.equal(result.ready, false); assert.equal(result.checks.filter(item => !item.ready).length, 6);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});
