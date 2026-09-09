const crypto = require('crypto');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function backupChecksum(backupContent) {
  return crypto.createHash('sha256').update(canonicalJson(backupContent), 'utf8').digest('hex');
}

function signBackup(backupContent) {
  return { ...backupContent, integrity: { algorithm: 'SHA-256', checksum: backupChecksum(backupContent) } };
}

function backupSummary(backup) {
  const data = backup?.data || {};
  const count = key => Array.isArray(data[key]) ? data[key].length : 0;
  return {
    patients: count('patients'), guides: count('guides'), patientDocuments: count('patientDocuments'),
    feedbacks: count('feedbacks'), authorizations: count('authorizations'), billingBatches: count('billingBatches'), billingBatchDocuments: count('billingBatchDocuments'),
    billingBatchStatusHistory: count('billingBatchStatusHistory'),
    billingBatchReturnItems: count('billingBatchReturnItems'),
    appointments: count('appointments'), insurers: count('insurers')
  };
}

function validateBackup(backup, clinicId) {
  if (!backup || backup.format !== 'tiss-flow-backup' || backup.version !== 1 || !backup.data) return { valid: false, error: 'Arquivo de backup inválido ou incompatível.' };
  if (backup.clinic?.id !== clinicId) return { valid: false, error: 'Este backup pertence a outra clínica.' };
  if (backup.integrity?.algorithm !== 'SHA-256' || !/^[a-f0-9]{64}$/.test(backup.integrity?.checksum || '')) return { valid: false, error: 'O backup não possui uma assinatura de integridade válida.' };
  const { integrity, ...content } = backup;
  if (backupChecksum(content) !== integrity.checksum) return { valid: false, error: 'O arquivo foi alterado ou está corrompido.' };
  return { valid: true, exportedAt: backup.exportedAt, version: backup.version, summary: backupSummary(backup) };
}

module.exports = { canonicalJson, backupChecksum, signBackup, backupSummary, validateBackup };
