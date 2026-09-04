const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nextSequentialId, timeToMinutes, hasScheduleConflictWith, escapeXml, findSessionOutsidePlanValidity, exceedsAuthorizedQuantity, findCidIncompatibility, filterGuides, filterPatients, filterInsurers, filterFeedbacks, consentAlertItems, clinicOnboardingChecklist } = require('./lib.js');

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
