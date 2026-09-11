const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nextSequentialId, timeToMinutes, hasScheduleConflictWith, escapeXml, findSessionOutsidePlanValidity, exceedsAuthorizedQuantity, findCidIncompatibility, filterGuides, filterPatients, filterPatientsByStatus, paginateItems, filterInsurers, filterFeedbacks, isActivePatient, planValidityAlertItems, consentAlertItems, clinicOnboardingChecklist, batchFollowupAlertItems, batchPaymentAlertItems, batchPaymentTiming, batchPaymentAgeBucket, batchPaymentDueInfo, batchReceivablesSummary, receivablesToCsv, receivablesAging, glosaRecoverySummary, insurerFinancialPerformance, glosaCauseAnalysis, glosaPreventionAlertItems, guideBillingRisk, filterBatches, sortBatches, safeCsvCell, batchesToCsv, normalizeBatchPreferences, financeBatchShortcutFilters, guideProductionSummary } = require('./lib.js');

test('isActivePatient trata booleanos locais e inteiros vindos do SQLite', () => {
  assert.equal(isActivePatient({ active: true }), true);
  assert.equal(isActivePatient({ active: 1 }), true);
  assert.equal(isActivePatient({}), true);
  assert.equal(isActivePatient({ active: false }), false);
  assert.equal(isActivePatient({ active: 0 }), false);
});

test('filterPatientsByStatus separa pacientes ativos e arquivados', () => {
  const patients = [{ id: '1', active: 1 }, { id: '2', active: 0 }, { id: '3' }];
  assert.deepEqual(filterPatientsByStatus(patients, 'active').map(patient => patient.id), ['1', '3']);
  assert.deepEqual(filterPatientsByStatus(patients, 'inactive').map(patient => patient.id), ['2']);
  assert.equal(filterPatientsByStatus(patients, 'all').length, 3);
});

test('paginateItems limita resultados e corrige página fora do intervalo', () => {
  const items = Array.from({ length: 45 }, (_, index) => index + 1);
  assert.deepEqual(paginateItems(items, 2, 20).items, items.slice(20, 40));
  assert.equal(paginateItems(items, 99, 20).page, 3);
  assert.equal(paginateItems([], 2, 20).totalPages, 1);
});

test('planValidityAlertItems avisa sobre plano próximo do vencimento e vencido', () => {
  const patients = [
    { id: '1', name: 'Ana', insurer: 'Unimed', cardNumber: '123', planValidity: '2026-09-20' },
    { id: '2', name: 'Bia', insurer: 'Amil', cardNumber: '456', planValidity: '2026-08-01' },
    { id: '3', name: 'Caio', planValidity: '2027-12-31' }
  ];
  const alerts = planValidityAlertItems(patients, new Date('2026-09-08T12:00:00'));
  assert.deepEqual(alerts.map(item => item.level), ['warning', 'critical']);
  assert.match(alerts[0].title, /12 dia/);
  assert.match(alerts[1].title, /Plano vencido/);
});

test('planValidityAlertItems ignora pacientes arquivados', () => {
  const patients = [{ id: '1', name: 'Ana', planValidity: '2020-01-01', active: 0 }];
  assert.deepEqual(planValidityAlertItems(patients, new Date('2026-09-08T12:00:00')), []);
});

test('clinicOnboardingChecklist identifica uma clínica pronta para operar', () => {
  const settings = { tradeName: 'Clínica', cnpj: '1', cnes: '1234567', letterheadDataUrl: 'data:image/png;base64,x', owners: [{ name: 'Ana', active: true }], professionals: [{ name: 'Bia', councilType: 'CRP', councilNumber: '1', councilState: 'BA', cbo: '251510' }] };
  const insurers = [{ name: 'Plano', ansCode: '123456', providerCode: 'P1', acceptedProcedures: ['50000000'] }];
  const users = [{ id: 'U1' }, { id: 'U2' }];
  const patients = [{ id: 'P1' }];
  assert.equal(clinicOnboardingChecklist(settings, insurers, users, patients).every(item => item.complete), true);
});

test('clinicOnboardingChecklist aponta cada configuração ausente e sua tela', () => {
  const checklist = clinicOnboardingChecklist({ owners: [], professionals: [] }, [], [{ id: 'U1' }], []);
  assert.equal(checklist.filter(item => !item.complete).length, 7);
  assert.equal(checklist.find(item => item.id === 'insurers').view, 'convenios');
  assert.equal(checklist.find(item => item.id === 'team').view, 'users');
});

test('consentAlertItems identifica pendência, revogação e ausência de comprovante', () => {
  const patients = [
    { id: 'P-1', name: 'Ana', consentStatus: 'pending' },
    { id: 'P-2', name: 'Bia', consentStatus: 'revoked', consentDate: '2026-09-01' },
    { id: 'P-3', name: 'Caio', consentStatus: 'granted' },
    { id: 'P-4', name: 'Davi', consentStatus: 'granted' }
  ];
  const events = [
    { patientId: 'P-3', eventDate: '2026-09-01' },
    { patientId: 'P-4', eventDate: '2026-09-01', signedDocumentId: 'DOC-1' }
  ];
  const alerts = consentAlertItems(patients, events);
  assert.deepEqual(alerts.map(item => item.targetId), ['P-1', 'P-2', 'P-3']);
  assert.deepEqual(alerts.map(item => item.level), ['warning', 'critical', 'warning']);
});

