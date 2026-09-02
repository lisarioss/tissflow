function parseSessions(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
}

function feedbackDateBelongsToGuide(guide, attendanceDate) {
  const dates = parseSessions(guide.sessions_json ?? guide.sessions)
    .map(session => session?.date)
    .filter(Boolean);
  if (dates.length) return dates.includes(attendanceDate);
  return Boolean(guide.competence && attendanceDate?.slice(0, 7) === guide.competence);
}

module.exports = { feedbackDateBelongsToGuide };
