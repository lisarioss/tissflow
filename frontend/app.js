const clinicProfiles = { sabia: { name: 'Clínica Sabiá', unit: 'Unidade Centro', initials: 'CS' }, vital: { name: 'Instituto Vital', unit: 'Unidade Jardins', initials: 'IV' } };
const clinicUsers = {
  sabia: [
    { id: 'marina', name: 'Marina Souza', email: 'marina@clinicasabia.com.br', role: 'admin', roleLabel: 'Administradora' },
    { id: 'julia', name: 'Júlia Rocha', email: 'recepcao@clinicasabia.com.br', role: 'recepcao', roleLabel: 'Recepção' },
    { id: 'fernando', name: 'Fernando Diniz', email: 'faturamento@clinicasabia.com.br', role: 'faturamento', roleLabel: 'Faturamento' },
    { id: 'camila', name: 'Camila Lopes', email: 'medica@clinicasabia.com.br', role: 'medico', roleLabel: 'Médica' }
  ],
  vital: [
    { id: 'paulo', name: 'Paulo Mendes', email: 'paulo@institutovital.com.br', role: 'admin', roleLabel: 'Gestor financeiro' },
    { id: 'leticia', name: 'Letícia Souza', email: 'recepcao@institutovital.com.br', role: 'recepcao', roleLabel: 'Recepção' },
    { id: 'bruno', name: 'Bruno Costa', email: 'faturamento@institutovital.com.br', role: 'faturamento', roleLabel: 'Faturamento' }
  ]
};
const activeSession = JSON.parse(localStorage.getItem('tiss-session') || 'null');
const activeClinicId = activeSession?.clinicId || 'sabia';
const activeClinic = activeSession?.clinic || clinicProfiles[activeClinicId] || { id: activeClinicId, name: 'Clínica', unit: 'Unidade principal' };
const roleLabels = { admin: 'Administradora', faturamento: 'Faturamento', recepcao: 'Recepção', medico: 'Médica' };
const activeUser = activeSession?.user || (activeSession ? (clinicUsers[activeClinicId] || []).find(user => user.id === activeSession.userId) : null);
const clinicStorageKey = key => `tiss-${activeClinicId}-${key}`;
const apiBase = '/api';
const moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const defaultGuides = [
  { id: 'G-2026-00481', patient: 'Helena Martins', procedure: 'Consulta ambulatorial', insurer: 'Unimed', competence: '2026-08', status: 'approved', label: 'Aprovada', date: '18 ago, 2026', value: 'R$ 180,00' },
  { id: 'G-2026-00480', patient: 'Rafael Nogueira', procedure: 'Sessão de fisioterapia', insurer: 'Bradesco Saúde', competence: '2026-08', status: 'review', label: 'Em análise', date: '18 ago, 2026', value: 'R$ 120,00' },
  { id: 'G-2026-00479', patient: 'Bianca Torres', procedure: 'Ultrassonografia', insurer: 'SulAmérica', competence: '2026-08', status: 'error', label: 'Com pendência', date: '17 ago, 2026', value: 'R$ 260,00' },
  { id: 'G-2026-00478', patient: 'João Pedro Lima', procedure: 'Consulta ambulatorial', insurer: 'Amil', competence: '2026-08', status: 'sent', label: 'Enviada', date: '17 ago, 2026', value: 'R$ 180,00' }
];
let guides = JSON.parse(localStorage.getItem(clinicStorageKey('guides')) || 'null') || defaultGuides;
const defaultPatients = [
  { id: 'P-001', name: 'Helena Martins', birthDate: '1988-03-14', insurer: 'Unimed', ansCode: '004701', cardNumber: '0123456789012', plan: 'Unimed Nacional Apartamento', planValidity: '2027-12-31' },
  { id: 'P-002', name: 'Rafael Nogueira', birthDate: '2014-09-22', insurer: 'Bradesco Saúde', ansCode: '005711', cardNumber: '9876543210001', plan: 'Bradesco Efetivo', planValidity: '2027-06-30' },
  { id: 'P-003', name: 'Bianca Torres', birthDate: '1992-11-08', insurer: 'SulAmérica', ansCode: '006246', cardNumber: '2468135790004', plan: 'SulAmérica Exato', planValidity: '2026-12-31' }
];
let patients = JSON.parse(localStorage.getItem(clinicStorageKey('patients')) || 'null') || defaultPatients;
const defaultInvoices = [
  { id: 'NF-2026-001', guideId: 'G-2026-00481', provider: 'Apex Equipamentos', description: 'Material de consumo', amount: 1280, expectedDate: '2026-08-27', status: 'pending' },
  { id: 'NF-2026-002', guideId: 'G-2026-00478', provider: 'MediSupply', description: 'Produtos de apoio clínico', amount: 980, expectedDate: '2026-08-29', status: 'received' },
  { id: 'NF-2026-003', guideId: '', provider: 'Lab Plus', description: 'Reagentes e exames', amount: 2400, expectedDate: '2026-08-31', status: 'pending' }
];
let invoices = JSON.parse(localStorage.getItem(clinicStorageKey('invoices')) || 'null') || defaultInvoices;
const defaultAppointments = [
  { id: 'A-001', patient: 'Helena Martins', professional: 'Marina Souza', date: '2026-08-20', start: '09:00', duration: 50, type: 'Consulta' },
  { id: 'A-002', patient: 'Rafael Nogueira', professional: 'Marina Souza', date: '2026-08-20', start: '10:00', duration: 50, type: 'Consulta' },
  { id: 'A-003', patient: 'Bianca Torres', professional: 'Lucas Andrade', date: '2026-08-20', start: '09:30', duration: 60, type: 'Fisioterapia' }
];
let appointments = JSON.parse(localStorage.getItem(clinicStorageKey('appointments')) || 'null') || defaultAppointments;
let selectedAgendaDate = new Date().toISOString().slice(0, 10);
let glosas = JSON.parse(localStorage.getItem(clinicStorageKey('glosas')) || 'null') || [];
// Logos empacotados no projeto — usados só como enfeite visual no cabeçalho da
// guia. Convênios cadastrados depois via tela de Convênios não têm logo
// próprio e caem no fallback de texto (initials/nome), sem quebrar nada.
const insurerLogos = {
  'Unimed': { logo: 'UNIMED', logoPath: 'assets/planos/unimed.png' },
  'Bradesco Saúde': { logo: 'BRADESCO SAÚDE', logoPath: 'assets/planos/bradescosaude.png' },
  'SulAmérica': { logo: 'SULAMÉRICA', logoPath: 'assets/planos/sulamerica.png' },
  'Amil': { logo: 'AMIL', logoPath: 'assets/planos/amil.png' },
  'Promédica': { logo: 'PROMÉDICA', logoPath: 'assets/planos/promedica.png' }
};
const defaultInsurers = [
  { id: 'INS-001', name: 'Unimed', ansCode: '004701', contactEmail: '', contactPhone: '', providerCode: '', deliveryFormat: 'both', acceptedProcedures: ['10101012', '50000470', '50000000', '40901122'] },
  { id: 'INS-002', name: 'Bradesco Saúde', ansCode: '005711', contactEmail: '', contactPhone: '', deliveryFormat: 'pdf', acceptedProcedures: ['10101012', '50000470', '40901122'] },
  { id: 'INS-003', name: 'SulAmérica', ansCode: '006246', contactEmail: '', contactPhone: '', deliveryFormat: 'xml', acceptedProcedures: ['10101012', '50000470'] },
  { id: 'INS-004', name: 'Amil', ansCode: '326305', contactEmail: '', contactPhone: '', deliveryFormat: 'both', acceptedProcedures: ['10101012'] },
  { id: 'INS-005', name: 'Promédica', ansCode: '', contactEmail: '', contactPhone: '', deliveryFormat: 'pdf', acceptedProcedures: [] }
];
let insurers = JSON.parse(localStorage.getItem(clinicStorageKey('insurers')) || 'null') || defaultInsurers;
function saveInsurers() { localStorage.setItem(clinicStorageKey('insurers'), JSON.stringify(insurers)); }
let batches = JSON.parse(localStorage.getItem(clinicStorageKey('batches')) || 'null') || [];
function saveBatches() { localStorage.setItem(clinicStorageKey('batches'), JSON.stringify(batches)); }
let authorizations = JSON.parse(localStorage.getItem(clinicStorageKey('authorizations')) || 'null') || [];
function saveAuthorizations() { localStorage.setItem(clinicStorageKey('authorizations'), JSON.stringify(authorizations)); }
let feedbacks = JSON.parse(localStorage.getItem(clinicStorageKey('feedbacks')) || 'null') || [];
let patientDocuments = [];
let auditLogs = [];
let users = clinicUsers[activeClinicId] || [];
let selectedReportCompetence = '';
function saveFeedbacks() { localStorage.setItem(clinicStorageKey('feedbacks'), JSON.stringify(feedbacks)); }
let clinicSettings = JSON.parse(localStorage.getItem(clinicStorageKey('settings')) || 'null') || { tradeName: clinicProfiles[activeClinicId]?.name || '', legalName: '', cnpj: '', cnes: '', phone: '', instagram: '', address: '', city: '', state: '', postalCode: '', logoDataUrl: '', letterheadDataUrl: '', letterheadHeaderMm: 35, letterheadFooterMm: 25, owners: [], professionals: [] };
const views = { overview: 'Visão geral', alerts: 'Notificações', agenda: 'Agenda', guides: 'Guias TISS', authorizations: 'Controle de autorizações', batches: 'Lotes de faturamento', financeiro: 'Financeiro', users: 'Usuários', patients: 'Pacientes', convenios: 'Convênios', feedback: 'Feedbacks', reports: 'Relatórios', audit: 'Trilha de auditoria', settings: 'Configurações' };
const appView = document.querySelector('#app-view');
const breadcrumb = document.querySelector('#breadcrumb');
const toast = document.querySelector('#toast');
function procedureRulesToText(rules) {
  return (rules || []).map(rule => `${rule.code} | ${Number(rule.unitValue || 0).toFixed(2).replace('.', ',')} | ${rule.requiresAuthorization ? 'sim' : 'não'} | ${rule.maxSessions || 0} | ${rule.validFrom || ''} | ${rule.validTo || ''}`).join('\n');
}
function parseProcedureRules(value) {
  return String(value || '').split('\n').map(line => {
    const [code = '', rawValue = '0', authorization = 'não', maxSessions = '0', validFrom = '', validTo = ''] = line.split('|').map(part => part.trim());
    return { code, unitValue: Number(rawValue.replace(',', '.')), requiresAuthorization: /^s(im)?$/i.test(authorization), maxSessions: Number(maxSessions || 0), validFrom, validTo };
  }).filter(rule => /^\d+$/.test(rule.code) && Number.isFinite(rule.unitValue));
}
function enhanceInsurerForm() {
  const form = document.querySelector('#insurer-form');
  if (!form || form.querySelector('#new-insurer-rules')) return;
  const field = document.createElement('div');
  field.className = 'field contract-rules-field';
  field.innerHTML = '<div class="contract-heading"><div><label>Tabela contratada por procedimento</label><small>Pesquise na TUSS oficial e informe as regras negociadas com a operadora.</small></div><button type="button" class="secondary-button" data-action="add-contract-rule">＋ Adicionar procedimento</button></div><div id="contract-rule-list" class="contract-rule-list"></div><textarea id="new-insurer-rules" name="procedureRulesText" hidden></textarea>';
  form.querySelector('.form-section')?.append(field);
  const legacyCodes = form.querySelector('#new-insurer-procedures')?.closest('.field');
  if (legacyCodes) legacyCodes.hidden = true;
}
function contractRuleRow(rule = {}) {
  const row = document.createElement('div');
  row.className = 'contract-rule-row';
  row.dataset.code = rule.code || '';
  row.innerHTML = `<div class="contract-procedure"><label>Procedimento TUSS</label><input class="contract-procedure-search" type="search" autocomplete="off" placeholder="Código ou descrição" value="${rule.code || ''}" /><div class="contract-search-results" hidden></div></div><div><label>Valor contratado</label><input class="contract-value" type="number" min="0" step="0.01" value="${Number(rule.unitValue || 0).toFixed(2)}" /></div><div><label>Limite por guia</label><input class="contract-max-sessions" type="number" min="0" step="1" value="${rule.maxSessions || ''}" placeholder="Sem limite" /></div><div><label>Início da vigência</label><input class="contract-valid-from" type="date" value="${rule.validFrom || ''}" /></div><div><label>Fim da vigência</label><input class="contract-valid-to" type="date" value="${rule.validTo || ''}" /></div><label class="contract-authorization"><input class="contract-requires-authorization" type="checkbox" ${rule.requiresAuthorization ? 'checked' : ''} /> Exige autorização</label><div class="contract-row-actions"><button type="button" class="text-button" data-action="new-contract-adjustment">Novo reajuste</button><button type="button" class="finance-delete" data-action="remove-contract-rule">Remover</button></div>`;
  return row;
}
function renderContractRules(rules = []) {
  const list = document.querySelector('#contract-rule-list');
  if (!list) return;
  list.replaceChildren(...rules.map(contractRuleRow));
  syncContractRules();
}
function syncContractRules() {
  const hidden = document.querySelector('#new-insurer-rules');
  if (!hidden) return;
  const rules = [...document.querySelectorAll('.contract-rule-row')].map(row => ({ code: row.dataset.code || '', unitValue: Number(row.querySelector('.contract-value')?.value || 0), requiresAuthorization: Boolean(row.querySelector('.contract-requires-authorization')?.checked), maxSessions: Number(row.querySelector('.contract-max-sessions')?.value || 0), validFrom: row.querySelector('.contract-valid-from')?.value || '', validTo: row.querySelector('.contract-valid-to')?.value || '' })).filter(rule => rule.code);
  hidden.value = procedureRulesToText(rules);
}
new MutationObserver(() => { enhanceInsurerForm(); enhanceAgendaFeedbackActions(); }).observe(appView, { childList: true, subtree: true });
const rolePermissions = {
  admin: ['overview', 'alerts', 'agenda', 'guides', 'authorizations', 'batches', 'financeiro', 'users', 'patients', 'convenios', 'feedback', 'reports', 'audit', 'settings'],
  faturamento: ['overview', 'alerts', 'guides', 'authorizations', 'batches', 'financeiro', 'reports'],
  recepcao: ['overview', 'alerts', 'agenda', 'authorizations', 'patients', 'feedback'],
  medico: ['overview', 'alerts', 'agenda', 'patients', 'feedback']
};
function userCan(view) { return (rolePermissions[activeUser?.role || 'admin'] || []).includes(view); }
function formatMoney(value) { return moneyFormatter.format(Number(value || 0)); }
function apiHeaders() { return activeSession?.token ? { Authorization: `Bearer ${activeSession.token}` } : {}; }
async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...apiHeaders(), ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível comunicar com a API.');
  return payload;
}
async function loadClinicOptions() {
  const select = document.querySelector('#login-clinic');
  if (!select) return;
  try {
    const clinics = await apiRequest('/clinics');
    const selected = select.value;
    select.replaceChildren(...clinics.map(clinic => { const option = document.createElement('option'); option.value = clinic.id; option.textContent = clinic.name; return option; }));
    if (clinics.some(clinic => clinic.id === selected)) select.value = selected;
  } catch { /* mantém as clínicas demonstrativas quando a API estiver indisponível */ }
}
function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}
async function downloadPatientDocument(documentId) {
  if (!activeSession?.token) { showToast('Entre pela API para baixar documentos.'); return; }
  const document = patientDocuments.find(item => item.id === documentId);
  try {
    const response = await fetch(`${apiBase}/patient-documents/${encodeURIComponent(documentId)}/download`, { headers: apiHeaders() });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || 'Não foi possível baixar o documento.'); }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url; link.download = document?.originalName || 'documento'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { showToast(error.message); }
}
let tussSearchTimer;
let tussSearchSequence = 0;
let contractSearchTimer;
function closeTussResults() {
  const results = document.querySelector('#tuss-results');
  if (results) { results.hidden = true; results.replaceChildren(); }
}
function applyContractRule(code) {
  const insurerName = document.querySelector('#insurer')?.value;
  const insurer = insurers.find(item => item.name === insurerName);
  const rules = insurer?.procedureRules || [];
  const rule = contractRuleFor(rules, code, guideContractReferenceDate());
  const help = document.querySelector('#tuss-help');
  if (!rules.length) {
    if (help) help.textContent = 'Procedimento oficial selecionado. Este convênio ainda não possui tabela contratada.';
    return;
  }
  if (!rule) {
    if (help) help.textContent = `Atenção: ${insurerName} não possui este procedimento na tabela contratada.`;
    showToast(`Procedimento não configurado para ${insurerName}.`);
    return;
  }
  const value = document.querySelector('#value');
  if (value && rule.unitValue > 0) value.value = rule.unitValue.toFixed(2);
  const authorizedQuantity = document.querySelector('#authorized-quantity');
  if (authorizedQuantity && rule.maxSessions > 0) authorizedQuantity.value = rule.maxSessions;
  const validity = rule.validFrom || rule.validTo ? ` · vigência de referência ${rule.validFrom || 'aberta'} a ${rule.validTo || 'aberta'}` : '';
  const limit = rule.maxSessions > 0 ? ` · referência de ${rule.maxSessions} atendimentos` : '';
  if (help) help.textContent = `Referência do contrato ${insurerName}: ${formatMoney(rule.unitValue)}${rule.requiresAuthorization ? ' · exige autorização prévia' : ' · sem autorização prévia configurada'}${limit}${validity}. Valor, quantidade e competência podem ser ajustados para o faturamento mensal.`;
  if (rule.requiresAuthorization && !document.querySelector('#authorization-number')?.value) showToast('Este procedimento exige autorização prévia do convênio.');
}
function guideContractReferenceDate(data = {}) {
  const competence = data.competence || document.querySelector('#competence')?.value;
  if (competence) return `${competence}-01`;
  return data.date || document.querySelector('#date')?.value || '';
}
function contractRuleFor(rules, code, referenceDate) {
  const versions = (rules || []).filter(rule => rule.code === code);
  const applicable = versions.filter(rule => (!rule.validFrom || !referenceDate || rule.validFrom <= referenceDate) && (!rule.validTo || !referenceDate || rule.validTo >= referenceDate));
  return [...(applicable.length ? applicable : versions)].sort((first, second) => String(second.validFrom || '').localeCompare(String(first.validFrom || '')))[0];
}
function contractValidationMessage(data) {
  const insurer = insurers.find(item => item.name === data.insurer);
  const rules = insurer?.procedureRules || [];
  if (!rules.length) return '';
  const rule = contractRuleFor(rules, data.serviceCode, guideContractReferenceDate(data));
  if (!rule) return `O procedimento ${data.serviceCode} não está na tabela contratada com ${data.insurer}.`;
  if (rule.requiresAuthorization && !String(data.authorizationNumber || '').trim()) return `Informe o número da autorização prévia exigida por ${data.insurer}.`;
  return '';
}
async function searchTussTerms(query) {
  const results = document.querySelector('#tuss-results');
  if (!results || query.length < 2) { closeTussResults(); return; }
  const sequence = ++tussSearchSequence;
  results.hidden = false;
  results.textContent = 'Buscando na tabela oficial…';
  try {
    const catalog = await apiRequest(`/tuss?query=${encodeURIComponent(query)}&limit=10`);
    if (sequence !== tussSearchSequence || !document.querySelector('#tuss-results')) return;
    results.replaceChildren();
    if (!catalog.terms.length) { results.textContent = 'Nenhum procedimento vigente encontrado.'; return; }
    catalog.terms.forEach(term => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tuss-result';
      button.dataset.code = term.code;
      button.dataset.term = term.term;
      const code = document.createElement('strong');
      code.textContent = term.code;
      const description = document.createElement('span');
      description.textContent = term.term;
      button.append(code, description);
      results.append(button);
    });
  } catch (error) {
    if (sequence === tussSearchSequence) results.textContent = error.message;
  }
}
document.addEventListener('submit', event => {
  if (event.target.id !== 'guide-form') return;
  const data = Object.fromEntries(new FormData(event.target));
  let message = '';
  let target = '#procedure';
  if (!data.serviceCode || !data.procedure?.startsWith(`${data.serviceCode} - `)) message = 'Selecione um procedimento na lista oficial TUSS.';
  else {
    message = contractValidationMessage(data);
    if (message.includes('autorização')) target = '#authorization-number';
    if (message.includes('valor')) target = '#value';
  }
  if (!message) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  showToast(message);
  document.querySelector(target)?.focus();
}, true);
function normalizeGuide(guide) { const sessions = guide.sessions || []; const competence = guide.competence || sessions[0]?.date?.slice(0, 7) || ''; return { ...guide, competence, sessions, status: guide.status, label: { sent: 'Enviada', review: 'Em análise', approved: 'Aprovada', error: 'Com glosa', recurso: 'Recurso enviado' }[guide.status] || guide.status, value: formatMoney((guide.valueCents || 0) / 100), unitValue: Number(guide.unitValueCents || 0) / 100, date: guide.createdAt ? new Date(guide.createdAt).toLocaleDateString('pt-BR') : '' }; }
function normalizeInvoice(invoice) { return { ...invoice, amount: Number(invoice.amountCents || 0) / 100 }; }
function normalizeGlosa(glosa) { return { ...glosa, amount: Number(glosa.amountCents || 0) / 100 }; }
function normalizeBatch(batch) { return { ...batch, totalValue: Number(batch.totalValueCents || 0) / 100, guides: batch.guides || [] }; }
async function loadApiData() {
  if (!activeSession?.token) return;
  try {
    const permittedRequest = (allowed, path, fallback = []) => allowed ? apiRequest(path) : Promise.resolve(fallback);
    const canReadFinancial = userCan('financeiro');
    const canReadFeedbacks = userCan('feedback');
    const [apiGuides, apiInvoices, apiPatients, apiGlosas, apiInsurers, apiFeedbacks, apiSettings, apiBatches, apiAuthorizations, apiPatientDocuments, apiAppointments] = await Promise.all([
      apiRequest('/guides'),
      permittedRequest(canReadFinancial, '/invoices'),
      apiRequest('/patients'),
      permittedRequest(canReadFinancial, '/glosas'),
      apiRequest('/insurers'),
      permittedRequest(canReadFeedbacks, '/feedbacks'),
      apiRequest('/settings'),
      permittedRequest(userCan('batches'), '/batches'),
      apiRequest('/authorizations'),
      permittedRequest(userCan('patients'), '/patient-documents'),
      permittedRequest(userCan('agenda'), '/appointments')
    ]);
    guides = apiGuides.map(normalizeGuide);
    invoices = apiInvoices.map(normalizeInvoice);
    if (apiPatients.length) patients = apiPatients;
    glosas = apiGlosas.map(normalizeGlosa);
    if (apiInsurers.length) insurers = apiInsurers;
    feedbacks = apiFeedbacks;
    clinicSettings = apiSettings;
    batches = apiBatches.map(normalizeBatch);
    authorizations = apiAuthorizations;
    patientDocuments = apiPatientDocuments;
    if (userCan('agenda')) appointments = apiAppointments;
    if (userCan('audit')) auditLogs = await apiRequest('/audit-logs');
    if (userCan('users')) users = await apiRequest('/users');
    updateNotificationBadge();
    render();
  } catch (error) {
    showToast(`Modo local: ${error.message}`);
  }
}
function saveGlosas() { localStorage.setItem(clinicStorageKey('glosas'), JSON.stringify(glosas)); }

