function daysUntil(date, today = new Date().toISOString().slice(0, 10)) {
  if (!date) return null;
  const difference = new Date(`${date}T12:00:00Z`) - new Date(`${today}T12:00:00Z`);
  return Math.ceil(difference / 86400000);
}

function commercialMetrics(clinics, plans, today = new Date().toISOString().slice(0, 10)) {
  const price = clinic => Number(plans[clinic.planCode]?.monthlyPriceCents || 0);
  const active = clinics.filter(clinic => clinic.effectiveStatus === 'active');
  const trials = clinics.filter(clinic => clinic.effectiveStatus === 'trialing');
  const mrrCents = active.reduce((total, clinic) => total + price(clinic), 0);
  const trialPotentialCents = trials.reduce((total, clinic) => total + price(clinic), 0);
  const expiringTrials = trials.map(clinic => ({ ...clinic, daysRemaining: daysUntil(clinic.trialEnd, today) }))
    .filter(clinic => clinic.daysRemaining !== null && clinic.daysRemaining >= 0 && clinic.daysRemaining <= 7)
    .sort((left, right) => left.daysRemaining - right.daysRemaining);
  const planDistribution = Object.keys(plans).map(planCode => ({ planCode, count: clinics.filter(clinic => clinic.planCode === planCode).length }));
  return { mrrCents, arrCents: mrrCents * 12, trialPotentialCents, expiringTrials, planDistribution };
}

function spreadsheetCell(value) {
  const text = String(value ?? '');
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function commercialCsv(clinics) {
  const headers = ['Clínica', 'Unidade', 'CNPJ', 'Contato administrativo', 'Plano', 'Status', 'Pacientes ativos', 'Usuários ativos', 'Fim do teste', 'Fim do período'];
  const rows = clinics.map(clinic => [clinic.name, clinic.unit, clinic.cnpj, clinic.adminEmail, clinic.plan?.name || clinic.planCode, clinic.effectiveStatus, clinic.patients, clinic.users, clinic.trialEnd, clinic.currentPeriodEnd]);
  return `\uFEFF${headers.map(spreadsheetCell).join(';')}\r\n${rows.map(row => row.map(spreadsheetCell).join(';')).join('\r\n')}`;
}

module.exports = { daysUntil, commercialMetrics, spreadsheetCell, commercialCsv };
