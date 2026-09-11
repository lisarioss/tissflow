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

function batchPaymentTiming(batch, today = new Date()) {
  const openStatuses = new Set(['sent', 'processing', 'approved', 'error']);
  const totalCents = Number(batch?.totalValueCents ?? Math.round(Number(batch?.totalValue || 0) * 100));
  const receivedCents = Number(batch?.receivedCents || 0);
  if (!batch || !openStatuses.has(batch.status) || (batch.reconciliationStatus === 'paid') || receivedCents >= totalCents) return 'inactive';
  if (!batch.expectedPaymentDate) return 'unscheduled';
  const reference = new Date(today); reference.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${batch.expectedPaymentDate}T12:00:00`); dueDate.setHours(0, 0, 0, 0);
  const days = Math.ceil((dueDate - reference) / 86400000);
  if (days < 0) return 'overdue';
  if (days <= 5) return 'upcoming';
  return 'scheduled';
}

function batchPaymentAgeBucket(batch, today = new Date()) {
  const timing = batchPaymentTiming(batch, today);
  if (timing === 'inactive') return 'inactive';
  if (timing === 'unscheduled') return 'unscheduled';
  if (timing !== 'overdue') return 'notDue';
  const reference = new Date(today); reference.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${batch.expectedPaymentDate}T12:00:00`); dueDate.setHours(0, 0, 0, 0);
  const overdueDays = Math.abs(Math.ceil((dueDate - reference) / 86400000));
  if (overdueDays <= 30) return 'overdue30';
  if (overdueDays <= 60) return 'overdue60';
  return 'overdueMore';
}