test('consentAlertItems usa o evento mais recente e ignora paciente inativo', () => {
  const patients = [
    { id: 'P-1', name: 'Ana', consentStatus: 'granted' },
    { id: 'P-2', name: 'Bia', consentStatus: 'pending', active: false }
  ];
  const events = [
    { patientId: 'P-1', eventDate: '2026-08-01', signedDocumentId: 'DOC-ANTIGO' },
    { patientId: 'P-1', eventDate: '2026-09-01' }
  ];
  const alerts = consentAlertItems(patients, events);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].targetId, 'P-1');
  assert.match(alerts[0].title, /Comprovante de consentimento ausente/);
});

test('consentAlertItems avisa quando a renovação se aproxima ou está vencida', () => {
  const patients = [
    { id: 'P-1', name: 'Ana', consentStatus: 'granted' },
    { id: 'P-2', name: 'Bia', consentStatus: 'granted' }
  ];
  const events = [
    { patientId: 'P-1', eventDate: '2025-09-20', signedDocumentId: 'DOC-1' },
    { patientId: 'P-2', eventDate: '2025-08-01', signedDocumentId: 'DOC-2' }
  ];
  const alerts = consentAlertItems(patients, events, 12, new Date('2026-09-04T12:00:00'));
  assert.equal(alerts.length, 2);
  assert.match(alerts[0].title, /vence em 16 dia/);
  assert.equal(alerts[0].level, 'warning');
  assert.match(alerts[1].title, /Consentimento vencido/);
  assert.equal(alerts[1].level, 'critical');
});

test('consentAlertItems não impõe renovação quando o controle está desativado', () => {
  const patients = [{ id: 'P-1', name: 'Ana', consentStatus: 'granted' }];
  const events = [{ patientId: 'P-1', eventDate: '2020-01-01', signedDocumentId: 'DOC-1' }];
  assert.deepEqual(consentAlertItems(patients, events, 0, new Date('2026-09-04T12:00:00')), []);
});

test('nextSequentialId gera o próximo número com base no maior ID existente', () => {
  const list = [{ id: 'G-2026-00478' }, { id: 'G-2026-00481' }];
  assert.equal(nextSequentialId(list, 'G-2026-', 5), 'G-2026-00482');
});

test('nextSequentialId não colide após remoção de itens (bug corrigido)', () => {
  // Antes da correção, o ID era baseado em list.length; ao remover uma guia
  // de uma lista de 3, list.length virava 2 e o próximo ID gerado colidia
  // com um ID já existente. Usar o maior número presente evita isso.
  const listAfterDeletion = [{ id: 'P-001' }, { id: 'P-003' }]; // P-002 foi removido
  assert.equal(nextSequentialId(listAfterDeletion, 'P-', 3), 'P-004');
});

test('nextSequentialId parte de 1 quando a lista está vazia', () => {
  assert.equal(nextSequentialId([], 'A-', 3), 'A-001');
});

test('timeToMinutes converte HH:MM para minutos desde meia-noite', () => {
  assert.equal(timeToMinutes('08:00'), 480);
  assert.equal(timeToMinutes('00:00'), 0);
  assert.equal(timeToMinutes('23:45'), 1425);
});

test('hasScheduleConflictWith detecta sobreposição de horário para o mesmo profissional/data', () => {
  const appointments = [{ professional: 'Marina Souza', date: '2026-08-10', start: '08:00', duration: 60 }];
  const conflict = hasScheduleConflictWith(appointments, { professional: 'Marina Souza', date: '2026-08-10', start: '08:30', duration: 30 });
  assert.ok(conflict, 'deveria encontrar conflito quando os intervalos se sobrepõem');
});

test('hasScheduleConflictWith não acusa conflito para profissionais diferentes no mesmo horário', () => {
  const appointments = [{ professional: 'Marina Souza', date: '2026-08-10', start: '08:00', duration: 60 }];
  const conflict = hasScheduleConflictWith(appointments, { professional: 'Fernando Diniz', date: '2026-08-10', start: '08:00', duration: 60 });
  assert.equal(conflict, undefined);
});

test('hasScheduleConflictWith não acusa conflito quando os horários apenas se tocam (sem sobreposição real)', () => {
  const appointments = [{ professional: 'Marina Souza', date: '2026-08-10', start: '08:00', duration: 60 }];
  // Atendimento das 09:00 às 09:30 começa exatamente quando o anterior termina (09:00) — não é sobreposição.
  const conflict = hasScheduleConflictWith(appointments, { professional: 'Marina Souza', date: '2026-08-10', start: '09:00', duration: 30 });
  assert.equal(conflict, undefined);
});

test('escapeXml escapa os cinco caracteres especiais de XML', () => {
  assert.equal(escapeXml(`<tag> & 'aspas' "duplas"`), '&lt;tag&gt; &amp; &apos;aspas&apos; &quot;duplas&quot;');
});

