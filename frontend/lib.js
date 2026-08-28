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


// --- Datas (din\u00e2micas, substituem valores hardcoded) ---
const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS_LONGO = ['domingo', 'segunda-feira', 'ter\u00e7a-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 's\u00e1bado'];

function hojeIso() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
}
function mesAtual() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}
function anoAtual() {
  return new Date().getFullYear();
}
function anoSeguinte() {
  return new Date().getFullYear() + 1;
}
function somarDiasLocal(ref, dias) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + dias);
  return d;
}
function dataRelativaIso(dias) {
  const d = somarDiasLocal(new Date(), dias);
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function dataRelativaCurta(dias) {
  const d = somarDiasLocal(new Date(), dias);
  return d.getDate() + ' ' + MESES_CURTO[d.getMonth()] + ', ' + d.getFullYear();
}
function diaDaSemanaLongo(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return DIAS_LONGO[date.getDay()];
}
function capitalizar(texto) {
  const s = String(texto || '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function saudacaoInstantanea(nome) {
  const h = new Date().getHours();
  const turno = h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
  return nome ? turno + ', ' + nome + '.' : turno + '.';
}
function ultimosSeteDias() {
  const labels = [];
  for (let i = 6; i >= 0; i--) {
    const d = somarDiasLocal(new Date(), -i);
    labels.push(d.getDate() + ' ' + MESES_CURTO[d.getMonth()]);
  }
  return labels;
}

// Disponibiliza as funções tanto para <script> no navegador (globais em
// `window`) quanto para `require()` em testes Node — sem precisar de bundler.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { nextSequentialId, timeToMinutes, hasScheduleConflictWith, escapeXml, findSessionOutsidePlanValidity, exceedsAuthorizedQuantity, findCidIncompatibility, filterGuides, filterPatients, hojeIso, mesAtual, anoAtual, anoSeguinte, dataRelativaIso, dataRelativaCurta, diaDaSemanaLongo, capitalizar, saudacaoInstantanea, ultimosSeteDias };
}