function statusTag(guide) { return `<span class="status ${guide.status}">${guide.label}</span>`; }
function configuredProfessionals() {
  return clinicSettings.professionals?.length ? clinicSettings.professionals : [
    { name: 'Marina Souza', title: 'Médica', council: 'CRM 12345' },
    { name: 'Lucas Andrade', title: 'Fisioterapeuta', council: 'CREFITO 8812' }
  ];
}
function professionalOptions(includeRegister = false) {
  return configuredProfessionals().map(person => `<option value="${person.name}"${includeRegister ? ` data-register="${person.council || ''}"` : ''}>${person.name}${person.council ? ` · ${person.council}` : ''}</option>`).join('');
}
function tussProcedureField() {
  return `<div class="field tuss-field"><label for="procedure">Procedimento TUSS *</label><input id="procedure" name="procedure" type="search" required autocomplete="off" placeholder="Digite o código ou nome do procedimento" aria-autocomplete="list" aria-controls="tuss-results" /><div id="tuss-results" class="tuss-results" role="listbox" hidden></div><small id="tuss-help">Consulte por código ou descrição na tabela 22 oficial da ANS.</small></div>`;
}
function overview() {
  const guideAmount = guide => Number(guide.valueCents || 0) / 100 || Number(String(guide.value || '').replace(/[^0-9,]/g, '').replace(',', '.')) || 0;
  const latestCompetence = [...guides].map(guide => guide.competence).filter(Boolean).sort().at(-1) || new Date().toISOString().slice(0, 7);
  const monthGuides = guides.filter(guide => guide.competence === latestCompetence);
  const concluded = monthGuides.filter(guide => ['approved', 'error', 'recurso'].includes(guide.status));
  const approved = monthGuides.filter(guide => guide.status === 'approved').length;
  const approvalRate = concluded.length ? (approved / concluded.length * 100).toFixed(1).replace('.', ',') : '0,0';
  const reviewing = monthGuides.filter(guide => ['review', 'sent'].includes(guide.status)).length;
  const billed = monthGuides.reduce((sum, guide) => sum + guideAmount(guide), 0);
  const received = invoices.filter(invoice => invoice.status === 'received' && String(invoice.expectedDate || '').startsWith(latestCompetence)).reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayAppointments = appointments.filter(item => item.date === todayKey && item.status !== 'cancelled').length;
  const referenceDates = guides.flatMap(guide => [guide.createdAt?.slice(0, 10), ...(guide.sessions || []).map(session => session.date)]).filter(Boolean).sort();
  const chartEnd = referenceDates.length ? new Date(`${referenceDates.at(-1)}T12:00:00`) : new Date();
  const chartDays = Array.from({ length: 7 }, (_, index) => { const date = new Date(chartEnd); date.setDate(chartEnd.getDate() - 6 + index); return date; });
  const chartValues = chartDays.map(date => { const key = date.toISOString().slice(0, 10); return guides.filter(guide => guide.createdAt?.slice(0, 10) === key || (guide.sessions || []).some(session => session.date === key)).length; });
  const chartMax = Math.max(...chartValues, 1);
  const chartPoints = chartValues.map((value, index) => `${index * 116.67},${125 - value / chartMax * 105}`).join(' ');
  const recent = [...guides].sort((a, b) => String(b.createdAt || b.id).localeCompare(String(a.createdAt || a.id))).slice(0, 5);
  const activities = [
    ...guides.filter(guide => guide.status === 'error').slice(0, 2).map(guide => ({ warn: true, title: 'Guia com pendência', text: `${guide.id} · ${guide.patient}` })),
    ...batches.filter(batch => ['sent', 'processing', 'approved'].includes(batch.status)).slice(0, 2).map(batch => ({ title: `Lote ${batchStatusLabels[batch.status]}`, text: `${batch.id} · ${batch.insurer}` })),
    ...authorizations.filter(item => ['expired', 'expiring'].includes(authorizationState(item).key)).slice(0, 2).map(item => ({ warn: true, title: 'Autorização requer atenção', text: `${item.patient} · vence em ${new Date(`${item.validTo}T12:00:00`).toLocaleDateString('pt-BR')}` }))
  ].slice(0, 4);
  const competenceLabel = new Date(`${latestCompetence}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const canCreateGuide = userCan('guides');
  return `<div class="page-heading"><div><p class="eyebrow">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p><h1>Olá, ${activeUser?.name?.split(' ')[0] || 'equipe'}.</h1><p class="heading-copy">Dados reais da clínica · competência ${competenceLabel}.</p></div>${canCreateGuide ? '<button class="primary-button" data-action="new-guide">＋ Nova guia</button>' : ''}</div>
  <div class="stats-grid"><article class="stat-card"><div class="stat-top"><span>Guias na competência</span><span class="stat-icon">▣</span></div><div class="stat-value">${monthGuides.length}</div><div class="stat-note"><b>${monthGuides.filter(guide => guide.status === 'approved').length} aprovada(s)</b> no período</div></article><article class="stat-card"><div class="stat-top"><span>Taxa de aprovação</span><span class="stat-icon">◉</span></div><div class="stat-value">${approvalRate}%</div><div class="stat-note">Baseada em <b>${concluded.length} guia(s) concluída(s)</b></div></article><article class="stat-card"><div class="stat-top"><span>Em processamento</span><span class="stat-icon">◷</span></div><div class="stat-value">${reviewing}</div><div class="stat-note warn"><b>${notificationItems().length} alerta(s)</b> precisam de atenção</div></article><article class="stat-card"><div class="stat-top"><span>${userCan('financeiro') ? 'Valor faturado' : 'Atendimentos hoje'}</span><span class="stat-icon">◇</span></div><div class="stat-value">${userCan('financeiro') ? formatMoney(billed) : todayAppointments}</div><div class="stat-note">${userCan('financeiro') ? `<b>${formatMoney(received)}</b> recebido(s)` : '<b>Agenda atualizada</b> para hoje'}</div></article></div>
  <div class="content-grid"><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Guias recentes</h2><p class="panel-subtitle">Últimos registros da clínica</p></div>${userCan('guides') ? '<button class="text-button" data-view="guides">Ver todas →</button>' : ''}</div><table><thead><tr><th>Guia</th><th>Paciente</th><th>Convênio</th><th>Status</th><th>Valor</th></tr></thead><tbody>${recent.length ? recent.map(g => `<tr><td><strong>${g.id}</strong><small>${g.date || ''}</small></td><td>${g.patient}<small>${g.procedure}</small></td><td>${g.insurer}</td><td>${statusTag(g)}</td><td><strong>${userCan('financeiro') ? g.value : '—'}</strong></td></tr>`).join('') : '<tr><td colspan="5">Nenhuma guia cadastrada.</td></tr>'}</tbody></table></div><div class="panel activity"><div class="panel-header"><div><h2 class="panel-title">Atenção operacional</h2><p class="panel-subtitle">Pendências atuais</p></div></div>${activities.length ? activities.map(item => `<div class="activity-item"><span class="activity-dot ${item.warn ? 'orange' : ''}"></span><div><strong>${item.title}</strong><p>${item.text}</p></div></div>`).join('') : '<div class="patient-folder-empty">Nenhuma pendência operacional.</div>'}</div></div>
  <div class="panel" style="margin-top:18px"><div class="panel-header"><div><h2 class="panel-title">Volume de guias</h2><p class="panel-subtitle">Registros nos últimos 7 dias com atividade</p></div><span class="guide-type-tag">${chartValues.reduce((sum, value) => sum + value, 0)} movimentação(ões)</span></div><div class="chart-area"><div class="chart-grid"><svg class="chart-line" viewBox="0 0 700 140" preserveAspectRatio="none"><polyline points="${chartPoints}"/>${chartPoints.split(' ').map(point => { const [cx, cy] = point.split(','); return `<circle cx="${cx}" cy="${cy}" r="3"/>`; }).join('')}</svg></div><div class="chart-labels">${chartDays.map(date => `<span>${date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')}</span>`).join('')}</div></div></div>`;
}
function guideFormComplete() {
  return `<div class="page-heading"><div><p class="eyebrow">Guia SP/SADT · TISS 4.01</p><h1>Preencher guia TISS</h1><p class="heading-copy">Complete os dados da operadora, beneficiário, prestador e atendimento.</p></div><button class="secondary-button" data-view="overview">← Voltar</button></div>
  <form class="guide-form" id="guide-form">
    <div class="guide-plan-header"><div class="plan-logo"><img id="plan-logo-image" src="" alt="Logo da operadora" hidden /><span id="plan-logo">TISS</span></div><div><strong id="plan-name">Selecione a operadora</strong><small>Guia SP/SADT · padrão demonstrativo</small></div><span class="guide-code">Nº <b>G-2026-DEMO</b></span></div>
    <div class="form-section"><h2>1. Identificação da operadora</h2><p>Dados da empresa responsável pelo plano de saúde.</p><div class="form-grid"><div class="field"><label for="insurer">Operadora *</label><select id="insurer" name="insurer" required><option value="">Selecione a operadora</option>${insurers.map(insurer => `<option value="${insurer.name}" data-code="${insurer.ansCode || ''}" data-logo="${(insurerLogos[insurer.name] || {}).logo || insurer.name.toUpperCase()}" data-logo-path="${(insurerLogos[insurer.name] || {}).logoPath || ''}">${insurer.name}</option>`).join('')}</select></div><div class="field"><label for="ans-code">Código ANS</label><input id="ans-code" name="ansCode" readonly placeholder="Preenchido pela operadora" /></div><div class="field"><label for="authorization-number">Número da autorização</label><input id="authorization-number" name="authorizationNumber" placeholder="Se autorizado previamente" /></div><div class="field"><label for="authorized-quantity">Quantidade autorizada</label><input id="authorized-quantity" name="authorizedQuantity" type="number" min="1" placeholder="Se pré-autorizado" /></div><div class="field"><label for="operator-guide">Guia da operadora</label><input id="operator-guide" name="operatorGuide" placeholder="Número informado pela operadora" /></div></div></div>
    <div class="form-section"><h2>2. Beneficiário</h2><p>Selecione um paciente cadastrado para preencher automaticamente os dados do plano.</p><div class="form-grid"><div class="field"><label for="patient">Paciente *</label><select id="patient" name="patient" required><option value="">Selecione o paciente</option>${patients.map(patient => `<option value="${patient.name}" data-patient-id="${patient.id}">${patient.name} · ${patient.insurer}</option>`).join('')}</select></div><div class="field"><label for="card-number">Número da carteira *</label><input id="card-number" name="cardNumber" required placeholder="Preenchido pelo paciente" /></div><div class="field"><label for="patient-birth">Data de nascimento</label><input id="patient-birth" name="patientBirth" type="date" /></div><div class="field"><label for="patient-plan">Plano</label><input id="patient-plan" name="patientPlan" placeholder="Preenchido pelo paciente" /></div><div class="field"><label for="plan-validity">Validade do plano</label><input id="plan-validity" name="planValidity" type="date" /></div></div></div>
    <div class="form-section"><h2>3. Prestador executante</h2><p>Dados da clínica e do profissional que realizou o atendimento.</p><div class="form-grid"><div class="field"><label for="provider-name">Nome da clínica *</label><input id="provider-name" name="providerName" value="${clinicSettings.tradeName || 'Clínica Sabiá'}" required /></div><div class="field"><label for="provider-cnpj">CNPJ</label><input id="provider-cnpj" name="providerCnpj" value="${clinicSettings.cnpj || ''}" /></div><div class="field"><label for="professional">Profissional executante *</label><select id="professional" name="professional" required><option value="">Selecione o profissional</option>${professionalOptions(true)}</select></div><div class="field"><label for="professional-register">Registro profissional</label><input id="professional-register" name="professionalRegister" readonly placeholder="Preenchido pelo profissional" /></div></div></div>
    <div class="form-section"><h2>4. Atendimento e procedimento</h2><p>Informe o código TUSS, a data e os detalhes do serviço realizado.</p><div class="form-grid"><div class="field"><label for="date">Data do atendimento *</label><input id="date" name="date" type="date" required value="2026-08-20" /></div><div class="field"><label for="type">Tipo de atendimento *</label><select id="type" name="type" required><option value="">Selecione o tipo</option><option>Consulta</option><option>Exame</option><option>Terapia</option></select></div>${tussProcedureField()}<div class="field"><label for="quantity">Quantidade *</label><input id="quantity" name="quantity" type="number" min="1" value="1" required /></div><div class="field"><label for="value">Valor do procedimento *</label><input id="value" name="value" type="number" min="0.01" step="0.01" value="180" required /></div><div class="field"><label for="service-code">Código do serviço</label><input id="service-code" name="serviceCode" readonly placeholder="Extraído do TUSS" /></div><div class="field"><label for="cid">CID-10 principal</label><input id="cid" name="cid" placeholder="Ex.: F84.0" pattern="^[A-Za-z][0-9]{2}(\.[0-9]{1,2})?$" title="Formato esperado: letra + 2 dígitos, ex. F84 ou F84.0" /></div></div></div>
    <div class="form-section"><h2>5. Observações</h2><p>Informações complementares para conferência da operadora.</p><div class="field"><label for="notes">Observações da guia</label><textarea id="notes" name="notes" rows="4" placeholder="Justificativa, informações clínicas ou observações administrativas"></textarea></div></div>
    <div class="form-footer"><button type="button" class="secondary-button" data-view="guides">Cancelar</button><button type="submit" class="primary-button">Validar e gerar XML</button></div>
  </form>`;
}

function guideFormMonthly() {
  const form = guideFormComplete().replace('<form class="guide-form" id="guide-form">', '<form class="guide-form" id="guide-form"><input type="hidden" name="guideType" value="sp_sadt" />');
  return form.replace(
    '<div class="form-section"><h2>4. Atendimento e procedimento</h2><p>Informe o código TUSS, a data e os detalhes do serviço realizado.</p><div class="form-grid"><div class="field"><label for="date">Data do atendimento *</label><input id="date" name="date" type="date" required value="2026-08-20" /></div><div class="field"><label for="type">Tipo de atendimento *</label><select id="type" name="type" required><option value="">Selecione o tipo</option><option>Consulta</option><option>Exame</option><option>Terapia</option></select></div><div class="field"><label for="procedure">Procedimento TUSS *</label><select id="procedure" name="procedure" required><option value="">Selecione o procedimento</option><option value="10101012 - Consulta em consultório">10101012 · Consulta em consultório</option><option value="50000470 - Sessão de fisioterapia">50000470 · Sessão de fisioterapia</option><option value="40901122 - Ultrassonografia">40901122 · Ultrassonografia</option></select></div><div class="field"><label for="quantity">Quantidade *</label><input id="quantity" name="quantity" type="number" min="1" value="1" required /></div><div class="field"><label for="value">Valor do procedimento *</label><input id="value" name="value" type="number" min="0.01" step="0.01" value="180" required /></div><div class="field"><label for="service-code">Código do serviço</label><input id="service-code" name="serviceCode" readonly placeholder="Extraído do TUSS" /></div><div class="field"><label for="cid">CID-10 principal</label><input id="cid" name="cid" placeholder="Ex.: F84.0" pattern="^[A-Za-z][0-9]{2}(\.[0-9]{1,2})?$" title="Formato esperado: letra + 2 dígitos, ex. F84 ou F84.0" /></div></div></div>',
    `<div class="form-section"><h2>4. Competência e atendimentos</h2><p>Registre todos os atendimentos do mês, como nas terapias ABA e acompanhamentos recorrentes.</p><div class="form-grid"><div class="field"><label for="competence">Competência *</label><input id="competence" name="competence" type="month" required value="2026-08" /></div><div class="field"><label for="attendance-type">Tipo de atendimento *</label><select id="attendance-type" name="type" required><option value="">Selecione o tipo</option><option>Consulta</option><option>Exame</option><option>Terapia ABA</option><option>Fisioterapia</option><option>Fonoaudiologia</option><option>Terapia ocupacional</option></select></div>${tussProcedureField()}<div class="field"><label for="quantity">Quantidade prevista no mês</label><input id="quantity" name="quantity" type="number" min="1" value="1" /></div><div class="field"><label for="value">Valor por atendimento *</label><input id="value" name="value" type="number" min="0.01" step="0.01" value="180" required /></div><div class="field"><label for="service-code">Código do serviço</label><input id="service-code" name="serviceCode" readonly placeholder="Extraído do TUSS" /></div><div class="field"><label for="cid">CID-10 principal</label><input id="cid" name="cid" placeholder="Ex.: F84.0" pattern="^[A-Za-z][0-9]{2}(\.[0-9]{1,2})?$" title="Formato esperado: letra + 2 dígitos, ex. F84 ou F84.0" /></div></div><div class="session-entry"><div class="form-grid"><div class="field"><label for="session-date">Data *</label><input id="session-date" type="date" value="2026-08-20" /></div><div class="field"><label for="session-start">Início *</label><input id="session-start" type="time" value="08:00" /></div><div class="field"><label for="session-end">Fim *</label><input id="session-end" type="time" value="09:00" /></div></div><button type="button" class="secondary-button" data-action="add-session">＋ Adicionar atendimento</button></div><div class="session-list" id="session-list"><p class="session-empty">Nenhum atendimento adicionado ainda.</p></div><input type="hidden" id="guide-sessions" name="sessions" value="[]" /></div>`
  );
}

function guideFormConsulta() {
  return guideFormComplete()
    .replace('<form class="guide-form" id="guide-form">', '<form class="guide-form" id="guide-form"><input type="hidden" name="guideType" value="consulta" />')
    .replace('Guia SP/SADT · TISS 4.01', 'Guia de Consulta · TISS 4.01')
    .replace('Guia SP/SADT · padrão demonstrativo', 'Guia de Consulta · padrão demonstrativo');
}

function statusSimulator() { return `<div class="panel status-simulator"><div class="panel-header"><div><h2 class="panel-title">Retorno da operadora</h2><p class="panel-subtitle">Simule o processamento para demonstrar o ciclo da guia.</p></div><span class="status sent">Ambiente demo</span></div><div class="status-controls"><select id="status-guide"><option value="">Selecione uma guia</option>${guides.map(guide => `<option value="${guide.id}">${guide.id} · ${guide.patient}</option>`).join('')}</select><button class="status-action review" data-status="review">Em análise</button><button class="status-action approved" data-status="approved">Aprovar</button><button class="status-action error" data-status="error">Glosar</button></div></div>`; }
const glosaCodes = [
  { value: '', label: 'Selecione um código' },
  { value: 'GL01', label: 'GL01 · Procedimento incompatível com a guia' },
  { value: 'GL02', label: 'GL02 · Falta de autorização prévia' },
  { value: 'GL03', label: 'GL03 · Divergência de valor cobrado' },
  { value: 'GL04', label: 'GL04 · Beneficiário fora de vigência' },
  { value: 'GL05', label: 'GL05 · Quantidade excede o autorizado' }
];
function glosaPanel(guide) {
  const guideGlosas = glosas.filter(item => item.guideId === guide.id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const current = guideGlosas[0];
  let body;
  if (!current || current.status === 'revertida') {
    body = `${current ? `<div class="glosa-outcome success">Glosa anterior <strong>revertida</strong> — guia reaprovada pela operadora.</div>` : ''}
    <form class="glosa-form" id="glosa-form" data-guide-id="${guide.id}"><div class="form-grid"><div class="field"><label for="glosa-code">Código da glosa</label><select id="glosa-code" name="code">${glosaCodes.map(item => `<option value="${item.value}">${item.label}</option>`).join('')}</select></div><div class="field"><label for="glosa-amount">Valor glosado *</label><input id="glosa-amount" name="amount" type="number" min="0.01" step="0.01" value="${Number(guide.value?.replace(/[^\d,]/g, '').replace(',', '.')) || 0}" required /></div></div><div class="field"><label for="glosa-reason">Motivo *</label><input id="glosa-reason" name="reason" required placeholder="Descreva o motivo informado pela operadora" /></div><button class="secondary-button" type="submit">Registrar glosa (simular retorno)</button></form>`;
  } else if (current.status === 'aberta') {
    body = `<div class="glosa-outcome error"><strong>${current.code || 'Sem código'}</strong> · ${current.reason} · <span>${formatMoney(current.amount)}</span></div>
    <form class="recurso-form" id="recurso-form" data-glosa-id="${current.id}"><div class="field"><label for="recurso-justification">Justificativa do recurso *</label><textarea id="recurso-justification" name="justification" rows="3" required placeholder="Explique por que a glosa deve ser revertida"></textarea></div><button class="primary-button" type="submit">Enviar recurso</button></form>`;
  } else if (current.status === 'recurso_enviado') {
    body = `<div class="glosa-outcome error"><strong>${current.code || 'Sem código'}</strong> · ${current.reason} · <span>${formatMoney(current.amount)}</span></div>
    <div class="recurso-sent"><span>Recurso enviado:</span><p>${current.justification}</p><small>Aguardando retorno da operadora.</small></div>
    <div class="status-controls"><button class="status-action approved" data-action="resolve-glosa" data-outcome="revertida" data-glosa-id="${current.id}">Simular reversão</button><button class="status-action error" data-action="resolve-glosa" data-outcome="mantida" data-glosa-id="${current.id}">Simular manutenção</button></div>`;
  } else {
    body = `<div class="glosa-outcome error">Glosa <strong>mantida</strong> pela operadora — valor de ${formatMoney(current.amount)} não será reembolsado.</div>
    <form class="glosa-form" id="glosa-form" data-guide-id="${guide.id}"><p class="heading-copy">Registrar novo item glosado (opcional):</p><div class="form-grid"><div class="field"><label for="glosa-code">Código da glosa</label><select id="glosa-code" name="code">${glosaCodes.map(item => `<option value="${item.value}">${item.label}</option>`).join('')}</select></div><div class="field"><label for="glosa-amount">Valor glosado *</label><input id="glosa-amount" name="amount" type="number" min="0.01" step="0.01" required /></div></div><div class="field"><label for="glosa-reason">Motivo *</label><input id="glosa-reason" name="reason" required /></div><button class="secondary-button" type="submit">Registrar nova glosa</button></form>`;
  }
  return `<div class="panel glosa-panel"><div class="panel-header"><div><h2 class="panel-title">Glosa e recurso</h2><p class="panel-subtitle">Histórico de retorno da operadora para esta guia.</p></div></div><div class="glosa-body">${body}</div></div>`;
}
function guideFolderView(guideId) {
  const guide = guides.find(item => item.id === guideId);
  if (!guide) return listing('Guia não encontrada', 'O registro solicitado não está disponível.', '×');
  const sessions = guide.sessions || [];
  const linkedFeedbacks = feedbacks.filter(item => item.guideId === guide.id).sort((first, second) => first.attendanceDate.localeCompare(second.attendanceDate));
  const isConsulta = guide.guideType === 'consulta';
  const panelTitle = isConsulta ? 'Atendimento' : 'Atendimentos da competência';
  const panelSubtitle = isConsulta ? 'Guia de consulta avulsa — edite o serviço ou gere o PDF.' : 'Edite o serviço de cada atendimento e gere um PDF completo ou individual.';
  return `<div class="page-heading"><div><p class="eyebrow">Pasta da guia · ${guide.id}</p><h1>${guide.patient}</h1><p class="heading-copy">${guide.insurer} · ${guide.competence || guide.date} · ${sessions.length} ${sessions.length === 1 ? 'atendimento' : 'atendimentos'}</p></div><div class="folder-actions"><button class="secondary-button" data-view="guides">← Voltar</button><button class="secondary-button" data-action="print-audit" data-guide-id="${guide.id}" ${linkedFeedbacks.length ? '' : 'disabled'}>PDF para auditoria (${linkedFeedbacks.length})</button><button class="secondary-button" data-action="print-folder" data-guide-id="${guide.id}">Gerar PDF da pasta</button></div></div><div class="folder-summary"><div><span>Guia</span><strong>${guide.id}</strong></div><div><span>Procedimento</span><strong>${guide.procedure}</strong></div><div><span>Valor total</span><strong>${guide.value}</strong></div><div><span>Status</span>${statusTag(guide)}</div></div><div class="panel"><div class="panel-header"><div><h2 class="panel-title">${panelTitle}</h2><p class="panel-subtitle">${panelSubtitle}</p></div></div><table><thead><tr><th>#</th><th>Data</th><th>Horário</th><th>Profissional</th><th>Serviço</th><th></th></tr></thead><tbody>${sessions.length ? sessions.map((session, index) => `<tr><td>${index + 1}</td><td>${new Date(`${session.date}T12:00:00`).toLocaleDateString('pt-BR')}</td><td>${session.start} às ${session.end}</td><td>${session.professional}</td><td><select class="folder-service" data-guide-id="${guide.id}" data-session-index="${index}"><option ${session.procedure.includes('10101012') ? 'selected' : ''} value="10101012 - Consulta em consultório">10101012 · Consulta</option><option ${session.procedure.includes('50000470') ? 'selected' : ''} value="50000470 - Sessão de fisioterapia">50000470 · Fisioterapia</option><option ${session.procedure.includes('50000000') ? 'selected' : ''} value="50000000 - Atendimento terapêutico ABA">50000000 · Terapia ABA</option><option ${session.procedure.includes('40901122') ? 'selected' : ''} value="40901122 - Ultrassonografia">40901122 · Ultrassonografia</option></select></td><td><button class="finance-delete" data-action="print-session" data-guide-id="${guide.id}" data-session-index="${index}">Gerar PDF</button></td></tr>`).join('') : '<tr><td colspan="6">Nenhum atendimento nesta pasta.</td></tr>'}</tbody></table></div><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Feedbacks vinculados</h2><p class="panel-subtitle">Registros separados automaticamente pela guia e pela competência.</p></div><span class="guide-type-tag">${linkedFeedbacks.length} registro(s)</span></div>${linkedFeedbacks.length ? `<table><thead><tr><th>Data</th><th>Profissional</th><th>Tipo</th><th>Resumo</th></tr></thead><tbody>${linkedFeedbacks.map(item => `<tr><td>${new Date(`${item.attendanceDate}T12:00:00`).toLocaleDateString('pt-BR')}</td><td>${item.professional}</td><td>${item.attendanceType || '—'}</td><td>${item.content}</td></tr>`).join('')}</tbody></table>` : '<p class="panel-subtitle">Nenhum feedback foi vinculado a esta guia. Cadastre o registro no módulo Feedbacks selecionando paciente, data e guia.</p>'}</div>${glosaPanel(guide)}`;
}
function guideRowsHtml(term) {
  const filtered = filterGuides(guides, term);
  if (!filtered.length) return '<tr><td colspan="7">Nenhuma guia encontrada para essa busca.</td></tr>';
  return filtered.map(g => `<tr><td><strong>${g.id}</strong><small>${g.date}</small></td><td>${g.patient}<small>${g.procedure}</small></td><td>${g.insurer}</td><td><span class="guide-type-tag">${g.guideType === 'consulta' ? 'Consulta' : 'SP/SADT'}</span></td><td>${statusTag(g)}</td><td><strong>${g.value}</strong></td><td><button class="text-button" data-action="open-guide-folder" data-guide-id="${g.id}">Abrir pasta →</button></td></tr>`).join('');
}
function guideList() { return `<div class="page-heading"><div><p class="eyebrow">Operação de faturamento</p><h1>Guias TISS</h1><p class="heading-copy">Acompanhe o ciclo de cada guia, do preenchimento ao envio.</p></div><div class="folder-actions"><button class="secondary-button" data-action="new-guide" data-guide-type="consulta">＋ Nova guia de Consulta</button><button class="primary-button" data-action="new-guide" data-guide-type="sp_sadt">＋ Nova guia SP/SADT</button></div></div><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Todas as guias</h2><p class="panel-subtitle">${guides.length} registros salvos neste navegador</p></div><button class="secondary-button" data-action="clear-guides">Limpar dados demo</button></div><div class="search-bar"><input type="search" id="guide-search" placeholder="Buscar por paciente, convênio, procedimento ou nº da guia" /></div><table><thead><tr><th>Guia</th><th>Paciente</th><th>Convênio</th><th>Tipo</th><th>Status</th><th>Valor</th><th></th></tr></thead><tbody id="guide-table-body">${guideRowsHtml('')}</tbody></table></div>${statusSimulator()}`; }

const batchStatusLabels = { draft: 'Em preparação', ready: 'Pronto para envio', sent: 'Enviado', processing: 'Em processamento', approved: 'Aprovado', error: 'Com erro' };
const deliveryFormatLabels = { pdf: 'PDF assinado', xml: 'XML', both: 'PDF assinado + XML' };
function batchGuideOptions(insurerName = '', competence = '') {
  const assignedIds = new Set(batches.flatMap(batch => batch.guides.map(guide => guide.id)));
  const eligible = guides.filter(guide => guide.insurer === insurerName && guide.competence === competence && !assignedIds.has(guide.id));
  if (!insurerName || !competence) return '<p class="batch-empty">Selecione o convênio e a competência para localizar as guias.</p>';
  if (!eligible.length) return '<p class="batch-empty">Nenhuma guia disponível para essa combinação.</p>';
  return eligible.map(guide => `<label class="batch-guide-option"><input type="checkbox" name="guideIds" value="${guide.id}" /><span><strong>${guide.id} · ${guide.patient}</strong><small>${guide.procedure} · ${guide.value}</small></span></label>`).join('');
}
function batchRequirementHtml(batch) {
  const requiresPdf = batch.deliveryFormat === 'pdf' || batch.deliveryFormat === 'both';
  const requiresXml = batch.deliveryFormat === 'xml' || batch.deliveryFormat === 'both';
  return `<div class="batch-requirements">
    <span class="requirement ${!requiresPdf || batch.missingSignedPdfs === 0 ? 'done' : 'pending'}">${requiresPdf ? `${batch.missingSignedPdfs || 0} PDF(s) pendente(s)` : 'PDF não exigido'}</span>
    <span class="requirement ${!requiresXml || !batch.xmlPending ? 'done' : 'pending'}">${requiresXml ? (!batch.xmlGenerated ? 'XML pendente' : batch.xmlValid ? `XML TISS ${batch.tissVersion || '4.03.00'} válido` : `XML inválido · ${batch.xmlValidationErrors?.length || 0} erro(s)`) : 'XML não exigido'}</span>
  </div>`;
}
function batchCard(batch) {
  const requiresPdf = batch.deliveryFormat === 'pdf' || batch.deliveryFormat === 'both';
  const requiresXml = batch.deliveryFormat === 'xml' || batch.deliveryFormat === 'both';
  return `<article class="batch-card" data-batch-id="${batch.id}">
    <div class="batch-card-heading"><div><span class="eyebrow">${batch.id} · ${batch.competence}</span><h2>${batch.insurer}</h2><small>${deliveryFormatLabels[batch.deliveryFormat] || deliveryFormatLabels.both}</small></div><span class="status ${batch.status}">${batchStatusLabels[batch.status] || batch.status}</span></div>
    <div class="batch-summary"><div><span>Guias</span><strong>${batch.guideCount ?? batch.guides.length}</strong></div><div><span>Valor total</span><strong>${formatMoney(batch.totalValue)}</strong></div><div><span>Protocolo</span><strong>${batch.protocol || 'Não informado'}</strong></div></div>
    ${batchRequirementHtml(batch)}
    ${batch.xmlGenerated && !batch.xmlValid ? '<div class="batch-validation-alert"><strong>O schema oficial encontrou incompatibilidades.</strong><span>Revise os cadastros obrigatórios da clínica, do profissional e da guia antes do envio.</span></div>' : ''}
    <div class="batch-guide-list">${batch.guides.map(guide => `<div class="batch-guide-row"><div><strong>${guide.id} · ${guide.patient}</strong><small>${guide.procedure} · ${formatMoney(Number(guide.valueCents || 0) / 100)}</small></div>${requiresPdf ? `<label><input type="checkbox" data-action="toggle-signed-pdf" data-batch-id="${batch.id}" data-guide-id="${guide.id}" ${guide.signedPdfReceived ? 'checked' : ''} /> PDF assinado conferido</label>` : ''}</div>`).join('')}</div>
    <div class="batch-actions">${requiresXml ? `<button type="button" class="secondary-button" data-action="download-batch-xml" data-batch-id="${batch.id}">Gerar XML</button>` : ''}<select data-batch-status><option value="draft">Em preparação</option><option value="ready">Pronto para envio</option><option value="sent">Enviado</option><option value="processing">Em processamento</option><option value="approved">Aprovado</option><option value="error">Com erro</option></select><input data-batch-protocol placeholder="Protocolo da operadora" value="${batch.protocol || ''}" /><button type="button" class="primary-button" data-action="update-batch" data-batch-id="${batch.id}">Salvar acompanhamento</button>${batch.status === 'draft' ? `<button type="button" class="finance-delete" data-action="delete-batch" data-batch-id="${batch.id}">Excluir lote</button>` : ''}</div>
  </article>`;
}
function batchesView() {
  const totalValue = batches.reduce((sum, batch) => sum + Number(batch.totalValue || 0), 0);
  const pending = batches.filter(batch => !batch.readyForSending && ['draft', 'ready'].includes(batch.status)).length;
  return `<div class="page-heading"><div><p class="eyebrow">Faturamento por competência</p><h1>Lotes TISS</h1><p class="heading-copy">Agrupe guias por convênio, confira os documentos exigidos e acompanhe o envio.</p></div></div>
    <div class="batch-stats"><div><span>Lotes</span><strong>${batches.length}</strong></div><div><span>Valor agrupado</span><strong>${formatMoney(totalValue)}</strong></div><div><span>Com pendências</span><strong>${pending}</strong></div></div>
    <form class="panel batch-form" id="batch-form"><div class="panel-header"><div><h2 class="panel-title">Criar lote</h2><p class="panel-subtitle">Cada lote reúne guias do mesmo convênio e da mesma competência.</p></div></div><div class="form-section"><div class="form-grid"><div class="field"><label for="batch-insurer">Convênio *</label><select id="batch-insurer" name="insurerId" required><option value="">Selecione</option>${insurers.map(insurer => `<option value="${insurer.id}">${insurer.name} · ${deliveryFormatLabels[insurer.deliveryFormat] || deliveryFormatLabels.both}</option>`).join('')}</select></div><div class="field"><label for="batch-competence">Competência *</label><input id="batch-competence" name="competence" type="month" required /></div></div><div><label class="batch-guide-label">Guias disponíveis *</label><div id="batch-guide-options" class="batch-guide-options">${batchGuideOptions()}</div></div></div><div class="form-footer"><button class="primary-button" type="submit">Criar lote</button></div></form>
    <div class="batch-list">${batches.length ? batches.map(batchCard).join('') : '<div class="empty-state"><div><div class="empty-icon">▤</div><h2>Nenhum lote criado</h2><p>Escolha um convênio, uma competência e as guias que serão faturadas juntas.</p></div></div>'}</div>`;
}
function authorizationState(item) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(`${item.validTo}T00:00:00`);
  const days = Math.ceil((end - today) / 86400000);
  if (days < 0) return { key: 'expired', label: 'Vencida', note: `Venceu há ${Math.abs(days)} dia(s)` };
  if (days <= 30) return { key: 'expiring', label: 'Próxima do vencimento', note: days === 0 ? 'Vence hoje' : `Vence em ${days} dia(s)` };
  return { key: 'active', label: 'Vigente', note: `Vence em ${days} dia(s)` };
}

