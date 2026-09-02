const test = require('node:test');
const assert = require('node:assert/strict');
const { hasAppointmentConflict, weeklyDates } = require('./appointmentService');

test('gera datas semanais sem sofrer alteração de fuso horário', () => {
  assert.deepEqual(weeklyDates('2026-08-05', 3), ['2026-08-05', '2026-08-12', '2026-08-19']);
});

test('detecta conflito e ignora atendimento cancelado', () => {
  const base = [{ professional: 'Ana', date: '2026-08-05', start: '09:00', duration: 50, status: 'scheduled' }];
  assert.ok(hasAppointmentConflict(base, { professional: 'Ana', date: '2026-08-05', start: '09:30', duration: 30 }));
  base[0].status = 'cancelled';
  assert.equal(hasAppointmentConflict(base, { professional: 'Ana', date: '2026-08-05', start: '09:30', duration: 30 }), undefined);
});
