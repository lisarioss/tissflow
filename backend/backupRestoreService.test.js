const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepareRestorePlan, recoveryPointBelongsToClinic, recoveryPointsToRemove, recoveryPointName, hasDailyRecoveryPoint, backupHealth, latestRecoveryPointName } = require('./backupRestoreService');

test('prepareRestorePlan força a clínica atual e preserva contas de acesso atuais', () => {
  const backup = { data: { patients: [{ id: 'P-1', clinic_id: 'outra', name: 'Ana' }], glosas: [{ id: 'GL-1', clinic_id: 'outra', recovered_by: 'antigo' }], billingBatches: [{ id: 'L-1', clinic_id: 'outra', risk_reviewed_by: 'antigo' }], billingBatchRiskReviews: [{ id: 'RR-1', clinic_id: 'outra', batch_id: 'L-1', reviewed_by: 'antigo' }], patientDocuments: [{ id: 'D-1', clinic_id: 'outra', uploaded_by: 'antigo', content_base64: 'abc' }], billingDeliveryPackages: [{ id: 'PKG-1', clinic_id: 'outra', created_by: 'antigo', content_base64: 'zip' }], billingBatchFollowups: [{ id: 'BC-1', clinic_id: 'outra', created_by: 'antigo' }], billingBatchPayments: [{ id: 'BP-1', clinic_id: 'outra', created_by: 'antigo', reversed_by: 'outro-antigo' }] } };
  const plan = prepareRestorePlan(backup, 'sabia', 'admin-atual');
  assert.equal(plan.find(item => item.table === 'patients').rows[0].clinic_id, 'sabia');
  const document = plan.find(item => item.table === 'patient_documents').rows[0];
  assert.equal(document.uploaded_by, 'admin-atual');
  assert.equal(document.content_base64, undefined);
  const deliveryPackage = plan.find(item => item.table === 'billing_delivery_packages').rows[0];
  assert.equal(deliveryPackage.clinic_id, 'sabia');
  assert.equal(deliveryPackage.created_by, 'admin-atual');
  assert.equal(deliveryPackage.content_base64, undefined);
  assert.equal(plan.find(item => item.table === 'billing_batch_followups').rows[0].created_by, 'admin-atual');
  const payment = plan.find(item => item.table === 'billing_batch_payments').rows[0];
  assert.equal(payment.created_by, 'admin-atual');
  assert.equal(payment.reversed_by, 'admin-atual');
  assert.equal(plan.find(item => item.table === 'glosas').rows[0].recovered_by, 'admin-atual');
  assert.equal(plan.find(item => item.table === 'billing_batches').rows[0].risk_reviewed_by, 'admin-atual');
  assert.equal(plan.find(item => item.table === 'billing_batch_risk_reviews').rows[0].reviewed_by, 'admin-atual');
});

test('recoveryPointBelongsToClinic bloqueia outra clínica e tentativa de caminho', () => {
  assert.equal(recoveryPointBelongsToClinic('before-restore-sabia-123.json', 'sabia'), true);
  assert.equal(recoveryPointBelongsToClinic('before-restore-vital-123.json', 'sabia'), false);
  assert.equal(recoveryPointBelongsToClinic('../before-restore-sabia-123.json', 'sabia'), false);
});

test('recoveryPointsToRemove mantém somente as cópias mais recentes da clínica', () => {
  const names = ['before-restore-sabia-100.json', 'before-restore-sabia-300.json', 'before-restore-sabia-200.json', 'before-restore-vital-050.json'];
  assert.deepEqual(recoveryPointsToRemove(names, 'sabia', 2), ['before-restore-sabia-100.json']);
});

test('recoveryPointName identifica motivo e clínica sem ambiguidade', () => {
  assert.equal(recoveryPointName('clinica-sabia', 'daily', 123), 'daily--clinica-sabia--123.json');
  assert.equal(recoveryPointBelongsToClinic('daily--clinica-sabia--123.json', 'clinica-sabia'), true);
  assert.equal(recoveryPointBelongsToClinic('daily--outra--123.json', 'clinica-sabia'), false);
});

test('hasDailyRecoveryPoint encontra somente a cópia do mesmo dia UTC', () => {
  const now = new Date('2026-09-08T15:00:00.000Z');
  assert.equal(hasDailyRecoveryPoint([recoveryPointName('sabia', 'daily', Date.parse('2026-09-08T01:00:00.000Z'))], 'sabia', now), true);
  assert.equal(hasDailyRecoveryPoint([recoveryPointName('sabia', 'daily', Date.parse('2026-09-07T23:59:59.000Z'))], 'sabia', now), false);
});

test('backupHealth alerta quando o backup diário está ausente ou atrasado', () => {
  const now = new Date('2026-09-08T15:00:00.000Z');
  assert.equal(backupHealth([], 'sabia', now).healthy, false);
  assert.equal(backupHealth([recoveryPointName('sabia', 'daily', Date.parse('2026-09-06T15:00:00.000Z'))], 'sabia', now).healthy, false);
  assert.equal(backupHealth([recoveryPointName('sabia', 'daily', Date.parse('2026-09-08T01:00:00.000Z'))], 'sabia', now).healthy, true);
});

test('latestRecoveryPointName seleciona a cópia mais recente do tipo solicitado', () => {
  const names = [recoveryPointName('sabia', 'daily', 100), recoveryPointName('sabia', 'manual', 300), recoveryPointName('sabia', 'daily', 200)];
  assert.equal(latestRecoveryPointName(names, 'sabia', 'daily'), 'daily--sabia--200.json');
  assert.equal(latestRecoveryPointName(names, 'sabia'), 'manual--sabia--300.json');
  assert.equal(latestRecoveryPointName(names, 'vital', 'daily'), null);
});