function notificationItems() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysUntil = value => Math.ceil((new Date(`${value}T12:00:00`) - today) / 86400000);
  const items = [];
  if (userCan('authorizations')) authorizations.forEach(item => {
    const days = daysUntil(item.validTo);
    const balance = Number(item.authorizedQuantity || 0) - Number(item.usedQuantity || 0);
    if (days < 0) items.push({ level: 'critical', title: `Autorização vencida · ${item.patient}`, detail: `${item.authorizationNumber} venceu em ${new Date(`${item.validTo}T12:00:00`).toLocaleDateString('pt-BR')}.`, view: 'authorizations' });
    else if (days <= 30) items.push({ level: 'warning', title: `Autorização vence em ${days} dia(s)`, detail: `${item.patient} · ${item.authorizationNumber}`, view: 'authorizations' });
    if (balance <= 2) items.push({ level: balance <= 0 ? 'critical' : 'warning', title: `Saldo de autorização: ${Math.max(0, balance)}`, detail: `${item.patient} possui poucas sessões disponíveis.`, view: 'authorizations' });
  });
  if (userCan('patients')) patientDocuments.forEach(item => {
    if (!item.validUntil) return;
    const days = daysUntil(item.validUntil);
    if (days <= 30) items.push({ level: days < 0 ? 'critical' : 'warning', title: days < 0 ? 'Documento vencido' : `Documento vence em ${days} dia(s)`, detail: `${item.patient || item.patientId} · ${item.originalName}`, view: 'patients' });
  });
  if (userCan('batches')) batches.filter(batch => !batch.readyForSending && ['draft', 'ready'].includes(batch.status)).forEach(batch => items.push({ level: 'warning', title: `Lote ${batch.id} com pendências`, detail: `${batch.insurer} · ${batch.missingSignedPdfs || 0} PDF(s) pendente(s)${batch.xmlPending ? ' · XML pendente' : ''}.`, view: 'batches' }));
  if (userCan('financeiro')) guides.filter(guide => guide.status === 'error').forEach(guide => items.push({ level: 'critical', title: `Guia ${guide.id} com glosa`, detail: `${guide.patient} · ${guide.insurer}`, view: 'guides' }));
  if (userCan('agenda')) appointments.forEach(item => { const days = daysUntil(item.date); if (days >= 0 && days <= 1 && !['completed', 'cancelled'].includes(item.status)) items.push({ level: 'info', title: days === 0 ? 'Atendimento hoje' : 'Atendimento amanhã', detail: `${item.start} · ${item.patient} · ${item.professional}`, view: 'agenda' }); });
  const priority = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => priority[a.level] - priority[b.level]);
}
function updateNotificationBadge() { const badge = document.querySelector('.notification-count'); if (!badge) return; const count = notificationItems().length; badge.textContent = count > 99 ? '99+' : count; badge.hidden = count === 0; }
function alertsView() { const items = notificationItems(); const critical = items.filter(item => item.level === 'critical').length; return `<div class="page-heading"><div><p class="eyebrow">Central de atenção</p><h1>Notificações</h1><p class="heading-copy">Pendências reunidas automaticamente conforme o seu perfil.</p></div><span class="status ${critical ? 'error' : 'approved'}">${critical ? `${critical} urgente(s)` : 'Sem urgências'}</span></div><div class="alert-stats"><div><span>Total</span><strong>${items.length}</strong></div><div><span>Urgentes</span><strong>${critical}</strong></div><div><span>Atenção</span><strong>${items.filter(item => item.level === 'warning').length}</strong></div><div><span>Informativos</span><strong>${items.filter(item => item.level === 'info').length}</strong></div></div><div class="panel"><div class="panel-header"><div><h2 class="panel-title">O que precisa de atenção</h2><p class="panel-subtitle">A lista é recalculada com os dados atuais do sistema.</p></div></div><div class="alert-list">${items.length ? items.map(item => `<button class="alert-item ${item.level}" data-action="open-alert-target" data-target-view="${item.view}"><span class="alert-marker"></span><span><strong>${item.title}</strong><small>${item.detail}</small></span><b>Ver detalhes →</b></button>`).join('') : '<div class="patient-folder-empty">Nenhuma pendência encontrada para o seu perfil.</div>'}</div></div>`; }
function authorizationsView() {
  const expiring = authorizations.filter(item => ['expired', 'expiring'].includes(authorizationState(item).key)).length;
  const rows = authorizations.map(item => { const state = authorizationState(item); const balance = Math.max(0, Number(item.authorizedQuantity) - Number(item.usedQuantity)); return `<tr data-authorization-row="${item.id}" data-valid-to="${item.validTo}" data-authorized-quantity="${item.authorizedQuantity}"><td><strong>${item.patient}</strong><small>${item.insurer}</small></td><td><strong>${item.authorizationNumber}</strong></td><td>${new Date(`${item.validFrom}T12:00:00`).toLocaleDateString('pt-BR')}<small>até ${new Date(`${item.validTo}T12:00:00`).toLocaleDateString('pt-BR')}</small></td><td><span class="authorization-status ${state.key}">${state.label}</span><small>${state.note}</small></td><td><strong>${balance} restante(s)</strong><label class="authorization-used">Usadas <input type="number" min="0" value="${item.usedQuantity}" data-authorization-used /></label></td><td><button class="text-button" data-action="update-authorization" data-authorization-id="${item.id}">Atualizar saldo</button> <button class="finance-delete" data-action="delete-authorization" data-authorization-id="${item.id}">Excluir</button></td></tr>`; }).join('');
  return `<div class="page-heading"><div><p class="eyebrow">Controle assistencial</p><h1>Autorizações de atendimento</h1><p class="heading-copy">Acompanhe a validade das guias autorizadas e o saldo de sessões de cada paciente.</p></div></div><div class="batch-stats"><div><span>Autorizações</span><strong>${authorizations.length}</strong></div><div><span>Vencidas ou próximas</span><strong>${expiring}</strong></div><div><span>Vigentes</span><strong>${authorizations.length - expiring}</strong></div></div><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Controle de vencimentos</h2><p class="panel-subtitle">O alerta amarelo começa 30 dias antes do vencimento.</p></div></div><table><thead><tr><th>Paciente</th><th>Número da autorização</th><th>Validade</th><th>Situação</th><th>Saldo</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6">Nenhuma autorização cadastrada.</td></tr>'}</tbody></table></div><form class="panel patient-form" id="authorization-form"><div class="panel-header"><div><h2 class="panel-title">Cadastrar autorização</h2><p class="panel-subtitle">Informe os dados recebidos do plano de saúde.</p></div></div><div class="form-section"><div class="form-grid"><div class="field"><label>Paciente *</label><select name="patientId" required><option value="">Selecione</option>${patients.map(patient => `<option value="${patient.id}">${patient.name} · ${patient.insurer}</option>`).join('')}</select></div><div class="field"><label>Convênio *</label><select name="insurerId" required><option value="">Selecione</option>${insurers.map(insurer => `<option value="${insurer.id}">${insurer.name}</option>`).join('')}</select></div><div class="field"><label>Número/senha da autorização *</label><input name="authorizationNumber" required /></div><div class="field"><label>Início da validade *</label><input name="validFrom" type="date" required /></div><div class="field"><label>Vencimento *</label><input name="validTo" type="date" required /></div><div class="field"><label>Quantidade autorizada *</label><input name="authorizedQuantity" type="number" min="1" value="1" required /></div><div class="field"><label>Quantidade já utilizada</label><input name="usedQuantity" type="number" min="0" value="0" /></div><div class="field"><label>Observações</label><input name="notes" placeholder="Ex.: autorização mensal" /></div></div></div><div class="form-footer"><button class="primary-button" type="submit">Salvar autorização</button></div></form>`;
}
function financeView() {
  const pendingCount = invoices.filter(invoice => invoice.status === 'pending').length;
  const receivedCount = invoices.filter(invoice => invoice.status === 'received').length;
  const totalExpected = invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);

  const billableGuides = guides.filter(guide => ['sent', 'approved'].includes(guide.status));

  return `<div class="page-heading"><div><p class="eyebrow">Fluxo de caixa</p><h1>Financeiro</h1><p class="heading-copy">Vincule notas fiscais às guias enviadas e acompanhe a previsão de pagamento.</p></div><button class="primary-button" data-action="new-invoice">＋ Nova nota</button></div>
  <div class="finance-summary"><div class="finance-summary-card"><span>Valor total previsto</span><strong>${formatMoney(totalExpected)}</strong><small>${invoices.length} notas cadastradas</small></div><div class="finance-summary-card"><span>Notas pendentes</span><strong>${pendingCount}</strong><small>Esperando entrada</small></div><div class="finance-summary-card"><span>Recebidas</span><strong>${receivedCount}</strong><small>Entradas confirmadas</small></div></div>
  <div class="panel"><div class="panel-header"><div><h2 class="panel-title">Notas fiscais</h2><p class="panel-subtitle">Acompanhamento das entradas previstas e guias relacionadas</p></div><select class="finance-filter" id="invoice-filter"><option value="all">Todas</option><option value="pending">Pendentes</option><option value="received">Recebidas</option></select></div><table><thead><tr><th>Nota</th><th>Guia TISS</th><th>Fornecedor</th><th>Valor</th><th>Previsão de pagamento</th><th>Status</th><th></th></tr></thead><tbody>${invoices.map(invoice => `<tr data-invoice-status="${invoice.status}"><td><strong>${invoice.id}</strong><small>${invoice.description}</small></td><td>${invoice.guideId || 'Sem vínculo'}</td><td>${invoice.provider}</td><td><strong>${formatMoney(invoice.amount)}</strong></td><td>${new Date(`${invoice.expectedDate}T12:00:00`).toLocaleDateString('pt-BR')}</td><td><button class="finance-status ${invoice.status}" data-action="mark-received" data-invoice-id="${invoice.id}">${invoice.status === 'received' ? 'Recebida' : 'Marcar recebimento'}</button></td><td><button class="finance-delete" data-delete-invoice-id="${invoice.id}" aria-label="Excluir ${invoice.id}">Excluir</button></td></tr>`).join('')}</tbody></table></div>
  <form class="panel invoice-form" id="invoice-form"><div class="panel-header"><div><h2 class="panel-title">Registrar nota fiscal</h2><p class="panel-subtitle">Associe a nota a uma guia enviada e informe a previsão de pagamento.</p></div></div><div class="form-section"><div class="form-grid"><div class="field"><label for="invoice-guide">Guia TISS enviada *</label><select id="invoice-guide" name="guideId" required><option value="">Selecione a guia</option>${billableGuides.map(guide => `<option value="${guide.id}">${guide.id} · ${guide.patient} · ${guide.label}</option>`).join('')}</select></div><div class="field"><label for="invoice-number">Número da nota *</label><input id="invoice-number" name="number" required placeholder="NF-2026-010" /></div><div class="field"><label for="invoice-provider">Fornecedor *</label><input id="invoice-provider" name="provider" required placeholder="Nome da empresa" /></div><div class="field"><label for="invoice-description">Descrição *</label><input id="invoice-description" name="description" required placeholder="Material ou serviço" /></div><div class="field"><label for="invoice-amount">Valor *</label><input id="invoice-amount" name="amount" type="number" min="0.01" step="0.01" required placeholder="0,00" /></div><div class="field"><label for="invoice-date">Previsão de pagamento *</label><input id="invoice-date" name="expectedDate" type="date" required /></div></div><div class="form-footer"><button type="button" class="secondary-button" data-view="financeiro">Cancelar</button><button class="primary-button" type="submit">Salvar nota vinculada</button></div></div></form>`;
}