test('escapeXml previne injeção de marcação vinda de dados do formulário', () => {
  const nomeMalicioso = '</nomeBeneficiario><observacao>injetado';
  const escaped = escapeXml(nomeMalicioso);
  assert.ok(!escaped.includes('<'), 'não deve conter "<" literal após o escape');
  assert.ok(!escaped.includes('>'), 'não deve conter ">" literal após o escape');
});

test('findSessionOutsidePlanValidity detecta atendimento após o fim da vigência do plano', () => {
  const sessions = [{ date: '2026-08-05' }, { date: '2026-08-20' }];
  assert.equal(findSessionOutsidePlanValidity(sessions, '2026-08-10'), '2026-08-20');
});

test('findSessionOutsidePlanValidity retorna null quando todos os atendimentos estão dentro da vigência', () => {
  const sessions = [{ date: '2026-08-05' }, { date: '2026-08-08' }];
  assert.equal(findSessionOutsidePlanValidity(sessions, '2026-08-10'), null);
});

test('findSessionOutsidePlanValidity ignora a checagem quando não há vigência informada', () => {
  const sessions = [{ date: '2099-01-01' }];
  assert.equal(findSessionOutsidePlanValidity(sessions, ''), null);
  assert.equal(findSessionOutsidePlanValidity(sessions, undefined), null);
});

test('exceedsAuthorizedQuantity acusa quando os atendimentos passam do autorizado', () => {
  assert.equal(exceedsAuthorizedQuantity(5, 3), true);
});

test('exceedsAuthorizedQuantity não acusa quando está dentro ou igual ao autorizado', () => {
  assert.equal(exceedsAuthorizedQuantity(3, 3), false);
  assert.equal(exceedsAuthorizedQuantity(2, 3), false);
});

test('exceedsAuthorizedQuantity ignora a checagem quando não há autorização prévia', () => {
  assert.equal(exceedsAuthorizedQuantity(999, ''), false);
  assert.equal(exceedsAuthorizedQuantity(999, undefined), false);
});

test('findCidIncompatibility acusa CID fora do capítulo esperado para o procedimento', () => {
  const result = findCidIncompatibility('50000000 - Atendimento terapêutico ABA', 'M54.5');
  assert.ok(result, 'deveria encontrar incompatibilidade (esperado capítulo F para terapia ABA)');
  assert.equal(result.chapter, 'M');
});

test('findCidIncompatibility aceita CID compatível com o procedimento', () => {
  assert.equal(findCidIncompatibility('50000000 - Atendimento terapêutico ABA', 'F84.0'), null);
  assert.equal(findCidIncompatibility('50000470 - Sessão de fisioterapia', 'M25.5'), null);
});

test('findCidIncompatibility não se aplica a procedimentos fora da tabela demonstrativa', () => {
  assert.equal(findCidIncompatibility('10101012 - Consulta em consultório', 'Z00.0'), null);
});

test('filterGuides encontra por paciente, convênio, procedimento ou ID, ignorando maiúsculas/minúsculas', () => {
  const guides = [
    { id: 'G-2026-00481', patient: 'Helena Martins', insurer: 'Unimed', procedure: 'Consulta ambulatorial' },
    { id: 'G-2026-00478', patient: 'João Pedro Lima', insurer: 'Amil', procedure: 'Fisioterapia' }
  ];
  assert.equal(filterGuides(guides, 'helena').length, 1);
  assert.equal(filterGuides(guides, 'AMIL').length, 1);
  assert.equal(filterGuides(guides, 'G-2026-00478').length, 1);
  assert.equal(filterGuides(guides, 'fisio').length, 1);
});

test('filterGuides retorna a lista completa quando o termo está vazio', () => {
  const guides = [{ id: 'G-1', patient: 'A', insurer: 'B', procedure: 'C' }];
  assert.equal(filterGuides(guides, '').length, 1);
  assert.equal(filterGuides(guides, '   ').length, 1);
  assert.equal(filterGuides(guides, undefined).length, 1);
});

test('filterGuides retorna vazio quando nada corresponde ao termo', () => {
  const guides = [{ id: 'G-1', patient: 'Helena', insurer: 'Unimed', procedure: 'Consulta' }];
  assert.equal(filterGuides(guides, 'inexistente').length, 0);
});

test('filterPatients encontra por nome, convênio, carteira ou plano', () => {
  const patients = [
    { name: 'Rafael Nogueira', insurer: 'Bradesco Saúde', cardNumber: '9876543210001', plan: 'Bradesco Efetivo' },
    { name: 'Bianca Torres', insurer: 'SulAmérica', cardNumber: '2468135790004', plan: 'SulAmérica Exato' }
  ];
  assert.equal(filterPatients(patients, 'rafael').length, 1);
  assert.equal(filterPatients(patients, '2468135790004').length, 1);
  assert.equal(filterPatients(patients, 'exato').length, 1);
  assert.equal(filterPatients(patients, '').length, 2);
});

test('filterInsurers encontra por nome, código ANS ou e-mail de contato', () => {
  const insurers = [
    { name: 'Unimed', ansCode: '004701', contactEmail: 'contato@unimed.com.br' },
    { name: 'Amil', ansCode: '326305', contactEmail: 'faturamento@amil.com.br' }
  ];
  assert.equal(filterInsurers(insurers, 'unimed').length, 1);
  assert.equal(filterInsurers(insurers, '326305').length, 1);
  assert.equal(filterInsurers(insurers, 'faturamento@amil').length, 1);
  assert.equal(filterInsurers(insurers, '').length, 2);
});

