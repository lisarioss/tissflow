const platformSessionKey = 'tiss-platform-session';
let platformSession = JSON.parse(sessionStorage.getItem(platformSessionKey) || 'null');
let platformClinics = [];
const statusLabels = { trialing: 'Em teste', trial_expired: 'Teste encerrado', active: 'Ativa', past_due: 'Pagamento pendente', canceled: 'Cancelada' };
const leadStatusLabels = { new: 'Novo', contacted: 'Contatado', converted: 'Convertido', discarded: 'Descartado' };
const phoneDigits = value => { const digits = String(value || '').replace(/\D/g, ''); return /^\d{10,11}$/.test(digits) ? `55${digits}` : digits; };

async function platformRequest(path, options = {}) {
  const response = await fetch(`/api/platform${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(platformSession?.token ? { Authorization: `Bearer ${platformSession.token}` } : {}), ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível acessar a plataforma.');
  return payload;
}

function showPlatform(login) {
  document.querySelector('#platform-login').hidden = !login;
  document.querySelector('#platform-dashboard').hidden = login;
  if (!login) document.querySelector('#platform-admin-name').textContent = platformSession?.admin?.name || '';
}

function formatDate(value) {
  return value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informada';
}

function renderClinics(query = '') {
  const term = query.trim().toLocaleLowerCase('pt-BR');
  const rows = platformClinics.filter(item => `${item.name} ${item.unit}`.toLocaleLowerCase('pt-BR').includes(term));
  document.querySelector('#platform-clinics').innerHTML = rows.length ? rows.map(item => `<tr><td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.unit)}${item.cnpj ? ` · ${escapeHtml(item.cnpj)}` : ''}</small></td><td><a class="contact-email" href="mailto:${encodeURIComponent(item.adminEmail || '')}">${escapeHtml(item.adminEmail || 'Não informado')}</a></td><td><strong>${escapeHtml(item.plan?.name || item.planCode)}</strong><small>${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((item.plan?.monthlyPriceCents || 0) / 100)}/mês</small></td><td><span class="status ${item.effectiveStatus}">${statusLabels[item.effectiveStatus] || item.effectiveStatus}</span></td><td>${item.patients}<small>de ${item.plan?.patientLimit || 'ilimitado'}</small></td><td>${item.users}<small>de ${item.plan?.userLimit || 'ilimitado'}</small></td><td>${formatDate(item.trialEnd || item.currentPeriodEnd)}</td><td><div class="commercial-actions"><select data-plan-clinic="${item.id}" aria-label="Plano de ${escapeHtml(item.name)}"><option value="essential" ${item.planCode === 'essential' ? 'selected' : ''}>Essencial</option><option value="professional" ${item.planCode === 'professional' ? 'selected' : ''}>Profissional</option><option value="network" ${item.planCode === 'network' ? 'selected' : ''}>Rede</option></select><select data-trial-clinic="${item.id}" aria-label="Prorrogar teste de ${escapeHtml(item.name)}"><option value="">Prorrogar teste</option><option value="7">+7 dias</option><option value="15">+15 dias</option><option value="30">+30 dias</option></select></div></td></tr>`).join('') : '<tr><td colspan="8" class="empty">Nenhuma clínica encontrada.</td></tr>';
}

function renderLeads(leads = []) {
  document.querySelector('#platform-leads').innerHTML = leads.length ? leads.map(lead => `<tr><td><strong>${escapeHtml(lead.contactName)}</strong><small><a class="contact-email" href="mailto:${encodeURIComponent(lead.email)}">${escapeHtml(lead.email)}</a>${lead.phone ? ` · ${escapeHtml(lead.phone)}` : ''}</small></td><td><strong>${escapeHtml(lead.clinicName)}</strong></td><td>${escapeHtml(lead.clinicSize || 'Não informado')}</td><td>${escapeHtml({ essential: 'Essencial', professional: 'Profissional', network: 'Rede' }[lead.planCode] || lead.planCode)}</td><td>${new Date(`${lead.createdAt.replace(' ', 'T')}Z`).toLocaleString('pt-BR')}</td><td><select data-lead-id="${lead.id}"><option value="new" ${lead.status === 'new' ? 'selected' : ''}>Novo</option><option value="contacted" ${lead.status === 'contacted' ? 'selected' : ''}>Contatado</option><option value="converted" ${lead.status === 'converted' ? 'selected' : ''}>Convertido</option><option value="discarded" ${lead.status === 'discarded' ? 'selected' : ''}>Descartado</option></select></td></tr>`).join('') : '<tr><td colspan="6" class="empty">Nenhum contato comercial recebido.</td></tr>';
}

function escapeHtml(value) {
  const element = document.createElement('span'); element.textContent = value || ''; return element.innerHTML;
}

async function loadOverview() {
  try {
    const data = await platformRequest('/overview');
    platformClinics = data.clinics;
    document.querySelector('#platform-stats').innerHTML = `<article><span>Clínicas</span><strong>${data.totals.clinics}</strong></article><article><span>Em teste</span><strong>${data.totals.trials}</strong></article><article><span>Assinaturas ativas</span><strong>${data.totals.active}</strong></article><article class="attention"><span>Precisam de atenção</span><strong>${data.totals.attention}</strong></article>`;
    const currency = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
    document.querySelector('#commercial-stats').innerHTML = `<article><span>Receita recorrente mensal</span><strong>${currency(data.commercial.mrrCents)}</strong><small>Somente assinaturas ativas</small></article><article><span>Projeção anual</span><strong>${currency(data.commercial.arrCents)}</strong><small>MRR atual × 12 meses</small></article><article><span>Potencial dos testes</span><strong>${currency(data.commercial.trialPotentialCents)}</strong><small>Se todos os testes converterem</small></article><article><span>Distribuição dos planos</span><strong>${data.commercial.planDistribution.map(item => `${item.planCode}: ${item.count}`).join(' · ')}</strong><small>Clínicas por plano</small></article>`;
    const leadTotals = data.commercial.leadTotals || {};
    document.querySelector('#lead-summary').innerHTML = `<span><b>${leadTotals.new || 0}</b> novos</span><span><b>${leadTotals.contacted || 0}</b> contatados</span><span><b>${leadTotals.converted || 0}</b> convertidos</span>`;
    const trialCard = document.querySelector('#trial-alert-card');
    trialCard.hidden = !data.commercial.expiringTrials.length;
    document.querySelector('#trial-alerts').innerHTML = data.commercial.expiringTrials.map(item => { const message = encodeURIComponent(`Olá! O período de teste do TISSFlow da ${item.name} termina ${item.daysRemaining === 0 ? 'hoje' : `em ${item.daysRemaining} dia(s)`}. Posso ajudar na continuidade?`); const phone = phoneDigits(item.phone); return `<div><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.plan?.name || item.planCode)} · ${item.daysRemaining === 0 ? 'vence hoje' : `${item.daysRemaining} dia(s)`}</small></span><span class="trial-contact-actions">${item.adminEmail ? `<a href="mailto:${encodeURIComponent(item.adminEmail)}?subject=${encodeURIComponent('Continuidade do teste TISSFlow')}&body=${message}">E-mail</a>` : ''}${phone ? `<a href="https://wa.me/${phone}?text=${message}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</span></div>`; }).join('');
    document.querySelector('#platform-generated-at').textContent = `Atualizado em ${new Date(data.generatedAt).toLocaleString('pt-BR')}`;
    renderLeads(data.leads || []);
    renderClinics(document.querySelector('#platform-search').value);
    await loadReadiness();
    await loadPlatformAudit();
    await loadLegalAcceptances();
  } catch (error) {
    if (/sessão|token|inativo/i.test(error.message)) { sessionStorage.removeItem(platformSessionKey); platformSession = null; showPlatform(true); }
    document.querySelector('#platform-login-message').textContent = error.message;
  }
}

