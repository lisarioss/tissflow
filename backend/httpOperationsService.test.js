const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldRedirectToHttps, requestLog } = require('./httpOperationsService');

test('produção redireciona páginas inseguras e preserva probes internos', () => {
  assert.equal(shouldRedirectToHttps({ production: true, secure: false, path: '/' }), true);
  assert.equal(shouldRedirectToHttps({ production: true, secure: false, path: '/api/health' }), false);
  assert.equal(shouldRedirectToHttps({ production: true, secure: true, path: '/' }), false);
  assert.equal(shouldRedirectToHttps({ production: false, secure: false, path: '/' }), false);
});

test('log técnico não inclui URL, query ou corpo clínico', () => {
  const parsed = JSON.parse(requestLog({ requestId: 'req-1', method: 'GET', statusCode: 200, durationMs: 12, clinicId: 'clinic', userId: 'user' }));
  assert.deepEqual(Object.keys(parsed).sort(), ['clinicId', 'durationMs', 'method', 'requestId', 'statusCode', 'timestamp', 'type', 'userId'].sort());
});