test('filterFeedbacks encontra por paciente, profissional, guia ou tipo de atendimento', () => {
  const feedbacks = [
    { patient: 'Helena Martins', professional: 'Marina Souza', guideId: 'G-2026-00481', attendanceType: 'Terapia ABA' },
    { patient: 'Rafael Nogueira', professional: 'Lucas Andrade', guideId: null, attendanceType: 'Fisioterapia' }
  ];
  assert.equal(filterFeedbacks(feedbacks, 'helena').length, 1);
  assert.equal(filterFeedbacks(feedbacks, 'lucas andrade').length, 1);
  assert.equal(filterFeedbacks(feedbacks, 'G-2026-00481').length, 1);
  assert.equal(filterFeedbacks(feedbacks, 'fisioterapia').length, 1);
  assert.equal(filterFeedbacks(feedbacks, '').length, 2);
});

test('batchFollowupAlertItems alerta remessas sem retorno após sete e quinze dias', () => {
  const today = new Date('2026-09-20T12:00:00');
  const alerts = batchFollowupAlertItems([
    { id: 'L-1', insurer: 'Unimed', status: 'sent', protocol: 'P-1', sentPackageId: 'PKG-1', sentAt: '2026-09-12 10:00:00', returnItems: [], documents: [] },
    { id: 'L-2', insurer: 'Amil', status: 'processing', protocol: 'P-2', sentPackageId: 'PKG-2', sentAt: '2026-09-01 10:00:00', returnItems: [], documents: [] }
  ], today);
  assert.equal(alerts.find(item => item.title.includes('L-1')).level, 'warning');
  assert.equal(alerts.find(item => item.title.includes('L-2')).level, 'critical');
});

test('batchFollowupAlertItems encerra o alerta quando o retorno foi anexado', () => {
  const alerts = batchFollowupAlertItems([{ id: 'L-1', insurer: 'Unimed', status: 'sent', protocol: 'P-1', sentPackageId: 'PKG-1', sentAt: '2026-08-01 10:00:00', returnItems: [{ id: 'R-1' }], documents: [] }], new Date('2026-09-20T12:00:00'));
  assert.equal(alerts.length, 0);
});

test('batchFollowupAlertItems respeita os prazos configurados no convênio', () => {
  const batch = { id: 'L-1', insurer: 'Plano Ágil', status: 'sent', protocol: 'P-1', sentPackageId: 'PKG-1', sentAt: '2026-09-10 10:00:00', returnAlertDays: 12, returnCriticalDays: 20, returnItems: [], documents: [] };
  assert.equal(batchFollowupAlertItems([batch], new Date('2026-09-20T12:00:00')).length, 0);
  assert.equal(batchFollowupAlertItems([batch], new Date('2026-09-22T12:00:00'))[0].level, 'warning');
  assert.equal(batchFollowupAlertItems([batch], new Date('2026-09-30T12:00:00'))[0].level, 'critical');
});

test('batchFollowupAlertItems prioriza a próxima cobrança agendada', () => {
  const batch = { id: 'L-1', insurer: 'Unimed', status: 'processing', protocol: 'P-1', sentPackageId: 'PKG-1', sentAt: '2026-09-01 10:00:00', returnItems: [], documents: [], followups: [{ nextFollowupDate: '2026-09-20' }] };
  const todayAlert = batchFollowupAlertItems([batch], new Date('2026-09-20T12:00:00'))[0];
  const lateAlert = batchFollowupAlertItems([batch], new Date('2026-09-21T12:00:00'))[0];
  assert.match(todayAlert.title, /hoje/);
  assert.equal(todayAlert.level, 'warning');
  assert.equal(lateAlert.level, 'critical');
});

test('batchPaymentAlertItems avisa pagamento próximo, parcial e atrasado', () => {
  const base = { insurer: 'Unimed', status: 'approved', totalValueCents: 100000, expectedPaymentDate: '2026-09-20' };
  const upcoming = batchPaymentAlertItems([{ ...base, id: 'L-1', receivedCents: 0 }], new Date('2026-09-17T12:00:00'))[0];
  const partial = batchPaymentAlertItems([{ ...base, id: 'L-2', receivedCents: 40000 }], new Date('2026-09-20T12:00:00'))[0];
  const overdue = batchPaymentAlertItems([{ ...base, id: 'L-3', receivedCents: 0 }], new Date('2026-09-23T12:00:00'))[0];
  assert.equal(upcoming.level, 'info');
  assert.equal(partial.level, 'warning');
  assert.match(partial.detail, /R\$\s*600,00/);
  assert.equal(overdue.level, 'critical');
});

test('batchPaymentAlertItems ignora lote quitado ou sem previsão', () => {
  const paid = { id: 'L-1', insurer: 'Amil', status: 'approved', totalValueCents: 50000, receivedCents: 50000, expectedPaymentDate: '2026-09-01' };
  assert.equal(batchPaymentAlertItems([paid], new Date('2026-09-20T12:00:00')).length, 0);
  assert.equal(batchPaymentAlertItems([{ ...paid, receivedCents: 0, expectedPaymentDate: null }], new Date('2026-09-20T12:00:00')).length, 0);
});

