function normalizeCardNumber(value) {
  return String(value || '').trim().replace(/[\s.\-/]/g, '').toUpperCase();
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validatePatientData(patient, insurers) {
  if (!isValidIsoDate(patient.birthDate)) return 'Informe uma data de nascimento válida.';
  if (!isValidIsoDate(patient.planValidity)) return 'Informe uma validade de plano válida.';
  if (patient.guardianEmail && !/^\S+@\S+\.\S+$/.test(patient.guardianEmail)) return 'Informe um e-mail válido para o responsável.';
  if (!insurers.some(insurer => insurer.name === patient.insurer)) return 'Selecione um convênio cadastrado na clínica.';
  if (patient.consentStatus === 'granted' && !isValidIsoDate(patient.consentDate)) return 'Informe a data em que o consentimento foi concedido.';
  return '';
}

function findDuplicatePatient(patients, cardNumber, ignoredPatientId = '') {
  const normalizedCard = normalizeCardNumber(cardNumber);
  if (!normalizedCard) return null;
  return patients.find(patient => patient.id !== ignoredPatientId
    && normalizeCardNumber(patient.cardNumber ?? patient.card_number) === normalizedCard) || null;
}

function patientStatusAuditDetails(previousActive, nextActive) {
  const wasActive = previousActive !== false && previousActive !== 0;
  const isActive = nextActive !== false && nextActive !== 0;
  if (wasActive === isActive) return {};
  return { patientStatusChange: isActive ? 'reactivated' : 'archived' };
}

module.exports = { normalizeCardNumber, isValidIsoDate, validatePatientData, findDuplicatePatient, patientStatusAuditDetails };
