function productionConfigurationChecks(env = {}) {
  const domain = String(env.DOMAIN || '').trim();
  const jwt = String(env.JWT_SECRET || '');
  const checks = [
    ['NODE_ENV', env.NODE_ENV === 'production', 'deve ser production'],
    ['DOMAIN', Boolean(domain && !/localhost|seu-dominio/i.test(domain)), 'informe o domínio público'],
    ['JWT_SECRET', jwt.length >= 32 && !/change-this|secret|senha/i.test(jwt), 'use pelo menos 32 caracteres aleatórios'],
    ['PLATFORM_ADMIN_EMAIL', /^\S+@\S+\.\S+$/.test(String(env.PLATFORM_ADMIN_EMAIL || '')), 'informe um e-mail válido'],
    ['PLATFORM_ADMIN_PASSWORD', String(env.PLATFORM_ADMIN_PASSWORD || '').length >= 12 && !/use-uma|troque|exemplo/i.test(String(env.PLATFORM_ADMIN_PASSWORD || '')), 'use uma senha real de pelo menos 12 caracteres'],
    ['ASAAS_API_KEY', Boolean(String(env.ASAAS_API_KEY || '').trim()), 'configure a chave do Asaas'],
    ['ASAAS_WEBHOOK_TOKEN', String(env.ASAAS_WEBHOOK_TOKEN || '').length >= 24, 'use um token de webhook forte'],
    ['PASSWORD_RESET_WEBHOOK_URL', /^https:\/\//.test(String(env.PASSWORD_RESET_WEBHOOK_URL || '')) && !/example|seu-servico/i.test(String(env.PASSWORD_RESET_WEBHOOK_URL || '')), 'informe o webhook HTTPS real de e-mail'],
    ['PASSWORD_RESET_WEBHOOK_SECRET', String(env.PASSWORD_RESET_WEBHOOK_SECRET || '').length >= 24 && !/gere|troque|exemplo/i.test(String(env.PASSWORD_RESET_WEBHOOK_SECRET || '')), 'use um segredo forte real'],
    ['ENABLE_DEMO_DATA', String(env.ENABLE_DEMO_DATA).toLowerCase() === 'false', 'deve ser false'],
    ['TRUST_PROXY', String(env.TRUST_PROXY).toLowerCase() === 'true', 'deve ser true atrás do Caddy']
  ].map(([id, ready, detail]) => ({ id, ready, detail }));
  return { ready: checks.every(item => item.ready), checks };
}
module.exports = { productionConfigurationChecks };