test('batchPaymentTiming classifica o prazo somente de lotes em aberto', () => {
  const today = new Date('2026-09-20T12:00:00');
  const base = { status: 'sent', totalValueCents: 10000, receivedCents: 0, reconciliationStatus: 'pending' };
  assert.equal(batchPaymentTiming({ ...base, expectedPaymentDate: '2026-09-19' }, today), 'overdue');
  assert.equal(batchPaymentTiming({ ...base, expectedPaymentDate: '2026-09-24' }, today), 'upcoming');
  assert.equal(batchPaymentTiming({ ...base, expectedPaymentDate: '2026-10-10' }, today), 'scheduled');
  assert.equal(batchPaymentTiming(base, today), 'unscheduled');
  assert.equal(batchPaymentTiming({ ...base, reconciliationStatus: 'paid', receivedCents: 10000 }, today), 'inactive');
});

test('batchPaymentAgeBucket respeita as faixas de 30 e 60 dias', () => {
  const today = new Date('2026-09-20T12:00:00');
  const base = { status: 'sent', totalValueCents: 10000, receivedCents: 0, reconciliationStatus: 'pending' };
  assert.equal(batchPaymentAgeBucket({ ...base, expectedPaymentDate: '2026-09-25' }, today), 'notDue');
  assert.equal(batchPaymentAgeBucket({ ...base, expectedPaymentDate: '2026-08-21' }, today), 'overdue30');
  assert.equal(batchPaymentAgeBucket({ ...base, expectedPaymentDate: '2026-07-22' }, today), 'overdue60');
  assert.equal(batchPaymentAgeBucket({ ...base, expectedPaymentDate: '2026-07-01' }, today), 'overdueMore');
  assert.equal(batchPaymentAgeBucket(base, today), 'unscheduled');
});

test('batchPaymentDueInfo descreve o prazo de recebimento do lote', () => {
  const today = new Date('2026-09-20T12:00:00');
  const base = { status: 'sent', totalValueCents: 10000, receivedCents: 0, reconciliationStatus: 'pending' };
  assert.deepEqual(batchPaymentDueInfo({ ...base, expectedPaymentDate: '2026-09-15' }, today), { state: 'overdue', label: '5 dia(s) em atraso', days: -5 });
  assert.deepEqual(batchPaymentDueInfo({ ...base, expectedPaymentDate: '2026-09-20' }, today), { state: 'upcoming', label: 'Previsto para hoje', days: 0 });
  assert.deepEqual(batchPaymentDueInfo({ ...base, expectedPaymentDate: '2026-09-23' }, today), { state: 'upcoming', label: 'Previsto em 3 dia(s)', days: 3 });
  assert.deepEqual(batchPaymentDueInfo(base, today), { state: 'unscheduled', label: 'Sem previsão', days: null });
  assert.deepEqual(batchPaymentDueInfo({ ...base, reconciliationStatus: 'paid', receivedCents: 10000 }, today), { state: 'inactive', label: 'Quitado', days: null });
});

test('batchReceivablesSummary consolida saldos por vencimento', () => {
  const summary = batchReceivablesSummary([
    { id: 'L-1', status: 'approved', totalValueCents: 100000, receivedCents: 20000, expectedPaymentDate: '2026-09-10' },
    { id: 'L-2', status: 'sent', totalValueCents: 50000, receivedCents: 0, expectedPaymentDate: '2026-09-23' },
    { id: 'L-3', status: 'approved', totalValueCents: 30000, receivedCents: 30000, expectedPaymentDate: '2026-09-01' },
    { id: 'L-4', status: 'draft', totalValueCents: 90000, receivedCents: 0 }
  ], new Date('2026-09-20T12:00:00'));
  assert.equal(summary.pendingCents, 130000);
  assert.equal(summary.overdueCents, 80000);
  assert.equal(summary.upcomingCents, 50000);
  assert.equal(summary.partialCents, 80000);
  assert.equal(summary.items.length, 3);
});

test('receivablesToCsv exporta saldos e neutraliza fórmulas do Excel', () => {
  const csv = receivablesToCsv([{
    id: 'L-1', insurer: '=PLANO', competence: '2026-09', expectedPaymentDate: '2026-09-25',
    days: -12, totalCents: 15050, receivedCents: 5000, pendingCents: 10050, state: 'partial'
  }], { partial: 'Pagamento parcial' });
  assert.match(csv, /"Lote";"Convênio";"Competência";"Previsão de pagamento";"Dias em atraso";"Faixa de atraso"/);
  assert.match(csv, /"L-1";"'=PLANO";"2026-09";"2026-09-25";"12";"1 a 30 dias";"150,50";"50,00";"100,50";"Pagamento parcial"/);
  const paidCsv = receivablesToCsv([{ id: 'L-2', pendingCents: 0, days: -90, state: 'paid' }], { paid: 'Quitado' });
  assert.match(paidCsv, /"L-2";"";"";"";"";"Quitado"/);
});

