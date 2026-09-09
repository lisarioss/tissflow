function parseReceivedAmount(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const normalized = typeof value === 'string' ? value.replace(',', '.') : value;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('O valor recebido deve ser um número igual ou maior que zero.');
  return Math.round(amount * 100);
}

function reconciliationStatus(totalCents, receivedCents) {
  const total = Math.max(0, Number(totalCents || 0));
  const received = Math.max(0, Number(receivedCents || 0));
  if (received === 0) return 'pending';
  if (received < total) return 'partial';
  return 'paid';
}

module.exports = { parseReceivedAmount, reconciliationStatus };
