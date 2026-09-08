const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canonicalJson, signBackup, backupSummary, validateBackup } = require('./backupIntegrityService');

test('canonicalJson gera o mesmo conteúdo apesar da ordem das chaves', () => {
  assert.equal(canonicalJson({ b: 2, a: { d: 4, c: 3 } }), canonicalJson({ a: { c: 3, d: 4 }, b: 2 }));
});

test('validateBackup confirma backup assinado da clínica', () => {
  const backup = signBackup({ format: 'tiss-flow-backup', version: 1, exportedAt: '2026-09-08T12:00:00Z', clinic: { id: 'sabia' }, data: { patients: [] } });
  assert.equal(validateBackup(backup, 'sabia').valid, true);
});

test('validateBackup rejeita alteração e backup de outra clínica', () => {
  const backup = signBackup({ format: 'tiss-flow-backup', version: 1, clinic: { id: 'sabia' }, data: { patients: [] } });
  backup.data.patients.push({ id: 'P-1' });
  assert.match(validateBackup(backup, 'sabia').error, /alterado|corrompido/);
  const original = signBackup({ format: 'tiss-flow-backup', version: 1, clinic: { id: 'sabia' }, data: {} });
  assert.match(validateBackup(original, 'vital').error, /outra clínica/);
});

test('backupSummary conta somente coleções conhecidas do backup', () => {
  const summary = backupSummary({ data: { patients: [{}, {}], guides: [{}], patientDocuments: [{}], unknown: [{}, {}] } });
  assert.equal(summary.patients, 2);
  assert.equal(summary.guides, 1);
  assert.equal(summary.patientDocuments, 1);
  assert.equal(summary.appointments, 0);
  assert.equal(summary.unknown, undefined);
});
