const crypto = require('crypto');

const DEFAULT_SANDBOX_URL = 'https://api-sandbox.asaas.com/v3';

function asaasConfig(env = process.env) {
  const apiKey = String(env.ASAAS_API_KEY || '').trim();
  const webhookToken = String(env.ASAAS_WEBHOOK_TOKEN || '').trim();
  const baseUrl = String(env.ASAAS_BASE_URL || DEFAULT_SANDBOX_URL).replace(/\/$/, '');
  return { enabled: Boolean(apiKey && webhookToken), apiKey, webhookToken, baseUrl, environment: baseUrl.includes('api-sandbox') ? 'sandbox' : 'production' };
}

function secureTokenMatches(received, expected) {
  const left = Buffer.from(String(received || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function subscriptionStatusForAsaasEvent(event) {
  if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(event)) return 'active';
  if (['PAYMENT_OVERDUE', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE'].includes(event)) return 'past_due';
  if (['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'].includes(event)) return 'canceled';
  return null;
}

function externalSubscriptionId(payload = {}) {
  return payload.subscription?.id || payload.payment?.subscription || null;
}

function periodEndForPayload(payload = {}) {
  return payload.payment?.dueDate || payload.subscription?.nextDueDate || null;
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

async function asaasRequest(config, path, options = {}, request = fetch) {
  const response = await request(`${config.baseUrl}${path}`, {
    ...options,
    headers: { accept: 'application/json', 'content-type': 'application/json', access_token: config.apiKey, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.errors?.map(error => error.description).filter(Boolean).join(' ') || data.message || 'O Asaas recusou a solicitação.';
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

async function createClinicSubscription(config, clinic, plan, billingType, request = fetch) {
  if (!config.enabled) throw new Error('Integração de cobrança não configurada.');
  if (!['BOLETO', 'PIX'].includes(billingType)) throw new Error('Selecione boleto ou Pix.');
  const cpfCnpj = digits(clinic.cnpj);
  if (![11, 14].includes(cpfCnpj.length)) throw new Error('Informe um CPF ou CNPJ válido nas configurações da clínica.');
  let customerId = clinic.externalCustomerId;
  if (!customerId) {
    const customers = await asaasRequest(config, `/customers?externalReference=${encodeURIComponent(clinic.id)}&limit=1`, {}, request);
    customerId = customers.data?.[0]?.id;
  }
  if (!customerId) {
    const customer = await asaasRequest(config, '/customers', { method: 'POST', body: JSON.stringify({ name: clinic.name, cpfCnpj, email: clinic.email, externalReference: clinic.id }) }, request);
    customerId = customer.id;
  }
  const today = new Date().toISOString().slice(0, 10);
  const existingSubscriptions = await asaasRequest(config, `/subscriptions?externalReference=${encodeURIComponent(clinic.id)}&limit=1`, {}, request);
  const subscription = existingSubscriptions.data?.[0] || await asaasRequest(config, '/subscriptions', { method: 'POST', body: JSON.stringify({ customer: customerId, billingType, value: plan.monthlyPriceCents / 100, nextDueDate: today, cycle: 'MONTHLY', description: `TISSFlow · Plano ${plan.name}`, externalReference: clinic.id }) }, request);
  const payments = await asaasRequest(config, `/subscriptions/${encodeURIComponent(subscription.id)}/payments`, {}, request);
  const payment = payments.data?.[0] || null;
  return { customerId, subscriptionId: subscription.id, paymentUrl: payment?.invoiceUrl || payment?.bankSlipUrl || null, paymentId: payment?.id || null, dueDate: payment?.dueDate || today };
}

module.exports = { DEFAULT_SANDBOX_URL, asaasConfig, secureTokenMatches, subscriptionStatusForAsaasEvent, externalSubscriptionId, periodEndForPayload, digits, asaasRequest, createClinicSubscription };