function saveInvoices() { localStorage.setItem(clinicStorageKey('invoices'), JSON.stringify(invoices)); }
function hasScheduleConflict(data) { return hasScheduleConflictWith(appointments, data); }
function saveAppointments() { localStorage.setItem(clinicStorageKey('appointments'), JSON.stringify(appointments)); }
const appointmentStatusLabels = { scheduled: 'Agendado', confirmed: 'Confirmado', completed: 'Presença', missed: 'Falta', cancelled: 'Cancelado' };
function enhanceAgendaFeedbackActions() {
  document.querySelectorAll('.appointment-status').forEach(select => {
    const row = select.closest('.appointment-row');
    const appointment = appointments.find(item => item.id === select.dataset.appointmentId);
    const info = row?.querySelector('.appointment-info');
    if (info && !info.querySelector('.appointment-authorization')) {
      const authorization = document.createElement('small');
      authorization.className = `appointment-authorization ${appointment?.authorizationId ? 'linked' : 'unlinked'}`;
      authorization.textContent = appointment?.authorizationId ? `Autorização ${appointment.authorizationNumber}${appointment.authorizationCounted ? ' · sessão descontada' : ''}` : 'Sem autorização vinculada';
      info.append(authorization);
    }
    const existing = row?.querySelector('[data-action="feedback-from-appointment"]');
    if (select.value !== 'completed') { existing?.remove(); return; }
    if (existing) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'text-button'; button.dataset.action = 'feedback-from-appointment'; button.dataset.appointmentId = select.dataset.appointmentId; button.textContent = 'Registrar feedback';
    row?.insertBefore(button, row.lastElementChild);
  });
}
function agendaView() {
  const dayAppointments = appointments.filter(appointment => appointment.date === selectedAgendaDate).sort((first, second) => timeToMinutes(first.start) - timeToMinutes(second.start));
  const dateLabel = new Date(`${selectedAgendaDate}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `<div class="page-heading"><div><p class="eyebrow">${dateLabel}</p><h1>Agenda da clínica</h1><p class="heading-copy">Agenda compartilhada, com recorrência e controle de presença.</p></div><div class="folder-actions"><label class="agenda-date-picker">Exibir data <input id="agenda-date" type="date" value="${selectedAgendaDate}" /></label><button class="primary-button" data-action="new-appointment">＋ Novo atendimento</button></div></div><div class="agenda-layout"><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Atendimentos do dia</h2><p class="panel-subtitle">${dayAppointments.length} horário(s) reservado(s)</p></div><span class="status approved">Sincronizada</span></div><div class="appointment-list">${dayAppointments.length ? dayAppointments.map(appointment => `<div class="appointment-row ${appointment.status || 'scheduled'}"><div class="appointment-time"><strong>${appointment.start}</strong><small>${appointment.duration} min</small></div><div class="appointment-info"><strong>${appointment.patient}</strong><small>${appointment.type} · ${appointment.professional}${appointment.recurrenceId ? ' · recorrente' : ''}</small></div><select class="appointment-status" data-appointment-id="${appointment.id}">${Object.entries(appointmentStatusLabels).map(([value, label]) => `<option value="${value}" ${(appointment.status || 'scheduled') === value ? 'selected' : ''}>${label}</option>`).join('')}</select><button class="finance-delete" data-action="delete-appointment" data-appointment-id="${appointment.id}">Excluir</button></div>`).join('') : '<div class="patient-folder-empty">Nenhum atendimento agendado nesta data.</div>'}</div></div><form class="panel appointment-form" id="appointment-form"><div class="panel-header"><div><h2 class="panel-title">Reservar horário</h2><p class="panel-subtitle">Repita semanalmente para terapias recorrentes.</p></div></div><div class="form-section"><div class="field"><label for="appointment-patient">Paciente *</label><select id="appointment-patient" name="patientId" required><option value="">Selecione</option>${patients.filter(patient => patient.active !== 0).map(patient => `<option value="${patient.id}">${patient.name}</option>`).join('')}</select></div><div class="field"><label for="appointment-professional">Profissional *</label><select id="appointment-professional" name="professional" required><option value="">Selecione</option>${professionalOptions()}</select></div><div class="field"><label for="appointment-date">Primeira data *</label><input id="appointment-date" name="date" type="date" value="${selectedAgendaDate}" required /></div><div class="appointment-fields"><div class="field"><label for="appointment-start">Início *</label><input id="appointment-start" name="start" type="time" value="09:00" required /></div><div class="field"><label for="appointment-duration">Duração *</label><select id="appointment-duration" name="duration" required><option value="30">30 min</option><option value="50" selected>50 min</option><option value="60">60 min</option></select></div></div><div class="field"><label for="appointment-type">Tipo de atendimento *</label><select id="appointment-type" name="type" required><option>Consulta</option><option>Fisioterapia</option><option>Terapia ABA</option><option>Psicologia</option><option>Fonoaudiologia</option><option>Terapia ocupacional</option><option>Exame</option></select></div><div class="field"><label for="appointment-repeat">Repetição semanal</label><select id="appointment-repeat" name="repeatWeeks"><option value="1">Somente esta data</option><option value="4">4 semanas</option><option value="8">8 semanas</option><option value="12">12 semanas</option><option value="24">24 semanas</option></select></div></div><div class="form-footer"><button class="primary-button" type="submit">Verificar e reservar</button></div></form></div>`;
}
function editPatient(patientId) {
  const patient = patients.find(item => item.id === patientId);
  if (!patient) return;
  const form = document.querySelector('#patient-form');
  if (!form) return;
  form.dataset.patientId = patient.id;
  form.querySelector('#new-patient-name').value = patient.name;
  form.querySelector('#new-patient-birth').value = patient.birthDate;
  form.querySelector('#new-patient-insurer').value = patient.insurer;
  form.querySelector('#new-patient-ans').value = patient.ansCode || '';
  form.querySelector('#new-patient-card').value = patient.cardNumber;
  form.querySelector('#new-patient-plan').value = patient.plan;
  form.querySelector('#new-patient-validity').value = patient.planValidity;
  form.querySelector('#new-patient-guardian').value = patient.guardianName || '';
  form.querySelector('#new-patient-relationship').value = patient.guardianRelationship || '';
  form.querySelector('#new-patient-phone').value = patient.guardianPhone || '';
  form.querySelector('#new-patient-email').value = patient.guardianEmail || '';
  form.querySelector('#new-patient-consent').value = patient.consentStatus || 'pending';
  form.querySelector('#new-patient-consent-date').value = patient.consentDate || '';
  form.querySelector('.panel-title').textContent = 'Editar paciente';
  form.querySelector('button[type="submit"]').textContent = 'Atualizar paciente';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function patientRowsHtml(term) {
  const filtered = filterPatients(patients, term);
  if (!filtered.length) return '<tr><td colspan="6">Nenhum paciente encontrado para essa busca.</td></tr>';
  return filtered.map(patient => `<tr><td><strong>${patient.name}</strong><small>${new Date(`${patient.birthDate}T12:00:00`).toLocaleDateString('pt-BR')}</small></td><td>${patient.insurer}</td><td>${patient.cardNumber}</td><td>${patient.plan}</td><td>${new Date(`${patient.planValidity}T12:00:00`).toLocaleDateString('pt-BR')}</td><td><button class="text-button" data-action="open-patient-folder" data-patient-id="${patient.id}">Abrir pasta →</button> <button class="text-button" data-action="edit-patient" data-patient-id="${patient.id}">Editar</button></td></tr>`).join('');
}
function patientsView() {
  return `<div class="page-heading"><div><p class="eyebrow">Cadastro da clínica</p><h1>Pacientes</h1><p class="heading-copy">Cada paciente possui uma pasta com seu histórico assistencial e de faturamento.</p></div><button class="primary-button" data-action="new-patient">＋ Novo paciente</button></div><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Pacientes cadastrados</h2><p class="panel-subtitle">${patients.length} registros com dados de convênio</p></div></div><div class="search-bar"><input type="search" id="patient-search" placeholder="Buscar por nome, convênio, carteira ou plano" /></div><table><thead><tr><th>Paciente</th><th>Convênio</th><th>Carteira</th><th>Plano</th><th>Validade</th><th></th></tr></thead><tbody id="patient-table-body">${patientRowsHtml('')}</tbody></table></div><form class="panel patient-form" id="patient-form"><div class="panel-header"><div><h2 class="panel-title">Cadastrar paciente</h2><p class="panel-subtitle">Dados do plano, responsável legal e consentimento.</p></div></div><div class="form-section"><div class="form-grid"><div class="field"><label for="new-patient-name">Nome completo *</label><input id="new-patient-name" name="name" required /></div><div class="field"><label for="new-patient-birth">Data de nascimento *</label><input id="new-patient-birth" name="birthDate" type="date" required /></div><div class="field"><label for="new-patient-insurer">Convênio *</label><select id="new-patient-insurer" name="insurer" required><option value="">Selecione</option>${insurers.map(insurer => `<option>${insurer.name}</option>`).join('')}</select></div><div class="field"><label for="new-patient-ans">Código ANS</label><input id="new-patient-ans" name="ansCode" placeholder="Ex.: 004701" /></div><div class="field"><label for="new-patient-card">Número da carteira *</label><input id="new-patient-card" name="cardNumber" required /></div><div class="field"><label for="new-patient-plan">Plano *</label><input id="new-patient-plan" name="plan" required placeholder="Nome do plano" /></div><div class="field"><label for="new-patient-validity">Validade do plano *</label><input id="new-patient-validity" name="planValidity" type="date" required /></div></div><h3 class="form-subtitle">Responsável legal e consentimento</h3><div class="form-grid"><div class="field"><label for="new-patient-guardian">Nome do responsável</label><input id="new-patient-guardian" name="guardianName" /></div><div class="field"><label for="new-patient-relationship">Parentesco/vínculo</label><input id="new-patient-relationship" name="guardianRelationship" placeholder="Ex.: mãe, pai, tutor" /></div><div class="field"><label for="new-patient-phone">Telefone</label><input id="new-patient-phone" name="guardianPhone" /></div><div class="field"><label for="new-patient-email">E-mail</label><input id="new-patient-email" name="guardianEmail" type="email" /></div><div class="field"><label for="new-patient-consent">Consentimento para tratamento dos dados</label><select id="new-patient-consent" name="consentStatus"><option value="pending">Pendente</option><option value="granted">Concedido</option><option value="revoked">Revogado</option></select></div><div class="field"><label for="new-patient-consent-date">Data do consentimento</label><input id="new-patient-consent-date" name="consentDate" type="date" /></div></div><div class="form-footer"><button class="primary-button" type="submit">Salvar paciente</button></div></div></form>`;
}
function patientFolderView(patientId) {
  const patient = patients.find(item => item.id === patientId);
  if (!patient) return listing('Paciente não encontrado', 'O cadastro solicitado não está disponível.', '×');
  const patientGuides = guides.filter(guide => guide.patient === patient.name);
  const guideIds = new Set(patientGuides.map(guide => guide.id));
  const patientFeedbacks = feedbacks.filter(item => item.patient === patient.name);
  const patientAuthorizations = authorizations.filter(item => item.patient === patient.name);
  const patientAppointments = appointments.filter(item => item.patient === patient.name).sort((first, second) => second.date.localeCompare(first.date));
  const patientGlosas = glosas.filter(item => guideIds.has(item.guideId));
  const patientInvoices = invoices.filter(item => guideIds.has(item.guideId));
  const patientBatches = batches.filter(batch => (batch.guides || []).some(guide => guide.patient === patient.name || guideIds.has(guide.id)));
  const documents = patientDocuments.filter(item => item.patientId === patient.id);
  const validUntil = patient.planValidity ? new Date(`${patient.planValidity}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informada';
  const empty = message => `<div class="patient-folder-empty">${message}</div>`;
  return `<div class="page-heading patient-folder-heading"><div><p class="eyebrow">Pasta do paciente · ${patient.id}</p><h1>${patient.name}</h1><p class="heading-copy">Histórico clínico, documentos e faturamento reunidos em um só lugar.</p></div><div class="folder-actions"><button class="secondary-button" data-view="patients">← Voltar</button><button class="secondary-button" data-action="edit-patient" data-patient-id="${patient.id}">Editar cadastro</button></div></div>
  <div class="patient-profile-card"><div class="patient-avatar">${patient.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</div><div><span>Paciente</span><strong>${patient.name}</strong><small>Nascimento: ${new Date(`${patient.birthDate}T12:00:00`).toLocaleDateString('pt-BR')}</small></div><div><span>Convênio</span><strong>${patient.insurer}</strong><small>${patient.plan}</small></div><div><span>Carteira</span><strong>${patient.cardNumber}</strong><small>Válida até ${validUntil}</small></div><div><span>Responsável legal</span><strong>${patient.guardianName || 'Não informado'}</strong><small>${[patient.guardianRelationship, patient.guardianPhone].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}</small></div><div><span>Consentimento</span><strong>${({ granted: 'Concedido', revoked: 'Revogado', pending: 'Pendente' })[patient.consentStatus || 'pending']}</strong><small>${patient.consentDate ? `Registrado em ${new Date(`${patient.consentDate}T12:00:00`).toLocaleDateString('pt-BR')}` : 'Sem data registrada'}</small></div></div>
  <div class="patient-folder-stats"><div><span>Documentos</span><strong>${documents.length}</strong></div><div><span>Guias</span><strong>${patientGuides.length}</strong></div><div><span>Feedbacks</span><strong>${patientFeedbacks.length}</strong></div><div><span>Autorizações</span><strong>${patientAuthorizations.length}</strong></div><div><span>Atendimentos</span><strong>${patientAppointments.length + patientGuides.reduce((total, guide) => total + (guide.sessions?.length || 0), 0)}</strong></div><div><span>Pendências/glosas</span><strong>${patientGlosas.length}</strong></div></div>
  <div class="patient-folder-grid">
    <section class="panel patient-folder-section patient-folder-wide"><div class="panel-header"><div><h2 class="panel-title">Documentos anexados</h2><p class="panel-subtitle">Pedidos, laudos, carteirinhas e arquivos usados no atendimento ou na auditoria.</p></div><span class="guide-type-tag">${documents.length} arquivo(s)</span></div>${documents.length ? `<div class="patient-document-list">${documents.map(item => { const expired = item.validUntil && item.validUntil < new Date().toISOString().slice(0, 10); return `<div class="patient-document-row"><span class="patient-file-icon">${item.mimeType === 'application/pdf' ? 'PDF' : 'IMG'}</span><div><strong>${item.originalName}</strong><small>${item.category}${item.description ? ` · ${item.description}` : ''} · ${(Number(item.sizeBytes) / 1024).toFixed(0)} KB</small><small>Enviado por ${item.uploadedBy}${item.validUntil ? ` · validade ${new Date(`${item.validUntil}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}${item.guideId ? ` · guia ${item.guideId}` : ''}</small></div>${expired ? '<span class="document-validity expired">Vencido</span>' : item.validUntil ? '<span class="document-validity active">Vigente</span>' : '<span></span>'}<button class="text-button" data-action="download-patient-document" data-document-id="${item.id}">Baixar</button><button class="finance-delete" data-action="delete-patient-document" data-document-id="${item.id}" data-patient-id="${patient.id}">Excluir</button></div>`; }).join('')}</div>` : empty('Nenhum documento anexado.')}
      <form class="patient-document-form" id="patient-document-form" data-patient-id="${patient.id}"><div class="form-grid"><div class="field"><label for="patient-document-category">Categoria *</label><select id="patient-document-category" name="category" required><option value="">Selecione</option><option>Pedido médico</option><option>Laudo</option><option>Carteirinha do convênio</option><option>Autorização</option><option>Relatório clínico</option><option>Documento pessoal</option><option>Outro</option></select></div><div class="field"><label for="patient-document-file">Arquivo *</label><input id="patient-document-file" name="file" type="file" accept="application/pdf,image/png,image/jpeg" required /><small>PDF, PNG ou JPEG de até 6 MB.</small></div><div class="field"><label for="patient-document-validity">Validade</label><input id="patient-document-validity" name="validUntil" type="date" /></div><div class="field"><label for="patient-document-guide">Vincular à guia</label><select id="patient-document-guide" name="guideId"><option value="">Sem guia</option>${patientGuides.map(guide => `<option value="${guide.id}">${guide.id} · ${guide.procedure}</option>`).join('')}</select></div><div class="field"><label for="patient-document-authorization">Vincular à autorização</label><select id="patient-document-authorization" name="authorizationId"><option value="">Sem autorização</option>${patientAuthorizations.map(item => `<option value="${item.id}">${item.authorizationNumber}</option>`).join('')}</select></div><div class="field"><label for="patient-document-description">Descrição</label><input id="patient-document-description" name="description" maxlength="180" placeholder="Observação opcional" /></div></div><div class="form-footer"><button type="submit" class="primary-button" ${activeSession?.token ? '' : 'disabled'}>Anexar documento</button></div>${activeSession?.token ? '' : '<small class="document-api-note">Entre pela API para armazenar documentos com segurança.</small>'}</form>
    </section>
    <section class="panel patient-folder-section patient-folder-wide"><div class="panel-header"><div><h2 class="panel-title">Guias e PDFs</h2><p class="panel-subtitle">Guias geradas para o paciente e documentos disponíveis.</p></div></div>${patientGuides.length ? `<div class="patient-document-list">${patientGuides.map(guide => `<div class="patient-document-row"><span class="patient-file-icon">PDF</span><div><strong>${guide.id} · ${guide.procedure}</strong><small>${guide.insurer} · competência ${guide.competence || guide.date || 'não informada'} · ${guide.sessions?.length || 0} atendimento(s)</small></div>${statusTag(guide)}<button class="text-button" data-action="open-guide-folder" data-guide-id="${guide.id}">Abrir guia</button><button class="text-button" data-action="print-folder" data-guide-id="${guide.id}">Gerar PDF</button></div>`).join('')}</div>` : empty('Nenhuma guia foi gerada para este paciente.')}</section>
    <section class="panel patient-folder-section"><div class="panel-header"><div><h2 class="panel-title">Feedbacks</h2><p class="panel-subtitle">Evoluções e registros assistenciais.</p></div></div>${patientFeedbacks.length ? `<div class="patient-timeline">${patientFeedbacks.map(item => `<article><time>${new Date(`${item.attendanceDate}T12:00:00`).toLocaleDateString('pt-BR')}</time><div><strong>${item.professional}</strong><small>${item.attendanceType || 'Atendimento'} · ${item.guideId || 'Sem guia vinculada'}</small><p>${item.content}</p></div><button class="text-button" data-action="print-feedback" data-feedback-id="${item.id}">PDF</button></article>`).join('')}</div>` : empty('Nenhum feedback registrado para este paciente.')}</section>
    <section class="panel patient-folder-section"><div class="panel-header"><div><h2 class="panel-title">Autorizações</h2><p class="panel-subtitle">Vigência e saldo autorizado.</p></div></div>${patientAuthorizations.length ? `<div class="patient-simple-list">${patientAuthorizations.map(item => `<div><strong>${item.authorizationNumber}</strong><small>${item.insurer} · ${new Date(`${item.validFrom}T12:00:00`).toLocaleDateString('pt-BR')} a ${new Date(`${item.validTo}T12:00:00`).toLocaleDateString('pt-BR')}</small><span>${Math.max(0, Number(item.authorizedQuantity) - Number(item.usedQuantity))} restante(s)</span></div>`).join('')}</div>` : empty('Nenhuma autorização cadastrada.')}</section>
    <section class="panel patient-folder-section"><div class="panel-header"><div><h2 class="panel-title">Agenda e atendimentos</h2><p class="panel-subtitle">Histórico de compromissos registrados.</p></div></div>${patientAppointments.length ? `<div class="patient-simple-list">${patientAppointments.map(item => `<div><strong>${new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR')} · ${item.start}</strong><small>${item.type} com ${item.professional}</small></div>`).join('')}</div>` : empty('Nenhum compromisso encontrado na agenda.')}</section>
    <section class="panel patient-folder-section"><div class="panel-header"><div><h2 class="panel-title">Faturamento relacionado</h2><p class="panel-subtitle">Lotes, notas e ocorrências das guias.</p></div></div><div class="patient-finance-groups"><div><span>Lotes</span><strong>${patientBatches.length}</strong></div><div><span>Notas</span><strong>${patientInvoices.length}</strong></div><div><span>Glosas</span><strong>${patientGlosas.length}</strong></div></div>${patientGlosas.length ? `<div class="patient-simple-list">${patientGlosas.map(item => `<div><strong>${item.code || 'Glosa'} · ${formatMoney(item.amount)}</strong><small>${item.guideId} · ${item.reason}</small></div>`).join('')}</div>` : ''}</section>
  </div>`;
}
function listing(title, description, icon) { return `<div class="page-heading"><div><p class="eyebrow">Módulo operacional</p><h1>${title}</h1><p class="heading-copy">${description}</p></div><button class="primary-button" data-action="new-guide">＋ Nova guia</button></div><div class="empty-state"><div><div class="empty-icon">${icon}</div><h2>Este módulo está pronto para crescer</h2><p>A estrutura de navegação está funcionando. O próximo passo é conectar este fluxo aos dados reais da clínica.</p><button class="primary-button" data-action="soon">Explorar demonstração</button></div></div>`; }
function insurerRowsHtml(term) {
  const filtered = filterInsurers(insurers, term);
  if (!filtered.length) return '<tr><td colspan="6">Nenhum convênio encontrado.</td></tr>';
  const deliveryLabels = { pdf: 'PDF assinado', xml: 'XML', both: 'PDF + XML' };
  return filtered.map(insurer => `<tr><td><strong>${insurer.name}</strong></td><td>${insurer.ansCode || '—'}</td><td>${insurer.contactEmail || '—'}<br><small>${insurer.contactPhone || ''}</small></td><td><span class="delivery-format ${insurer.deliveryFormat || 'both'}">${deliveryLabels[insurer.deliveryFormat] || deliveryLabels.both}</span></td><td>${(insurer.acceptedProcedures || []).length} procedimento(s)</td><td><button class="text-button" data-action="edit-insurer" data-insurer-id="${insurer.id}">Editar</button> <button class="finance-delete" data-action="delete-insurer" data-insurer-id="${insurer.id}">Excluir</button></td></tr>`).join('');
}
function insurersView() {
  return `<div class="page-heading"><div><p class="eyebrow">Cadastro da clínica</p><h1>Convênios</h1><p class="heading-copy">Operadoras aceitas pela clínica — alimenta os seletores de guia, paciente e lote.</p></div></div>
  <div class="panel"><div class="panel-header"><div><h2 class="panel-title">Convênios cadastrados</h2><p class="panel-subtitle">${insurers.length} operadoras</p></div></div><div class="search-bar"><input type="search" id="insurer-search" placeholder="Buscar por nome, código ANS ou contato" /></div><table><thead><tr><th>Nome</th><th>Código ANS</th><th>Contato</th><th>Envio exigido</th><th>Procedimentos aceitos</th><th></th></tr></thead><tbody id="insurer-table-body">${insurerRowsHtml('')}</tbody></table></div>
  <form class="panel patient-form" id="insurer-form"><div class="panel-header"><div><h2 class="panel-title">Cadastrar convênio</h2><p class="panel-subtitle">Defina também os documentos exigidos no fechamento do faturamento.</p></div></div><div class="form-section"><div class="form-grid"><div class="field"><label for="new-insurer-name">Nome *</label><input id="new-insurer-name" name="name" required /></div><div class="field"><label for="new-insurer-ans">Código ANS</label><input id="new-insurer-ans" name="ansCode" placeholder="Ex.: 004701" /></div><div class="field"><label for="new-insurer-provider-code">Código do prestador na operadora</label><input id="new-insurer-provider-code" name="providerCode" maxlength="14" placeholder="Código fornecido pelo convênio" /><small>Pode ser diferente em cada operadora.</small></div><div class="field"><label for="new-insurer-email">E-mail de contato</label><input id="new-insurer-email" name="contactEmail" type="email" placeholder="faturamento@operadora.com.br" /></div><div class="field"><label for="new-insurer-phone">Telefone de contato</label><input id="new-insurer-phone" name="contactPhone" placeholder="(00) 0000-0000" /></div><div class="field"><label for="new-insurer-delivery">Forma de envio exigida *</label><select id="new-insurer-delivery" name="deliveryFormat" required><option value="pdf">PDF assinado</option><option value="xml">XML</option><option value="both" selected>PDF assinado + XML</option></select><small>O lote cobrará automaticamente os arquivos escolhidos.</small></div></div><div class="field"><label for="new-insurer-procedures">Códigos TUSS aceitos (separados por vírgula)</label><input id="new-insurer-procedures" name="acceptedProcedures" placeholder="Ex.: 10101012, 50000470" /></div></div><div class="form-footer"><button type="button" class="secondary-button" data-action="cancel-insurer-edit" hidden>Cancelar edição</button><button class="primary-button" type="submit">Salvar convênio</button></div></form>`;
}
function editInsurer(insurerId) {
  const insurer = insurers.find(item => item.id === insurerId);
  if (!insurer) return;
  const form = document.querySelector('#insurer-form');
  if (!form) return;
  form.dataset.insurerId = insurer.id;
  form.querySelector('#new-insurer-name').value = insurer.name;
  form.querySelector('#new-insurer-ans').value = insurer.ansCode || '';
  form.querySelector('#new-insurer-email').value = insurer.contactEmail || '';
  form.querySelector('#new-insurer-phone').value = insurer.contactPhone || '';
  form.querySelector('#new-insurer-provider-code').value = insurer.providerCode || '';
  form.querySelector('#new-insurer-delivery').value = insurer.deliveryFormat || 'both';
  form.querySelector('#new-insurer-procedures').value = (insurer.acceptedProcedures || []).join(', ');
  renderContractRules(insurer.procedureRules || []);
  form.querySelector('.panel-title').textContent = 'Editar convênio';
  form.querySelector('button[type="submit"]').textContent = 'Atualizar convênio';
  const cancelButton = form.querySelector('[data-action="cancel-insurer-edit"]');
  if (cancelButton) cancelButton.hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function feedbackRowsHtml(term) {
  const filtered = filterFeedbacks(feedbacks, term);
  if (!filtered.length) return '<tr><td colspan="6">Nenhum feedback encontrado.</td></tr>';
  return filtered.map(fb => `<tr><td><strong>${fb.patient}</strong><small>${new Date(`${fb.attendanceDate}T12:00:00`).toLocaleDateString('pt-BR')}</small></td><td>${fb.professional}</td><td>${fb.attendanceType || '—'}</td><td>${fb.guideId ? `<span class="guide-type-tag">${fb.guideId}</span>` : '<small>Particular</small>'}</td><td>${fb.photo ? '📷' : '—'}</td><td><button class="text-button" data-action="print-feedback" data-feedback-id="${fb.id}">Gerar PDF</button> <button class="finance-delete" data-action="delete-feedback" data-feedback-id="${fb.id}">Excluir</button></td></tr>`).join('');
}
function feedbackGuideOptions(patientName = '', attendanceDate = '') {
  const patientGuides = guides.filter(guide => guide.patient === patientName).filter(guide => {
    if (!attendanceDate) return true;
    const sessionDates = (guide.sessions || []).map(session => session.date).filter(Boolean);
    return sessionDates.length ? sessionDates.includes(attendanceDate) : guide.competence === attendanceDate.slice(0, 7);
  });
  return '<option value="">Particular / sem guia</option>' + patientGuides.map(guide => {
    const dates = (guide.sessions || []).map(session => session.date).filter(Boolean).sort();
    const dateLabel = dates.length ? dates.map(date => new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR')).join(', ') : `competência ${guide.competence || 'não informada'}`;
    return `<option value="${guide.id}">${guide.id} · ${guide.competence || ''} · ${guide.procedure} · ${dateLabel}</option>`;
  }).join('');
}
function refreshFeedbackGuideOptions() {
  const select = document.querySelector('#feedback-guide');
  if (!select) return;
  const previous = select.value;
  select.innerHTML = feedbackGuideOptions(document.querySelector('#feedback-patient')?.value, document.querySelector('#feedback-date')?.value);
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
  else if (select.options.length === 2) select.selectedIndex = 1;
}
function feedbackView() {
  return `<div class="page-heading"><div><p class="eyebrow">Acompanhamento clínico</p><h1>Feedbacks de atendimento</h1><p class="heading-copy">Registros dos profissionais vinculados à guia e à data faturada para facilitar auditorias.</p></div></div><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Feedbacks registrados</h2><p class="panel-subtitle">${feedbacks.length} registros</p></div></div><div class="search-bar"><input type="search" id="feedback-search" placeholder="Buscar por paciente, profissional, guia ou tipo" /></div><table><thead><tr><th>Paciente</th><th>Profissional</th><th>Tipo</th><th>Guia</th><th>Foto</th><th></th></tr></thead><tbody id="feedback-table-body">${feedbackRowsHtml('')}</tbody></table></div><form class="panel patient-form" id="feedback-form"><div class="panel-header"><div><h2 class="panel-title">Novo feedback</h2><p class="panel-subtitle">Informe primeiro o paciente e a data. O sistema mostrará somente as guias compatíveis com aquele atendimento.</p></div></div><div class="form-section"><div class="form-grid"><div class="field"><label for="feedback-patient">Paciente *</label><select id="feedback-patient" name="patient" required><option value="">Selecione o paciente</option>${patients.map(patient => `<option>${patient.name}</option>`).join('')}</select></div><div class="field"><label for="feedback-professional">Profissional *</label><select id="feedback-professional" name="professional" required><option value="">Selecione o profissional</option>${professionalOptions()}</select></div><div class="field"><label for="feedback-date">Data do atendimento *</label><input id="feedback-date" name="attendanceDate" type="date" required /></div><div class="field"><label for="feedback-type">Tipo de atendimento</label><select id="feedback-type" name="attendanceType"><option value="">Selecione</option><option>Consulta</option><option>Exame</option><option>Terapia</option></select></div><div class="field"><label for="feedback-guide">Guia vinculada (convênio)</label><select id="feedback-guide" name="guideId">${feedbackGuideOptions()}</select><small>A guia só aparece quando paciente e data correspondem ao faturamento.</small></div><div class="field"><label for="feedback-photo">Foto do atendimento (opcional)</label><input id="feedback-photo" name="photoFile" type="file" accept="image/*" /><input type="hidden" id="feedback-photo-data" name="photo" /></div></div><div class="field"><label for="feedback-content">Feedback *</label><textarea id="feedback-content" name="content" rows="4" required placeholder="Descreva a evolução, observações clínicas ou orientações passadas ao paciente"></textarea></div></div><div class="form-footer"><button class="primary-button" type="submit">Salvar feedback</button></div></form>`;
}
const auditActionLabels = { create: 'Criação', update: 'Alteração', delete: 'Exclusão', download: 'Download' };
const auditEntityLabels = { guides: 'Guia', patients: 'Paciente', feedbacks: 'Feedback', appointments: 'Agenda', authorizations: 'Autorização', 'patient-documents': 'Documento', batches: 'Lote', invoices: 'Nota fiscal', glosas: 'Glosa', insurers: 'Convênio', settings: 'Configurações', users: 'Usuário', reports: 'Relatório', backup: 'Backup', clinics: 'Clínica' };
function auditRowsHtml() {
  const action = document.querySelector('#audit-action')?.value || '';
  const user = document.querySelector('#audit-user')?.value || '';
  const dateFrom = document.querySelector('#audit-from')?.value || '';
  const dateTo = document.querySelector('#audit-to')?.value || '';
  const filtered = auditLogs.filter(item => (!action || item.action === action) && (!user || item.userId === user) && (!dateFrom || item.createdAt.slice(0, 10) >= dateFrom) && (!dateTo || item.createdAt.slice(0, 10) <= dateTo));
  if (!filtered.length) return '<tr><td colspan="6">Nenhum evento encontrado para os filtros selecionados.</td></tr>';
  return filtered.map(item => `<tr><td><strong>${new Date(`${item.createdAt.replace(' ', 'T')}Z`).toLocaleDateString('pt-BR')}</strong><small>${new Date(`${item.createdAt.replace(' ', 'T')}Z`).toLocaleTimeString('pt-BR')}</small></td><td><strong>${item.userName}</strong><small>${item.userId}</small></td><td><span class="audit-action ${item.action}">${auditActionLabels[item.action] || item.action}</span></td><td><strong>${auditEntityLabels[item.entityType] || item.entityType}</strong><small>${item.entityId || 'Registro não identificado'}</small></td><td>${item.details?.changedFields?.length ? item.details.changedFields.join(', ') : item.details?.document || '—'}</td><td><small>${item.ipAddress || '—'}</small></td></tr>`).join('');
}
function auditView() {
  const users = [...new Map(auditLogs.map(item => [item.userId, item.userName])).entries()];
  return `<div class="page-heading"><div><p class="eyebrow">Segurança e rastreabilidade</p><h1>Trilha de auditoria</h1><p class="heading-copy">Histórico imutável das alterações e downloads realizados na clínica.</p></div><span class="status approved">Somente administradores</span></div><div class="audit-stats"><div><span>Eventos registrados</span><strong>${auditLogs.length}</strong></div><div><span>Alterações</span><strong>${auditLogs.filter(item => item.action === 'update').length}</strong></div><div><span>Downloads</span><strong>${auditLogs.filter(item => item.action === 'download').length}</strong></div><div><span>Exclusões</span><strong>${auditLogs.filter(item => item.action === 'delete').length}</strong></div></div><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Histórico da operação</h2><p class="panel-subtitle">Os conteúdos clínicos e arquivos não são copiados para o log.</p></div></div><div class="audit-filters"><select id="audit-action"><option value="">Todas as ações</option>${Object.entries(auditActionLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select><select id="audit-user"><option value="">Todos os usuários</option>${users.map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</select><label>De <input id="audit-from" type="date" /></label><label>Até <input id="audit-to" type="date" /></label></div><div class="audit-table"><table><thead><tr><th>Data e hora</th><th>Usuário</th><th>Ação</th><th>Registro</th><th>Campos/documento</th><th>Origem</th></tr></thead><tbody id="audit-table-body">${auditRowsHtml()}</tbody></table></div></div>`;
}
document.addEventListener('click', async event => {
  const auditButton = event.target.closest('[data-view="audit"]');
  if (!auditButton) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (!userCan('audit')) { render('overview'); return; }
  try { if (activeSession?.token) auditLogs = await apiRequest('/audit-logs'); } catch (error) { showToast(error.message); }
  breadcrumb.textContent = views.audit;
  appView.innerHTML = auditView();
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'audit'));
}, true);
document.addEventListener('change', event => {
  if (!event.target.matches('#audit-action, #audit-user, #audit-from, #audit-to')) return;
  const body = document.querySelector('#audit-table-body');
  if (body) body.innerHTML = auditRowsHtml();
});
function reportsView() {
  const reportGuides = selectedReportCompetence ? guides.filter(guide => guide.competence === selectedReportCompetence) : guides;
  const reportInvoices = selectedReportCompetence ? invoices.filter(invoice => String(invoice.expectedDate || '').startsWith(selectedReportCompetence)) : invoices;
  const reportGuideIds = new Set(reportGuides.map(guide => guide.id));
  const reportGlosas = selectedReportCompetence ? glosas.filter(glosa => reportGuideIds.has(glosa.guideId)) : glosas;
  const guideCounts = reportGuides.reduce((summary, guide) => ({ ...summary, [guide.status]: (summary[guide.status] || 0) + 1 }), {});
  const pendingAmount = reportInvoices.filter(invoice => invoice.status === 'pending').reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const receivedAmount = reportInvoices.filter(invoice => invoice.status === 'received').reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const upcomingInvoices = [...reportInvoices].filter(invoice => invoice.status === 'pending').sort((first, second) => first.expectedDate.localeCompare(second.expectedDate));
  const openGlosas = reportGlosas.filter(glosa => glosa.status === 'aberta' || glosa.status === 'recurso_enviado');
  const openGlosaAmount = openGlosas.reduce((sum, glosa) => sum + Number(glosa.amount || 0), 0);

  return `<div class="page-heading"><div><p class="eyebrow">Indicadores operacionais</p><h1>Relatórios</h1><p class="heading-copy">Acompanhe o desempenho das guias e exporte os dados para conferência.</p></div><label class="report-competence">Competência <input id="report-competence" type="month" value="${selectedReportCompetence}" /></label></div><div class="report-export-bar"><span>Exportar CSV compatível com Excel</span><button class="secondary-button" data-report-export="guides">Guias</button><button class="secondary-button" data-report-export="invoices">Financeiro</button><button class="secondary-button" data-report-export="glosas">Glosas</button><button class="secondary-button" data-report-export="authorizations">Autorizações</button></div>
  <div class="stats-grid"><article class="stat-card"><div class="stat-top"><span>Total de guias</span><span class="stat-icon">▣</span></div><div class="stat-value">${reportGuides.length}</div><div class="stat-note">Registros no filtro</div></article><article class="stat-card"><div class="stat-top"><span>Guias aprovadas</span><span class="stat-icon">◉</span></div><div class="stat-value">${guideCounts.approved || 0}</div><div class="stat-note">Processadas com sucesso</div></article><article class="stat-card"><div class="stat-top"><span>Valor pendente</span><span class="stat-icon">◷</span></div><div class="stat-value">${formatMoney(pendingAmount)}</div><div class="stat-note warn">${formatMoney(receivedAmount)} recebido(s)</div></article><article class="stat-card"><div class="stat-top"><span>Valor em glosa</span><span class="stat-icon">✕</span></div><div class="stat-value">${formatMoney(openGlosaAmount)}</div><div class="stat-note ${openGlosas.length ? 'warn' : ''}">${openGlosas.length} glosa(s) em aberto ou recurso</div></article></div>
  <div class="content-grid"><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Status das guias</h2><p class="panel-subtitle">Distribuição atual do faturamento TISS</p></div></div><div class="report-status-list"><div><span>Enviadas</span><strong>${guideCounts.sent || 0}</strong></div><div><span>Em análise</span><strong>${guideCounts.review || 0}</strong></div><div><span>Aprovadas</span><strong>${guideCounts.approved || 0}</strong></div><div><span>Com glosa</span><strong>${guideCounts.error || 0}</strong></div><div><span>Recurso enviado</span><strong>${guideCounts.recurso || 0}</strong></div></div></div><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Próximos pagamentos</h2><p class="panel-subtitle">Notas pendentes em ordem de vencimento</p></div></div><div class="report-payment-list">${upcomingInvoices.length ? upcomingInvoices.slice(0, 5).map(invoice => `<div class="report-payment-row"><div><strong>${invoice.id}</strong><small>${invoice.guideId || 'Sem guia vinculada'}</small></div><strong>${formatMoney(invoice.amount)}</strong><time>${new Date(`${invoice.expectedDate}T12:00:00`).toLocaleDateString('pt-BR')}</time></div>`).join('') : '<p class="panel-subtitle">Nenhum pagamento pendente.</p>'}</div></div></div>`;
}
function professionalRowHtml(professional = {}, index = 0) {
  const legacyCouncil = String(professional.council || '').match(/^([A-Za-z]+)\s*(.*)$/);
  const councilType = professional.councilType || legacyCouncil?.[1] || '';
  const councilNumber = professional.councilNumber || legacyCouncil?.[2] || '';
  return `<div class="owner-settings-row" data-professional-row><div class="professional-settings-grid">
    <div class="field"><label>Nome *</label><input data-professional-field="name" value="${professional.name || ''}" required /></div>
    <div class="field"><label>Especialidade</label><input data-professional-field="title" value="${professional.title || ''}" placeholder="Ex.: Psicóloga" /></div>
    <div class="field"><label>Conselho *</label><select data-professional-field="councilType" required><option value="">Selecione</option>${['CRM','CRP','CREFITO','CREFONO','CRO','COREN','CRN','CRESS','OUT'].map(type => `<option value="${type}" ${councilType === type ? 'selected' : ''}>${type}</option>`).join('')}</select></div>
    <div class="field"><label>Número do conselho *</label><input data-professional-field="councilNumber" value="${councilNumber}" required /></div>
    <div class="field"><label>UF do conselho *</label><input data-professional-field="councilState" maxlength="2" value="${professional.councilState || clinicSettings.state || ''}" required /></div>
    <div class="field"><label>CBO *</label><input data-professional-field="cbo" inputmode="numeric" maxlength="6" value="${professional.cbo || ''}" placeholder="6 dígitos" required /></div>
  </div><div class="owner-settings-actions"><small>Dados usados no XML TISS.</small><button type="button" class="text-button" data-action="remove-professional" ${index === 0 ? 'hidden' : ''}>Remover</button></div></div>`;
}
function ownerRowHtml(owner = {}, index = 0) {
  return `<div class="owner-settings-row" data-owner-row>
    <div class="owner-settings-grid">
      <div class="field"><label>Nome do responsável</label><input data-owner-field="name" value="${owner.name || ''}" placeholder="Nome completo" /></div>
      <div class="field"><label>Cargo ou vínculo</label><input data-owner-field="title" value="${owner.title || ''}" placeholder="Ex.: Sócia proprietária" /></div>
      <div class="field"><label>Conselho/registro</label><input data-owner-field="council" value="${owner.council || ''}" placeholder="Ex.: CRP 03/12239" /></div>
    </div>
    <div class="owner-settings-actions">
      <label class="owner-active"><input type="checkbox" data-owner-field="active" ${owner.active !== false ? 'checked' : ''} /> Incluir automaticamente na capa</label>
      <button type="button" class="text-button owner-remove" data-action="remove-owner" ${index === 0 ? 'hidden' : ''}>Remover</button>
    </div>
  </div>`;
}
function professionalsFromSettingsForm(form) {
  return [...form.querySelectorAll('[data-professional-row]')].map(row => {
    const value = field => row.querySelector(`[data-professional-field="${field}"]`)?.value.trim() || '';
    const councilType = value('councilType').toUpperCase();
    const councilNumber = value('councilNumber');
    return { name: value('name'), title: value('title'), councilType, councilNumber, councilState: value('councilState').toUpperCase(), cbo: value('cbo'), council: `${councilType} ${councilNumber}`.trim() };
  }).filter(professional => professional.name);
}
function settingsView() {
  const logo = clinicSettings.letterheadDataUrl ? '<p class="panel-subtitle">Papel timbrado A4 cadastrado.</p>' : clinicSettings.logoDataUrl ? `<img src="${clinicSettings.logoDataUrl}" alt="Logotipo atual" style="max-width:180px;max-height:90px;object-fit:contain" />` : '<p class="panel-subtitle">Nenhum timbrado cadastrado.</p>';
  const owners = clinicSettings.owners?.length ? clinicSettings.owners : [{}];
  const professionals = clinicSettings.professionals?.length ? clinicSettings.professionals : [{}];
  return `<div class="page-heading"><div><p class="eyebrow">Identidade dos documentos</p><h1>Configurações da clínica</h1><p class="heading-copy">Estes dados serão usados na capa e na guia impressa.</p></div><button class="secondary-button" data-action="download-backup">Baixar backup da clínica</button></div>
    <form class="panel patient-form" id="settings-form">
      <div class="panel-header"><div><h2 class="panel-title">Timbrado e responsáveis</h2><p class="panel-subtitle">Somente administradores podem alterar estas informações.</p></div>${logo}</div>
      <div class="form-section">
        <div class="form-grid">
          <div class="field"><label>Nome da clínica *</label><input name="tradeName" value="${clinicSettings.tradeName || ''}" required /></div>
          <div class="field"><label>Razão social</label><input name="legalName" value="${clinicSettings.legalName || ''}" /></div>
          <div class="field"><label>CNPJ</label><input name="cnpj" value="${clinicSettings.cnpj || ''}" /></div>
          <div class="field"><label>CNES *</label><input name="cnes" inputmode="numeric" maxlength="7" value="${clinicSettings.cnes || ''}" placeholder="7 dígitos" required /><small>Cadastro Nacional de Estabelecimentos de Saúde.</small></div>
          <div class="field"><label>Telefone</label><input name="phone" value="${clinicSettings.phone || ''}" /></div>
          <div class="field"><label>Instagram</label><input name="instagram" value="${clinicSettings.instagram || ''}" /></div>
          <div class="field"><label>CEP</label><input name="postalCode" value="${clinicSettings.postalCode || ''}" /></div>
          <div class="field"><label>Endereço</label><input name="address" value="${clinicSettings.address || ''}" /></div>
          <div class="field"><label>Cidade</label><input name="city" value="${clinicSettings.city || ''}" /></div>
          <div class="field"><label>UF</label><input name="state" maxlength="2" value="${clinicSettings.state || ''}" /></div>
          <div class="field"><label>Logotipo (PNG ou JPEG)</label><input id="settings-logo" type="file" accept="image/png,image/jpeg" /><input type="hidden" name="logoDataUrl" value="${clinicSettings.logoDataUrl || ''}" /></div>
          <div class="field"><label>Papel timbrado A4 completo *</label><input id="settings-letterhead" type="file" accept="image/png,image/jpeg" /><input type="hidden" name="letterheadDataUrl" value="${clinicSettings.letterheadDataUrl || ''}" /><small>Envie uma imagem vertical A4, com cabeçalho, marca-d'água e rodapé. Ela será o fundo da capa.</small></div>
          <div class="field"><label>Área reservada para o cabeçalho (mm)</label><input name="letterheadHeaderMm" type="number" min="20" max="70" value="${clinicSettings.letterheadHeaderMm || 35}" /><small>Protege a logo e os dados no topo do timbrado.</small></div>
          <div class="field"><label>Área reservada para o rodapé (mm)</label><input name="letterheadFooterMm" type="number" min="15" max="50" value="${clinicSettings.letterheadFooterMm || 25}" /><small>Impede que atendimentos e assinaturas cubram o rodapé.</small></div>
        </div>
        <div class="owners-settings"><div class="owners-settings-heading"><div><label>Responsáveis e sócios que assinam a capa</label><small>Ative somente quem deve aparecer automaticamente no PDF.</small></div><button type="button" class="secondary-button" data-action="add-owner">＋ Adicionar responsável</button></div><div id="owners-settings-list">${owners.map(ownerRowHtml).join('')}</div></div>
        <div class="owners-settings"><div class="owners-settings-heading"><div><label>Profissionais da clínica</label><small>Conselho, UF e CBO são usados na guia eletrônica.</small></div><button type="button" class="secondary-button" data-action="add-professional">＋ Adicionar profissional</button></div><div id="professionals-settings-list">${professionals.map(professionalRowHtml).join('')}</div></div>
      </div>
      <div class="form-footer"><button class="primary-button" type="submit">Salvar configurações</button></div>
    </form>`;
}
function saveGuides() { localStorage.setItem(clinicStorageKey('guides'), JSON.stringify(guides)); }
function restoreDraft() { const draft = JSON.parse(localStorage.getItem(clinicStorageKey('draft')) || 'null'); if (!draft) return; Object.entries(draft).forEach(([key, value]) => { const field = document.querySelector(`#${key}`); if (field) field.value = value; }); }
function saveDraft(form) { localStorage.setItem(clinicStorageKey('draft'), JSON.stringify(Object.fromEntries(new FormData(form)))); }
function render(view = 'overview') { breadcrumb.textContent = views[view] || views.overview; const safeView = userCan(view) ? view : 'overview'; appView.innerHTML = safeView === 'overview' ? overview() : safeView === 'alerts' ? alertsView() : safeView === 'agenda' ? agendaView() : safeView === 'guides' ? guideList() : safeView === 'authorizations' ? authorizationsView() : safeView === 'batches' ? batchesView() : safeView === 'financeiro' ? financeView() : safeView === 'reports' ? reportsView() : safeView === 'patients' ? patientsView() : safeView === 'users' ? usersView() : safeView === 'convenios' ? insurersView() : safeView === 'feedback' ? feedbackView() : safeView === 'settings' ? settingsView() : listing(views[safeView], `Gerencie ${views[safeView].toLowerCase()} em um só lugar.`, '↗'); document.querySelectorAll('.nav-item').forEach(item => { const visible = userCan(item.dataset.view); item.style.display = visible ? '' : 'none'; item.classList.toggle('active', item.dataset.view === safeView && visible); }); if (safeView === 'batches') batches.forEach(batch => { const card = document.querySelector(`[data-batch-id="${batch.id}"]`); const select = card?.querySelector('[data-batch-status]'); if (select) select.value = batch.status; }); updateNotificationBadge(); }
function applySession() { const clinic = activeClinic; if (!clinic || !activeUser) return; const initials = clinic.initials || clinic.name.split(' ').map(name => name[0]).join('').slice(0, 2).toUpperCase(); document.querySelector('.workspace-switcher strong').textContent = clinic.name; document.querySelector('.workspace-switcher small').textContent = clinic.unit; document.querySelector('.workspace-switcher .avatar').textContent = initials; document.querySelector('#breadcrumb-clinic').textContent = clinic.name; document.querySelector('.profile strong').textContent = activeUser.name; document.querySelector('.profile small').textContent = activeUser.roleLabel || roleLabels[activeUser.role] || activeUser.role; document.querySelector('.user-button span:nth-child(2)').textContent = activeUser.name; document.querySelector('.user-button .avatar').textContent = activeUser.name.split(' ').map(name => name[0]).join('').slice(0, 2); }
function usersView(editId = '') { const selected = users.find(user => user.id === editId); return `<div class="page-heading"><div><p class="eyebrow">Acesso e segurança</p><h1>Usuários da clínica</h1><p class="heading-copy">Cadastre a equipe e mantenha cada acesso no perfil correto.</p></div></div><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Equipe</h2><p class="panel-subtitle">${users.filter(user => user.active !== false).length} acesso(s) ativo(s)</p></div></div><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th></th></tr></thead><tbody>${users.map(user => `<tr><td><strong>${user.name}</strong></td><td>${user.email}</td><td>${roleLabels[user.role] || user.role}</td><td><span class="status ${user.active === false ? 'error' : 'approved'}">${user.active === false ? 'Inativo' : 'Ativo'}</span></td><td><button class="text-button" data-action="edit-user" data-user-id="${user.id}">Editar</button></td></tr>`).join('')}</tbody></table></div><form class="panel patient-form" id="user-form" data-user-id="${selected?.id || ''}"><div class="panel-header"><div><h2 class="panel-title">${selected ? 'Editar usuário' : 'Novo usuário'}</h2><p class="panel-subtitle">${selected ? 'Deixe a senha vazia para manter a atual.' : 'A senha inicial deve possuir pelo menos 8 caracteres.'}</p></div></div><div class="form-section"><div class="form-grid"><div class="field"><label>Nome *</label><input name="name" value="${selected?.name || ''}" required /></div><div class="field"><label>E-mail *</label><input name="email" type="email" value="${selected?.email || ''}" required /></div><div class="field"><label>Perfil *</label><select name="role" required>${Object.entries(roleLabels).map(([value,label]) => `<option value="${value}" ${selected?.role === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="field"><label>${selected ? 'Nova senha' : 'Senha inicial *'}</label><input name="password" type="password" minlength="8" ${selected ? '' : 'required'} autocomplete="new-password" /></div>${selected ? `<label class="owner-active"><input name="active" type="checkbox" ${selected.active !== false ? 'checked' : ''} /> Usuário ativo</label>` : ''}</div></div><div class="form-footer"><button class="primary-button" type="submit">${selected ? 'Salvar alterações' : 'Cadastrar usuário'}</button>${selected ? '<button class="secondary-button" type="button" data-action="cancel-user-edit">Cancelar</button>' : ''}</div></form>`; }
function showToast(message) { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2800); }
function createTissXml(data, guideId) {
  const sessions = JSON.parse(data.sessions || '[]');
  const isConsulta = data.guideType === 'consulta';
  const rootTag = isConsulta ? 'guiaConsulta' : 'guiaSP_SADT';
  // A guia de Consulta TISS nao lista multiplos atendimentos como a SP/SADT
  // (que cobre uma competencia inteira) - e um unico atendimento avulso.
  const corpoGuia = isConsulta
    ? `<dadosConsulta><dataAtendimento>${escapeXml(data.date || '')}</dataAtendimento><tipoConsulta>${escapeXml(data.type || '')}</tipoConsulta><codigoTUSS>${escapeXml(data.serviceCode || '')}</codigoTUSS><valorConsulta>${escapeXml(data.value || '0')}</valorConsulta><profissionalExecutante>${escapeXml(data.professional || '')}</profissionalExecutante><registroProfissional>${escapeXml(data.professionalRegister || '')}</registroProfissional></dadosConsulta>`
    : (() => {
        const attendanceXml = sessions.length ? sessions.map(session => `<atendimento><data>${escapeXml(session.date)}</data><horaInicio>${escapeXml(session.start)}</horaInicio><horaFim>${escapeXml(session.end)}</horaFim><tipo>${escapeXml(session.type)}</tipo><procedimento>${escapeXml(session.procedure)}</procedimento><profissional>${escapeXml(session.professional)}</profissional></atendimento>`).join('') : `<atendimento><data>${escapeXml(data.date || '')}</data><horaInicio></horaInicio><horaFim></horaFim><tipo>${escapeXml(data.type || '')}</tipo><procedimento>${escapeXml(data.procedure || '')}</procedimento><profissional>${escapeXml(data.professional || '')}</profissional></atendimento>`;
        return `<dadosAtendimento><competencia>${escapeXml(data.competence || '')}</competencia><quantidadeAtendimentos>${sessions.length || escapeXml(data.quantity || '1')}</quantidadeAtendimentos><codigoTUSS>${escapeXml(data.serviceCode || '')}</codigoTUSS><valorUnitario>${escapeXml(data.value || '0')}</valorUnitario>${attendanceXml}<registroProfissional>${escapeXml(data.professionalRegister || '')}</registroProfissional></dadosAtendimento>`;
      })();
  return `<?xml version="1.0" encoding="UTF-8"?>
<mensagemTISS versao="4.01.00">
  <cabecalho><identificacaoTransacao><tipoTransacao>ENVIO_LOTE_GUIAS</tipoTransacao><sequencialTransacao>000001</sequencialTransacao><dataRegistroTransacao>${escapeXml(data.date || '')}</dataRegistroTransacao><horaRegistroTransacao>10:30:00</horaRegistroTransacao></identificacaoTransacao></cabecalho>
  <prestador><identificacao><CNPJ>${escapeXml(data.providerCnpj || '12.345.678/0001-90')}</CNPJ></identificacao><nomeContratado>${escapeXml(data.providerName || 'Clinica Sabia')}</nomeContratado></prestador>
  <guiasTISS><${rootTag}><cabecalhoGuia><registroANS>${escapeXml(data.ansCode || '000000')}</registroANS><numeroGuiaPrestador>${escapeXml(guideId || 'G-2026-DEMO')}</numeroGuiaPrestador></cabecalhoGuia><dadosAutorizacao><numeroGuiaOperadora>${escapeXml(data.operatorGuide || 'NAO_INFORMADO')}</numeroGuiaOperadora><numeroAutorizacao>${escapeXml(data.authorizationNumber || 'NAO_INFORMADO')}</numeroAutorizacao></dadosAutorizacao><beneficiario><numeroCarteira>${escapeXml(data.cardNumber || `${data.insurer}-DEMO`)}</numeroCarteira><nomeBeneficiario>${escapeXml(data.patient)}</nomeBeneficiario><dataNascimento>${escapeXml(data.patientBirth || '')}</dataNascimento><plano>${escapeXml(data.patientPlan || '')}</plano></beneficiario><indicacaoClinica><cid>${escapeXml(data.cid || '')}</cid></indicacaoClinica>${corpoGuia}<observacao>${escapeXml(data.notes || '')}</observacao></${rootTag}></guiasTISS>
</mensagemTISS>`;
}
function downloadXml(xml, guideId) {
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `guia-tiss-${guideId || 'demo'}.xml`;
  link.click();
  URL.revokeObjectURL(url);
}

function printGuideContent(title, rows) {
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) { showToast('Permita pop-ups para imprimir a guia.'); return; }
  printWindow.document.write(`<html><head><title>${title}</title><style>@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#17231f;padding:28px}h1{font-size:20px}p{color:#687770}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #dfe7e1;padding:9px;text-align:left;font-size:12px}th{background:#eef3ef}.print-brand{display:flex;align-items:center;gap:16px;font-size:14px;font-weight:700;border-bottom:3px solid #167c5a;padding-bottom:12px}.print-brand img{width:130px;height:42px;object-fit:contain}</style></head><body>${rows}</body></html>`);
  printWindow.document.close();
  setTimeout(() => { printWindow.focus(); printWindow.print(); }, 300);
}

function printGuideFolder(guide, session = null) {
  const sessions = session ? [session] : guide.sessions || [];
  const logoPaths = { Unimed: 'assets/planos/unimed.png', 'Bradesco Saúde': 'assets/planos/bradescosaude.png', SulAmérica: 'assets/planos/sulamerica.png', Amil: 'assets/planos/amil.png', 'Promédica': 'assets/planos/promedica.png' };
  const logoPath = logoPaths[guide.insurer] || '';
  const rows = `<div class="print-brand">${logoPath ? `<img src="${logoPath}" alt="Logo ${guide.insurer}">` : ''}<span>TISS flow · Guia SP/SADT</span></div><h1>Pasta da guia ${guide.id}</h1><p><strong>Paciente:</strong> ${guide.patient} &nbsp; <strong>Operadora:</strong> ${guide.insurer}</p><p><strong>Competência:</strong> ${guide.competence || guide.date} &nbsp; <strong>Valor:</strong> ${guide.value}</p><table><thead><tr><th>Data</th><th>Horário</th><th>Profissional</th><th>Serviço</th></tr></thead><tbody>${sessions.map(item => `<tr><td>${new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR')}</td><td>${item.start} às ${item.end}</td><td>${item.professional}</td><td>${item.procedure}</td></tr>`).join('')}</tbody></table>`;
  printGuideContent(session ? `Atendimento ${guide.id}` : `Pasta ${guide.id}`, rows);
}

async function downloadGuidePdf(guideId) {
  if (!activeSession?.token) { showToast('Entre pela API para gerar o PDF oficial da pasta.'); return; }
  try {
    const response = await fetch(`${apiBase}/guides/${encodeURIComponent(guideId)}/pdf`, { headers: apiHeaders() });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || 'Não foi possível gerar o PDF.'); }
    const blob = await response.blob();
    const xmlIsValid = response.headers.get('X-TISS-Valid') === 'true';
    const tissVersion = response.headers.get('X-TISS-Version') || '4.03.00';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `capa-e-guia-${guideId}.pdf`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('PDF com capa e guia gerado.');
  } catch (error) { showToast(error.message); }
}

async function downloadGuideAuditPdf(guideId) {
  if (!activeSession?.token) { showToast('Entre pela API para gerar o PDF oficial da auditoria.'); return; }
  try {
    const response = await fetch(`${apiBase}/guides/${encodeURIComponent(guideId)}/audit-pdf`, { headers: apiHeaders() });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || 'Não foi possível gerar o PDF da auditoria.'); }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `auditoria-guia-${guideId}.pdf`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('PDF da auditoria gerado com os feedbacks vinculados.');
  } catch (error) { showToast(error.message); }
}

async function refreshBatches() {
  if (activeSession?.token) batches = (await apiRequest('/batches')).map(normalizeBatch);
  else saveBatches();
}

async function downloadBatchXml(batchId) {
  if (!activeSession?.token) { showToast('O XML do lote depende da API local.'); return; }
  try {
    const response = await fetch(`${apiBase}/batches/${encodeURIComponent(batchId)}/xml`, { headers: apiHeaders() });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || 'Não foi possível gerar o XML do lote.'); }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `lote-${batchId}.xml`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    await refreshBatches();
    render('batches');
    showToast(xmlIsValid ? `XML TISS ${tissVersion} validado e gerado.` : `XML gerado, mas ainda possui erros no schema TISS ${tissVersion}.`);
  } catch (error) { showToast(error.message); }
}

