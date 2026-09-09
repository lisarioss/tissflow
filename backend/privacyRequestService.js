const allowedTypes = new Set(['access', 'correction', 'portability', 'anonymization', 'deletion']);
const allowedStatuses = new Set(['requested', 'under_review', 'fulfilled', 'denied']);

function validatePrivacyRequest({ type, requestedBy, notes }) {
  if (!allowedTypes.has(type)) throw new Error('Selecione um direito do titular válido.');
  if (!String(requestedBy || '').trim()) throw new Error('Informe quem apresentou a solicitação.');
  return { type, requestedBy: String(requestedBy).trim().slice(0, 180), notes: String(notes || '').trim().slice(0, 1000) };
}

function validatePrivacyResolution({ status, resolution }) {
  if (!allowedStatuses.has(status) || status === 'requested') throw new Error('Selecione uma situação válida para a análise.');
  if (['fulfilled', 'denied'].includes(status) && !String(resolution || '').trim()) throw new Error('Registre a justificativa da conclusão.');
  return { status, resolution: String(resolution || '').trim().slice(0, 2000) };
}

module.exports = { validatePrivacyRequest, validatePrivacyResolution };