async function loadLegalAcceptances() {
  const rows = await platformRequest('/legal-acceptances');
  document.querySelector('#platform-legal-acceptances').innerHTML = rows.length ? rows.map(item => `<tr><td><strong>${escapeHtml(item.clinicName)}</strong></td><td>${escapeHtml(item.userName)}<small>${escapeHtml(item.email)}</small></td><td>${escapeHtml(item.termsVersion)}</td><td>${escapeHtml(item.privacyVersion)}</td><td>${new Date(`${item.acceptedAt.replace(' ', 'T')}Z`).toLocaleString('pt-BR')}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">Nenhum aceite registrado. Clínicas antigas podem ter sido criadas antes deste controle.</td></tr>';
}

async function loadReadiness() {
  const readiness = await platformRequest('/readiness');
  const status = document.querySelector('#readiness-status');
  status.textContent = readiness.ready ? 'Pronto para publicar' : 'Configuração pendente';
  status.className = `status ${readiness.ready ? 'ready' : 'pending'}`;
  document.querySelector('#readiness-summary').textContent = `${readiness.completed} de ${readiness.total} requisitos concluídos.`;
  document.querySelector('#readiness-checks').innerHTML = readiness.checks.map(check => `<article class="${check.ready ? '' : 'pending'}"><b>${check.ready ? '✓' : '!'}</b><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail)}</small></article>`).join('');
}

async function loadPlatformSettings() {
  const settings = await platformRequest('/settings');
  const form = document.querySelector('#platform-settings-form');
  Object.entries(settings).forEach(([name, value]) => { if (form.elements[name]) form.elements[name].value = value || ''; });
}

async function loadPlatformAudit() {
  const logs = await platformRequest('/audit');
  document.querySelector('#platform-audit').innerHTML = logs.length ? logs.map(log => {
    const title = { change_plan: 'Plano alterado', extend_trial: 'Teste prorrogado', change_platform_password: 'Senha da plataforma alterada', export_commercial_csv: 'Carteira comercial exportada' }[log.action] || log.action;
    const detail = log.action === 'change_plan' ? `${escapeHtml(log.details.from)} → ${escapeHtml(log.details.to)}` : log.action === 'extend_trial' ? `Novo vencimento: ${formatDate(log.details.trialEnd)}` : log.action === 'export_commercial_csv' ? `${log.details.clinicCount || 0} clínica(s)` : 'Sessões anteriores encerradas';
    return `<div><span><strong>${title}</strong><small>${escapeHtml(log.clinicName || log.clinicId || 'Conta da plataforma')} · ${new Date(`${log.createdAt.replace(' ', 'T')}Z`).toLocaleString('pt-BR')}</small></span><small>${detail}</small></div>`;
  }).join('') : '<p class="empty">Nenhuma alteração comercial registrada.</p>';
}

document.querySelector('#platform-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const message = document.querySelector('#platform-login-message'); message.textContent = 'Entrando...';
  try {
    platformSession = await platformRequest('/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
    sessionStorage.setItem(platformSessionKey, JSON.stringify(platformSession)); message.textContent = ''; showPlatform(false); await loadOverview();
  } catch (error) { message.textContent = error.message; }
});
document.querySelector('#platform-refresh').addEventListener('click', loadOverview);
document.querySelector('#platform-export').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/platform/clinics.csv', { headers: { Authorization: `Bearer ${platformSession.token}` } });
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'Não foi possível exportar.'); }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `tissflow-clinicas-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url); await loadPlatformAudit();
  } catch (error) { alert(error.message); }
});
document.querySelector('#platform-search').addEventListener('input', event => renderClinics(event.target.value));
document.querySelector('#platform-clinics').addEventListener('change', async event => {
  const planClinic = event.target.dataset.planClinic;
  const trialClinic = event.target.dataset.trialClinic;
  try {
    if (planClinic) await platformRequest(`/clinics/${encodeURIComponent(planClinic)}/plan`, { method: 'PATCH', body: JSON.stringify({ planCode: event.target.value }) });
    if (trialClinic && event.target.value) await platformRequest(`/clinics/${encodeURIComponent(trialClinic)}/extend-trial`, { method: 'POST', body: JSON.stringify({ days: Number(event.target.value) }) });
    await loadOverview();
  } catch (error) { alert(error.message); await loadOverview(); }
});
document.querySelector('#platform-leads').addEventListener('change', async event => {
  if (!event.target.dataset.leadId) return;
  try { await platformRequest(`/leads/${encodeURIComponent(event.target.dataset.leadId)}`, { method: 'PATCH', body: JSON.stringify({ status: event.target.value }) }); await loadOverview(); }
  catch (error) { alert(error.message); await loadOverview(); }
});
document.querySelector('#platform-logout').addEventListener('click', () => { sessionStorage.removeItem(platformSessionKey); platformSession = null; showPlatform(true); });
document.querySelector('#platform-password-toggle').addEventListener('click', () => { const card = document.querySelector('#platform-password-card'); card.hidden = !card.hidden; });
document.querySelector('#platform-settings-toggle').addEventListener('click', async () => { const card = document.querySelector('#platform-settings-card'); card.hidden = !card.hidden; if (!card.hidden) await loadPlatformSettings(); });
document.querySelector('#platform-settings-form').addEventListener('submit', async event => { event.preventDefault(); const message = document.querySelector('#platform-settings-message'); try { const result = await platformRequest('/settings', { method:'PUT', body:JSON.stringify(Object.fromEntries(new FormData(event.target))) }); message.textContent = result.message; await loadPlatformAudit(); } catch(error) { message.textContent = error.message; } });
document.querySelector('#platform-password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const message = document.querySelector('#platform-password-message');
  if (data.newPassword !== data.confirmation) { message.textContent = 'A confirmação não corresponde à nova senha.'; return; }
  try {
    const result = await platformRequest('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: data.currentPassword, newPassword: data.newPassword }) });
    platformSession.token = result.token; sessionStorage.setItem(platformSessionKey, JSON.stringify(platformSession));
    event.target.reset(); message.textContent = 'Senha atualizada. As outras sessões foram encerradas.'; await loadPlatformAudit();
  } catch (error) { message.textContent = error.message; }
});

showPlatform(!platformSession);
if (platformSession) loadOverview();
