function sessionVersionMatches(sessionVersion, storedVersion) {
  return Number(sessionVersion || 0) === Number(storedVersion || 0);
}

function validateNewPassword(newPassword) {
  if (typeof newPassword !== 'string' || newPassword.length < 12) return 'A nova senha deve possuir pelo menos 12 caracteres.';
  return null;
}

function loginFailureState(currentAttempts, now = Date.now(), maxAttempts = 5, lockMinutes = 15) {
  const attempts = Number(currentAttempts || 0) + 1;
  return { attempts, lockedUntil: attempts >= maxAttempts ? new Date(now + lockMinutes * 60000).toISOString() : null };
}

function accountIsLocked(lockedUntil, now = Date.now()) {
  return Boolean(lockedUntil && Date.parse(lockedUntil) > now);
}

module.exports = { sessionVersionMatches, validateNewPassword, loginFailureState, accountIsLocked };