test('receivablesAging distribui somente saldos em aberto por faixa de atraso', () => {
  const aging = receivablesAging([
    { pendingCents: 10000, days: 4 },
    { pendingCents: 20000, days: -10 },
    { pendingCents: 30000, days: -45 },
    { pendingCents: 40000, days: -90 },
    { pendingCents: 50000, days: null },
    { pendingCents: 0, days: -120 }
  ]);
  assert.deepEqual(aging, {
    notDue: { count: 1, cents: 10000 }, overdue30: { count: 1, cents: 20000 },
    overdue60: { count: 1, cents: 30000 }, overdueMore: { count: 1, cents: 40000 },
    unscheduled: { count: 1, cents: 50000 }
  });
});

test('glosaRecoverySummary separa contestação, crédito aguardado, recuperação e perda', () => {
  const summary = glosaRecoverySummary([
    { status: 'aberta', amountCents: 10000 },
    { status: 'recurso_enviado', amountCents: 20000 },
    { status: 'revertida', amountCents: 30000, recoveredCents: null },
    { status: 'revertida', amountCents: 40000, recoveredCents: 35000 },
    { status: 'mantida', amountCents: 50000 }
  ]);
  assert.deepEqual(summary, { totalCents: 150000, contestedCents: 30000, awaitingCreditCents: 30000, recoveredCents: 35000, lossCents: 55000 });
});

test('insurerFinancialPerformance compara faturamento e glosas por convênio', () => {
  const rows = insurerFinancialPerformance([
    { insurer: 'Plano A', status: 'approved', totalValueCents: 100000, receivedCents: 80000 },
    { insurer: 'Plano B', status: 'sent', totalValueCents: 200000, receivedCents: 100000 }
  ], [
    { guideId: 'G-1', status: 'revertida', amountCents: 20000, recoveredCents: 15000 },
    { guideId: 'G-2', status: 'mantida', amountCents: 10000, recoveredCents: null }
  ], [{ id: 'G-1', insurer: 'Plano A' }, { id: 'G-2', insurer: 'Plano B' }]);
  assert.equal(rows[0].insurer, 'Plano A');
  assert.equal(rows[0].glosaRate, 20);
  assert.equal(rows[0].recoveredCents, 15000);
  assert.equal(rows[0].lossCents, 5000);
  assert.equal(rows[1].glosaRate, 5);
  assert.equal(rows[1].lossCents, 10000);
});

test('glosaCauseAnalysis ordena causas e procedimentos pelo impacto financeiro', () => {
  const analysis = glosaCauseAnalysis([
    { guideId: 'G-1', code: 'GL02', reason: 'Sem autorização', status: 'mantida', amountCents: 20000 },
    { guideId: 'G-2', code: 'GL02', reason: 'Sem autorização', status: 'revertida', amountCents: 10000, recoveredCents: 10000 },
    { guideId: 'G-3', code: 'GL03', reason: 'Valor divergente', status: 'mantida', amountCents: 5000 }
  ], [{ id: 'G-1', procedure: 'Terapia ABA' }, { id: 'G-2', procedure: 'Terapia ABA' }, { id: 'G-3', procedure: 'Consulta' }]);
  assert.equal(analysis.byReason[0].label, 'GL02 · Sem autorização');
  assert.equal(analysis.byReason[0].count, 2);
  assert.equal(analysis.byReason[0].amountCents, 30000);
  assert.equal(analysis.byReason[0].lossCents, 20000);
  assert.equal(analysis.byProcedure[0].label, 'Terapia ABA');
});

test('glosaPreventionAlertItems sinaliza taxa alta e padrões recorrentes', () => {
  const alerts = glosaPreventionAlertItems([{ insurer: 'Plano A', status: 'approved', totalValueCents: 100000 }], [
    { guideId: 'G-1', code: 'GL02', reason: 'Sem autorização', amountCents: 12000, status: 'aberta' },
    { guideId: 'G-2', code: 'GL02', reason: 'Sem autorização', amountCents: 10000, status: 'mantida' }
  ], [{ id: 'G-1', insurer: 'Plano A', procedure: 'Terapia ABA' }, { id: 'G-2', insurer: 'Plano A', procedure: 'Terapia ABA' }]);
  assert.equal(alerts.filter(item => item.view === 'reports').length, 3);
  assert.equal(alerts[0].level, 'critical');
  assert.match(alerts[1].title, /recorrente/);
});

test('glosaPreventionAlertItems não alerta taxa abaixo do limite nem ocorrência isolada', () => {
  const alerts = glosaPreventionAlertItems([{ insurer: 'Plano A', status: 'approved', totalValueCents: 100000 }], [
    { guideId: 'G-1', code: 'GL03', reason: 'Valor', amountCents: 5000, status: 'aberta' }
  ], [{ id: 'G-1', insurer: 'Plano A', procedure: 'Consulta' }]);
  assert.equal(alerts.length, 0);
});