function parsePeople(value, isOwner = false) {
  return String(value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const [name = '', title = '', council = ''] = line.split('|').map(part => part.trim());
    return { name, title, council, isOwner };
  });
}

function ownersFromSettingsForm(form) {
  return [...form.querySelectorAll('[data-owner-row]')].map(row => ({
    name: row.querySelector('[data-owner-field="name"]')?.value.trim() || '',
    title: row.querySelector('[data-owner-field="title"]')?.value.trim() || '',
    council: row.querySelector('[data-owner-field="council"]')?.value.trim() || '',
    active: Boolean(row.querySelector('[data-owner-field="active"]')?.checked),
    isOwner: true
  })).filter(owner => owner.name);
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-action="toggle-registration"]')) {
    const form = document.querySelector('#clinic-registration-form');
    form?.classList.toggle('hidden');
    document.querySelector('#register-clinic-name')?.focus();
  }
  const addButton = event.target.closest('[data-action="add-owner"]');
  if (addButton) {
    const list = document.querySelector('#owners-settings-list');
    if (list) list.insertAdjacentHTML('beforeend', ownerRowHtml({}, list.children.length));
    return;
  }
  const removeButton = event.target.closest('[data-action="remove-owner"]');
  if (removeButton) { removeButton.closest('[data-owner-row]')?.remove(); return; }
  const addProfessionalButton = event.target.closest('[data-action="add-professional"]');
  if (addProfessionalButton) {
    const list = document.querySelector('#professionals-settings-list');
    if (list) list.insertAdjacentHTML('beforeend', professionalRowHtml({}, list.children.length));
    return;
  }
  const removeProfessionalButton = event.target.closest('[data-action="remove-professional"]');
  if (removeProfessionalButton) removeProfessionalButton.closest('[data-professional-row]')?.remove();
});

