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

function consentAlertItems(patients, consentEvents, renewalMonths = 0, today = new Date()) {
  return patients.filter(patient => patient.active !== false).flatMap(patient => {
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

// Disponibiliza as funções tanto para <script> no navegador (globais em
// `window`) quanto para `require()` em testes Node — sem precisar de bundler.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { nextSequentialId, timeToMinutes, hasScheduleConflictWith, escapeXml, findSessionOutsidePlanValidity, exceedsAuthorizedQuantity, findCidIncompatibility, filterGuides, filterPatients, filterInsurers, filterFeedbacks, consentAlertItems };
}
