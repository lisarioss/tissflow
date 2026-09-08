const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encryptBackup, decryptBackup } = require('./backupEncryptionService');

test('encryptBackup protege e decryptBackup recupera o conteúdo original', () => {
  const backup = { format: 'tiss-flow-backup', data: { patients: [{ id: 'P-1' }] } };
  const encrypted = encryptBackup(backup, 'senha-segura-123');
  assert.equal(encrypted.cipher, 'AES-256-GCM');
  assert.deepEqual(decryptBackup(encrypted, 'senha-segura-123'), backup);
  assert.equal(JSON.stringify(encrypted).includes('P-1'), false);
});

test('encryptBackup exige senha forte e decryptBackup rejeita senha incorreta', () => {
  assert.throws(() => encryptBackup({}, 'curta'), /12 caracteres/);
  const encrypted = encryptBackup({}, 'senha-segura-123');
  assert.throws(() => decryptBackup(encrypted, 'senha-incorreta-123'), /Senha incorreta|corrompido/);
});

test('decryptBackup rejeita arquivo adulterado e formato incompatível', () => {
  const password = 'senha-segura-123';
  const encrypted = encryptBackup({ clinicId: 'clinica-1' }, password);
  const altered = { ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -4)}AAAA` };
  assert.throws(() => decryptBackup(altered, password), /Senha incorreta|corrompido/);
  assert.throws(() => decryptBackup({ ...encrypted, version: 2 }, password), /inválido|incompatível/);
});
