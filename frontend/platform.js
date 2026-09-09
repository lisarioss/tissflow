const platformSessionKey = 'tiss-platform-session';
let platformSession = JSON.parse(sessionStorage.getItem(platformSessionKey) || 'null');
let platformClinics = [];
const statusLabels = { trialing: 'Em teste', trial_expired: 'Teste encerrado', active: 'Ativa', past_due: 'Pagamento pendente', canceled: 'Cancelada' };

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
    const trialCard = document.querySelector('#trial-alert-card');
    trialCard.hidden = !data.commercial.expiringTrials.length;
    document.querySelector('#trial-alerts').innerHTML = data.commercial.expiringTrials.map(item => `<div><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.plan?.name || item.planCode)}</small></span><strong>${item.daysRemaining === 0 ? 'Vence hoje' : `${item.daysRemaining} dia(s)`}</strong></div>`).join('');
    document.querySelector('#platform-generated-at').textContent = `Atualizado em ${new Date(data.generatedAt).toLocaleString('pt-BR')}`;
    renderClinics(document.querySelector('#platform-search').value);
    await loadPlatformAudit();
  } catch (error) {
    if (/sessão|token|inativo/i.test(error.message)) { sessionStorage.removeItem(platformSessionKey); platformSession = null; showPlatform(true); }
    document.querySelector('#platform-login-message').textContent = error.message;
  }
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
document.querySelector('#platform-logout').addEventListener('click', () => { sessionStorage.removeItem(platformSessionKey); platformSession = null; showPlatform(true); });
document.querySelector('#platform-password-toggle').addEventListener('click', () => { const card = document.querySelector('#platform-password-card'); card.hidden = !card.hidden; });
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
