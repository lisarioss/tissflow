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
const roleLabels = { admin: 'Administradora', faturamento: 'Faturamento', recepcao: 'Recepção', medico: 'Médica' };
const activeUser = activeSession?.user || (activeSession ? (clinicUsers[activeClinicId] || []).find(user => user.id === activeSession.userId) : null);
const clinicStorageKey = key => `tiss-${activeClinicId}-${key}`;
const apiBase = '/api';
const moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const defaultGuides = [
  { id: 'G-2026-00481', patient: 'Helena Martins', procedure: 'Consulta ambulatorial', insurer: 'Unimed', status: 'approved', label: 'Aprovada', date: '18 ago, 2026', value: 'R$ 180,00' },
  { id: 'G-2026-00480', patient: 'Rafael Nogueira', procedure: 'Sessão de fisioterapia', insurer: 'Bradesco Saúde', status: 'review', label: 'Em análise', date: '18 ago, 2026', value: 'R$ 120,00' },
  { id: 'G-2026-00479', patient: 'Bianca Torres', procedure: 'Ultrassonografia', insurer: 'SulAmérica', status: 'error', label: 'Com pendência', date: '17 ago, 2026', value: 'R$ 260,00' },
  { id: 'G-2026-00478', patient: 'João Pedro Lima', procedure: 'Consulta ambulatorial', insurer: 'Amil', status: 'sent', label: 'Enviada', date: '17 ago, 2026', value: 'R$ 180,00' }
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
let glosas = JSON.parse(localStorage.getItem(clinicStorageKey('glosas')) || 'null') || [];
const views = { overview: 'Visão geral', agenda: 'Agenda', guides: 'Guias TISS', financeiro: 'Financeiro', users: 'Usuários', patients: 'Pacientes', convenios: 'Convênios', reports: 'Relatórios', settings: 'Configurações' };
const appView = document.querySelector('#app-view');
const breadcrumb = document.querySelector('#breadcrumb');
const toast = document.querySelector('#toast');
const rolePermissions = {
  admin: ['overview', 'agenda', 'guides', 'financeiro', 'users', 'patients', 'convenios', 'reports', 'settings'],
  faturamento: ['overview', 'guides', 'financeiro', 'reports', 'users'],
  recepcao: ['overview', 'agenda', 'patients', 'users'],
  medico: ['overview', 'agenda', 'patients']
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
function normalizeGuide(guide) { return { ...guide, sessions: guide.sessions || [], status: guide.status, label: { sent: 'Enviada', review: 'Em análise', approved: 'Aprovada', error: 'Com glosa', recurso: 'Recurso enviado' }[guide.status] || guide.status, value: formatMoney((guide.valueCents || 0) / 100), unitValue: Number(guide.unitValueCents || 0) / 100, date: guide.createdAt ? new Date(guide.createdAt).toLocaleDateString('pt-BR') : '' }; }
function normalizeInvoice(invoice) { return { ...invoice, amount: Number(invoice.amountCents || 0) / 100 }; }
function normalizeGlosa(glosa) { return { ...glosa, amount: Number(glosa.amountCents || 0) / 100 }; }
async function loadApiData() {
  if (!activeSession?.token) return;
  try {
    const [apiGuides, apiInvoices, apiPatients, apiGlosas] = await Promise.all([apiRequest('/guides'), apiRequest('/invoices'), apiRequest('/patients'), apiRequest('/glosas')]);
    guides = apiGuides.map(normalizeGuide);
    invoices = apiInvoices.map(normalizeInvoice);
    if (apiPatients.length) patients = apiPatients;
    glosas = apiGlosas.map(normalizeGlosa);
    render();
  } catch (error) {
    showToast(`Modo local: ${error.message}`);
  }
}
function saveGlosas() { localStorage.setItem(clinicStorageKey('glosas'), JSON.stringify(glosas)); }

function statusTag(guide) { return `<span class="status ${guide.status}">${guide.label}</span>`; }
function overview() {
  return `<div class="page-heading"><div><p class="eyebrow">Quarta-feira, 19 de agosto de 2026</p><h1>Bom dia, Marina.</h1><p class="heading-copy">Aqui está o pulso do faturamento da sua clínica.</p></div><button class="primary-button" data-action="new-guide">＋ Nova guia</button></div>
  <div class="stats-grid"><article class="stat-card"><div class="stat-top"><span>Guias este mês</span><span class="stat-icon">▣</span></div><div class="stat-value">184</div><div class="stat-note"><b>↑ 12,4%</b> vs. mês anterior</div></article><article class="stat-card"><div class="stat-top"><span>Taxa de aprovação</span><span class="stat-icon">◉</span></div><div class="stat-value">94,8%</div><div class="stat-note"><b>↑ 2,1 p.p.</b> vs. mês anterior</div></article><article class="stat-card"><div class="stat-top"><span>Em análise</span><span class="stat-icon">◷</span></div><div class="stat-value">12</div><div class="stat-note warn"><b>3 vencem hoje</b> precisam de atenção</div></article><article class="stat-card"><div class="stat-top"><span>Valor faturado</span><span class="stat-icon">◇</span></div><div class="stat-value">R$ 42,8k</div><div class="stat-note"><b>↑ 8,7%</b> vs. mês anterior</div></article></div>
  <div class="content-grid"><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Guias recentes</h2><p class="panel-subtitle">Acompanhe as últimas movimentações</p></div><button class="text-button" data-view="guides">Ver todas →</button></div><table><thead><tr><th>Guia</th><th>Paciente</th><th>Convênio</th><th>Status</th><th>Valor</th></tr></thead><tbody>${guides.map(g => `<tr><td><strong>${g.id}</strong><small>${g.date}</small></td><td>${g.patient}<small>${g.procedure}</small></td><td>${g.insurer}</td><td>${statusTag(g)}</td><td><strong>${g.value}</strong></td></tr>`).join('')}</tbody></table></div><div class="panel activity"><div class="panel-header"><div><h2 class="panel-title">Atividade recente</h2><p class="panel-subtitle">Atualizações da operação</p></div></div><div class="activity-item"><span class="activity-dot"></span><div><strong>Guia aprovada</strong><p>G-2026-00481 foi processada pela Unimed</p></div><time>há 18 min</time></div><div class="activity-item"><span class="activity-dot orange"></span><div><strong>Nova pendência</strong><p>G-2026-00479 requer revisão</p></div><time>há 1 h</time></div><div class="activity-item"><span class="activity-dot"></span><div><strong>Lote enviado</strong><p>12 guias enviadas para Bradesco Saúde</p></div><time>há 3 h</time></div></div></div>
  <div class="panel" style="margin-top:18px"><div class="panel-header"><div><h2 class="panel-title">Volume de guias</h2><p class="panel-subtitle">Guias processadas nos últimos 7 dias</p></div><button class="secondary-button">Últimos 7 dias⌄</button></div><div class="chart-area"><div class="chart-grid"><svg class="chart-line" viewBox="0 0 700 140" preserveAspectRatio="none"><polyline points="0,112 100,91 200,101 300,65 400,78 500,34 600,49 700,15"/><circle cx="0" cy="112" r="3"/><circle cx="100" cy="91" r="3"/><circle cx="200" cy="101" r="3"/><circle cx="300" cy="65" r="3"/><circle cx="400" cy="78" r="3"/><circle cx="500" cy="34" r="3"/><circle cx="600" cy="49" r="3"/><circle cx="700" cy="15" r="3"/></svg></div><div class="chart-labels">${ultimosSeteDias().map(label => `<span>${label}</span>`).join('')}</div></div></div>`;
}
function guideForm() { return `<div class="page-heading"><div><p class="eyebrow">Nova movimentação</p><h1>Preencher guia TISS</h1><p class="heading-copy">Os dados ficam salvos como rascunho até a validação final.</p></div><button class="secondary-button" data-view="overview">← Voltar</button></div><form class="guide-form" id="guide-form"><div class="form-section"><h2>Dados do atendimento</h2><p>Informe os dados básicos para iniciar a guia.</p><div class="form-grid"><div class="field"><label for="patient">Paciente *</label><input id="patient" required placeholder="Nome completo" /></div><div class="field"><label for="insurer">Convênio *</label><select id="insurer" required><option value="">Selecione o convênio</option><option>Unimed</option><option>Bradesco Saúde</option><option>SulAmérica</option><option>Amil</option></select></div><div class="field"><label for="date">Data do atendimento *</label><input id="date" type="date" required value="2026-08-19" /></div><div class="field"><label for="type">Tipo de atendimento *</label><select id="type" required><option value="">Selecione o tipo</option><option>Consulta</option><option>Exame</option><option>Terapia</option></select></div></div></div><div class="form-section"><h2>Procedimento realizado</h2><p>Busque o procedimento pelo código TUSS ou descrição.</p><div class="form-grid"><div class="field"><label for="procedure">Procedimento *</label><select id="procedure" required><option value="">Selecione o procedimento</option><option>10101012 - Consulta em consultório</option><option>50000470 - Sessão de fisioterapia</option><option>40901122 - Ultrassonografia</option></select></div><div class="field"><label for="professional">Profissional executante *</label><select id="professional" required><option value="">Selecione o profissional</option><option>Marina Souza - CRM 12345</option><option>Lucas Andrade - CREFITO 8812</option></select></div></div></div><div class="form-section"><h2>Conferência</h2><p>A validação automática será executada antes da geração do XML.</p><div class="field"><label for="notes">Observações (opcional)</label><input id="notes" placeholder="Adicione uma observação para o faturamento" /></div></div><div class="form-footer"><button type="button" class="secondary-button" data-action="draft">Salvar rascunho</button><button class="primary-button" type="submit">Validar e continuar →</button></div></form>`; }
function guideFormComplete() {
  const insurers = [
    { value: 'Unimed', label: 'Unimed', code: '004701', logo: 'UNIMED', logoPath: 'assets/planos/unimed.png' },
    { value: 'Bradesco Saúde', label: 'Bradesco Saúde', code: '005711', logo: 'BRADESCO SAÚDE', logoPath: 'assets/planos/bradescosaude.png' },
    { value: 'SulAmérica', label: 'SulAmérica', code: '006246', logo: 'SULAMÉRICA', logoPath: 'assets/planos/sulamerica.png' },
    { value: 'Amil', label: 'Amil', code: '326305', logo: 'AMIL', logoPath: 'assets/planos/amil.png' },
    { value: 'Promédica', label: 'Promédica', code: '', logo: 'PROMÉDICA', logoPath: 'assets/planos/promedica.png' }
  ];

  return `<div class="page-heading"><div><p class="eyebrow">Guia SP/SADT · TISS 4.01</p><h1>Preencher guia TISS</h1><p class="heading-copy">Complete os dados da operadora, beneficiário, prestador e atendimento.</p></div><button class="secondary-button" data-view="overview">← Voltar</button></div>
  <form class="guide-form" id="guide-form">
    <div class="guide-plan-header"><div class="plan-logo"><img id="plan-logo-image" src="" alt="Logo da operadora" hidden /><span id="plan-logo">TISS</span></div><div><strong id="plan-name">Selecione a operadora</strong><small>Guia SP/SADT · padrão demonstrativo</small></div><span class="guide-code">Nº <b>G-2026-DEMO</b></span></div>
    <div class="form-section"><h2>1. Identificação da operadora</h2><p>Dados da empresa responsável pelo plano de saúde.</p><div class="form-grid"><div class="field"><label for="insurer">Operadora *</label><select id="insurer" name="insurer" required><option value="">Selecione a operadora</option>${insurers.map(insurer => `<option value="${insurer.value}" data-code="${insurer.code}" data-logo="${insurer.logo}" data-logo-path="${insurer.logoPath}">${insurer.label}</option>`).join('')}</select></div><div class="field"><label for="ans-code">Código ANS</label><input id="ans-code" name="ansCode" readonly placeholder="Preenchido pela operadora" /></div><div class="field"><label for="authorization-number">Número da autorização</label><input id="authorization-number" name="authorizationNumber" placeholder="Se autorizado previamente" /></div><div class="field"><label for="authorized-quantity">Quantidade autorizada</label><input id="authorized-quantity" name="authorizedQuantity" type="number" min="1" placeholder="Se pré-autorizado" /></div><div class="field"><label for="operator-guide">Guia da operadora</label><input id="operator-guide" name="operatorGuide" placeholder="Número informado pela operadora" /></div></div></div>
    <div class="form-section"><h2>2. Beneficiário</h2><p>Selecione um paciente cadastrado para preencher automaticamente os dados do plano.</p><div class="form-grid"><div class="field"><label for="patient">Paciente *</label><select id="patient" name="patient" required><option value="">Selecione o paciente</option>${patients.map(patient => `<option value="${patient.name}" data-patient-id="${patient.id}">${patient.name} · ${patient.insurer}</option>`).join('')}</select></div><div class="field"><label for="card-number">Número da carteira *</label><input id="card-number" name="cardNumber" required placeholder="Preenchido pelo paciente" /></div><div class="field"><label for="patient-birth">Data de nascimento</label><input id="patient-birth" name="patientBirth" type="date" /></div><div class="field"><label for="patient-plan">Plano</label><input id="patient-plan" name="patientPlan" placeholder="Preenchido pelo paciente" /></div><div class="field"><label for="plan-validity">Validade do plano</label><input id="plan-validity" name="planValidity" type="date" /></div></div></div>
    <div class="form-section"><h2>3. Prestador executante</h2><p>Dados da clínica e do profissional que realizou o atendimento.</p><div class="form-grid"><div class="field"><label for="provider-name">Nome da clínica *</label><input id="provider-name" name="providerName" value="Clínica Sabiá" required /></div><div class="field"><label for="provider-cnpj">CNPJ</label><input id="provider-cnpj" name="providerCnpj" value="12.345.678/0001-90" /></div><div class="field"><label for="professional">Profissional executante *</label><select id="professional" name="professional" required><option value="">Selecione o profissional</option><option value="Marina Souza" data-register="CRM 12345">Marina Souza · CRM 12345</option><option value="Lucas Andrade" data-register="CREFITO 8812">Lucas Andrade · CREFITO 8812</option></select></div><div class="field"><label for="professional-register">Registro profissional</label><input id="professional-register" name="professionalRegister" readonly placeholder="Preenchido pelo profissional" /></div></div></div>
    <div class="form-section"><h2>4. Atendimento e procedimento</h2><p>Informe o código TUSS, a data e os detalhes do serviço realizado.</p><div class="form-grid"><div class="field"><label for="date">Data do atendimento *</label><input id="date" name="date" type="date" required value="2026-08-20" /></div><div class="field"><label for="type">Tipo de atendimento *</label><select id="type" name="type" required><option value="">Selecione o tipo</option><option>Consulta</option><option>Exame</option><option>Terapia</option></select></div><div class="field"><label for="procedure">Procedimento TUSS *</label><select id="procedure" name="procedure" required><option value="">Selecione o procedimento</option><option value="10101012 - Consulta em consultório">10101012 · Consulta em consultório</option><option value="50000470 - Sessão de fisioterapia">50000470 · Sessão de fisioterapia</option><option value="40901122 - Ultrassonografia">40901122 · Ultrassonografia</option></select></div><div class="field"><label for="quantity">Quantidade *</label><input id="quantity" name="quantity" type="number" min="1" value="1" required /></div><div class="field"><label for="value">Valor do procedimento *</label><input id="value" name="value" type="number" min="0.01" step="0.01" value="180" required /></div><div class="field"><label for="service-code">Código do serviço</label><input id="service-code" name="serviceCode" readonly placeholder="Extraído do TUSS" /></div><div class="field"><label for="cid">CID-10 principal</label><input id="cid" name="cid" placeholder="Ex.: F84.0" pattern="^[A-Za-z][0-9]{2}(\.[0-9]{1,2})?$" title="Formato esperado: letra + 2 dígitos, ex. F84 ou F84.0" /></div></div></div>
    <div class="form-section"><h2>5. Observações</h2><p>Informações complementares para conferência da operadora.</p><div class="field"><label for="notes">Observações da guia</label><textarea id="notes" name="notes" rows="4" placeholder="Justificativa, informações clínicas ou observações administrativas"></textarea></div></div>
    <div class="form-footer"><button type="button" class="secondary-button" data-view="guides">Cancelar</button><button type="submit" class="primary-button">Validar e gerar XML</button></div>
  </form>`;
}

function guideFormMonthly() {
  const form = guideFormComplete().replace('<form class="guide-form" id="guide-form">', '<form class="guide-form" id="guide-form"><input type="hidden" name="guideType" value="sp_sadt" />');
  return form.replace(
    '<div class="form-section"><h2>4. Atendimento e procedimento</h2><p>Informe o código TUSS, a data e os detalhes do serviço realizado.</p><div class="form-grid"><div class="field"><label for="date">Data do atendimento *</label><input id="date" name="date" type="date" required value="2026-08-20" /></div><div class="field"><label for="type">Tipo de atendimento *</label><select id="type" name="type" required><option value="">Selecione o tipo</option><option>Consulta</option><option>Exame</option><option>Terapia</option></select></div><div class="field"><label for="procedure">Procedimento TUSS *</label><select id="procedure" name="procedure" required><option value="">Selecione o procedimento</option><option value="10101012 - Consulta em consultório">10101012 · Consulta em consultório</option><option value="50000470 - Sessão de fisioterapia">50000470 · Sessão de fisioterapia</option><option value="40901122 - Ultrassonografia">40901122 · Ultrassonografia</option></select></div><div class="field"><label for="quantity">Quantidade *</label><input id="quantity" name="quantity" type="number" min="1" value="1" required /></div><div class="field"><label for="value">Valor do procedimento *</label><input id="value" name="value" type="number" min="0.01" step="0.01" value="180" required /></div><div class="field"><label for="service-code">Código do serviço</label><input id="service-code" name="serviceCode" readonly placeholder="Extraído do TUSS" /></div><div class="field"><label for="cid">CID-10 principal</label><input id="cid" name="cid" placeholder="Ex.: F84.0" pattern="^[A-Za-z][0-9]{2}(\.[0-9]{1,2})?$" title="Formato esperado: letra + 2 dígitos, ex. F84 ou F84.0" /></div></div></div>',
    '<div class="form-section"><h2>4. Competência e atendimentos</h2><p>Registre todos os atendimentos do mês, como nas terapias ABA e acompanhamentos recorrentes.</p><div class="form-grid"><div class="field"><label for="competence">Competência *</label><input id="competence" name="competence" type="month" required value="2026-08" /></div><div class="field"><label for="attendance-type">Tipo de atendimento *</label><select id="attendance-type" name="type" required><option value="">Selecione o tipo</option><option>Consulta</option><option>Exame</option><option>Terapia ABA</option><option>Fisioterapia</option><option>Fonoaudiologia</option><option>Terapia ocupacional</option></select></div><div class="field"><label for="procedure">Procedimento TUSS *</label><select id="procedure" name="procedure" required><option value="">Selecione o procedimento</option><option value="10101012 - Consulta em consultório">10101012 · Consulta em consultório</option><option value="50000470 - Sessão de fisioterapia">50000470 · Sessão de fisioterapia</option><option value="40901122 - Ultrassonografia">40901122 · Ultrassonografia</option><option value="50000000 - Atendimento terapêutico ABA">50000000 · Atendimento terapêutico ABA</option></select></div><div class="field"><label for="quantity">Quantidade prevista no mês</label><input id="quantity" name="quantity" type="number" min="1" value="1" /></div><div class="field"><label for="value">Valor por atendimento *</label><input id="value" name="value" type="number" min="0.01" step="0.01" value="180" required /></div><div class="field"><label for="service-code">Código do serviço</label><input id="service-code" name="serviceCode" readonly placeholder="Extraído do TUSS" /></div><div class="field"><label for="cid">CID-10 principal</label><input id="cid" name="cid" placeholder="Ex.: F84.0" pattern="^[A-Za-z][0-9]{2}(\.[0-9]{1,2})?$" title="Formato esperado: letra + 2 dígitos, ex. F84 ou F84.0" /></div></div><div class="session-entry"><div class="form-grid"><div class="field"><label for="session-date">Data *</label><input id="session-date" type="date" value="2026-08-20" /></div><div class="field"><label for="session-start">Início *</label><input id="session-start" type="time" value="08:00" /></div><div class="field"><label for="session-end">Fim *</label><input id="session-end" type="time" value="09:00" /></div></div><button type="button" class="secondary-button" data-action="add-session">＋ Adicionar atendimento</button></div><div class="session-list" id="session-list"><p class="session-empty">Nenhum atendimento adicionado ainda.</p></div><input type="hidden" id="guide-sessions" name="sessions" value="[]" /></div>'
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
  const isConsulta = guide.guideType === 'consulta';
  const panelTitle = isConsulta ? 'Atendimento' : 'Atendimentos da competência';
  const panelSubtitle = isConsulta ? 'Guia de consulta avulsa — edite o serviço ou gere o PDF.' : 'Edite o serviço de cada atendimento e gere um PDF completo ou individual.';
  return `<div class="page-heading"><div><p class="eyebrow">Pasta da guia · ${guide.id}</p><h1>${guide.patient}</h1><p class="heading-copy">${guide.insurer} · ${guide.competence || guide.date} · ${sessions.length} ${sessions.length === 1 ? 'atendimento' : 'atendimentos'}</p></div><div class="folder-actions"><button class="secondary-button" data-view="guides">← Voltar</button><button class="secondary-button" data-action="print-folder" data-guide-id="${guide.id}">Gerar PDF da pasta</button></div></div><div class="folder-summary"><div><span>Guia</span><strong>${guide.id}</strong></div><div><span>Procedimento</span><strong>${guide.procedure}</strong></div><div><span>Valor total</span><strong>${guide.value}</strong></div><div><span>Status</span>${statusTag(guide)}</div></div><div class="panel"><div class="panel-header"><div><h2 class="panel-title">${panelTitle}</h2><p class="panel-subtitle">${panelSubtitle}</p></div></div><table><thead><tr><th>#</th><th>Data</th><th>Horário</th><th>Profissional</th><th>Serviço</th><th></th></tr></thead><tbody>${sessions.length ? sessions.map((session, index) => `<tr><td>${index + 1}</td><td>${new Date(`${session.date}T12:00:00`).toLocaleDateString('pt-BR')}</td><td>${session.start} às ${session.end}</td><td>${session.professional}</td><td><select class="folder-service" data-guide-id="${guide.id}" data-session-index="${index}"><option ${session.procedure.includes('10101012') ? 'selected' : ''} value="10101012 - Consulta em consultório">10101012 · Consulta</option><option ${session.procedure.includes('50000470') ? 'selected' : ''} value="50000470 - Sessão de fisioterapia">50000470 · Fisioterapia</option><option ${session.procedure.includes('50000000') ? 'selected' : ''} value="50000000 - Atendimento terapêutico ABA">50000000 · Terapia ABA</option><option ${session.procedure.includes('40901122') ? 'selected' : ''} value="40901122 - Ultrassonografia">40901122 · Ultrassonografia</option></select></td><td><button class="finance-delete" data-action="print-session" data-guide-id="${guide.id}" data-session-index="${index}">Gerar PDF</button></td></tr>`).join('') : '<tr><td colspan="6">Nenhum atendimento nesta pasta.</td></tr>'}</tbody></table></div>${glosaPanel(guide)}`;
}
function guideRowsHtml(term) {
  const filtered = filterGuides(guides, term);
  if (!filtered.length) return '<tr><td colspan="7">Nenhuma guia encontrada para essa busca.</td></tr>';
  return filtered.map(g => `<tr><td><strong>${g.id}</strong><small>${g.date}</small></td><td>${g.patient}<small>${g.procedure}</small></td><td>${g.insurer}</td><td><span class="guide-type-tag">${g.guideType === 'consulta' ? 'Consulta' : 'SP/SADT'}</span></td><td>${statusTag(g)}</td><td><strong>${g.value}</strong></td><td><button class="text-button" data-action="open-guide-folder" data-guide-id="${g.id}">Abrir pasta →</button></td></tr>`).join('');
}
function guideList() { return `<div class="page-heading"><div><p class="eyebrow">Operação de faturamento</p><h1>Guias TISS</h1><p class="heading-copy">Acompanhe o ciclo de cada guia, do preenchimento ao envio.</p></div><div class="folder-actions"><button class="secondary-button" data-action="new-guide" data-guide-type="consulta">＋ Nova guia de Consulta</button><button class="primary-button" data-action="new-guide" data-guide-type="sp_sadt">＋ Nova guia SP/SADT</button></div></div><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Todas as guias</h2><p class="panel-subtitle">${guides.length} registros salvos neste navegador</p></div><button class="secondary-button" data-action="clear-guides">Limpar dados demo</button></div><div class="search-bar"><input type="search" id="guide-search" placeholder="Buscar por paciente, convênio, procedimento ou nº da guia" /></div><table><thead><tr><th>Guia</th><th>Paciente</th><th>Convênio</th><th>Tipo</th><th>Status</th><th>Valor</th><th></th></tr></thead><tbody id="guide-table-body">${guideRowsHtml('')}</tbody></table></div>${statusSimulator()}`; }
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
function agendaView() { const date = '2026-08-20'; const dayAppointments = appointments.filter(appointment => appointment.date === date).sort((first, second) => timeToMinutes(first.start) - timeToMinutes(second.start)); return `<div class="page-heading"><div><p class="eyebrow">Quinta-feira, 20 de agosto de 2026</p><h1>Agenda da clínica</h1><p class="heading-copy">Horários ocupados são bloqueados automaticamente por profissional.</p></div><button class="primary-button" data-action="new-appointment">＋ Novo atendimento</button></div><div class="agenda-layout"><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Atendimentos de hoje</h2><p class="panel-subtitle">${dayAppointments.length} horários reservados</p></div><span class="status approved">Agenda protegida</span></div><div class="appointment-list">${dayAppointments.map(appointment => `<div class="appointment-row"><div class="appointment-time"><strong>${appointment.start}</strong><small>${appointment.duration} min</small></div><div class="appointment-info"><strong>${appointment.patient}</strong><small>${appointment.type} · ${appointment.professional}</small></div><span class="appointment-professional">${appointment.professional}</span></div>`).join('')}</div></div><form class="panel appointment-form" id="appointment-form"><div class="panel-header"><div><h2 class="panel-title">Reservar horário</h2><p class="panel-subtitle">A checagem acontece antes de salvar.</p></div></div><div class="form-section"><div class="field"><label for="appointment-patient">Paciente *</label><input id="appointment-patient" name="patient" required placeholder="Nome completo" /></div><div class="field"><label for="appointment-professional">Profissional *</label><select id="appointment-professional" name="professional" required><option value="">Selecione</option><option>Marina Souza</option><option>Lucas Andrade</option></select></div><div class="field"><label for="appointment-date">Data *</label><input id="appointment-date" name="date" type="date" value="${date}" required /></div><div class="appointment-fields"><div class="field"><label for="appointment-start">Início *</label><input id="appointment-start" name="start" type="time" value="09:00" required /></div><div class="field"><label for="appointment-duration">Duração *</label><select id="appointment-duration" name="duration" required><option value="30">30 min</option><option value="50" selected>50 min</option><option value="60">60 min</option></select></div></div><div class="field"><label for="appointment-type">Tipo de atendimento *</label><select id="appointment-type" name="type" required><option>Consulta</option><option>Fisioterapia</option><option>Exame</option></select></div></div><div class="form-footer"><button class="primary-button" type="submit">Verificar e reservar</button></div></form></div>`; }
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
  form.querySelector('.panel-title').textContent = 'Editar paciente';
  form.querySelector('button[type="submit"]').textContent = 'Atualizar paciente';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function patientRowsHtml(term) {
  const filtered = filterPatients(patients, term);
  if (!filtered.length) return '<tr><td colspan="6">Nenhum paciente encontrado para essa busca.</td></tr>';
  return filtered.map(patient => `<tr><td><strong>${patient.name}</strong><small>${new Date(`${patient.birthDate}T12:00:00`).toLocaleDateString('pt-BR')}</small></td><td>${patient.insurer}</td><td>${patient.cardNumber}</td><td>${patient.plan}</td><td>${new Date(`${patient.planValidity}T12:00:00`).toLocaleDateString('pt-BR')}</td><td><button class="text-button" data-action="edit-patient" data-patient-id="${patient.id}">Editar</button></td></tr>`).join('');
}
function patientsView() {
  return `<div class="page-heading"><div><p class="eyebrow">Cadastro da clínica</p><h1>Pacientes</h1><p class="heading-copy">Mantenha os dados do plano prontos para reutilizar nas guias.</p></div><button class="primary-button" data-action="new-patient">＋ Novo paciente</button></div><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Pacientes cadastrados</h2><p class="panel-subtitle">${patients.length} registros com dados de convênio</p></div></div><div class="search-bar"><input type="search" id="patient-search" placeholder="Buscar por nome, convênio, carteira ou plano" /></div><table><thead><tr><th>Paciente</th><th>Convênio</th><th>Carteira</th><th>Plano</th><th>Validade</th><th></th></tr></thead><tbody id="patient-table-body">${patientRowsHtml('')}</tbody></table></div><form class="panel patient-form" id="patient-form"><div class="panel-header"><div><h2 class="panel-title">Cadastrar paciente</h2><p class="panel-subtitle">Esses dados serão carregados automaticamente na guia.</p></div></div><div class="form-section"><div class="form-grid"><div class="field"><label for="new-patient-name">Nome completo *</label><input id="new-patient-name" name="name" required /></div><div class="field"><label for="new-patient-birth">Data de nascimento *</label><input id="new-patient-birth" name="birthDate" type="date" required /></div><div class="field"><label for="new-patient-insurer">Convênio *</label><select id="new-patient-insurer" name="insurer" required><option value="">Selecione</option><option>Unimed</option><option>Bradesco Saúde</option><option>SulAmérica</option><option>Amil</option><option>Promédica</option></select></div><div class="field"><label for="new-patient-ans">Código ANS</label><input id="new-patient-ans" name="ansCode" placeholder="Ex.: 004701" /></div><div class="field"><label for="new-patient-card">Número da carteira *</label><input id="new-patient-card" name="cardNumber" required /></div><div class="field"><label for="new-patient-plan">Plano *</label><input id="new-patient-plan" name="plan" required placeholder="Nome do plano" /></div><div class="field"><label for="new-patient-validity">Validade do plano *</label><input id="new-patient-validity" name="planValidity" type="date" required /></div></div><div class="form-footer"><button class="primary-button" type="submit">Salvar paciente</button></div></div></form>`;
}
function listing(title, description, icon) { return `<div class="page-heading"><div><p class="eyebrow">Módulo operacional</p><h1>${title}</h1><p class="heading-copy">${description}</p></div><button class="primary-button" data-action="new-guide">＋ Nova guia</button></div><div class="empty-state"><div><div class="empty-icon">${icon}</div><h2>Este módulo está pronto para crescer</h2><p>A estrutura de navegação está funcionando. O próximo passo é conectar este fluxo aos dados reais da clínica.</p><button class="primary-button" data-action="soon">Explorar demonstração</button></div></div>`; }
function reportsView() {
  const guideCounts = guides.reduce((summary, guide) => ({ ...summary, [guide.status]: (summary[guide.status] || 0) + 1 }), {});
  const pendingAmount = invoices.filter(invoice => invoice.status === 'pending').reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const receivedAmount = invoices.filter(invoice => invoice.status === 'received').reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const upcomingInvoices = [...invoices].filter(invoice => invoice.status === 'pending').sort((first, second) => first.expectedDate.localeCompare(second.expectedDate));

  return `<div class="page-heading"><div><p class="eyebrow">Indicadores operacionais</p><h1>Relatórios</h1><p class="heading-copy">Acompanhe o desempenho das guias e a previsão financeira da clínica.</p></div><button class="secondary-button" data-action="refresh-report">Atualizar dados</button></div>
  <div class="stats-grid"><article class="stat-card"><div class="stat-top"><span>Total de guias</span><span class="stat-icon">▣</span></div><div class="stat-value">${guides.length}</div><div class="stat-note">Registros salvos</div></article><article class="stat-card"><div class="stat-top"><span>Guias aprovadas</span><span class="stat-icon">◉</span></div><div class="stat-value">${guideCounts.approved || 0}</div><div class="stat-note">Processadas com sucesso</div></article><article class="stat-card"><div class="stat-top"><span>Valor pendente</span><span class="stat-icon">◷</span></div><div class="stat-value">${formatMoney(pendingAmount)}</div><div class="stat-note warn">Aguardando pagamento</div></article><article class="stat-card"><div class="stat-top"><span>Valor recebido</span><span class="stat-icon">◇</span></div><div class="stat-value">${formatMoney(receivedAmount)}</div><div class="stat-note">Notas recebidas</div></article></div>
  <div class="content-grid"><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Status das guias</h2><p class="panel-subtitle">Distribuição atual do faturamento TISS</p></div></div><div class="report-status-list"><div><span>Enviadas</span><strong>${guideCounts.sent || 0}</strong></div><div><span>Em análise</span><strong>${guideCounts.review || 0}</strong></div><div><span>Aprovadas</span><strong>${guideCounts.approved || 0}</strong></div><div><span>Com pendência</span><strong>${guideCounts.error || 0}</strong></div></div></div><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Próximos pagamentos</h2><p class="panel-subtitle">Notas pendentes em ordem de vencimento</p></div></div><div class="report-payment-list">${upcomingInvoices.length ? upcomingInvoices.slice(0, 5).map(invoice => `<div class="report-payment-row"><div><strong>${invoice.id}</strong><small>${invoice.guideId || 'Sem guia vinculada'}</small></div><strong>${formatMoney(invoice.amount)}</strong><time>${new Date(`${invoice.expectedDate}T12:00:00`).toLocaleDateString('pt-BR')}</time></div>`).join('') : '<p class="panel-subtitle">Nenhum pagamento pendente.</p>'}</div></div></div>`;
}
function saveGuides() { localStorage.setItem(clinicStorageKey('guides'), JSON.stringify(guides)); }
function restoreDraft() { const draft = JSON.parse(localStorage.getItem(clinicStorageKey('draft')) || 'null'); if (!draft) return; Object.entries(draft).forEach(([key, value]) => { const field = document.querySelector(`#${key}`); if (field) field.value = value; }); }
function saveDraft(form) { localStorage.setItem(clinicStorageKey('draft'), JSON.stringify(Object.fromEntries(new FormData(form)))); }
function render(view = 'overview') { breadcrumb.textContent = views[view] || views.overview; const safeView = userCan(view) ? view : 'overview'; appView.innerHTML = safeView === 'overview' ? overview() : safeView === 'agenda' ? agendaView() : safeView === 'guides' ? guideList() : safeView === 'financeiro' ? financeView() : safeView === 'reports' ? reportsView() : safeView === 'patients' ? patientsView() : safeView === 'users' ? usersView() : listing(views[safeView], `Gerencie ${views[safeView].toLowerCase()} em um só lugar.`, safeView === 'convenios' ? '◇' : '↗'); document.querySelectorAll('.nav-item').forEach(item => { const visible = userCan(item.dataset.view); item.style.display = visible ? '' : 'none'; item.classList.toggle('active', item.dataset.view === safeView && visible); }); }
function applySession() { const clinic = clinicProfiles[activeClinicId]; if (!clinic || !activeUser) return; document.querySelector('.workspace-switcher strong').textContent = clinic.name; document.querySelector('.workspace-switcher small').textContent = clinic.unit; document.querySelector('.workspace-switcher .avatar').textContent = clinic.initials; document.querySelector('#breadcrumb-clinic').textContent = clinic.name; document.querySelector('.profile strong').textContent = activeUser.name; document.querySelector('.profile small').textContent = activeUser.roleLabel || roleLabels[activeUser.role] || activeUser.role; document.querySelector('.user-button span:nth-child(2)').textContent = activeUser.name; document.querySelector('.user-button .avatar').textContent = activeUser.name.split(' ').map(name => name[0]).join('').slice(0, 2); }
function usersView() { const clinicUsersList = clinicUsers[activeClinicId] || []; return `<div class="page-heading"><div><p class="eyebrow">Acesso e segurança</p><h1>Usuários da clínica</h1><p class="heading-copy">Cada perfil acessa apenas o que precisa.</p></div><button class="primary-button" data-action="new-user">＋ Novo usuário</button></div><div class="panel"><div class="panel-header"><div><h2 class="panel-title">Equipe</h2><p class="panel-subtitle">${clinicUsersList.length} usuários cadastrados</p></div></div><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Permissão</th></tr></thead><tbody>${clinicUsersList.map(user => `<tr><td><strong>${user.name}</strong></td><td>${user.email}</td><td>${user.roleLabel}</td><td>${user.role === 'admin' ? 'Total' : user.role === 'faturamento' ? 'Guias e relatórios' : user.role === 'recepcao' ? 'Agenda e pacientes' : 'Agenda e prontuários'}</td></tr>`).join('')}</tbody></table></div>`; }
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
  if (exceedsAuthorizedQuantity(sessions.length, data.authorizedQuantity)) { showToast(`Quantidade de atendimentos (${sessions.length}) excede a quantidade autorizada (${data.authorizedQuantity}).`); return; }
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

document.addEventListener('click', event => { const viewButton = event.target.closest('[data-view]'); if (viewButton) { document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === viewButton.dataset.view)); render(viewButton.dataset.view); } const statusButton = event.target.closest('[data-status]'); if (statusButton) { const guideId = document.querySelector('#status-guide')?.value; if (!guideId) { showToast('Selecione uma guia antes de registrar o retorno.'); return; } if (statusButton.dataset.status === 'error') { document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'guides')); breadcrumb.textContent = 'Pasta da guia'; appView.innerHTML = guideFolderView(guideId); showToast('Registre o motivo e o valor da glosa na pasta da guia.'); return; } const statusLabels = { review: 'Em análise', approved: 'Aprovada' }; const guide = guides.find(item => item.id === guideId); guide.status = statusButton.dataset.status; guide.label = statusLabels[guide.status]; saveGuides(); render('guides'); showToast(`Retorno registrado: ${guide.label}.`); } const action = event.target.closest('[data-action]')?.dataset.action; if (action === 'logout') { localStorage.removeItem('tiss-session'); window.location.reload(); } if (action === 'open-guide-folder') { breadcrumb.textContent = 'Pasta da guia'; appView.innerHTML = guideFolderView(event.target.closest('[data-guide-id]').dataset.guideId); } if (action === 'print-folder') { const guide = guides.find(item => item.id === event.target.closest('[data-guide-id]').dataset.guideId); if (guide) printGuideFolder(guide); } if (action === 'print-session') { const button = event.target.closest('[data-guide-id]'); const guide = guides.find(item => item.id === button.dataset.guideId); if (guide) printGuideFolder(guide, guide.sessions[Number(button.dataset.sessionIndex)]); } if (action === 'new-guide') { document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'guides')); const guideType = event.target.closest('[data-guide-type]')?.dataset.guideType; breadcrumb.textContent = guideType === 'consulta' ? 'Nova guia de Consulta' : 'Nova guia'; appView.innerHTML = guideType === 'consulta' ? guideFormConsulta() : guideFormMonthly(); restoreDraft(); } if (action === 'new-appointment') { breadcrumb.textContent = 'Novo atendimento'; document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'agenda')); appView.innerHTML = agendaView(); document.querySelector('#appointment-patient')?.focus(); } if (action === 'clear-guides') { guides = [...defaultGuides]; saveGuides(); render('guides'); showToast('Dados demo restaurados.'); } if (action === 'resolve-glosa' && !activeSession?.token) { const button = event.target.closest('[data-glosa-id]'); const glosa = glosas.find(item => item.id === button.dataset.glosaId); if (!glosa) return; glosa.status = button.dataset.outcome; glosa.resolvedAt = new Date().toISOString(); const guide = guides.find(item => item.id === glosa.guideId); if (guide) { guide.status = glosa.status === 'revertida' ? 'approved' : 'error'; guide.label = glosa.status === 'revertida' ? 'Aprovada' : 'Com glosa'; } saveGlosas(); saveGuides(); appView.innerHTML = guideFolderView(glosa.guideId); showToast(glosa.status === 'revertida' ? 'Glosa revertida.' : 'Glosa mantida.'); } if (action === 'soon') showToast('Demonstração em preparação.'); });
document.addEventListener('input', event => {
  if (event.target.id === 'guide-search') {
    const body = document.querySelector('#guide-table-body');
    if (body) body.innerHTML = guideRowsHtml(event.target.value);
  }
  if (event.target.id === 'patient-search') {
    const body = document.querySelector('#patient-table-body');
    if (body) body.innerHTML = patientRowsHtml(event.target.value);
  }
});
document.addEventListener('click', event => {
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
  if (event.target.id === 'appointment-form') { event.preventDefault(); const form = event.target; if (!form.checkValidity()) { form.reportValidity(); return; } const data = Object.fromEntries(new FormData(form)); const conflict = hasScheduleConflict(data); if (conflict) { showToast(`Conflito: ${conflict.professional} já atende ${conflict.patient} às ${conflict.start}.`); return; } appointments.push({ id: nextSequentialId(appointments, 'A-', 3), ...data, duration: Number(data.duration) }); saveAppointments(); render('agenda'); showToast('Horário reservado sem conflito.'); return; } if (event.target.id !== 'guide-form') return; event.preventDefault(); const form = event.target; if (!form.checkValidity()) { form.reportValidity(); return; } const data = Object.fromEntries(new FormData(form)); let sessions = JSON.parse(data.sessions || '[]'); if (!sessions.length) { if (data.guideType === 'consulta' && data.date && data.procedure && data.professional) { sessions = [{ date: data.date, start: '08:00', end: '09:00', type: data.type, procedure: data.procedure, professional: data.professional }]; } else { showToast('Adicione pelo menos um atendimento à competência antes de enviar.'); return; } } const outOfValidityDate = findSessionOutsidePlanValidity(sessions, data.planValidity); if (outOfValidityDate) { showToast(`Atendimento em ${new Date(`${outOfValidityDate}T12:00:00`).toLocaleDateString('pt-BR')} está fora da vigência do plano (válido até ${new Date(`${data.planValidity}T12:00:00`).toLocaleDateString('pt-BR')}).`); return; } if (exceedsAuthorizedQuantity(sessions.length, data.authorizedQuantity)) { showToast(`Quantidade de atendimentos (${sessions.length}) excede a quantidade autorizada (${data.authorizedQuantity}).`); return; } const cidIssueLocal = findCidIncompatibility(data.procedure, data.cid); if (cidIssueLocal) { showToast(`CID ${data.cid.toUpperCase()} é incomum para ${cidIssueLocal.label} (esperado capítulo ${cidIssueLocal.chapters.join('/')}). Confira antes de enviar.`); return; } const guideId = nextSequentialId(guides, 'G-2026-', 5); const xml = createTissXml(data, guideId); const totalValue = Number(data.value || 0) * sessions.length; guides.unshift({ id: guideId, patient: data.patient, procedure: data.procedure.split(' - ')[1] || data.procedure, insurer: data.insurer, status: 'sent', label: 'Pronta para envio', date: data.competence || sessions[0].date, competence: data.competence, guideType: data.guideType || 'sp_sadt', value: formatMoney(totalValue), sessions }); saveGuides(); localStorage.removeItem(clinicStorageKey('draft')); downloadXml(xml, guideId); showToast(`${sessions.length} atendimentos validados, guia salva e XML baixado.`); });
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
  }

  if (event.target.id === 'professional') {
    const option = event.target.selectedOptions[0];
    const register = document.querySelector('#professional-register');
    if (register) register.value = option.dataset.register || '';
  }

  if (event.target.id === 'procedure') {
    const serviceCode = document.querySelector('#service-code');
    if (serviceCode) serviceCode.value = event.target.value.split(' - ')[0] || '';
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
  if (event.target.closest('[data-action="refresh-report"]')) render('reports');
});

document.addEventListener('submit', event => {
  if (event.target.id !== 'invoice-form') return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  invoices.unshift({ id: data.number, guideId: data.guideId, provider: data.provider, description: data.description, amount: Number(data.amount), expectedDate: data.expectedDate, status: 'pending' });
  saveInvoices();
  render('financeiro');
  showToast('Nota fiscal cadastrada com sucesso.');
});
if (activeSession) { document.querySelector('#login-screen').classList.add('hidden'); applySession(); render(); loadApiData(); } else { document.querySelector('.app-shell').classList.add('hidden'); }