test('glosaPreventionAlertItems respeita o limite específico do convênio', () => {
  const batches = [{ insurer: 'Plano rigoroso', status: 'approved', totalValueCents: 100000 }];
  const glosas = [{ guideId: 'G-1', amountCents: 7000, status: 'aberta' }];
  const guides = [{ id: 'G-1', insurer: 'Plano rigoroso', procedure: 'Consulta' }];
  assert.equal(glosaPreventionAlertItems(batches, glosas, guides).length, 0);
  assert.equal(glosaPreventionAlertItems(batches, glosas, guides, [{ name: 'Plano rigoroso', glosaAlertRate: 5 }]).length, 1);
  assert.match(glosaPreventionAlertItems(batches, glosas, guides, [{ name: 'Plano rigoroso', glosaAlertRate: 5 }])[0].detail, /5%/);
});

test('guideBillingRisk avisa antes do lote sobre convênio e procedimento recorrente', () => {
  const guide = { id: 'G-3', insurer: 'Plano A', procedure: 'Terapia ABA' };
  const guides = [{ id: 'G-1', insurer: 'Plano A', procedure: 'Terapia ABA' }, { id: 'G-2', insurer: 'Plano A', procedure: 'Terapia ABA' }, guide];
  const risks = guideBillingRisk(guide, [{ insurer: 'Plano A', status: 'approved', totalValueCents: 100000 }], [{ guideId: 'G-1', amountCents: 8000 }, { guideId: 'G-2', amountCents: 7000 }], guides, [{ name: 'Plano A', glosaAlertRate: 10 }]);
  assert.equal(risks.length, 2);
  assert.match(risks[0], /15%/);
  assert.match(risks[1], /2 glosas/);
});

test('guideBillingRisk não bloqueia guia sem histórico de risco', () => {
  assert.deepEqual(guideBillingRisk({ id: 'G-1', insurer: 'Plano B', procedure: 'Consulta' }, [], [], [], []), []);
});

test('filterBatches combina competência, convênio, status e risco pendente', () => {
  const batches = [
    { id: 'L-1', competence: '2026-08', insurerId: 'I-1', insurer: 'Unimed', protocol: 'PROTO-123', status: 'draft', reconciliationStatus: 'pending', riskReviewRequired: true, guides: [{ id: 'G-1', patient: 'Ana Lima', procedure: 'Psicoterapia' }] },
    { id: 'L-2', competence: '2026-08', insurerId: 'I-2', insurer: 'Amil', status: 'sent', reconciliationStatus: 'partial', expectedPaymentDate: '2026-09-24', totalValueCents: 10000, receivedCents: 5000, riskReviewRequired: false },
    { id: 'L-3', competence: '2026-09', insurerId: 'I-1', status: 'draft', reconciliationStatus: 'paid', riskReviewRequired: false }
  ];
  assert.deepEqual(filterBatches(batches, { competence: '2026-08' }).map(item => item.id), ['L-1', 'L-2']);
  assert.deepEqual(filterBatches(batches, { insurerId: 'I-1', status: 'draft', riskPending: true }).map(item => item.id), ['L-1']);
  assert.deepEqual(filterBatches(batches, { reconciliationStatus: 'partial' }).map(item => item.id), ['L-2']);
  assert.deepEqual(filterBatches(batches, { paymentTiming: 'upcoming', today: new Date('2026-09-20T12:00:00') }).map(item => item.id), ['L-2']);
  assert.equal(filterBatches(batches).length, 3);
  assert.deepEqual(filterBatches(batches, { query: 'ana lima' }).map(item => item.id), ['L-1']);
  assert.deepEqual(filterBatches(batches, { query: 'proto-123' }).map(item => item.id), ['L-1']);
  assert.deepEqual(filterBatches(batches, { query: 'psicoterapia', competence: '2026-08' }).map(item => item.id), ['L-1']);
});

test('sortBatches ordena por data, valor e risco sem alterar a lista original', () => {
  const batches = [
    { id: 'L-1', createdAt: '2026-08-01T10:00:00Z', totalValueCents: 10000, riskReviewRequired: false },
    { id: 'L-2', createdAt: '2026-09-01T10:00:00Z', totalValueCents: 5000, riskReviewRequired: true },
    { id: 'L-3', createdAt: '2026-07-01T10:00:00Z', totalValueCents: 20000, riskReviewRequired: false }
  ];
  assert.deepEqual(sortBatches(batches, 'newest').map(item => item.id), ['L-2', 'L-1', 'L-3']);
  assert.deepEqual(sortBatches(batches, 'oldest').map(item => item.id), ['L-3', 'L-1', 'L-2']);
  assert.deepEqual(sortBatches(batches, 'highest-value').map(item => item.id), ['L-3', 'L-1', 'L-2']);
  assert.deepEqual(sortBatches(batches, 'risk-first').map(item => item.id), ['L-2', 'L-1', 'L-3']);
  assert.deepEqual(batches.map(item => item.id), ['L-1', 'L-2', 'L-3']);
});

test('sortBatches ordena cobranças pelo maior atraso e deixa quitados no final', () => {
  const batches = [
    { id: 'L-RECENTE', status: 'sent', reconciliationStatus: 'pending', totalValueCents: 10000, expectedPaymentDate: '2026-09-10' },
    { id: 'L-ANTIGO', status: 'approved', reconciliationStatus: 'partial', totalValueCents: 20000, receivedCents: 5000, expectedPaymentDate: '2026-07-01' },
    { id: 'L-QUITADO', status: 'approved', reconciliationStatus: 'paid', totalValueCents: 10000, receivedCents: 10000, expectedPaymentDate: '2026-06-01' },
    { id: 'L-SEM-DATA', status: 'sent', reconciliationStatus: 'pending', totalValueCents: 10000 }
  ];
  assert.deepEqual(sortBatches(batches, 'most-overdue').map(item => item.id), ['L-ANTIGO', 'L-RECENTE', 'L-QUITADO', 'L-SEM-DATA']);
});