document.addEventListener('change', event => {
  if (!['settings-logo', 'settings-letterhead'].includes(event.target.id) || !event.target.files[0]) return;
  const file = event.target.files[0];
  const maxSize = event.target.id === 'settings-letterhead' ? 5 : 2;
  if (file.size > maxSize * 1024 * 1024) { showToast(`A imagem deve ter no máximo ${maxSize} MB.`); event.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => { const fieldName = event.target.id === 'settings-letterhead' ? 'letterheadDataUrl' : 'logoDataUrl'; const hidden = event.target.form.querySelector(`[name="${fieldName}"]`); if (hidden) hidden.value = reader.result; showToast('Imagem carregada. Salve as configurações.'); };
  reader.readAsDataURL(file);
});

document.addEventListener('submit', async event => {
  if (event.target.id !== 'authorization-form') return;
  event.preventDefault(); event.stopImmediatePropagation();
  const payload = Object.fromEntries(new FormData(event.target));
  payload.authorizedQuantity = Number(payload.authorizedQuantity);
  payload.usedQuantity = Number(payload.usedQuantity || 0);
  try {
    if (activeSession?.token) { await apiRequest('/authorizations', { method: 'POST', body: JSON.stringify(payload) }); authorizations = await apiRequest('/authorizations'); }
    else { const patient = patients.find(item => item.id === payload.patientId); const insurer = insurers.find(item => item.id === payload.insurerId); if (patient?.insurer !== insurer?.name) throw new Error('O convênio é diferente do cadastro do paciente.'); authorizations.push({ id: `AUT-${Date.now()}`, patient: patient.name, insurer: insurer.name, ...payload }); saveAuthorizations(); }
    render('authorizations'); showToast('Autorização cadastrada e monitorada.');
  } catch (error) { showToast(error.message); }
}, true);

document.addEventListener('click', async event => {
  const updateButton = event.target.closest('[data-action="update-authorization"]');
  if (updateButton) {
    const row = updateButton.closest('[data-authorization-row]');
    const item = authorizations.find(entry => entry.id === updateButton.dataset.authorizationId);
    const payload = { usedQuantity: Number(row.querySelector('[data-authorization-used]').value), authorizedQuantity: Number(row.dataset.authorizedQuantity), validTo: row.dataset.validTo, notes: item?.notes || '' };
    try { if (activeSession?.token) { await apiRequest(`/authorizations/${updateButton.dataset.authorizationId}`, { method: 'PUT', body: JSON.stringify(payload) }); authorizations = await apiRequest('/authorizations'); } else { Object.assign(item, payload); saveAuthorizations(); } render('authorizations'); showToast('Saldo da autorização atualizado.'); } catch (error) { showToast(error.message); }
    return;
  }
  const button = event.target.closest('[data-action="delete-authorization"]');
  if (!button) return;
  try {
    if (activeSession?.token) { await apiRequest(`/authorizations/${button.dataset.authorizationId}`, { method: 'DELETE' }); authorizations = await apiRequest('/authorizations'); }
    else { authorizations = authorizations.filter(item => item.id !== button.dataset.authorizationId); saveAuthorizations(); }
    render('authorizations'); showToast('Autorização excluída.');
  } catch (error) { showToast(error.message); }
});

document.addEventListener('submit', async event => {
  if (event.target.id !== 'settings-form') return;
  event.preventDefault(); event.stopImmediatePropagation();
  const data = Object.fromEntries(new FormData(event.target));
  const payload = { ...data, owners: ownersFromSettingsForm(event.target), professionals: professionalsFromSettingsForm(event.target) };
  try {
    if (activeSession?.token) { await apiRequest('/settings', { method: 'PUT', body: JSON.stringify(payload) }); clinicSettings = await apiRequest('/settings'); }
    else { clinicSettings = payload; localStorage.setItem(clinicStorageKey('settings'), JSON.stringify(payload)); }
    render('settings'); showToast('Configurações da clínica salvas.');
  } catch (error) { showToast(error.message); }
}, true);

document.addEventListener('change', event => {
  if (!['batch-insurer', 'batch-competence'].includes(event.target.id)) return;
  const insurerId = document.querySelector('#batch-insurer')?.value;
  const insurerName = insurers.find(insurer => insurer.id === insurerId)?.name || '';
  const competence = document.querySelector('#batch-competence')?.value || '';
  const options = document.querySelector('#batch-guide-options');
  if (options) options.innerHTML = batchGuideOptions(insurerName, competence);
});

document.addEventListener('submit', async event => {
  if (event.target.id !== 'batch-form') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const data = new FormData(event.target);
  const insurerId = data.get('insurerId');
  const competence = data.get('competence');
  const guideIds = data.getAll('guideIds');
  if (!guideIds.length) { showToast('Selecione pelo menos uma guia para criar o lote.'); return; }
  try {
    if (activeSession?.token) {
      await apiRequest('/batches', { method: 'POST', body: JSON.stringify({ insurerId, competence, guideIds }) });
      await refreshBatches();
    } else {
      const insurer = insurers.find(item => item.id === insurerId);
      const selectedGuides = guides.filter(guide => guideIds.includes(guide.id));
      const id = `L-${competence.slice(0, 4)}-${String(batches.length + 1).padStart(4, '0')}`;
      batches.unshift({ id, insurerId, insurer: insurer.name, competence, deliveryFormat: insurer.deliveryFormat || 'both', status: 'draft', protocol: '', xmlGenerated: false, xmlPending: insurer.deliveryFormat !== 'pdf', missingSignedPdfs: insurer.deliveryFormat === 'xml' ? 0 : selectedGuides.length, readyForSending: false, guideCount: selectedGuides.length, totalValue: selectedGuides.reduce((sum, guide) => sum + Number(String(guide.value).replace(/[^0-9,]/g, '').replace(',', '.')), 0), guides: selectedGuides.map(guide => ({ ...guide, signedPdfReceived: false })) });
      saveBatches();
    }
    render('batches');
    showToast('Lote criado com as exigências do convênio.');
  } catch (error) { showToast(error.message); }
}, true);

document.addEventListener('change', async event => {
  if (event.target.dataset.action !== 'toggle-signed-pdf') return;
  const { batchId, guideId } = event.target.dataset;
  try {
    if (activeSession?.token) {
      await apiRequest(`/batches/${batchId}/guides/${guideId}`, { method: 'PATCH', body: JSON.stringify({ signedPdfReceived: event.target.checked }) });
      await refreshBatches();
    } else {
      const batch = batches.find(item => item.id === batchId);
      const guide = batch?.guides.find(item => item.id === guideId);
      if (guide) guide.signedPdfReceived = event.target.checked;
      if (batch) { batch.missingSignedPdfs = batch.guides.filter(item => !item.signedPdfReceived).length; batch.readyForSending = batch.missingSignedPdfs === 0 && !batch.xmlPending; }
      saveBatches();
    }
    render('batches');
  } catch (error) { event.target.checked = !event.target.checked; showToast(error.message); }
});

document.addEventListener('click', async event => {
  const xmlButton = event.target.closest('[data-action="download-batch-xml"]');
  if (xmlButton) { await downloadBatchXml(xmlButton.dataset.batchId); return; }
  const deleteButton = event.target.closest('[data-action="delete-batch"]');
  if (deleteButton) {
    const batchId = deleteButton.dataset.batchId;
    try {
      if (activeSession?.token) { await apiRequest(`/batches/${batchId}`, { method: 'DELETE' }); await refreshBatches(); }
      else { batches = batches.filter(batch => batch.id !== batchId); saveBatches(); }
      render('batches'); showToast('Lote em preparação excluído.');
    } catch (error) { showToast(error.message); }
    return;
  }
  const updateButton = event.target.closest('[data-action="update-batch"]');
  if (!updateButton) return;
  const card = updateButton.closest('[data-batch-id]');
  const batchId = updateButton.dataset.batchId;
  const status = card.querySelector('[data-batch-status]').value;
  const protocol = card.querySelector('[data-batch-protocol]').value.trim();
  try {
    if (activeSession?.token) {
      await apiRequest(`/batches/${batchId}`, { method: 'PATCH', body: JSON.stringify({ status, protocol }) });
      await refreshBatches();
    } else {
      Object.assign(batches.find(batch => batch.id === batchId), { status, protocol });
      saveBatches();
    }
    render('batches');
    showToast('Acompanhamento do lote atualizado.');
  } catch (error) { showToast(error.message); }
});

document.addEventListener('submit', async event => {
  if (event.target.id !== 'login-form') return;
  event.preventDefault();
  event.stopPropagation();
  const data = Object.fromEntries(new FormData(event.target));
  try {
    const session = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(data) });
    session.user.roleLabel = roleLabels[session.user.role] || session.user.role;
    localStorage.setItem('tiss-session', JSON.stringify({ ...session, userId: session.user.id }));
    window.location.reload();
  } catch (error) {
    showToast(error.message);
  }
}, true);

