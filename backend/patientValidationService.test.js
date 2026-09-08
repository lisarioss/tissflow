const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCardNumber, validatePatientData, findDuplicatePatient, patientStatusAuditDetails } = require('./patientValidationService');

test('normalizeCardNumber ignora formatação comum da carteira', () => {
  assert.equal(normalizeCardNumber(' 012.345-67/89 '), '0123456789');
});

test('findDuplicatePatient identifica a mesma carteira apesar da formatação', () => {
  const patients = [{ id: 'P-1', insurer: 'Unimed', cardNumber: '012.345-67' }];
  assert.equal(findDuplicatePatient(patients, '01234567')?.id, 'P-1');
});

test('findDuplicatePatient ignora o próprio cadastro durante a edição', () => {
  const patients = [{ id: 'P-1', insurer: 'Unimed', card_number: '123' }];
  assert.equal(findDuplicatePatient(patients, '123', 'P-1'), null);
});

test('validatePatientData aceita cadastro consistente', () => {
  const patient = { birthDate: '2010-01-02', planValidity: '2027-12-31', insurer: 'Unimed', guardianEmail: 'mae@example.com', consentStatus: 'granted', consentDate: '2026-09-08' };
  assert.equal(validatePatientData(patient, [{ name: 'Unimed' }]), '');
});

test('validatePatientData rejeita datas impossíveis, e-mail e convênio desconhecido', () => {
  const base = { birthDate: '2010-01-02', planValidity: '2027-12-31', insurer: 'Unimed' };
  assert.match(validatePatientData({ ...base, birthDate: '2010-02-30' }, [{ name: 'Unimed' }]), /nascimento/);
  assert.match(validatePatientData({ ...base, guardianEmail: 'invalido' }, [{ name: 'Unimed' }]), /e-mail/);
  assert.match(validatePatientData({ ...base, insurer: 'Outro' }, [{ name: 'Unimed' }]), /convênio/);
});

test('patientStatusAuditDetails registra apenas arquivamento ou reativação real', () => {
  assert.deepEqual(patientStatusAuditDetails(1, false), { patientStatusChange: 'archived' });
  assert.deepEqual(patientStatusAuditDetails(0, true), { patientStatusChange: 'reactivated' });
  assert.deepEqual(patientStatusAuditDetails(1, true), {});
});
