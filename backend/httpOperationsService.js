function shouldRedirectToHttps({ production, secure, path }) {
  return Boolean(production && !secure && !['/api/health', '/api/ready'].includes(path));
}

function requestLog({ requestId, method, statusCode, durationMs, clinicId, userId }) {
  return JSON.stringify({ type: 'http_request', requestId, method, statusCode, durationMs, clinicId: clinicId || null, userId: userId || null, timestamp: new Date().toISOString() });
}

module.exports = { shouldRedirectToHttps, requestLog };