document.addEventListener('submit', async event => {
  if (event.target.id !== 'patient-form') return;
  if (event.target.dataset.patientId) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const data = Object.fromEntries(new FormData(event.target));
    try {
      if (activeSession?.token) {
        await apiRequest(`/patients/${event.target.dataset.patientId}`, { method: 'PATCH', body: JSON.stringify(data) });
        patients = await apiRequest('/patients');
      } else {
        const patient = patients.find(item => item.id === event.target.dataset.patientId);
        Object.assign(patient, data);
        localStorage.setItem(clinicStorageKey('patients'), JSON.stringify(patients));
      }
      render('patients');
      showToast('Dados do paciente atualizados.');
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const patient = { id: nextSequentialId(patients, 'P-', 3), ...data };
  try {
    if (activeSession?.token) {
      await apiRequest('/patients', { method: 'POST', body: JSON.stringify(patient) });
      patients = await apiRequest('/patients');
    } else {
      patients.unshift(patient);
      localStorage.setItem(clinicStorageKey('patients'), JSON.stringify(patients));
    }
    render('patients');
    showToast('Paciente cadastrado com dados do plano.');
  } catch (error) {
    showToast(error.message);
  }
});

function printFeedback(feedback) {
  const rows = `<div class="print-brand"><span>TISS flow · Feedback de atendimento</span></div><h1>Feedback — ${feedback.patient}</h1><p><strong>Profissional:</strong> ${feedback.professional} &nbsp; <strong>Data do atendimento:</strong> ${new Date(`${feedback.attendanceDate}T12:00:00`).toLocaleDateString('pt-BR')}</p><p><strong>Tipo:</strong> ${feedback.attendanceType || 'Não informado'} &nbsp; <strong>Guia vinculada:</strong> ${feedback.guideId || 'Particular / sem guia'}</p><p style="white-space:pre-wrap;margin-top:16px;border:1px solid #dfe7e1;padding:14px;border-radius:6px;">${feedback.content}</p>${feedback.photo ? `<img src="${feedback.photo}" alt="Foto do atendimento" style="max-width:100%;margin-top:16px;border-radius:6px;" />` : ''}`;
  printGuideContent(`Feedback ${feedback.patient}`, rows);
}

document.addEventListener('submit', async event => {
  if (event.target.id !== 'insurer-form') return;
  event.preventDefault();
  syncContractRules();
  const data = Object.fromEntries(new FormData(event.target));
  const acceptedProcedures = String(data.acceptedProcedures || '').split(',').map(code => code.trim()).filter(Boolean);
  const procedureRules = parseProcedureRules(data.procedureRulesText);
  const insurerId = event.target.dataset.insurerId;
  try {
    if (insurerId) {
      const payload = { name: data.name, ansCode: data.ansCode, contactEmail: data.contactEmail, contactPhone: data.contactPhone, providerCode: data.providerCode, deliveryFormat: data.deliveryFormat, acceptedProcedures, procedureRules };
      if (activeSession?.token) {
        await apiRequest(`/insurers/${insurerId}`, { method: 'PUT', body: JSON.stringify(payload) });
        insurers = await apiRequest('/insurers');
      } else {
        Object.assign(insurers.find(item => item.id === insurerId), payload);
        saveInsurers();
      }
      showToast('Convênio atualizado.');
    } else {
      const insurer = { id: nextSequentialId(insurers, 'INS-', 3), name: data.name, ansCode: data.ansCode, contactEmail: data.contactEmail, contactPhone: data.contactPhone, providerCode: data.providerCode, deliveryFormat: data.deliveryFormat, acceptedProcedures, procedureRules };
      if (activeSession?.token) {
        await apiRequest('/insurers', { method: 'POST', body: JSON.stringify(insurer) });
        insurers = await apiRequest('/insurers');
      } else {
        insurers.unshift(insurer);
        saveInsurers();
      }
      showToast('Convênio cadastrado.');
    }
    render('convenios');
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener('click', async event => {
  const editInsurerButton = event.target.closest('[data-action="edit-insurer"]');
  if (editInsurerButton) { editInsurer(editInsurerButton.dataset.insurerId); return; }
  const cancelInsurerButton = event.target.closest('[data-action="cancel-insurer-edit"]');
  if (cancelInsurerButton) { render('convenios'); return; }
  const deleteInsurerButton = event.target.closest('[data-action="delete-insurer"]');
  if (!deleteInsurerButton) return;
  const insurerId = deleteInsurerButton.dataset.insurerId;
  try {
    if (activeSession?.token) {
      await apiRequest(`/insurers/${insurerId}`, { method: 'DELETE' });
      insurers = await apiRequest('/insurers');
    } else {
      insurers = insurers.filter(item => item.id !== insurerId);
      saveInsurers();
    }
    render('convenios');
    showToast('Convênio excluído.');
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener('submit', async event => {
  if (event.target.id !== 'feedback-form') return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const feedback = { id: nextSequentialId(feedbacks, 'FB-', 4), guideId: data.guideId || null, patient: data.patient, professional: data.professional, attendanceDate: data.attendanceDate, attendanceType: data.attendanceType, content: data.content, photo: data.photo || null };
  try {
    if (activeSession?.token) {
      await apiRequest('/feedbacks', { method: 'POST', body: JSON.stringify(feedback) });
      feedbacks = await apiRequest('/feedbacks');
    } else {
      feedbacks.unshift(feedback);
      saveFeedbacks();
    }
    render('feedback');
    showToast('Feedback registrado.');
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener('click', async event => {
  const patientFolderButton = event.target.closest('[data-action="open-patient-folder"]');
  if (patientFolderButton) {
    breadcrumb.textContent = 'Pasta do paciente';
    appView.innerHTML = patientFolderView(patientFolderButton.dataset.patientId);
    return;
  }
  const downloadDocumentButton = event.target.closest('[data-action="download-patient-document"]');
  if (downloadDocumentButton) {
    await downloadPatientDocument(downloadDocumentButton.dataset.documentId);
    return;
  }
  const deleteDocumentButton = event.target.closest('[data-action="delete-patient-document"]');
  if (deleteDocumentButton) {
    const document = patientDocuments.find(item => item.id === deleteDocumentButton.dataset.documentId);
    if (!document || !window.confirm(`Excluir permanentemente o documento "${document.originalName}"?`)) return;
    try {
      await apiRequest(`/patient-documents/${document.id}`, { method: 'DELETE' });
      patientDocuments = await apiRequest('/patient-documents');
      appView.innerHTML = patientFolderView(deleteDocumentButton.dataset.patientId);
      showToast('Documento excluído.');
    } catch (error) { showToast(error.message); }
    return;
  }
  const auditButton = event.target.closest('[data-action="print-audit"]');
  if (auditButton) {
    await downloadGuideAuditPdf(auditButton.dataset.guideId);
    return;
  }
  const printFeedbackButton = event.target.closest('[data-action="print-feedback"]');
  if (printFeedbackButton) {
    const feedback = feedbacks.find(item => item.id === printFeedbackButton.dataset.feedbackId);
    if (feedback) printFeedback(feedback);
    return;
  }
  const deleteFeedbackButton = event.target.closest('[data-action="delete-feedback"]');
  if (!deleteFeedbackButton) return;
  const feedbackId = deleteFeedbackButton.dataset.feedbackId;
  try {
    if (activeSession?.token) {
      await apiRequest(`/feedbacks/${feedbackId}`, { method: 'DELETE' });
      feedbacks = await apiRequest('/feedbacks');
    } else {
      feedbacks = feedbacks.filter(item => item.id !== feedbackId);
      saveFeedbacks();
    }
    render('feedback');
    showToast('Feedback excluído.');
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener('submit', async event => {
  if (event.target.id !== 'patient-document-form') return;
  event.preventDefault();
  const form = event.target;
  const file = form.querySelector('[name="file"]')?.files?.[0];
  if (!file) { showToast('Selecione um documento.'); return; }
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) { showToast('Envie um arquivo PDF, PNG ou JPEG.'); return; }
  if (file.size > 6 * 1024 * 1024) { showToast('O documento deve possuir no máximo 6 MB.'); return; }
  const data = Object.fromEntries(new FormData(form));
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = 'Enviando...';
  try {
    const payload = { id: `DOC-${Date.now()}`, patientId: form.dataset.patientId, guideId: data.guideId || null, authorizationId: data.authorizationId || null, category: data.category, description: data.description, validUntil: data.validUntil || null, originalName: file.name, mimeType: file.type, contentDataUrl: await fileAsDataUrl(file) };
    await apiRequest('/patient-documents', { method: 'POST', body: JSON.stringify(payload) });
    patientDocuments = await apiRequest('/patient-documents');
    appView.innerHTML = patientFolderView(form.dataset.patientId);
    showToast('Documento anexado à pasta do paciente.');
  } catch (error) {
    submitButton.disabled = false;
    submitButton.textContent = 'Anexar documento';
    showToast(error.message);
  }
});

document.addEventListener('submit', async event => {
  if (event.target.id !== 'appointment-form') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const form = event.target;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form));
  const patient = patients.find(item => item.id === data.patientId);
  try {
    if (activeSession?.token) {
      const result = await apiRequest('/appointments', { method: 'POST', body: JSON.stringify(data) });
      appointments = await apiRequest('/appointments');
      selectedAgendaDate = data.date;
      render('agenda');
      showToast(result.ids.length > 1 ? `${result.ids.length} atendimentos semanais reservados.` : 'Atendimento reservado.');
    } else {
      const repeatWeeks = Number(data.repeatWeeks || 1);
      const recurrenceId = repeatWeeks > 1 ? `REC-${Date.now()}` : null;
      const candidates = Array.from({ length: repeatWeeks }, (_, index) => { const date = new Date(`${data.date}T12:00:00`); date.setDate(date.getDate() + index * 7); return { id: `A-${Date.now()}-${index + 1}`, patientId: data.patientId, patient: patient?.name || '', professional: data.professional, date: date.toISOString().slice(0, 10), start: data.start, duration: Number(data.duration), type: data.type, status: 'scheduled', recurrenceId }; });
      const conflict = candidates.find(candidate => hasScheduleConflict(candidate));
      if (conflict) throw new Error(`Existe conflito de horário em ${new Date(`${conflict.date}T12:00:00`).toLocaleDateString('pt-BR')}.`);
      appointments.push(...candidates); saveAppointments(); selectedAgendaDate = data.date; render('agenda'); showToast(`${candidates.length} atendimento(s) reservado(s).`);
    }
  } catch (error) { showToast(error.message); }
}, true);

document.addEventListener('change', async event => {
  if (event.target.id === 'agenda-date') { selectedAgendaDate = event.target.value; render('agenda'); return; }
  if (!event.target.classList.contains('appointment-status')) return;
  const appointment = appointments.find(item => item.id === event.target.dataset.appointmentId);
  if (!appointment) return;
  const previous = appointment.status || 'scheduled';
  try {
    if (activeSession?.token) {
      await apiRequest(`/appointments/${appointment.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: event.target.value }) });
      [appointments, authorizations] = await Promise.all([apiRequest('/appointments'), apiRequest('/authorizations')]);
    } else { appointment.status = event.target.value; saveAppointments(); }
    render('agenda'); showToast(`Atendimento marcado como ${appointmentStatusLabels[appointment.status].toLowerCase()}.`);
  } catch (error) { appointment.status = previous; render('agenda'); showToast(error.message); }
});

document.addEventListener('click', async event => {
  const feedbackButton = event.target.closest('[data-action="feedback-from-appointment"]');
  if (feedbackButton) {
    const appointment = appointments.find(item => item.id === feedbackButton.dataset.appointmentId);
    if (!appointment) return;
    breadcrumb.textContent = 'Feedback do atendimento';
    appView.innerHTML = feedbackView();
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'feedback'));
    document.querySelector('#feedback-patient').value = appointment.patient;
    document.querySelector('#feedback-professional').value = appointment.professional;
    document.querySelector('#feedback-date').value = appointment.date;
    document.querySelector('#feedback-type').value = ['Consulta', 'Exame'].includes(appointment.type) ? appointment.type : 'Terapia';
    refreshFeedbackGuideOptions();
    document.querySelector('#feedback-content').focus();
    showToast('Dados do atendimento preenchidos. Complete apenas a evolução.');
    return;
  }
  const button = event.target.closest('[data-action="delete-appointment"]');
  if (!button) return;
  const appointment = appointments.find(item => item.id === button.dataset.appointmentId);
  if (!appointment || !window.confirm(`Excluir o atendimento de ${appointment.patient} em ${new Date(`${appointment.date}T12:00:00`).toLocaleDateString('pt-BR')}?`)) return;
  try {
    if (activeSession?.token) { await apiRequest(`/appointments/${appointment.id}`, { method: 'DELETE' }); appointments = await apiRequest('/appointments'); }
    else { appointments = appointments.filter(item => item.id !== appointment.id); saveAppointments(); }
    render('agenda'); showToast('Atendimento excluído.');
  } catch (error) { showToast(error.message); }
});

document.addEventListener('click', async event => {
  const statusButton = event.target.closest('[data-invoice-id]');
  if (!statusButton || !activeSession?.token) return;
  event.preventDefault();
  event.stopPropagation();
  const invoice = invoices.find(item => item.id === statusButton.dataset.invoiceId);
  if (!invoice) return;
  try {
    invoice.status = invoice.status === 'received' ? 'pending' : 'received';
    await apiRequest(`/invoices/${invoice.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: invoice.status }) });
    render('financeiro');
    showToast(invoice.status === 'received' ? 'Nota marcada como recebida.' : 'Nota movida para pendente.');
  } catch (error) {
    showToast(error.message);
  }
}, true);

document.addEventListener('click', async event => {
  const deleteButton = event.target.closest('[data-delete-invoice-id]');
  if (!deleteButton || !activeSession?.token) return;
  event.preventDefault();
  event.stopPropagation();
  try {
    await apiRequest(`/invoices/${deleteButton.dataset.deleteInvoiceId}`, { method: 'DELETE' });
    invoices = invoices.filter(invoice => invoice.id !== deleteButton.dataset.deleteInvoiceId);
    render('financeiro');
    showToast('Nota fiscal excluída na API.');
  } catch (error) {
    showToast(error.message);
  }
}, true);

document.addEventListener('submit', async event => {
  if (event.target.id !== 'glosa-form' || !activeSession?.token) return;
  event.preventDefault();
  event.stopPropagation();
  const guideId = event.target.dataset.guideId;
  const data = Object.fromEntries(new FormData(event.target));
  try {
    await apiRequest(`/guides/${guideId}/glosa`, { method: 'POST', body: JSON.stringify(data) });
    const [apiGlosas, apiGuides] = await Promise.all([apiRequest('/glosas'), apiRequest('/guides')]);
    glosas = apiGlosas.map(normalizeGlosa);
    guides = apiGuides.map(normalizeGuide);
    appView.innerHTML = guideFolderView(guideId);
    showToast('Glosa registrada.');
  } catch (error) {
    showToast(error.message);
  }
}, true);

document.addEventListener('submit', async event => {
  if (event.target.id !== 'recurso-form' || !activeSession?.token) return;
  event.preventDefault();
  event.stopPropagation();
  const glosaId = event.target.dataset.glosaId;
  const data = Object.fromEntries(new FormData(event.target));
  const guideId = guides.find(guide => glosas.some(g => g.id === glosaId && g.guideId === guide.id))?.id;
  try {
    await apiRequest(`/glosas/${glosaId}/recurso`, { method: 'POST', body: JSON.stringify(data) });
    const [apiGlosas, apiGuides] = await Promise.all([apiRequest('/glosas'), apiRequest('/guides')]);
    glosas = apiGlosas.map(normalizeGlosa);
    guides = apiGuides.map(normalizeGuide);
    appView.innerHTML = guideFolderView(guideId);
    showToast('Recurso enviado à operadora.');
  } catch (error) {
    showToast(error.message);
  }
}, true);

document.addEventListener('click', async event => {
  const resolveButton = event.target.closest('[data-action="resolve-glosa"]');
  if (!resolveButton || !activeSession?.token) return;
  event.preventDefault();
  event.stopPropagation();
  const glosaId = resolveButton.dataset.glosaId;
  const guideId = guides.find(guide => glosas.some(g => g.id === glosaId && g.guideId === guide.id))?.id;
  try {
    await apiRequest(`/glosas/${glosaId}/resolve`, { method: 'POST', body: JSON.stringify({ outcome: resolveButton.dataset.outcome }) });
    const [apiGlosas, apiGuides] = await Promise.all([apiRequest('/glosas'), apiRequest('/guides')]);
    glosas = apiGlosas.map(normalizeGlosa);
    guides = apiGuides.map(normalizeGuide);
    appView.innerHTML = guideFolderView(guideId);
    showToast(resolveButton.dataset.outcome === 'revertida' ? 'Glosa revertida.' : 'Glosa mantida.');
  } catch (error) {
    showToast(error.message);
  }
}, true);

document.addEventListener('submit', async event => {
  if (event.target.id !== 'invoice-form' || !activeSession?.token) return;
  event.preventDefault();
  event.stopPropagation();
  const data = Object.fromEntries(new FormData(event.target));
  try {
    await apiRequest('/invoices', { method: 'POST', body: JSON.stringify({ id: data.number, guideId: data.guideId, provider: data.provider, description: data.description, amount: data.amount, expectedDate: data.expectedDate }) });
    const apiInvoices = await apiRequest('/invoices');
    invoices = apiInvoices.map(normalizeInvoice);
    render('financeiro');
    showToast('Nota fiscal cadastrada na API.');
  } catch (error) {
    showToast(error.message);
  }
}, true);

document.addEventListener('submit', async event => {
  if (event.target.id !== 'guide-form' || !activeSession?.token) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const form = event.target;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const data = Object.fromEntries(new FormData(form));
  if (!data.serviceCode || !data.procedure.startsWith(`${data.serviceCode} - `)) { showToast('Selecione um procedimento na lista oficial TUSS.'); document.querySelector('#procedure')?.focus(); return; }
  let sessions = JSON.parse(data.sessions || '[]');
  if (!sessions.length) {
    if (data.guideType === 'consulta' && data.date && data.procedure && data.professional) {
      sessions = [{ date: data.date, start: '08:00', end: '09:00', type: data.type, procedure: data.procedure, professional: data.professional }];
    } else {
      showToast('Adicione pelo menos um atendimento à competência antes de enviar.');
      return;
    }
  }
  const outOfValidityDate = findSessionOutsidePlanValidity(sessions, data.planValidity);
  if (outOfValidityDate) { showToast(`Atendimento em ${new Date(`${outOfValidityDate}T12:00:00`).toLocaleDateString('pt-BR')} está fora da vigência do plano (válido até ${new Date(`${data.planValidity}T12:00:00`).toLocaleDateString('pt-BR')}).`); return; }
  const cidIssue = findCidIncompatibility(data.procedure, data.cid);
  if (cidIssue) { showToast(`CID ${data.cid.toUpperCase()} é incomum para ${cidIssue.label} (esperado capítulo ${cidIssue.chapters.join('/')}). Confira antes de enviar.`); return; }
  const guideId = nextSequentialId(guides, 'G-2026-', 5);
  try {
    await apiRequest('/guides', { method: 'POST', body: JSON.stringify({
      id: guideId,
      patient: data.patient,
      procedure: data.procedure,
      insurer: data.insurer,
      competence: data.competence,
      ansCode: data.ansCode,
      cardNumber: data.cardNumber,
      patientBirth: data.patientBirth,
      patientPlan: data.patientPlan,
      planValidity: data.planValidity,
      authorizationNumber: data.authorizationNumber,
      operatorGuide: data.operatorGuide,
      providerName: data.providerName,
      providerCnpj: data.providerCnpj,
      professional: data.professional,
      professionalRegister: data.professionalRegister,
      attendanceType: data.type,
      serviceCode: data.serviceCode,
      quantity: sessions.length,
      unitValue: Number(data.value || 0),
      value: Number(data.value || 0) * sessions.length,
      sessions,
      guideType: data.guideType || 'sp_sadt',
      cid: data.cid,
      authorizedQuantity: data.authorizedQuantity
    }) });
    const apiGuides = await apiRequest('/guides');
    guides = apiGuides.map(normalizeGuide);
    localStorage.removeItem(clinicStorageKey('draft'));
    downloadXml(createTissXml(data, guideId), guideId);
    render('guides');
    showToast('Guia e atendimentos salvos na API.');
  } catch (error) {
    showToast(error.message);
  }
}, true);

document.addEventListener('submit', event => {
  if (event.target.id !== 'glosa-form' || activeSession?.token) return;
  event.preventDefault();
  const guideId = event.target.dataset.guideId;
  const data = Object.fromEntries(new FormData(event.target));
  const glosaId = `GL-${Date.now()}`;
  glosas.unshift({ id: glosaId, guideId, code: data.code, reason: data.reason, amount: Number(data.amount || 0), status: 'aberta' });
  const guide = guides.find(item => item.id === guideId);
  if (guide) { guide.status = 'error'; guide.label = 'Com glosa'; }
  saveGlosas();
  saveGuides();
  appView.innerHTML = guideFolderView(guideId);
  showToast('Glosa registrada.');
});

document.addEventListener('submit', event => {
  if (event.target.id !== 'recurso-form' || activeSession?.token) return;
  event.preventDefault();
  const glosaId = event.target.dataset.glosaId;
  const data = Object.fromEntries(new FormData(event.target));
  const glosa = glosas.find(item => item.id === glosaId);
  if (!glosa) return;
  glosa.status = 'recurso_enviado';
  glosa.justification = data.justification;
  const guide = guides.find(item => item.id === glosa.guideId);
  if (guide) { guide.status = 'recurso'; guide.label = 'Recurso enviado'; }
  saveGlosas();
  saveGuides();
  appView.innerHTML = guideFolderView(glosa.guideId);
  showToast('Recurso enviado à operadora.');
});

document.addEventListener('click', event => { const viewButton = event.target.closest('[data-view]'); if (viewButton) { document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === viewButton.dataset.view)); render(viewButton.dataset.view); } const statusButton = event.target.closest('[data-status]'); if (statusButton) { const guideId = document.querySelector('#status-guide')?.value; if (!guideId) { showToast('Selecione uma guia antes de registrar o retorno.'); return; } if (statusButton.dataset.status === 'error') { document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'guides')); breadcrumb.textContent = 'Pasta da guia'; appView.innerHTML = guideFolderView(guideId); showToast('Registre o motivo e o valor da glosa na pasta da guia.'); return; } const statusLabels = { review: 'Em análise', approved: 'Aprovada' }; const guide = guides.find(item => item.id === guideId); guide.status = statusButton.dataset.status; guide.label = statusLabels[guide.status]; saveGuides(); render('guides'); showToast(`Retorno registrado: ${guide.label}.`); } const action = event.target.closest('[data-action]')?.dataset.action; if (action === 'logout') { localStorage.removeItem('tiss-session'); window.location.reload(); } if (action === 'open-guide-folder') { breadcrumb.textContent = 'Pasta da guia'; appView.innerHTML = guideFolderView(event.target.closest('[data-guide-id]').dataset.guideId); } if (action === 'print-folder') { const guide = guides.find(item => item.id === event.target.closest('[data-guide-id]').dataset.guideId); if (guide) downloadGuidePdf(guide.id); } if (action === 'print-session') { const button = event.target.closest('[data-guide-id]'); const guide = guides.find(item => item.id === button.dataset.guideId); if (guide) printGuideFolder(guide, guide.sessions[Number(button.dataset.sessionIndex)]); } if (action === 'new-guide') { document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'guides')); const guideType = event.target.closest('[data-guide-type]')?.dataset.guideType; breadcrumb.textContent = guideType === 'consulta' ? 'Nova guia de Consulta' : 'Nova guia'; appView.innerHTML = guideType === 'consulta' ? guideFormConsulta() : guideFormMonthly(); restoreDraft(); } if (action === 'new-appointment') { breadcrumb.textContent = 'Novo atendimento'; document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'agenda')); appView.innerHTML = agendaView(); document.querySelector('#appointment-patient')?.focus(); } if (action === 'clear-guides') { guides = [...defaultGuides]; saveGuides(); render('guides'); showToast('Dados demo restaurados.'); } if (action === 'resolve-glosa' && !activeSession?.token) { const button = event.target.closest('[data-glosa-id]'); const glosa = glosas.find(item => item.id === button.dataset.glosaId); if (!glosa) return; glosa.status = button.dataset.outcome; glosa.resolvedAt = new Date().toISOString(); const guide = guides.find(item => item.id === glosa.guideId); if (guide) { guide.status = glosa.status === 'revertida' ? 'approved' : 'error'; guide.label = glosa.status === 'revertida' ? 'Aprovada' : 'Com glosa'; } saveGlosas(); saveGuides(); appView.innerHTML = guideFolderView(glosa.guideId); showToast(glosa.status === 'revertida' ? 'Glosa revertida.' : 'Glosa mantida.'); } if (action === 'soon') showToast('Demonstração em preparação.'); });
document.addEventListener('input', event => {
  if (event.target.classList.contains('contract-procedure-search')) {
    const row = event.target.closest('.contract-rule-row');
    row.dataset.code = '';
    syncContractRules();
    clearTimeout(contractSearchTimer);
    const query = event.target.value.trim();
    const results = row.querySelector('.contract-search-results');
    if (query.length < 2) { results.hidden = true; results.replaceChildren(); return; }
    contractSearchTimer = setTimeout(async () => {
      results.hidden = false;
      results.textContent = 'Buscando…';
      try {
        const catalog = await apiRequest(`/tuss?query=${encodeURIComponent(query)}&limit=8`);
        results.replaceChildren();
        catalog.terms.forEach(term => {
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'contract-search-result'; button.dataset.code = term.code; button.dataset.term = term.term;
          button.textContent = `${term.code} · ${term.term}`;
          results.append(button);
        });
        if (!catalog.terms.length) results.textContent = 'Nenhum procedimento encontrado.';
      } catch (error) { results.textContent = error.message; }
    }, 250);
  }
  if (event.target.id === 'procedure') {
    const serviceCode = document.querySelector('#service-code');
    if (serviceCode) serviceCode.value = '';
    event.target.setCustomValidity('Selecione um procedimento da lista oficial TUSS.');
    clearTimeout(tussSearchTimer);
    const query = event.target.value.trim();
    tussSearchTimer = setTimeout(() => searchTussTerms(query), 250);
  }
  if (event.target.id === 'guide-search') {
    const body = document.querySelector('#guide-table-body');
    if (body) body.innerHTML = guideRowsHtml(event.target.value);
  }
  if (event.target.id === 'patient-search') {
    const body = document.querySelector('#patient-table-body');
    if (body) body.innerHTML = patientRowsHtml(event.target.value);
  }
  if (event.target.id === 'insurer-search') {
    const body = document.querySelector('#insurer-table-body');
    if (body) body.innerHTML = insurerRowsHtml(event.target.value);
  }
  if (event.target.id === 'feedback-search') {
    const body = document.querySelector('#feedback-table-body');
    if (body) body.innerHTML = feedbackRowsHtml(event.target.value);
  }
});
document.addEventListener('click', event => {
  const addContractRule = event.target.closest('[data-action="add-contract-rule"]');
  if (addContractRule) {
    const list = document.querySelector('#contract-rule-list');
    const row = contractRuleRow();
    list?.append(row);
    row.querySelector('.contract-procedure-search')?.focus();
    return;
  }
  const removeContractRule = event.target.closest('[data-action="remove-contract-rule"]');
  if (removeContractRule) { removeContractRule.closest('.contract-rule-row')?.remove(); syncContractRules(); return; }
  const newAdjustment = event.target.closest('[data-action="new-contract-adjustment"]');
  if (newAdjustment) {
    const source = newAdjustment.closest('.contract-rule-row');
    if (!source.dataset.code) { showToast('Selecione primeiro um procedimento TUSS para criar o reajuste.'); source.querySelector('.contract-procedure-search')?.focus(); return; }
    const rule = { code: source.dataset.code, unitValue: Number(source.querySelector('.contract-value')?.value || 0), maxSessions: Number(source.querySelector('.contract-max-sessions')?.value || 0), requiresAuthorization: Boolean(source.querySelector('.contract-requires-authorization')?.checked), validFrom: '', validTo: '' };
    const row = contractRuleRow(rule);
    row.querySelector('.contract-procedure-search').value = source.querySelector('.contract-procedure-search').value;
    source.after(row);
    syncContractRules();
    row.querySelector('.contract-value')?.focus();
    showToast('Novo período criado. Informe o valor e a vigência do reajuste.');
    return;
  }
  const contractResult = event.target.closest('.contract-search-result');
  if (contractResult) {
    const row = contractResult.closest('.contract-rule-row');
    row.dataset.code = contractResult.dataset.code;
    row.querySelector('.contract-procedure-search').value = `${contractResult.dataset.code} - ${contractResult.dataset.term}`;
    row.querySelector('.contract-search-results').hidden = true;
    syncContractRules();
    row.querySelector('.contract-value')?.focus();
    return;
  }
  const tussResult = event.target.closest('.tuss-result');
  if (tussResult) {
    const procedure = document.querySelector('#procedure');
    const serviceCode = document.querySelector('#service-code');
    if (procedure && serviceCode) {
      procedure.value = `${tussResult.dataset.code} - ${tussResult.dataset.term}`;
      procedure.setCustomValidity('');
      serviceCode.value = tussResult.dataset.code;
      closeTussResults();
      applyContractRule(tussResult.dataset.code);
      procedure.focus();
    }
    return;
  }
  const editButton = event.target.closest('[data-action="edit-patient"]');
  if (editButton) editPatient(editButton.dataset.patientId);
});
document.addEventListener('submit', event => {
  // Observação: o login-form NÃO tem fallback offline aqui de propósito.
  // O submit de login é sempre interceptado (capture phase, sem checar sessão)
  // pelo listener no topo do arquivo, que fala direto com a API. Abrir apenas
  // frontend/index.html sem o backend rodando faz o login falhar por erro de
  // rede — isso é uma limitação conhecida do modo somente-visual, não um bug
  // deste bloco. Guias, agenda e notas fiscais têm fallback local abaixo porque
  // não dependem de autenticação real.
  if (event.target.id === 'appointment-form') { event.preventDefault(); const form = event.target; if (!form.checkValidity()) { form.reportValidity(); return; } const data = Object.fromEntries(new FormData(form)); const conflict = hasScheduleConflict(data); if (conflict) { showToast(`Conflito: ${conflict.professional} já atende ${conflict.patient} às ${conflict.start}.`); return; } appointments.push({ id: nextSequentialId(appointments, 'A-', 3), ...data, duration: Number(data.duration) }); saveAppointments(); render('agenda'); showToast('Horário reservado sem conflito.'); return; } if (event.target.id !== 'guide-form') return; event.preventDefault(); const form = event.target; if (!form.checkValidity()) { form.reportValidity(); return; } const data = Object.fromEntries(new FormData(form)); let sessions = JSON.parse(data.sessions || '[]'); if (!sessions.length) { if (data.guideType === 'consulta' && data.date && data.procedure && data.professional) { sessions = [{ date: data.date, start: '08:00', end: '09:00', type: data.type, procedure: data.procedure, professional: data.professional }]; } else { showToast('Adicione pelo menos um atendimento à competência antes de enviar.'); return; } } const outOfValidityDate = findSessionOutsidePlanValidity(sessions, data.planValidity); if (outOfValidityDate) { showToast(`Atendimento em ${new Date(`${outOfValidityDate}T12:00:00`).toLocaleDateString('pt-BR')} está fora da vigência do plano (válido até ${new Date(`${data.planValidity}T12:00:00`).toLocaleDateString('pt-BR')}).`); return; } const cidIssueLocal = findCidIncompatibility(data.procedure, data.cid); if (cidIssueLocal) { showToast(`CID ${data.cid.toUpperCase()} é incomum para ${cidIssueLocal.label} (esperado capítulo ${cidIssueLocal.chapters.join('/')}). Confira antes de enviar.`); return; } const guideId = nextSequentialId(guides, 'G-2026-', 5); const xml = createTissXml(data, guideId); const totalValue = Number(data.value || 0) * sessions.length; guides.unshift({ id: guideId, patient: data.patient, procedure: data.procedure.split(' - ')[1] || data.procedure, insurer: data.insurer, status: 'sent', label: 'Pronta para envio', date: data.competence || sessions[0].date, competence: data.competence, guideType: data.guideType || 'sp_sadt', value: formatMoney(totalValue), sessions }); saveGuides(); localStorage.removeItem(clinicStorageKey('draft')); downloadXml(xml, guideId); showToast(`${sessions.length} atendimentos validados, guia salva e XML baixado.`); });
document.addEventListener('click', event => {
  const deleteButton = event.target.closest('[data-delete-invoice-id]');
  if (deleteButton) {
    invoices = invoices.filter(invoice => invoice.id !== deleteButton.dataset.deleteInvoiceId);
    saveInvoices();
    render('financeiro');
    showToast('Nota fiscal excluída.');
    return;
  }

  const invoiceButton = event.target.closest('[data-invoice-id]');
  if (!invoiceButton) return;
  const invoice = invoices.find(item => item.id === invoiceButton.dataset.invoiceId);
  if (!invoice) return;
  invoice.status = invoice.status === 'received' ? 'pending' : 'received';
  saveInvoices();
  render('financeiro');
  showToast(invoice.status === 'received' ? 'Nota marcada como recebida.' : 'Nota movida para pendente.');
});

document.addEventListener('change', event => {
  if (event.target.matches('.contract-value, .contract-max-sessions, .contract-valid-from, .contract-valid-to, .contract-requires-authorization')) syncContractRules();
  if (event.target.matches('#competence, #date')) {
    const selectedProcedureCode = document.querySelector('#service-code')?.value;
    if (selectedProcedureCode) applyContractRule(selectedProcedureCode);
  }
  if (event.target.id === 'patient') {
    const patient = patients.find(item => item.name === event.target.value);
    if (patient) {
      const fields = { 'card-number': patient.cardNumber, 'patient-birth': patient.birthDate, 'patient-plan': patient.plan, 'plan-validity': patient.planValidity, 'ans-code': patient.ansCode };
      Object.entries(fields).forEach(([id, value]) => { const field = document.querySelector(`#${id}`); if (field) field.value = value; });
      const insurer = document.querySelector('#insurer');
      if (insurer) { insurer.value = patient.insurer; insurer.dispatchEvent(new Event('change', { bubbles: true })); }
      showToast('Dados do plano preenchidos pelo cadastro do paciente.');
    }
  }
  if (event.target.id === 'feedback-patient' || event.target.id === 'feedback-date') refreshFeedbackGuideOptions();
  if (event.target.id === 'feedback-photo') {
    const dataField = document.querySelector('#feedback-photo-data');
    const file = event.target.files?.[0];
    if (!file || !dataField) return;
    if (file.size > 4 * 1024 * 1024) { showToast('Foto muito grande — escolha uma imagem de até 4MB.'); event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => { dataField.value = reader.result; };
    reader.readAsDataURL(file);
  }
  if (event.target.classList.contains('folder-service')) {
    const guide = guides.find(item => item.id === event.target.dataset.guideId);
    const session = guide?.sessions?.[Number(event.target.dataset.sessionIndex)];
    if (session) {
      session.procedure = event.target.value;
      guide.procedure = event.target.value.split(' - ')[1] || event.target.value;
      saveGuides();
      if (activeSession?.token) apiRequest(`/guides/${guide.id}/sessions/${event.target.dataset.sessionIndex}`, { method: 'PATCH', body: JSON.stringify({ procedure: event.target.value }) }).catch(error => showToast(error.message));
      showToast('Serviço do atendimento atualizado.');
    }
    return;
  }

  if (event.target.id === 'insurer') {
    const option = event.target.selectedOptions[0];
    const logo = document.querySelector('#plan-logo');
    const logoImage = document.querySelector('#plan-logo-image');
    const name = document.querySelector('#plan-name');
    const ansCode = document.querySelector('#ans-code');
    if (logo) logo.textContent = option.dataset.logo || 'TISS';
    if (logoImage) {
      logoImage.src = option.dataset.logoPath || '';
      logoImage.alt = option.value ? `Logo ${option.value}` : 'Logo da operadora';
      logoImage.hidden = !option.dataset.logoPath;
      logoImage.onerror = () => { logoImage.hidden = true; if (logo) logo.hidden = false; };
    }
    if (logo) logo.hidden = Boolean(option.dataset.logoPath);
    if (name) name.textContent = option.value || 'Selecione a operadora';
    if (ansCode) ansCode.value = option.dataset.code || '';
    const selectedProcedureCode = document.querySelector('#service-code')?.value;
    if (selectedProcedureCode) applyContractRule(selectedProcedureCode);
  }

  if (event.target.id === 'professional') {
    const option = event.target.selectedOptions[0];
    const register = document.querySelector('#professional-register');
    if (register) register.value = option.dataset.register || '';
  }

  if (event.target.id !== 'invoice-filter') return;
  const selectedStatus = event.target.value;
  document.querySelectorAll('[data-invoice-status]').forEach(row => {
    row.hidden = selectedStatus !== 'all' && row.dataset.invoiceStatus !== selectedStatus;
  });
});

function updateSessionList() {
  const list = document.querySelector('#session-list');
  const hidden = document.querySelector('#guide-sessions');
  if (!list || !hidden) return;
  const sessions = JSON.parse(hidden.value || '[]');
  list.innerHTML = sessions.length ? sessions.map((session, index) => `<div class="session-row"><span><strong>${index + 1}. ${new Date(`${session.date}T12:00:00`).toLocaleDateString('pt-BR')}</strong><small>${session.start} às ${session.end} · ${session.type}</small></span><button type="button" class="finance-delete" data-remove-session="${index}">Remover</button></div>`).join('') : '<p class="session-empty">Nenhum atendimento adicionado ainda.</p>';
}

document.addEventListener('click', event => {
  const addSession = event.target.closest('[data-action="add-session"]');
  if (addSession) {
    const date = document.querySelector('#session-date')?.value;
    const start = document.querySelector('#session-start')?.value;
    const end = document.querySelector('#session-end')?.value;
    const type = document.querySelector('#attendance-type')?.value;
    const procedure = document.querySelector('#procedure')?.value;
    const professional = document.querySelector('#professional')?.value;
    const hidden = document.querySelector('#guide-sessions');
    if (!date || !start || !end || !type || !procedure || !professional) { showToast('Preencha data, horário, tipo, procedimento e profissional antes de adicionar.'); return; }
    if (end <= start) { showToast('O horário final deve ser maior que o horário inicial.'); return; }
    const sessions = JSON.parse(hidden.value || '[]');
    sessions.push({ date, start, end, type, procedure, professional });
    hidden.value = JSON.stringify(sessions);
    updateSessionList();
    showToast('Atendimento adicionado à competência.');
    return;
  }

  const removeSession = event.target.closest('[data-remove-session]');
  if (removeSession) {
    const hidden = document.querySelector('#guide-sessions');
    const sessions = JSON.parse(hidden.value || '[]');
    sessions.splice(Number(removeSession.dataset.removeSession), 1);
    hidden.value = JSON.stringify(sessions);
    updateSessionList();
  }
});

document.addEventListener('click', event => {
  const exportButton = event.target.closest('[data-report-export]');
  if (exportButton) downloadCsvReport(exportButton.dataset.reportExport);
});

document.addEventListener('change', event => {
  if (event.target.id !== 'report-competence') return;
  selectedReportCompetence = event.target.value;
  render('reports');
});

async function downloadCsvReport(type) {
  if (!activeSession?.token) { showToast('Entre pela API para exportar relatórios.'); return; }
  const query = selectedReportCompetence ? `?competence=${encodeURIComponent(selectedReportCompetence)}` : '';
  try {
    const response = await fetch(`${apiBase}/reports/${encodeURIComponent(type)}.csv${query}`, { headers: apiHeaders() });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || 'Não foi possível exportar o relatório.'); }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `relatorio-${type}.csv`;
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Relatório exportado com sucesso.');
  } catch (error) { showToast(error.message); }
}

