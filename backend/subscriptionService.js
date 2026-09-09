const plans = {
  essential: { code: 'essential', name: 'Essencial', description: 'Operação de uma clínica com os módulos principais.', patientLimit: 100, userLimit: 5, monthlyPriceCents: 14900 },
  professional: { code: 'professional', name: 'Profissional', description: 'Mais capacidade para equipes e faturamento em crescimento.', patientLimit: 500, userLimit: 20, monthlyPriceCents: 29900 },
  network: { code: 'network', name: 'Rede', description: 'Estrutura ampliada para grupos e múltiplas unidades.', patientLimit: null, userLimit: null, monthlyPriceCents: 59900 }
};

function validPlan(code) {
  if (!plans[code]) throw new Error('Selecione um plano válido.');
  return plans[code];
}

function subscriptionState(subscription, today = new Date().toISOString().slice(0, 10)) {
  if (subscription.status === 'trialing' && subscription.trialEnd && subscription.trialEnd < today) return 'trial_expired';
  return subscription.status;
}

function remainingTrialDays(trialEnd, today = new Date().toISOString().slice(0, 10)) {
  if (!trialEnd) return 0;
  return Math.max(0, Math.ceil((new Date(`${trialEnd}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000));
}

function planCapacityAvailable(current, limit, additional = 1) {
  return limit === null || Number(current) + Number(additional) <= Number(limit);
}

function subscriptionWriteAccess(subscription, now = new Date(), graceDays = 7) {
  const effectiveStatus = subscriptionState(subscription, now.toISOString().slice(0, 10));
  if (['active', 'trialing'].includes(effectiveStatus)) return { allowed: true, effectiveStatus, graceDaysRemaining: 0 };
  if (effectiveStatus === 'past_due') {
    const updatedAt = new Date(String(subscription.updatedAt || '').replace(' ', 'T') + (String(subscription.updatedAt || '').includes('Z') ? '' : 'Z'));
    const elapsedDays = Number.isNaN(updatedAt.getTime()) ? graceDays + 1 : Math.floor((now - updatedAt) / 86400000);
    const graceDaysRemaining = Math.max(0, graceDays - elapsedDays);
    return { allowed: elapsedDays <= graceDays, effectiveStatus, graceDaysRemaining };
  }
  return { allowed: false, effectiveStatus, graceDaysRemaining: 0 };
}

function extendedTrialEnd(days, today = new Date().toISOString().slice(0, 10)) {
  const allowedDays = [7, 15, 30];
  const extension = Number(days);
  if (!allowedDays.includes(extension)) throw new Error('Selecione uma prorrogação de 7, 15 ou 30 dias.');
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + extension);
  return date.toISOString().slice(0, 10);
}

module.exports = { plans, validPlan, subscriptionState, remainingTrialDays, planCapacityAvailable, subscriptionWriteAccess, extendedTrialEnd };