test('sortBatches ordena pelo saldo restante após pagamentos parciais', () => {
  const batches = [
    { id: 'L-ALTO-QUASE-PAGO', totalValueCents: 100000, receivedCents: 95000, createdAt: '2026-09-03T10:00:00Z' },
    { id: 'L-MAIOR-SALDO', totalValueCents: 60000, receivedCents: 10000, createdAt: '2026-09-01T10:00:00Z' },
    { id: 'L-MEDIO', totalValueCents: 30000, receivedCents: 0, createdAt: '2026-09-02T10:00:00Z' }
  ];
  assert.deepEqual(sortBatches(batches, 'highest-balance').map(item => item.id), ['L-MAIOR-SALDO', 'L-MEDIO', 'L-ALTO-QUASE-PAGO']);
});

test('batchesToCsv exporta valores e neutraliza fórmulas para o Excel', () => {
  assert.equal(safeCsvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  const csv = batchesToCsv([{ id: 'L-1', insurer: 'Unimed', competence: '2026-09', status: 'sent', protocol: '+123', guideCount: 2, totalValueCents: 12345, receivedCents: 10000, reconciliationStatus: 'partial', riskReviewRequired: true }], { sent: 'Enviado' });
  assert.match(csv, /"L-1";"Unimed";"2026-09";"Enviado";"'\+123"/);
  assert.match(csv, /"123,45";"100,00";"partial";"Sim"/);
});

test('normalizeBatchPreferences recupera filtros e ordenação válidos', () => {
  const preferences = normalizeBatchPreferences(JSON.stringify({
    filters: { query: 'Helena', competence: '2026-08', insurerId: 'INS-001', status: 'sent', reconciliationStatus: 'partial', paymentTiming: 'upcoming', agingBucket: 'overdue30', riskPending: true },
    sortOrder: 'risk-first'
  }));
  assert.deepEqual(preferences, {
    filters: { query: 'Helena', competence: '2026-08', insurerId: 'INS-001', status: 'sent', reconciliationStatus: 'partial', paymentTiming: 'upcoming', agingBucket: 'overdue30', riskPending: true },
    sortOrder: 'risk-first'
  });
});

test('normalizeBatchPreferences usa valores seguros para preferência inválida', () => {
  assert.deepEqual(normalizeBatchPreferences('{conteudo-invalido'), {
    filters: { query: '', competence: '', insurerId: '', status: '', reconciliationStatus: '', paymentTiming: '', agingBucket: '', riskPending: false },
    sortOrder: 'newest'
  });
  assert.deepEqual(normalizeBatchPreferences({ filters: { competence: 'agosto', riskPending: 'sim' }, sortOrder: 'desconhecida' }), {
    filters: { query: '', competence: '', insurerId: '', status: '', reconciliationStatus: '', paymentTiming: '', agingBucket: '', riskPending: false },
    sortOrder: 'newest'
  });
});

test('financeBatchShortcutFilters abre uma consulta financeira limpa', () => {
  assert.deepEqual(financeBatchShortcutFilters({ paymentTiming: 'overdue' }), {
    query: '', competence: '', insurerId: '', status: '', reconciliationStatus: '', paymentTiming: 'overdue', agingBucket: '', riskPending: false
  });
  assert.deepEqual(financeBatchShortcutFilters({ reconciliationStatus: 'partial' }), {
    query: '', competence: '', insurerId: '', status: '', reconciliationStatus: 'partial', paymentTiming: '', agingBucket: '', riskPending: false
  });
});

test('guideProductionSummary consolida sessões por profissional e paciente', () => {
  const summary = guideProductionSummary([
    { id: 'G-1', patient: 'Ana', professional: 'Dra. Lia', quantity: 2, unitValueCents: 10000, valueCents: 20000, sessions: [{ date: '2026-09-01', professional: 'Dra. Lia' }, { date: '2026-09-08', professional: 'Dra. Bia' }] },
    { id: 'G-2', patient: 'Ana', professional: 'Dra. Lia', quantity: 1, unitValueCents: 15000, valueCents: 15000, sessions: [{ date: '2026-09-02' }] },
    { id: 'G-3', patient: 'Caio', professional: '', quantity: 1, valueCents: 9000, sessions: [] }
  ]);
  assert.equal(summary.guides, 3);
  assert.equal(summary.sessions, 4);
  assert.equal(summary.valueCents, 44000);
  assert.deepEqual(summary.byProfessional.map(item => [item.label, item.sessions, item.guides, item.valueCents]), [['Dra. Lia', 2, 2, 25000], ['Dra. Bia', 1, 1, 10000], ['Não informado', 1, 1, 9000]]);
  assert.deepEqual(summary.byPatient.map(item => [item.label, item.sessions, item.guides]), [['Ana', 3, 2], ['Caio', 1, 1]]);
});
