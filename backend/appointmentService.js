const timeToMinutes = value => { const [hours = 0, minutes = 0] = String(value || '').split(':').map(Number); return hours * 60 + minutes; };

function hasAppointmentConflict(appointments, candidate) {
  const start = timeToMinutes(candidate.start);
  const end = start + Number(candidate.duration);
  return appointments.find(item => item.professional === candidate.professional && item.date === candidate.date && item.status !== 'cancelled' && start < timeToMinutes(item.start) + Number(item.duration) && end > timeToMinutes(item.start));
}

function weeklyDates(initialDate, totalWeeks) {
  const [year, month, day] = initialDate.split('-').map(Number);
  return Array.from({ length: totalWeeks }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day + index * 7));
    return date.toISOString().slice(0, 10);
  });
}

module.exports = { hasAppointmentConflict, weeklyDates };
