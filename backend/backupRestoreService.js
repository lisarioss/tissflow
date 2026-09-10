const restoreCollections = [
  ['clinic_settings', 'clinicSettings'], ['insurers', 'insurers'], ['patients', 'patients'], ['guides', 'guides'],
  ['authorizations', 'authorizations'], ['billing_batches', 'billingBatches'], ['invoices', 'invoices'], ['glosas', 'glosas'],
  ['feedbacks', 'feedbacks'], ['patient_documents', 'patientDocuments'], ['billing_batch_guides', 'billingBatchGuides'],
  ['billing_batch_documents', 'billingBatchDocuments'], ['billing_batch_status_history', 'billingBatchStatusHistory'],
  ['billing_batch_return_items', 'billingBatchReturnItems'], ['billing_delivery_packages', 'billingDeliveryPackages'], ['billing_batch_followups', 'billingBatchFollowups'], ['billing_batch_payments', 'billingBatchPayments'],
  ['patient_consents', 'patientConsents'], ['privacy_requests', 'privacyRequests'], ['appointments', 'appointments']
];
const deletionOrder = [...restoreCollections].reverse();

function rowsForCollection(data, key) {
  if (key === 'clinicSettings') return data[key] ? [data[key]] : [];
  return Array.isArray(data[key]) ? data[key] : [];
}

function prepareRestorePlan(backup, clinicId, currentUserId) {
  return restoreCollections.map(([table, key]) => ({
    table,
    rows: rowsForCollection(backup.data, key).map(source => {
      const row = { ...source };
      delete row.content_base64;
      if ('clinic_id' in row || table !== 'billing_batch_guides') row.clinic_id = clinicId;
      if (table === 'billing_batches' && row.sent_by) row.sent_by = currentUserId;
      if (table === 'glosas' && row.recovered_by) row.recovered_by = currentUserId;
      if (table === 'patient_documents' && row.uploaded_by) row.uploaded_by = currentUserId;
      if (table === 'billing_batch_documents' && row.uploaded_by) row.uploaded_by = currentUserId;
      if (table === 'billing_delivery_packages' && row.created_by) row.created_by = currentUserId;
      if (table === 'billing_batch_followups' && row.created_by) row.created_by = currentUserId;
      if (table === 'billing_batch_payments') { if (row.created_by) row.created_by = currentUserId; if (row.reversed_by) row.reversed_by = currentUserId; }
      if (table === 'billing_batch_status_history' && row.changed_by) row.changed_by = currentUserId;
      if (table === 'patient_consents' && row.recorded_by) row.recorded_by = currentUserId;
      if (table === 'privacy_requests') { if (row.created_by) row.created_by = currentUserId; if (row.resolved_by) row.resolved_by = currentUserId; }
      if (table === 'appointments' && row.created_by) row.created_by = currentUserId;
      return row;
    })
  }));
}

function restoreBackupDatabase(db, backup, clinicId, currentUserId) {
  const plan = prepareRestorePlan(backup, clinicId, currentUserId);
  db.transaction(() => {
    deletionOrder.forEach(([table]) => {
      if (table === 'billing_batch_guides') db.prepare('DELETE FROM billing_batch_guides WHERE batch_id IN (SELECT id FROM billing_batches WHERE clinic_id = ?)').run(clinicId);
      else db.prepare(`DELETE FROM ${table} WHERE clinic_id = ?`).run(clinicId);
    });
    plan.forEach(({ table, rows }) => rows.forEach(row => {
      const allowed = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name));
      const entries = Object.entries(row).filter(([column]) => allowed.has(column));
      if (!entries.length) return;
      const columns = entries.map(([column]) => column);
      const placeholders = columns.map(() => '?').join(', ');
      db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`).run(...entries.map(([, value]) => value));
    }));
  })();
  return Object.fromEntries(plan.map(({ table, rows }) => [table, rows.length]));
}

function recoveryPointBelongsToClinic(name, clinicId) {
  if (typeof name !== 'string' || pathSafeName(name) !== name) return false;
  return name.startsWith(`before-restore-${clinicId}-`) && /^before-restore-[a-z0-9-]+-\d+\.json$/i.test(name)
    || ['manual', 'daily', 'before-restore'].some(reason => name.startsWith(`${reason}--${clinicId}--`) && new RegExp(`^${reason}--[a-z0-9-]+--\\d+\\.json$`, 'i').test(name));
}

function recoveryPointsToRemove(names, clinicId, keep = 20) {
  const timestamp = name => Number(name.match(/(\d+)\.json$/)?.[1] || 0);
  return names.filter(name => recoveryPointBelongsToClinic(name, clinicId)).sort((first, second) => timestamp(second) - timestamp(first)).slice(Math.max(1, Number(keep) || 20));
}

function pathSafeName(name) { return name.replace(/^.*[\\/]/, ''); }

function recoveryPointName(clinicId, reason = 'manual', timestamp = Date.now()) {
  const safeReason = ['manual', 'daily', 'before-restore'].includes(reason) ? reason : 'manual';
  if (!/^[a-z0-9-]+$/i.test(clinicId)) throw new Error('Identificador de clínica inválido.');
  return `${safeReason}--${clinicId}--${Number(timestamp)}.json`;
}

function hasDailyRecoveryPoint(names, clinicId, now = new Date()) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = start + 86400000;
  return names.some(name => {
    const match = name.match(new RegExp(`^daily--${clinicId}--(\\d+)\\.json$`, 'i'));
    const timestamp = Number(match?.[1]);
    return timestamp >= start && timestamp < end;
  });
}

function backupHealth(names, clinicId, now = new Date()) {
  const dailyTimestamps = names.map(name => Number(name.match(new RegExp(`^daily--${clinicId}--(\\d+)\\.json$`, 'i'))?.[1] || 0)).filter(Boolean);
  const lastDailyTimestamp = dailyTimestamps.length ? Math.max(...dailyTimestamps) : 0;
  const ageHours = lastDailyTimestamp ? (now.getTime() - lastDailyTimestamp) / 3600000 : null;
  return { healthy: ageHours !== null && ageHours <= 36, lastDailyAt: lastDailyTimestamp ? new Date(lastDailyTimestamp).toISOString() : null, ageHours };
}

function latestRecoveryPointName(names, clinicId, reason = '') {
  const candidates = names.filter(name => recoveryPointBelongsToClinic(name, clinicId) && (!reason || name.startsWith(`${reason}--`)));
  const timestamp = name => Number(name.match(/(\d+)\.json$/)?.[1] || 0);
  return candidates.sort((first, second) => timestamp(second) - timestamp(first))[0] || null;
}

module.exports = { restoreCollections, prepareRestorePlan, restoreBackupDatabase, recoveryPointBelongsToClinic, recoveryPointsToRemove, recoveryPointName, hasDailyRecoveryPoint, backupHealth, latestRecoveryPointName };
