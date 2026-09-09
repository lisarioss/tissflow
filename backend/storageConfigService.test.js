const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { resolveStoragePaths } = require('./storageConfigService');

test('desenvolvimento mantém banco e arquivos no diretório do backend', () => {
  const base = path.resolve('backend-local');
  const result = resolveStoragePaths({}, base);
  assert.equal(result.databasePath, path.join(base, 'tiss-flow.db'));
  assert.equal(result.documentUploadRoot, path.join(base, 'uploads'));
});

test('DATA_DIR reúne banco, documentos e recuperação no volume configurado', () => {
  const data = path.resolve('volume-tiss');
  const result = resolveStoragePaths({ DATA_DIR: data }, path.resolve('backend-local'));
  assert.equal(result.dataDirectory, data);
  assert.equal(result.recoveryRoot, path.join(data, 'recovery-backups'));
});

test('produção exige DATA_DIR absoluto', () => {
  assert.throws(() => resolveStoragePaths({ NODE_ENV: 'production' }), /DATA_DIR/);
  assert.throws(() => resolveStoragePaths({ NODE_ENV: 'production', DATA_DIR: 'dados' }), /absoluto/);
});
