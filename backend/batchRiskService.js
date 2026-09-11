function batchRiskReasons({ billedCents = 0, glosaCents = 0, threshold = 10, procedureGlosaCounts = {} } = {}) {
  const reasons = [];
  const billed = Math.max(0, Number(billedCents) || 0);
  const glosa = Math.max(0, Number(glosaCents) || 0);
  const limit = Math.min(100, Math.max(1, Number(threshold) || 10));
  const rate = billed > 0 ? glosa / billed * 100 : 0;
  if (billed > 0 && rate >= limit) reasons.push(`Convênio com ${rate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% de glosa`);
  Object.entries(procedureGlosaCounts).forEach(([procedure, count]) => {
    const occurrences = Math.max(0, Number(count) || 0);
    if (occurrences >= 2) reasons.push(`${procedure}: procedimento com ${occurrences} glosas anteriores`);
  });
  return [...new Set(reasons)];
}

function riskReviewIsCurrent(storedRisks, currentRisks, reviewedAt) {
  if (!reviewedAt || !Array.isArray(storedRisks) || !Array.isArray(currentRisks)) return false;
  const normalize = items => [...new Set(items.map(item => String(item).trim()).filter(Boolean))].sort();
  return JSON.stringify(normalize(storedRisks)) === JSON.stringify(normalize(currentRisks));
}

module.exports = { batchRiskReasons, riskReviewIsCurrent };
