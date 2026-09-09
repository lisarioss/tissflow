const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRuntimeConfig } = require('./runtimeConfigService');

test('aceita configuração local com dados demonstrativos', () => {
  const result = validateRuntimeConfig({ PORT: '3000', JWT_SECRET: 'local', DEMO_PASSWORD: 'demo' });
  assert.equal(result.demoEnabled, true);
  assert.equal(result.port, 3000);
});

test('aceita produção segura sem dados demonstrativos', () => {
  const result = validateRuntimeConfig({ NODE_ENV: 'production', PORT: '8080', JWT_SECRET: 'a'.repeat(48), ENABLE_DEMO_DATA: 'false', CORS_ORIGINS: 'https://app.exemplo.com', TRUST_PROXY: 'true' });
  assert.equal(result.production, true);
  assert.equal(result.demoEnabled, false);
});

test('bloqueia produção com segredo fraco, HTTP e demonstração', () => {
  assert.throws(() => validateRuntimeConfig({ NODE_ENV: 'production', JWT_SECRET: 'secret', ENABLE_DEMO_DATA: 'true', DEMO_PASSWORD: 'demo', CORS_ORIGINS: 'http://localhost:3000' }), /JWT_SECRET[\s\S]*ENABLE_DEMO_DATA[\s\S]*HTTPS[\s\S]*TRUST_PROXY/);
});

test('rejeita porta inválida', () => {
  assert.throws(() => validateRuntimeConfig({ PORT: '90000', JWT_SECRET: 'local', DEMO_PASSWORD: 'demo' }), /PORT/);
});