document.addEventListener('submit', event => {
  if (event.target.id !== 'invoice-form') return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  invoices.unshift({ id: data.number, guideId: data.guideId, provider: data.provider, description: data.description, amount: Number(data.amount), expectedDate: data.expectedDate, status: 'pending' });
  saveInvoices();
  render('financeiro');
  showToast('Nota fiscal cadastrada com sucesso.');
});
document.addEventListener('click', event => {
  const backupButton = event.target.closest('[data-action="download-backup"]');
  if (backupButton) downloadClinicBackup();
  if (event.target.closest('[data-action="open-alerts"]')) render('alerts');
  const alertTarget = event.target.closest('[data-action="open-alert-target"]');
  if (alertTarget) render(alertTarget.dataset.targetView);
  const editButton = event.target.closest('[data-action="edit-user"]');
  if (editButton) { appView.innerHTML = usersView(editButton.dataset.userId); document.querySelector('#user-form input[name="name"]')?.focus(); }
  if (event.target.closest('[data-action="cancel-user-edit"]')) render('users');
});

async function downloadClinicBackup() {
  if (!activeSession?.token) { showToast('Entre pela API para gerar o backup.'); return; }
  try {
    const response = await fetch(`${apiBase}/backup`, { headers: apiHeaders() });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || 'Não foi possível gerar o backup.'); }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `backup-${activeClinicId}.json`;
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Backup gerado com sucesso. Guarde o arquivo em local seguro.');
  } catch (error) { showToast(error.message); }
}

document.addEventListener('submit', async event => {
  if (event.target.id === 'clinic-registration-form') {
    event.preventDefault();
    event.stopImmediatePropagation();
    const data = Object.fromEntries(new FormData(event.target));
    try {
      const session = await apiRequest('/auth/register-clinic', { method: 'POST', body: JSON.stringify(data) });
      session.user.roleLabel = roleLabels.admin;
      localStorage.setItem('tiss-session', JSON.stringify({ ...session, userId: session.user.id }));
      window.location.reload();
    } catch (error) { showToast(error.message); }
    return;
  }
  if (event.target.id !== 'user-form') return;
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  const id = form.dataset.userId;
  const payload = { name: data.name, email: data.email, role: data.role, password: data.password, active: id ? data.active === 'on' : true };
  try {
    await apiRequest(id ? `/users/${encodeURIComponent(id)}` : '/users', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    users = await apiRequest('/users');
    render('users');
    showToast(id ? 'Usuário atualizado.' : 'Usuário cadastrado.');
  } catch (error) { showToast(error.message); }
});

if (activeSession) { document.querySelector('#login-screen').classList.add('hidden'); applySession(); render(); loadApiData(); } else { document.querySelector('.app-shell').classList.add('hidden'); loadClinicOptions(); }
