const test = require('node:test');
const assert = require('node:assert/strict');
const { asaasConfig, secureTokenMatches, subscriptionStatusForAsaasEvent, externalSubscriptionId, periodEndForPayload, createClinicSubscription } = require('./asaasBillingService');

test('Asaas permanece desativado sem segredos e usa o sandbox por padrão', () => {
  const config = asaasConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.environment, 'sandbox');
});

test('Asaas só fica pronto com chave da API e token do webhook', () => {
  const config = asaasConfig({ ASAAS_API_KEY: 'key', ASAAS_WEBHOOK_TOKEN: 'secret' });
  assert.equal(config.enabled, true);
  assert.equal(secureTokenMatches('secret', config.webhookToken), true);
  assert.equal(secureTokenMatches('invalid', config.webhookToken), false);
});

test('eventos financeiros são convertidos para estados internos', () => {
  assert.equal(subscriptionStatusForAsaasEvent('PAYMENT_CONFIRMED'), 'active');
  assert.equal(subscriptionStatusForAsaasEvent('PAYMENT_OVERDUE'), 'past_due');
  assert.equal(subscriptionStatusForAsaasEvent('SUBSCRIPTION_DELETED'), 'canceled');
  assert.equal(subscriptionStatusForAsaasEvent('PAYMENT_CREATED'), null);
});

test('identifica a assinatura e o período nos payloads do Asaas', () => {
  assert.equal(externalSubscriptionId({ payment: { subscription: 'sub_1' } }), 'sub_1');
  assert.equal(externalSubscriptionId({ subscription: { id: 'sub_2' } }), 'sub_2');
  assert.equal(periodEndForPayload({ payment: { dueDate: '2026-10-10' } }), '2026-10-10');
});

test('cria cliente, assinatura mensal e recupera o link da primeira cobrança', async () => {
  const calls = [];
  const responses = [{ data: [] }, { id: 'cus_1' }, { data: [] }, { id: 'sub_1' }, { data: [{ id: 'pay_1', invoiceUrl: 'https://sandbox.asaas.com/i/1', dueDate: '2026-09-09' }] }];
  const request = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => responses.shift() };
  };
  const result = await createClinicSubscription(
    { enabled: true, apiKey: 'key', baseUrl: 'https://api-sandbox.asaas.com/v3' },
    { id: 'clinica-1', name: 'Clínica Teste', cnpj: '12.345.678/0001-95', email: 'admin@teste.com' },
    { name: 'Profissional', monthlyPriceCents: 29900 }, 'PIX', request
  );
  assert.equal(result.subscriptionId, 'sub_1');
  assert.equal(result.paymentUrl, 'https://sandbox.asaas.com/i/1');
  assert.equal(JSON.parse(calls[3].options.body).value, 299);
  assert.equal(JSON.parse(calls[3].options.body).cycle, 'MONTHLY');
});

test('não envia assinatura sem documento válido ou forma de pagamento aceita', async () => {
  const config = { enabled: true, apiKey: 'key', baseUrl: 'https://api-sandbox.asaas.com/v3' };
  const clinic = { id: 'c1', name: 'Clínica', cnpj: '123', email: 'a@b.com' };
  await assert.rejects(() => createClinicSubscription(config, clinic, { monthlyPriceCents: 14900 }, 'PIX'), /CPF ou CNPJ/);
  await assert.rejects(() => createClinicSubscription(config, { ...clinic, cnpj: '12345678901' }, { monthlyPriceCents: 14900 }, 'CARD'), /boleto ou Pix/);
});
