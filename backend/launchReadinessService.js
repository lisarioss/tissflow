function launchReadiness(input = {}) {
  const legal = input.legalSettings || {};
  const checks = [
    { id: 'environment', label: 'Ambiente de produção', ready: Boolean(input.production), detail: input.production ? 'NODE_ENV configurado para produção' : 'Aplicação executando em modo local' },
    { id: 'billing', label: 'Cobrança recorrente', ready: Boolean(input.billingConfigured), detail: input.billingConfigured ? 'Asaas configurado' : 'Informe chave e webhook do Asaas' },
    { id: 'password-reset', label: 'Recuperação de senha', ready: Boolean(input.passwordResetConfigured), detail: input.passwordResetConfigured ? 'Entrega por e-mail configurada' : 'Configure o webhook de entrega de e-mail' },
    { id: 'legal', label: 'Identidade jurídica', ready: Boolean(legal.legalName && legal.cnpj && legal.supportEmail && legal.privacyEmail), detail: legal.legalName && legal.cnpj && legal.supportEmail && legal.privacyEmail ? 'Dados institucionais preenchidos' : 'Complete razão social, CNPJ e canais oficiais' },
    { id: 'demo', label: 'Dados demonstrativos', ready: !input.demoEnabled, detail: input.demoEnabled ? 'Desative os dados demo antes da publicação' : 'Dados demo desativados' },
    { id: 'storage', label: 'Armazenamento persistente', ready: Boolean(input.dataDirectoryConfigured), detail: input.dataDirectoryConfigured ? 'Volume de dados configurado' : 'Configure DATA_DIR para produção' }
  ];
  return { ready: checks.every(check => check.ready), completed: checks.filter(check => check.ready).length, total: checks.length, checks };
}
module.exports = { launchReadiness };