function batchPaymentDueInfo(batch, today = new Date()) {
  const timing = batchPaymentTiming(batch, today);
  if (timing === 'inactive') return { state: 'inactive', label: batch?.reconciliationStatus === 'paid' ? 'Quitado' : 'Não se aplica', days: null };
  if (timing === 'unscheduled') return { state: 'unscheduled', label: 'Sem previsão', days: null };
  const reference = new Date(today); reference.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${batch.expectedPaymentDate}T12:00:00`); dueDate.setHours(0, 0, 0, 0);
  const days = Math.ceil((dueDate - reference) / 86400000);
  if (days < 0) return { state: 'overdue', label: `${Math.abs(days)} dia(s) em atraso`, days };
  if (days === 0) return { state: 'upcoming', label: 'Previsto para hoje', days };
  return { state: timing, label: `Previsto em ${days} dia(s)`, days };
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

function receivablesToCsv(items, stateLabels = {}) {
  const headers = ['Lote', 'Convênio', 'Competência', 'Previsão de pagamento', 'Dias em atraso', 'Faixa de atraso', 'Valor faturado', 'Valor recebido', 'Saldo a receber', 'Situação'];
  const money = cents => (Number(cents || 0) / 100).toFixed(2).replace('.', ',');
  const agingLabels = { paid: 'Quitado', notDue: 'A vencer', overdue30: '1 a 30 dias', overdue60: '31 a 60 dias', overdueMore: 'Mais de 60 dias', unscheduled: 'Sem previsão' };
  const rows = (items || []).map(item => {
    let bucket = Number(item.pendingCents || 0) <= 0 ? 'paid' : 'unscheduled';
    if (bucket !== 'paid' && item.days !== null && item.days !== undefined) bucket = item.days >= 0 ? 'notDue' : item.days >= -30 ? 'overdue30' : item.days >= -60 ? 'overdue60' : 'overdueMore';
    const overdueDays = bucket !== 'paid' && item.days < 0 ? Math.abs(item.days) : '';
    return [
      item.id, item.insurer, item.competence, item.expectedPaymentDate || '', overdueDays,
      agingLabels[bucket], money(item.totalCents), money(item.receivedCents), money(item.pendingCents), stateLabels[item.state] || item.state || ''
    ];
  });
  return [headers, ...rows].map(row => row.map(safeCsvCell).join(';')).join('\r\n');
}

function receivablesAging(items) {
  const aging = {
    notDue: { count: 0, cents: 0 }, overdue30: { count: 0, cents: 0 }, overdue60: { count: 0, cents: 0 }, overdueMore: { count: 0, cents: 0 }, unscheduled: { count: 0, cents: 0 }
  };
  (items || []).filter(item => Number(item.pendingCents || 0) > 0).forEach(item => {
    let bucket = 'unscheduled';
    if (item.days !== null && item.days !== undefined) {
      if (item.days >= 0) bucket = 'notDue';
      else if (item.days >= -30) bucket = 'overdue30';
      else if (item.days >= -60) bucket = 'overdue60';
      else bucket = 'overdueMore';
    }
    aging[bucket].count += 1;
    aging[bucket].cents += Number(item.pendingCents || 0);
  });
  return aging;
}

function glosaRecoverySummary(glosas) {
  return (glosas || []).reduce((summary, glosa) => {
    const amountCents = Number(glosa.amountCents ?? Math.round(Number(glosa.amount || 0) * 100));
    const recoveredCents = glosa.recoveredCents === null || glosa.recoveredCents === undefined ? null : Number(glosa.recoveredCents);
    summary.totalCents += amountCents;
    if (['aberta', 'recurso_enviado'].includes(glosa.status)) summary.contestedCents += amountCents;
    if (glosa.status === 'revertida' && recoveredCents === null) summary.awaitingCreditCents += amountCents;
    if (recoveredCents !== null) {
      summary.recoveredCents += recoveredCents;
      summary.lossCents += Math.max(0, amountCents - recoveredCents);
    } else if (glosa.status === 'mantida') summary.lossCents += amountCents;
    return summary;
  }, { totalCents: 0, contestedCents: 0, awaitingCreditCents: 0, recoveredCents: 0, lossCents: 0 });
}

function insurerFinancialPerformance(batches, glosas, guides) {
  const guideInsurers = new Map((guides || []).map(guide => [guide.id, guide.insurer || 'Convênio não identificado']));
  const rows = new Map();
  const rowFor = insurer => {
    const key = insurer || 'Convênio não identificado';
    if (!rows.has(key)) rows.set(key, { insurer: key, billedCents: 0, receivedCents: 0, glosaCents: 0, recoveredCents: 0, lossCents: 0 });
    return rows.get(key);
  };
  (batches || []).filter(batch => ['sent', 'processing', 'approved', 'error'].includes(batch.status)).forEach(batch => {
    const row = rowFor(batch.insurer);
    row.billedCents += Number(batch.totalValueCents ?? Math.round(Number(batch.totalValue || 0) * 100));
    row.receivedCents += Number(batch.receivedCents || 0);
  });
  (glosas || []).forEach(glosa => {
    const row = rowFor(guideInsurers.get(glosa.guideId));
    const amountCents = Number(glosa.amountCents ?? Math.round(Number(glosa.amount || 0) * 100));
    const recoveredCents = glosa.recoveredCents === null || glosa.recoveredCents === undefined ? null : Number(glosa.recoveredCents);
    row.glosaCents += amountCents;
    if (recoveredCents !== null) { row.recoveredCents += recoveredCents; row.lossCents += Math.max(0, amountCents - recoveredCents); }
    else if (glosa.status === 'mantida') row.lossCents += amountCents;
  });
  return [...rows.values()].map(row => ({ ...row, glosaRate: row.billedCents > 0 ? row.glosaCents / row.billedCents * 100 : 0 })).sort((a, b) => b.glosaRate - a.glosaRate || b.glosaCents - a.glosaCents);
}

function glosaCauseAnalysis(glosas, guides) {
  const guideProcedures = new Map((guides || []).map(guide => [guide.id, guide.procedure || 'Procedimento não identificado']));
  const group = keyFor => {
    const groups = new Map();
    (glosas || []).forEach(glosa => {
      const key = keyFor(glosa) || 'Não informado';
      const current = groups.get(key) || { label: key, count: 0, amountCents: 0, lossCents: 0 };
      const amountCents = Number(glosa.amountCents ?? Math.round(Number(glosa.amount || 0) * 100));
      const recoveredCents = glosa.recoveredCents === null || glosa.recoveredCents === undefined ? null : Number(glosa.recoveredCents);
      current.count += 1; current.amountCents += amountCents;
      if (recoveredCents !== null) current.lossCents += Math.max(0, amountCents - recoveredCents);
      else if (glosa.status === 'mantida') current.lossCents += amountCents;
      groups.set(key, current);
    });
    return [...groups.values()].sort((a, b) => b.amountCents - a.amountCents || b.count - a.count);
  };
  return {
    byReason: group(glosa => glosa.code ? `${glosa.code} · ${glosa.reason || 'Sem descrição'}` : glosa.reason),
    byProcedure: group(glosa => guideProcedures.get(glosa.guideId))
  };
}

function glosaPreventionAlertItems(batches, glosas, guides, insurers = [], defaultThreshold = 10) {
  const thresholds = new Map((insurers || []).map(insurer => [insurer.name, Number(insurer.glosaAlertRate || defaultThreshold)]));
  const alerts = insurerFinancialPerformance(batches, glosas, guides)
    .filter(item => item.billedCents > 0 && item.glosaCents > 0 && item.glosaRate >= (thresholds.get(item.insurer) || defaultThreshold))
    .map(item => { const threshold = thresholds.get(item.insurer) || defaultThreshold; return { level: item.glosaRate >= threshold * 2 ? 'critical' : 'warning', title: `Taxa de glosa elevada · ${item.insurer}`, detail: `${item.glosaRate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do faturamento · limite configurado em ${threshold}%.`, view: 'reports' }; });
  const causes = glosaCauseAnalysis(glosas, guides);
  const repeatedReason = causes.byReason.find(item => item.count >= 2);
  const repeatedProcedure = causes.byProcedure.find(item => item.count >= 2);
  if (repeatedReason) alerts.push({ level: 'warning', title: `Motivo de glosa recorrente · ${repeatedReason.count} ocorrências`, detail: repeatedReason.label, view: 'reports' });
  if (repeatedProcedure) alerts.push({ level: 'warning', title: `Procedimento com glosas recorrentes`, detail: `${repeatedProcedure.label} · ${repeatedProcedure.count} ocorrências.`, view: 'reports' });
  return alerts;
}

function guideBillingRisk(guide, batches, glosas, guides, insurers = []) {
  if (!guide) return [];
  const reasons = [];
  const insurerResult = insurerFinancialPerformance(batches, glosas, guides).find(item => item.insurer === guide.insurer);
  const threshold = Number((insurers || []).find(item => item.name === guide.insurer)?.glosaAlertRate || 10);
  if (insurerResult?.billedCents > 0 && insurerResult.glosaRate >= threshold) reasons.push(`Convênio com ${insurerResult.glosaRate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% de glosa`);
  const relatedGuideIds = new Set((guides || []).filter(item => item.procedure === guide.procedure).map(item => item.id));
  const procedureOccurrences = (glosas || []).filter(item => relatedGuideIds.has(item.guideId)).length;
  if (procedureOccurrences >= 2) reasons.push(`Procedimento com ${procedureOccurrences} glosas anteriores`);
  return reasons;
}

function filterBatches(batches, filters = {}) {
  const query = String(filters.query || '').trim().toLocaleLowerCase('pt-BR');
  return (batches || []).filter(batch => {
    if (query) {
      const guideText = (batch.guides || []).flatMap(guide => [guide.id, guide.patient, guide.procedure]).join(' ');
      const searchable = [batch.id, batch.protocol, batch.insurer, batch.competence, guideText].join(' ').toLocaleLowerCase('pt-BR');
      if (!searchable.includes(query)) return false;
    }
    if (filters.competence && batch.competence !== filters.competence) return false;
    if (filters.insurerId && batch.insurerId !== filters.insurerId) return false;
    if (filters.status && batch.status !== filters.status) return false;
    if (filters.reconciliationStatus && (batch.reconciliationStatus || 'pending') !== filters.reconciliationStatus) return false;
    if (filters.paymentTiming && batchPaymentTiming(batch, filters.today || new Date()) !== filters.paymentTiming) return false;
    if (filters.agingBucket && batchPaymentAgeBucket(batch, filters.today || new Date()) !== filters.agingBucket) return false;
    if (filters.riskPending && !batch.riskReviewRequired) return false;
    return true;
  });
}

function sortBatches(batches, order = 'newest') {
  const items = [...(batches || [])];
  const createdValue = batch => Date.parse(batch.createdAt || `${batch.competence || '0000-00'}-01`) || 0;
  const valueCents = batch => Number(batch.totalValueCents ?? Math.round(Number(batch.totalValue || 0) * 100));
  const balanceCents = batch => Math.max(0, valueCents(batch) - Number(batch.receivedCents || 0));
  if (order === 'oldest') return items.sort((first, second) => createdValue(first) - createdValue(second) || String(first.id).localeCompare(String(second.id)));
  if (order === 'highest-value') return items.sort((first, second) => valueCents(second) - valueCents(first) || createdValue(second) - createdValue(first));
  if (order === 'highest-balance') return items.sort((first, second) => balanceCents(second) - balanceCents(first) || createdValue(second) - createdValue(first));
  if (order === 'risk-first') return items.sort((first, second) => Number(Boolean(second.riskReviewRequired)) - Number(Boolean(first.riskReviewRequired)) || createdValue(second) - createdValue(first));
  if (order === 'most-overdue') return items.sort((first, second) => {
    const firstOpen = batchPaymentTiming(first) !== 'inactive' && Boolean(first.expectedPaymentDate);
    const secondOpen = batchPaymentTiming(second) !== 'inactive' && Boolean(second.expectedPaymentDate);
    if (firstOpen !== secondOpen) return Number(secondOpen) - Number(firstOpen);
    const firstDue = firstOpen ? Date.parse(`${first.expectedPaymentDate}T12:00:00`) : Number.MAX_SAFE_INTEGER;
    const secondDue = secondOpen ? Date.parse(`${second.expectedPaymentDate}T12:00:00`) : Number.MAX_SAFE_INTEGER;
    return firstDue - secondDue || createdValue(second) - createdValue(first);
  });
  return items.sort((first, second) => createdValue(second) - createdValue(first) || String(second.id).localeCompare(String(first.id)));
}

function safeCsvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function batchesToCsv(batches, statusLabels = {}) {
  const headers = ['Lote', 'Convênio', 'Competência', 'Status', 'Protocolo', 'Guias', 'Valor faturado', 'Valor recebido', 'Conciliação', 'Pré-auditoria pendente'];
  const rows = (batches || []).map(batch => [
    batch.id, batch.insurer, batch.competence, statusLabels[batch.status] || batch.status, batch.protocol || '',
    batch.guideCount ?? (batch.guides || []).length,
    (Number(batch.totalValueCents ?? Math.round(Number(batch.totalValue || 0) * 100)) / 100).toFixed(2).replace('.', ','),
    (Number(batch.receivedCents || 0) / 100).toFixed(2).replace('.', ','), batch.reconciliationStatus || '',
    batch.riskReviewRequired ? 'Sim' : 'Não'
  ]);
  return [headers, ...rows].map(row => row.map(safeCsvCell).join(';')).join('\r\n');
}

function normalizeBatchPreferences(rawPreferences) {
  const defaults = { filters: { query: '', competence: '', insurerId: '', status: '', reconciliationStatus: '', paymentTiming: '', agingBucket: '', riskPending: false }, sortOrder: 'newest' };
  let preferences = rawPreferences;
  if (typeof rawPreferences === 'string') {
    try { preferences = JSON.parse(rawPreferences); } catch { return defaults; }
  }
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return defaults;
  const filters = preferences.filters && typeof preferences.filters === 'object' && !Array.isArray(preferences.filters) ? preferences.filters : {};
  const allowedSortOrders = new Set(['newest', 'oldest', 'highest-value', 'highest-balance', 'risk-first', 'most-overdue']);
  return {
    filters: {
      query: typeof filters.query === 'string' ? filters.query : '',
      competence: /^\d{4}-\d{2}$/.test(filters.competence || '') ? filters.competence : '',
      insurerId: typeof filters.insurerId === 'string' ? filters.insurerId : '',
      status: typeof filters.status === 'string' ? filters.status : '',
      reconciliationStatus: ['pending', 'partial', 'paid'].includes(filters.reconciliationStatus) ? filters.reconciliationStatus : '',
      paymentTiming: ['overdue', 'upcoming', 'scheduled', 'unscheduled'].includes(filters.paymentTiming) ? filters.paymentTiming : '',
      agingBucket: ['notDue', 'overdue30', 'overdue60', 'overdueMore', 'unscheduled'].includes(filters.agingBucket) ? filters.agingBucket : '',
      riskPending: filters.riskPending === true
    },
    sortOrder: allowedSortOrders.has(preferences.sortOrder) ? preferences.sortOrder : 'newest'
  };
}

function financeBatchShortcutFilters({ paymentTiming = '', reconciliationStatus = '' } = {}) {
  return { query: '', competence: '', insurerId: '', status: '', reconciliationStatus, paymentTiming, agingBucket: '', riskPending: false };
}

function guideProductionSummary(guides = []) {
  const group = key => {
    const items = new Map();
    for (const guide of guides || []) {
      const sessions = Array.isArray(guide.sessions) && guide.sessions.length ? guide.sessions : Array.from({ length: Math.max(1, Number(guide.quantity || 1)) }, () => ({}));
      const unitValueCents = Number(guide.unitValueCents || 0) || Math.round(Number(guide.valueCents || 0) / sessions.length);
      for (const session of sessions) {
        const label = String(key === 'professional' ? (session.professional || guide.professional || 'Não informado') : (guide.patient || 'Não informado')).trim() || 'Não informado';
        const current = items.get(label) || { label, sessions: 0, guideIds: new Set(), valueCents: 0 };
        current.sessions += 1;
        current.guideIds.add(guide.id);
        current.valueCents += unitValueCents;
        items.set(label, current);
      }
    }
    return [...items.values()].map(item => ({ ...item, guides: item.guideIds.size, guideIds: undefined })).sort((first, second) => second.sessions - first.sessions || second.valueCents - first.valueCents || first.label.localeCompare(second.label, 'pt-BR'));
  };
  const sessions = (guides || []).reduce((sum, guide) => sum + (Array.isArray(guide.sessions) && guide.sessions.length ? guide.sessions.length : Math.max(1, Number(guide.quantity || 1))), 0);
  return { guides: (guides || []).length, sessions, valueCents: (guides || []).reduce((sum, guide) => sum + Number(guide.valueCents || 0), 0), byProfessional: group('professional'), byPatient: group('patient') };
}

// Disponibiliza as funções tanto para <script> no navegador (globais em
// `window`) quanto para `require()` em testes Node — sem precisar de bundler.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { nextSequentialId, timeToMinutes, hasScheduleConflictWith, escapeXml, findSessionOutsidePlanValidity, exceedsAuthorizedQuantity, findCidIncompatibility, filterGuides, filterPatients, filterPatientsByStatus, paginateItems, filterInsurers, filterFeedbacks, isActivePatient, planValidityAlertItems, consentAlertItems, clinicOnboardingChecklist, batchFollowupAlertItems, batchPaymentAlertItems, batchPaymentTiming, batchPaymentAgeBucket, batchPaymentDueInfo, batchReceivablesSummary, receivablesToCsv, receivablesAging, glosaRecoverySummary, insurerFinancialPerformance, glosaCauseAnalysis, glosaPreventionAlertItems, guideBillingRisk, filterBatches, sortBatches, safeCsvCell, batchesToCsv, normalizeBatchPreferences, financeBatchShortcutFilters, guideProductionSummary };
}
