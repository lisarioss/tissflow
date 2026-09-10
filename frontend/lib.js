// Funções puras (sem DOM/localStorage), extraídas de app.js para permitir
// testes automatizados com `node --test`. Carregado antes de app.js no
// index.html; nada de comportamento muda, só a organização do código.

// Gera o próximo ID com base no maior número já existente na lista, em vez de
// list.length — evitando colisão quando itens são removidos/filtrados
// (ex.: duas guias apagadas fariam list.length reaproveitar um ID em uso).
function nextSequentialId(list, prefix, digits) {
  const highest = list.reduce((max, item) => {
    const match = String(item.id || '').match(/(\d+)$/);
    const num = match ? Number(match[1]) : 0;
    return num > max ? num : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(digits, '0')}`;
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Recebe a lista de agendamentos explicitamente (em vez de fechar sobre a
// variável global `appointments`) para poder ser testada isoladamente.
function hasScheduleConflictWith(appointments, data) {
  const start = timeToMinutes(data.start);
  const end = start + Number(data.duration);
  return appointments.find(appointment => {
    if (appointment.professional !== data.professional || appointment.date !== data.date) return false;
    const appointmentStart = timeToMinutes(appointment.start);
    const appointmentEnd = appointmentStart + Number(appointment.duration);
    return start < appointmentEnd && end > appointmentStart;
  });
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]));
}

// --- Validações de negócio ---
// Regras simplificadas e demonstrativas — não substituem a tabela oficial da
// ANS, servem para ilustrar o tipo de checagem que um sistema TISS real faz
// antes de enviar uma guia.

// Retorna a data do atendimento mais recente que ultrapassa a vigência do
// plano, ou null se todos os atendimentos estiverem dentro da validade.
function findSessionOutsidePlanValidity(sessions, planValidity) {
  if (!planValidity) return null;
  const outOfRange = sessions.find(session => session.date > planValidity);
  return outOfRange ? outOfRange.date : null;
}

// Compara a quantidade de atendimentos da guia com a quantidade autorizada
// previamente pela operadora (quando informada).
function exceedsAuthorizedQuantity(sessionCount, authorizedQuantity) {
  if (!authorizedQuantity) return false;
  return sessionCount > Number(authorizedQuantity);
}

// Tabela simplificada de compatibilidade entre código TUSS e capítulo do
// CID-10 esperado. Cobre só os quatro procedimentos já usados no demo.
const cidCompatibilityTable = {
  '50000000': { label: 'Terapia ABA', chapters: ['F'] },
  '50000470': { label: 'Fisioterapia', chapters: ['M', 'S', 'T'] }
};
function findCidIncompatibility(procedureValue, cid) {
  if (!cid) return null;
  const code = String(procedureValue || '').split(' - ')[0].trim();
  const rule = cidCompatibilityTable[code];
  if (!rule) return null;
  const chapter = String(cid).trim().toUpperCase()[0];
  return rule.chapters.includes(chapter) ? null : { ...rule, chapter };
}

// --- Busca/filtro nas listagens ---
// Busca simples por substring (case-insensitive), sem acentuação especial —
// suficiente para o volume de dados de um protótipo/demo.
function filterGuides(guides, term) {
  const query = String(term || '').trim().toLowerCase();
  if (!query) return guides;
  return guides.filter(guide => [guide.id, guide.patient, guide.insurer, guide.procedure].some(field => String(field || '').toLowerCase().includes(query)));
}
function filterPatients(patients, term) {
  const query = String(term || '').trim().toLowerCase();
  if (!query) return patients;
  return patients.filter(patient => [patient.name, patient.insurer, patient.cardNumber, patient.plan].some(field => String(field || '').toLowerCase().includes(query)));
}
function filterInsurers(insurers, term) {
  const query = String(term || '').trim().toLowerCase();
  if (!query) return insurers;
  return insurers.filter(insurer => [insurer.name, insurer.ansCode, insurer.contactEmail].some(field => String(field || '').toLowerCase().includes(query)));
}
function filterFeedbacks(feedbacks, term) {
  const query = String(term || '').trim().toLowerCase();
  if (!query) return feedbacks;
  return feedbacks.filter(feedback => [feedback.patient, feedback.professional, feedback.guideId, feedback.attendanceType].some(field => String(field || '').toLowerCase().includes(query)));
}

function filterPatientsByStatus(patients, status = 'active') {
  if (status === 'all') return patients;
  return patients.filter(patient => status === 'active' ? isActivePatient(patient) : !isActivePatient(patient));
}

function paginateItems(items, requestedPage = 1, pageSize = 20) {
  const safeSize = Math.max(1, Number(pageSize) || 20);
  const totalPages = Math.max(1, Math.ceil(items.length / safeSize));
  const page = Math.min(totalPages, Math.max(1, Number(requestedPage) || 1));
  return { items: items.slice((page - 1) * safeSize, page * safeSize), page, totalPages, total: items.length };
}

function isActivePatient(patient) { return patient?.active !== false && patient?.active !== 0; }

function planValidityAlertItems(patients, today = new Date()) {
  const referenceDate = new Date(today); referenceDate.setHours(0, 0, 0, 0);
  return patients.filter(isActivePatient).flatMap(patient => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patient.planValidity || '')) return [];
    const validityDate = new Date(`${patient.planValidity}T12:00:00`); validityDate.setHours(0, 0, 0, 0);
    const days = Math.ceil((validityDate - referenceDate) / 86400000);
    if (days > 30) return [];
    const formattedDate = validityDate.toLocaleDateString('pt-BR');
    return [{
      level: days < 0 ? 'critical' : 'warning',
      title: days < 0 ? `Plano vencido · ${patient.name}` : days === 0 ? `Plano vence hoje · ${patient.name}` : `Plano vence em ${days} dia(s) · ${patient.name}`,
      detail: `${patient.insurer} · carteira ${patient.cardNumber || 'não informada'} · validade ${formattedDate}.`,
      view: 'patients',
      targetId: patient.id
    }];
  });
}

function consentAlertItems(patients, consentEvents, renewalMonths = 0, today = new Date()) {
  return patients.filter(isActivePatient).flatMap(patient => {
    const currentConsent = consentEvents
      .filter(item => item.patientId === patient.id)
      .sort((first, second) => `${second.eventDate}${second.createdAt || ''}`.localeCompare(`${first.eventDate}${first.createdAt || ''}`))[0];
    const status = patient.consentStatus || 'pending';
    if (status === 'pending') return [{ level: 'warning', title: `Consentimento pendente · ${patient.name}`, detail: 'Registre a manifestação do responsável na pasta do paciente.', view: 'patients', targetId: patient.id }];
    if (status === 'revoked') return [{ level: 'critical', title: `Consentimento revogado · ${patient.name}`, detail: `Revogação registrada${patient.consentDate ? ` em ${new Date(`${patient.consentDate}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}. Confira o fluxo assistencial e administrativo.`, view: 'patients', targetId: patient.id }];
    if (status !== 'granted') return [];
    const alerts = [];
    if (!currentConsent?.signedDocumentId) alerts.push({ level: 'warning', title: `Comprovante de consentimento ausente · ${patient.name}`, detail: 'Anexe e vincule o termo assinado ao registro mais recente.', view: 'patients', targetId: patient.id });
    if (renewalMonths > 0 && currentConsent?.eventDate) {
      const renewalDate = new Date(`${currentConsent.eventDate}T12:00:00`);
      renewalDate.setMonth(renewalDate.getMonth() + Number(renewalMonths));
      renewalDate.setHours(0, 0, 0, 0);
      const referenceDate = new Date(today); referenceDate.setHours(0, 0, 0, 0);
      const days = Math.ceil((renewalDate - referenceDate) / 86400000);
      if (days <= 30) alerts.push({ level: days < 0 ? 'critical' : 'warning', title: days < 0 ? `Consentimento vencido · ${patient.name}` : `Consentimento vence em ${days} dia(s) · ${patient.name}`, detail: `Renovação prevista para ${renewalDate.toLocaleDateString('pt-BR')}. Registre uma nova manifestação.`, view: 'patients', targetId: patient.id });
    }
    return alerts;
  });
}

function clinicOnboardingChecklist(settings, insurers, users, patients) {
  const activeOwners = (settings.owners || []).filter(owner => owner.active !== false && String(owner.name || '').trim());
  const completeProfessionals = (settings.professionals || []).filter(professional => professional.name && professional.councilType && professional.councilNumber && professional.councilState && professional.cbo);
  const configuredInsurers = (insurers || []).filter(insurer => insurer.name && insurer.ansCode && insurer.providerCode && ((insurer.procedureRules || []).length || (insurer.acceptedProcedures || []).length));
  const activeUsers = (users || []).filter(user => user.active !== false);
  return [
    { id: 'identity', label: 'Dados institucionais, CNPJ e CNES', complete: Boolean(settings.tradeName && settings.cnpj && settings.cnes), view: 'settings' },
    { id: 'letterhead', label: 'Papel timbrado A4', complete: Boolean(settings.letterheadDataUrl), view: 'settings' },
    { id: 'owners', label: 'Responsável que assina a capa', complete: activeOwners.length > 0, view: 'settings' },
    { id: 'professionals', label: 'Profissionais com conselho e CBO', complete: completeProfessionals.length > 0, view: 'settings' },
    { id: 'insurers', label: 'Convênio com código do prestador e procedimentos', complete: configuredInsurers.length > 0, view: 'convenios' },
    { id: 'team', label: 'Equipe com acesso ao sistema', complete: activeUsers.length > 1, view: 'users' },
    { id: 'patients', label: 'Primeiro paciente cadastrado', complete: (patients || []).some(isActivePatient), view: 'patients' }
  ];
}

function batchFollowupAlertItems(batches, today = new Date()) {
  const referenceDate = new Date(today); referenceDate.setHours(0, 0, 0, 0);
  return (batches || []).flatMap(batch => {
    if (!['sent', 'processing'].includes(batch.status)) return [];
    const alerts = [];
    if (!batch.protocol) alerts.push({ level: 'critical', title: `Lote ${batch.id} sem protocolo`, detail: `${batch.insurer} · registre o comprovante do envio.`, view: 'batches', targetId: batch.id });
    if (!batch.sentPackageId) alerts.push({ level: 'warning', title: `Lote ${batch.id} sem remessa oficial`, detail: 'Vincule a versão exata do pacote enviada à operadora.', view: 'batches', targetId: batch.id });
    if ((batch.returnItems || []).length || (batch.documents || []).some(item => ['operator_return', 'payment_statement'].includes(item.category))) return alerts;
    const scheduled = (batch.followups || [])[0]?.nextFollowupDate ? batch.followups[0] : null;
    if (scheduled) {
      const dueDate = new Date(`${scheduled.nextFollowupDate}T12:00:00`); dueDate.setHours(0, 0, 0, 0);
      const daysUntilFollowup = Math.ceil((dueDate - referenceDate) / 86400000);
      if (daysUntilFollowup <= 0) alerts.push({ level: daysUntilFollowup < 0 ? 'critical' : 'warning', title: daysUntilFollowup < 0 ? `Cobrança atrasada · lote ${batch.id}` : `Cobrar operadora hoje · lote ${batch.id}`, detail: `${batch.insurer} · acompanhamento marcado para ${dueDate.toLocaleDateString('pt-BR')}.`, view: 'batches', targetId: batch.id });
      return alerts;
    }
    const sentDate = batch.sentAt ? new Date(`${String(batch.sentAt).replace(' ', 'T')}Z`) : null;
    if (!sentDate || Number.isNaN(sentDate.getTime())) return alerts;
    sentDate.setHours(0, 0, 0, 0);
    const elapsedDays = Math.max(0, Math.floor((referenceDate - sentDate) / 86400000));
    const alertDays = Number(batch.returnAlertDays || 7), criticalDays = Number(batch.returnCriticalDays || 15);
    if (elapsedDays >= alertDays) alerts.push({ level: elapsedDays >= criticalDays ? 'critical' : 'warning', title: `Lote ${batch.id} sem retorno há ${elapsedDays} dias`, detail: `${batch.insurer} · protocolo ${batch.protocol || 'não informado'}. Consulte a operadora.`, view: 'batches', targetId: batch.id });
    return alerts;
  });
}

function batchPaymentAlertItems(batches, today = new Date()) {
  const referenceDate = new Date(today); referenceDate.setHours(0, 0, 0, 0);
  return (batches || []).flatMap(batch => {
    if (!batch.expectedPaymentDate || !['sent', 'processing', 'approved', 'error'].includes(batch.status)) return [];
    const total = Number(batch.totalValueCents || Math.round(Number(batch.totalValue || 0) * 100));
    const received = Number(batch.receivedCents || 0);
    if (total > 0 && received >= total) return [];
    const dueDate = new Date(`${batch.expectedPaymentDate}T12:00:00`); dueDate.setHours(0, 0, 0, 0);
    if (Number.isNaN(dueDate.getTime())) return [];
    const days = Math.ceil((dueDate - referenceDate) / 86400000);
    if (days > 5) return [];
    const remaining = Math.max(0, total - received) / 100;
    const amount = remaining.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (days < 0) return [{ level: 'critical', title: `Pagamento atrasado · lote ${batch.id}`, detail: `${batch.insurer} · ${amount} pendente há ${Math.abs(days)} dia(s).`, view: 'batches', targetId: batch.id }];
    return [{ level: received > 0 ? 'warning' : 'info', title: days === 0 ? `Pagamento previsto para hoje · lote ${batch.id}` : `Pagamento previsto em ${days} dia(s) · lote ${batch.id}`, detail: `${batch.insurer} · ${amount} ainda pendente${received > 0 ? ' após pagamento parcial' : ''}.`, view: 'batches', targetId: batch.id }];
  });
}

function batchReceivablesSummary(batches, today = new Date()) {
  const referenceDate = new Date(today); referenceDate.setHours(0, 0, 0, 0);
  const items = (batches || []).filter(batch => ['sent', 'processing', 'approved', 'error'].includes(batch.status)).map(batch => {
    const totalCents = Number(batch.totalValueCents || Math.round(Number(batch.totalValue || 0) * 100));
    const receivedCents = Number(batch.receivedCents || 0), pendingCents = Math.max(0, totalCents - receivedCents);
    const dueDate = batch.expectedPaymentDate ? new Date(`${batch.expectedPaymentDate}T12:00:00`) : null;
    if (dueDate) dueDate.setHours(0, 0, 0, 0);
    const days = dueDate && !Number.isNaN(dueDate.getTime()) ? Math.ceil((dueDate - referenceDate) / 86400000) : null;
    const state = pendingCents === 0 ? 'paid' : days !== null && days < 0 ? 'overdue' : days !== null && days <= 5 ? 'upcoming' : receivedCents > 0 ? 'partial' : 'pending';
    return { ...batch, totalCents, receivedCents, pendingCents, days, state };
  });
  return {
    items,
    pendingCents: items.reduce((sum, item) => sum + item.pendingCents, 0),
    overdueCents: items.filter(item => item.state === 'overdue').reduce((sum, item) => sum + item.pendingCents, 0),
    upcomingCents: items.filter(item => item.state === 'upcoming').reduce((sum, item) => sum + item.pendingCents, 0),
    partialCents: items.filter(item => item.pendingCents > 0 && item.receivedCents > 0).reduce((sum, item) => sum + item.pendingCents, 0)
  };
}

// Disponibiliza as funções tanto para <script> no navegador (globais em
// `window`) quanto para `require()` em testes Node — sem precisar de bundler.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { nextSequentialId, timeToMinutes, hasScheduleConflictWith, escapeXml, findSessionOutsidePlanValidity, exceedsAuthorizedQuantity, findCidIncompatibility, filterGuides, filterPatients, filterPatientsByStatus, paginateItems, filterInsurers, filterFeedbacks, isActivePatient, planValidityAlertItems, consentAlertItems, clinicOnboardingChecklist, batchFollowupAlertItems, batchPaymentAlertItems, batchReceivablesSummary };
}
