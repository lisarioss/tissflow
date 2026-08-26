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

// Disponibiliza as funções tanto para <script> no navegador (globais em
// `window`) quanto para `require()` em testes Node — sem precisar de bundler.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { nextSequentialId, timeToMinutes, hasScheduleConflictWith, escapeXml };
}