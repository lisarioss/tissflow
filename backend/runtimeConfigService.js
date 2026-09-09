function truthy(value) { return String(value || '').toLowerCase() === 'true'; }

function validateRuntimeConfig(environment = process.env) {
  const production = environment.NODE_ENV === 'production';
  const port = Number(environment.PORT || 3000);
  const jwtSecret = String(environment.JWT_SECRET || '');
  const origins = String(environment.CORS_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  const demoEnabled = environment.ENABLE_DEMO_DATA === undefined ? !production : truthy(environment.ENABLE_DEMO_DATA);
  const errors = [];
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('PORT deve ser um número entre 1 e 65535.');
  if (!jwtSecret) errors.push('JWT_SECRET é obrigatório.');
  if (production && (jwtSecret.length < 32 || /change-this|secret|senha/i.test(jwtSecret))) errors.push('JWT_SECRET deve ter pelo menos 32 caracteres aleatórios em produção.');
  if (production && demoEnabled) errors.push('ENABLE_DEMO_DATA deve ser false em produção.');
  if (production && !origins.length) errors.push('CORS_ORIGINS deve informar o domínio HTTPS da aplicação.');
  if (production && origins.some(origin => !origin.startsWith('https://'))) errors.push('Todas as CORS_ORIGINS devem usar HTTPS em produção.');
  if (production && !truthy(environment.TRUST_PROXY)) errors.push('TRUST_PROXY deve ser true em produção atrás do proxy HTTPS.');
  if (demoEnabled && !environment.DEMO_PASSWORD) errors.push('DEMO_PASSWORD é obrigatório quando os dados de demonstração estão ativos.');
  if (errors.length) throw new Error(`Configuração insegura:\n- ${errors.join('\n- ')}`);
  return { production, port, jwtSecret, origins, demoEnabled, trustProxy: truthy(environment.TRUST_PROXY) };
}

module.exports = { validateRuntimeConfig, truthy };
