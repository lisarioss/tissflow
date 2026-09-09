const test = require('node:test');
const assert = require('node:assert/strict');
const { plans, validPlan, subscriptionState, remainingTrialDays, planCapacityAvailable, subscriptionWriteAccess, extendedTrialEnd } = require('./subscriptionService');

test('catálogo possui limites claros e plano Rede ilimitado', () => {
  assert.equal(plans.essential.patientLimit, 100);
  assert.equal(plans.essential.monthlyPriceCents, 14900);
  assert.equal(plans.professional.monthlyPriceCents, 29900);
  assert.equal(plans.network.monthlyPriceCents, 59900);
  assert.equal(plans.network.patientLimit, null);
  assert.throws(() => validPlan('inventado'), /plano válido/);
});

test('teste vencido é identificado sem alterar datas armazenadas', () => {
  assert.equal(subscriptionState({ status: 'trialing', trialEnd: '2026-01-10' }, '2026-01-11'), 'trial_expired');
  assert.equal(subscriptionState({ status: 'trialing', trialEnd: '2026-01-10' }, '2026-01-10'), 'trialing');
  assert.equal(remainingTrialDays('2026-01-20', '2026-01-10'), 10);
});

test('limites aceitam a capacidade exata e tratam Rede como ilimitado', () => {
  assert.equal(planCapacityAvailable(99, 100, 1), true);
  assert.equal(planCapacityAvailable(100, 100, 1), false);
  assert.equal(planCapacityAvailable(10000, null, 500), true);
});

test('atraso possui sete dias de tolerância antes do modo somente leitura', () => {
  const withinGrace = subscriptionWriteAccess({ status: 'past_due', updatedAt: '2026-09-05 12:00:00' }, new Date('2026-09-09T12:00:00Z'));
  const expiredGrace = subscriptionWriteAccess({ status: 'past_due', updatedAt: '2026-09-01 12:00:00' }, new Date('2026-09-09T12:00:00Z'));
  assert.equal(withinGrace.allowed, true);
  assert.equal(withinGrace.graceDaysRemaining, 3);
  assert.equal(expiredGrace.allowed, false);
});

test('teste encerrado e assinatura cancelada ficam somente leitura', () => {
  assert.equal(subscriptionWriteAccess({ status: 'trialing', trialEnd: '2026-09-01' }, new Date('2026-09-09T12:00:00Z')).allowed, false);
  assert.equal(subscriptionWriteAccess({ status: 'canceled' }, new Date('2026-09-09T12:00:00Z')).allowed, false);
});

test('prorrogação administrativa aceita somente períodos controlados', () => {
  assert.equal(extendedTrialEnd(15, '2026-09-09'), '2026-09-24');
  assert.throws(() => extendedTrialEnd(365, '2026-09-09'), /7, 15 ou 30/);
});
