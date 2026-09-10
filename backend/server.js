const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const JSZip = require('jszip');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { validateRuntimeConfig } = require('./runtimeConfigService');
const runtimeConfig = validateRuntimeConfig(process.env);
const { resolveStoragePaths } = require('./storageConfigService');
const { documentUploadRoot, recoveryRoot } = resolveStoragePaths(process.env, __dirname);
fs.mkdirSync(documentUploadRoot, { recursive: true });
fs.mkdirSync(recoveryRoot, { recursive: true });
const db = require('./db');
const { generateGuidePackagePDF, generateGuideAuditPDF, generatePatientConsentPDF, generateBatchAuditPDF, consentDocumentContent } = require('./pdfService');
const { feedbackDateBelongsToGuide } = require('./feedbackService');
const { hasAppointmentConflict, weeklyDates } = require('./appointmentService');
const { TISS_VERSION, calculateTissHash, validateTissXml } = require('./tissValidationService');
const { parsePatientCsv, validatePatientImport } = require('./patientImportService');
const { validatePatientData, findDuplicatePatient, patientStatusAuditDetails } = require('./patientValidationService');
const { signBackup, validateBackup } = require('./backupIntegrityService');
const { encryptBackup, decryptBackup } = require('./backupEncryptionService');
const { restoreBackupDatabase, recoveryPointBelongsToClinic, recoveryPointsToRemove, recoveryPointName, hasDailyRecoveryPoint, backupHealth, latestRecoveryPointName } = require('./backupRestoreService');
const { sessionVersionMatches, validateNewPassword, loginFailureState, accountIsLocked } = require('./authSecurityService');
const { decodeSignedPdf, signedPdfRequirementMet } = require('./signedPdfService');
const { canTransitionBatch } = require('./batchWorkflowService');
const { decodeBatchDocument } = require('./batchDocumentService');
const { parseReceivedAmount, reconciliationStatus } = require('./batchReconciliationService');
const { parseTissOperatorReturn } = require('./tissReturnService');
const { validatePrivacyRequest, validatePrivacyResolution } = require('./privacyRequestService');
const { shouldRedirectToHttps, requestLog } = require('./httpOperationsService');
const { plans: subscriptionPlans, validPlan, subscriptionState, remainingTrialDays, planCapacityAvailable, subscriptionWriteAccess, extendedTrialEnd } = require('./subscriptionService');
const { asaasConfig, secureTokenMatches, subscriptionStatusForAsaasEvent, externalSubscriptionId, periodEndForPayload, createClinicSubscription } = require('./asaasBillingService');
const { commercialMetrics, commercialCsv } = require('./platformCommercialService');
const { createPasswordReset, hashResetToken, resetTokenIsValid } = require('./passwordResetService');
const { launchReadiness } = require('./launchReadinessService');

const app = express();
const port = runtimeConfig.port;
const jwtSecret = runtimeConfig.jwtSecret;
const allowedOrigins = new Set(runtimeConfig.origins.length ? runtimeConfig.origins : [`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
const billingConfig = asaasConfig(process.env);
const legalVersions = { terms: '2026-09-10', privacy: '2026-09-10' };

app.disable('x-powered-by');
if (runtimeConfig.trustProxy) app.set('trust proxy', 1);
app.use((req, res, next) => {
  const requestId = /^[a-zA-Z0-9._-]{8,80}$/.test(req.get('X-Request-ID') || '') ? req.get('X-Request-ID') : crypto.randomUUID();
  req.requestId = requestId; res.setHeader('X-Request-ID', requestId);
  const startedAt = Date.now();
  res.on('finish', () => { if (runtimeConfig.production) console.log(requestLog({ requestId, method: req.method, statusCode: res.statusCode, durationMs: Date.now() - startedAt, clinicId: req.session?.clinicId, userId: req.session?.userId })); });
  next();
});
app.use(cors({ origin(origin, callback) { if (!origin || allowedOrigins.has(origin)) return callback(null, true); callback(new Error('Origem não autorizada.')); } }));
// Um arquivo binario de 6 MB ocupa cerca de 8 MB quando convertido para base64.
// A margem adicional comporta o restante do JSON sem rejeitar um arquivo valido.
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (runtimeConfig.production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use((req, res, next) => {
  if (shouldRedirectToHttps({ production: runtimeConfig.production, secure: req.secure, path: req.path })) return res.redirect(308, `https://${req.get('host')}${req.originalUrl}`);
  next();
});
app.use(express.static(path.join(__dirname, '..', 'frontend'), { index: false }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'landing.html')));
app.get(['/login', '/app'], (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html')));
app.get('/platform', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'platform.html')));
function sendLegalPage(filename, res) { res.type('html').send(fs.readFileSync(path.join(__dirname, '..', 'frontend', filename), 'utf8').replace('</body>', '<script src="legal.js"></script></body>')); }
app.get('/termos', (req, res) => sendLegalPage('terms.html', res));
app.get('/privacidade', (req, res) => sendLegalPage('privacy.html', res));
app.get('/recuperar', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'reset-password.html')));

function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token não informado.' });
  try {
    req.session = jwt.verify(token, jwtSecret);
    const user = db.prepare('SELECT role, active, token_version FROM users WHERE id = ? AND clinic_id = ?').get(req.session.userId, req.session.clinicId);
    if (!user?.active) return res.status(401).json({ error: 'Usuário inativo ou não encontrado.' });
    if (!sessionVersionMatches(req.session.tokenVersion, user.token_version)) return res.status(401).json({ error: 'Sua senha foi alterada. Entre novamente.' });
    req.session.role = user.role;
    next();
  } catch {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}

// A autorização é aplicada no servidor, tanto nas alterações quanto nas
// consultas sensíveis. A interface apenas reflete essas mesmas permissões.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.session.role)) return res.status(403).json({ error: 'Seu perfil não tem permissão para esta ação.' });
    next();
  };
}

function moneyToCents(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'tiss-flow-api' }));
app.get('/api/ready', (req, res) => {
  try {
    db.prepare('SELECT 1 AS ready').get();
    fs.accessSync(documentUploadRoot, fs.constants.R_OK | fs.constants.W_OK);
    res.json({ status: 'ready', service: 'tiss-flow-api' });
  } catch {
    res.status(503).json({ status: 'not-ready', service: 'tiss-flow-api' });
  }
});

// O endpoint e publico porque e chamado pelo Asaas, mas exige um token secreto
// exclusivo e registra o ID do evento antes de aplicar qualquer mudanca.
app.post('/api/billing/webhooks/asaas', (req, res) => {
  if (!billingConfig.enabled) return res.status(503).json({ error: 'Integração de cobrança não configurada.' });
  if (!secureTokenMatches(req.get('asaas-access-token'), billingConfig.webhookToken)) return res.status(401).json({ error: 'Webhook não autorizado.' });
  const eventId = String(req.body?.id || '').trim();
  const eventType = String(req.body?.event || '').trim();
  if (!eventId || !eventType) return res.status(400).json({ error: 'Evento de cobrança inválido.' });
  const externalId = externalSubscriptionId(req.body);
  try {
    const result = db.transaction(() => {
      const inserted = db.prepare('INSERT OR IGNORE INTO billing_webhook_events (provider, event_id, event_type, external_subscription_id) VALUES (?, ?, ?, ?)').run('asaas', eventId, eventType, externalId);
      if (!inserted.changes) return { duplicate: true, updated: false };
      const status = subscriptionStatusForAsaasEvent(eventType);
      if (!status || !externalId) return { duplicate: false, updated: false };
      const periodEnd = periodEndForPayload(req.body);
      const updated = db.prepare(`UPDATE clinic_subscriptions SET status = ?, current_period_end = COALESCE(?, current_period_end), updated_at = CURRENT_TIMESTAMP
        WHERE external_subscription_id = ?`).run(status, periodEnd, externalId);
      return { duplicate: false, updated: Boolean(updated.changes) };
    })();
    res.json({ received: true, ...result });
  } catch (error) {
    console.error('Falha ao processar webhook de cobrança:', error.message);
    res.status(500).json({ error: 'Não foi possível registrar o evento de cobrança.', requestId: req.requestId });
  }
});

function parseJsonArray(value) {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function platformAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token da plataforma não informado.' });
  try {
    const session = jwt.verify(token, jwtSecret);
    if (session.scope !== 'platform-admin') throw new Error('Escopo inválido');
    const admin = db.prepare('SELECT id, name, email, active, token_version AS tokenVersion FROM platform_admins WHERE id = ?').get(session.platformAdminId);
    if (!admin?.active) return res.status(401).json({ error: 'Administrador da plataforma inativo.' });
    if (!sessionVersionMatches(session.tokenVersion, admin.tokenVersion)) return res.status(401).json({ error: 'Sua senha foi alterada. Entre novamente.' });
    req.platformAdmin = admin;
    next();
  } catch { res.status(401).json({ error: 'Sessão da plataforma inválida ou expirada.' }); }
}

function rateLimit({ windowMs, max, message, resetOnSuccess = false }) {
  const attempts = new Map();
  const middleware = (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    const current = attempts.get(key);
    const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    entry.count += 1;
    attempts.set(key, entry);
    if (resetOnSuccess) res.on('finish', () => { if (res.statusCode < 400) attempts.delete(key); });
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('RateLimit-Reset', Math.ceil(entry.resetAt / 1000));
    if (entry.count > max) return res.status(429).json({ error: message });
    next();
  };
  setInterval(() => { const now = Date.now(); for (const [key, entry] of attempts) if (entry.resetAt <= now) attempts.delete(key); }, windowMs).unref();
  return middleware;
}

const loginRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, resetOnSuccess: true, message: 'Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente.' });
const registrationRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Limite de cadastros atingido. Aguarde uma hora e tente novamente.' });
const commercialContactRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Limite de contatos atingido. Aguarde uma hora e tente novamente.' });
const passwordResetRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Muitas solicitações de recuperação. Aguarde uma hora.' });
const platformLoginRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, resetOnSuccess: true, message: 'Muitas tentativas de acesso. Aguarde 15 minutos.' });

function recordLoginEvent(clinicId, userId, email, outcome, ipAddress) {
  if (!db.prepare('SELECT 1 FROM clinics WHERE id = ?').get(clinicId)) return;
  db.prepare('INSERT INTO login_events (clinic_id, user_id, email, outcome, ip_address) VALUES (?, ?, ?, ?, ?)').run(clinicId, userId || null, String(email || '').trim().toLowerCase().slice(0, 180), outcome, ipAddress || null);
  db.prepare("DELETE FROM login_events WHERE created_at < datetime('now', '-180 days')").run();
}

function recordAudit(req, action, entityType, entityId = null, details = {}) {
  if (!req.session) return;
  db.prepare('INSERT INTO audit_logs (clinic_id, user_id, action, entity_type, entity_id, route, details_json, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(req.session.clinicId, req.session.userId, action, entityType, entityId, req.originalUrl.split('?')[0], JSON.stringify(details), req.ip || null);
}

app.use('/api', (req, res, next) => {
  const action = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' }[req.method];
  if (action) res.on('finish', () => {
    if (!req.session || res.statusCode >= 400) return;
    const parts = req.originalUrl.split('?')[0].split('/').filter(Boolean);
    if (parts[0] === 'api') parts.shift();
    const entityType = parts[0] || 'api';
    const entityId = parts[1] && !['status', 'recurso', 'resolve'].includes(parts[1]) ? parts[1] : req.body?.id || null;
    const safeFields = Object.keys(req.body || {}).filter(key => !/password|photo|content|dataurl|justification/i.test(key));
    try { recordAudit(req, action, entityType, entityId, { changedFields: safeFields, statusCode: res.statusCode, ...(req.auditDetails || {}) }); } catch (error) { console.error('Falha ao registrar auditoria:', error.message); }
  });
  next();
});

function guideCompetence(guide) {
  return guide.competence || parseJsonArray(guide.sessions_json)[0]?.date?.slice(0, 7) || '';
}

function mapClinicSettings(row, clinic) {
  return {
    legalName: row?.legal_name || clinic?.name || '', tradeName: row?.trade_name || clinic?.name || '',
    cnpj: row?.cnpj || '', cnes: row?.cnes || '', phone: row?.phone || '', instagram: row?.instagram || '',
    address: row?.address || '', city: row?.city || '', state: row?.state || '', postalCode: row?.postal_code || '',
    logoDataUrl: row?.logo_data_url || '', letterheadDataUrl: row?.letterhead_data_url || '',
    letterheadHeaderMm: Number(row?.letterhead_header_mm || 35), letterheadFooterMm: Number(row?.letterhead_footer_mm || 25),
    owners: parseJsonArray(row?.owners_json), professionals: parseJsonArray(row?.professionals_json),
    consentTitle: row?.consent_title || '', consentText: row?.consent_text || '', privacyContact: row?.privacy_contact || '',
    consentRenewalMonths: Number(row?.consent_renewal_months || 0)
  };
}

app.post('/api/auth/register-clinic', registrationRateLimit, (req, res) => {
  const { clinicName, unit, cnpj, cnes, adminName, email, password } = req.body;
  let selectedPlan;
  try { selectedPlan = validPlan(req.body?.planCode || 'professional'); } catch (error) { return res.status(400).json({ error: error.message }); }
  if (String(clinicName || '').trim().length < 3 || String(adminName || '').trim().length < 3 || !/^\S+@\S+\.\S+$/.test(String(email || '')) || String(password || '').length < 12) return res.status(400).json({ error: 'Informe clínica, responsável, e-mail válido e senha de pelo menos 12 caracteres.' });
  if (req.body?.legalAccepted !== true && req.body?.legalAccepted !== 'on') return res.status(400).json({ error: 'Leia e aceite os Termos de Uso e a Política de Privacidade para continuar.' });
  if (db.prepare('SELECT 1 FROM users WHERE lower(email) = lower(?)').get(String(email).trim())) return res.status(409).json({ error: 'Este e-mail já possui acesso ao TISSFlow. Entre com sua conta ou utilize outro e-mail.' });
  if (cnes && !/^\d{7}$/.test(String(cnes))) return res.status(400).json({ error: 'O CNES deve possuir 7 dígitos.' });
  const baseSlug = String(clinicName).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'clinica';
  let clinicId = baseSlug;
  let suffix = 1;
  while (db.prepare('SELECT 1 FROM clinics WHERE id = ?').get(clinicId)) clinicId = `${baseSlug}-${++suffix}`;
  const userId = `USR-${clinicId}-${Date.now()}`;
  try {
    db.transaction(() => {
      db.prepare('INSERT INTO clinics (id, name, unit) VALUES (?, ?, ?)').run(clinicId, String(clinicName).trim(), String(unit || 'Unidade principal').trim());
      db.prepare('INSERT INTO users (id, clinic_id, name, email, password_hash, role, active) VALUES (?, ?, ?, ?, ?, ?, 1)').run(userId, clinicId, String(adminName).trim(), String(email).trim().toLowerCase(), bcrypt.hashSync(password, 10), 'admin');
      db.prepare('INSERT INTO clinic_settings (clinic_id, legal_name, trade_name, cnpj, cnes) VALUES (?, ?, ?, ?, ?)').run(clinicId, String(clinicName).trim(), String(clinicName).trim(), String(cnpj || '').trim(), String(cnes || '').trim());
      db.prepare("INSERT INTO clinic_subscriptions (clinic_id, plan_code, status, trial_end) VALUES (?, ?, 'trialing', date('now', '+30 days'))").run(clinicId, selectedPlan.code);
      db.prepare('INSERT INTO legal_acceptances (clinic_id, user_id, terms_version, privacy_version, ip_address) VALUES (?, ?, ?, ?, ?)').run(clinicId, userId, legalVersions.terms, legalVersions.privacy, req.ip || null);
      db.prepare("UPDATE commercial_leads SET status = 'converted' WHERE lower(email) = lower(?) AND status IN ('new', 'contacted')").run(String(email).trim());
      db.prepare('INSERT INTO audit_logs (clinic_id, user_id, action, entity_type, entity_id, route, details_json, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(clinicId, userId, 'create', 'clinics', clinicId, '/api/auth/register-clinic', JSON.stringify({ fields: ['clinicName', 'unit', 'cnpj', 'cnes', 'adminName', 'email', 'planCode'], planCode: selectedPlan.code }), req.ip || '');
    })();
    const clinic = { id: clinicId, name: String(clinicName).trim(), unit: String(unit || 'Unidade principal').trim() };
    const user = { id: userId, name: String(adminName).trim(), email: String(email).trim().toLowerCase(), role: 'admin' };
    const token = jwt.sign({ userId, clinicId, role: 'admin', tokenVersion: 0 }, jwtSecret, { expiresIn: '8h' });
    res.status(201).json({ token, user, clinicId, clinic });
  } catch (error) { res.status(409).json({ error: error.message.includes('UNIQUE') ? 'Este e-mail já está cadastrado nesta clínica.' : error.message }); }
});

app.post('/api/commercial/contact', commercialContactRateLimit, (req, res) => {
  const { contactName, clinicName, email, phone = '', clinicSize = '', planCode = 'professional' } = req.body || {};
  if (String(contactName || '').trim().length < 2 || String(clinicName || '').trim().length < 2 || !/^\S+@\S+\.\S+$/.test(String(email || ''))) return res.status(400).json({ error: 'Informe seu nome, a clínica e um e-mail válido.' });
  let plan;
  try { plan = validPlan(planCode); } catch (error) { return res.status(400).json({ error: error.message }); }
  db.prepare('INSERT INTO commercial_leads (contact_name, clinic_name, email, phone, clinic_size, plan_code) VALUES (?, ?, ?, ?, ?, ?)').run(String(contactName).trim().slice(0, 120), String(clinicName).trim().slice(0, 160), String(email).trim().toLowerCase().slice(0, 180), String(phone).trim().slice(0, 30), String(clinicSize).trim().slice(0, 40), plan.code);
  res.status(201).json({ message: 'Contato recebido. Retornaremos pelos dados informados.' });
});

app.get('/api/public/platform-info', (req, res) => {
  const row = db.prepare(`SELECT trade_name AS tradeName, legal_name AS legalName, cnpj, address,
    support_email AS supportEmail, privacy_email AS privacyEmail, support_whatsapp AS supportWhatsapp FROM platform_settings WHERE id = 1`).get();
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ ...row, legalVersions });
});

app.post('/api/auth/forgot-password', passwordResetRateLimit, async (req, res) => {
  const generic = { message: 'Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.' };
  const users = db.prepare('SELECT id, email, name FROM users WHERE lower(email) = lower(?) AND active = 1').all(String(req.body?.email || '').trim());
  if (users.length !== 1) return res.status(202).json(generic);
  const user = users[0];
  const reset = createPasswordReset();
  db.prepare("UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL").run(user.id);
  db.prepare('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip) VALUES (?, ?, ?, ?)').run(user.id, reset.tokenHash, reset.expiresAt, req.ip || null);
  const resetUrl = `${req.protocol}://${req.get('host')}/recuperar?token=${encodeURIComponent(reset.token)}`;
  if (process.env.PASSWORD_RESET_WEBHOOK_URL) {
    try { await fetch(process.env.PASSWORD_RESET_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.PASSWORD_RESET_WEBHOOK_SECRET ? { Authorization: `Bearer ${process.env.PASSWORD_RESET_WEBHOOK_SECRET}` } : {}) }, body: JSON.stringify({ type: 'password_reset', recipient: user.email, name: user.name, resetUrl, expiresInMinutes: 30 }) }); }
    catch (error) { console.error('Falha ao entregar recuperação de senha:', error.message); }
  }
  res.status(202).json({ ...generic, ...(runtimeConfig.production ? {} : { resetUrl }) });
});

app.post('/api/auth/reset-password', passwordResetRateLimit, (req, res) => {
  const passwordError = validateNewPassword(req.body?.newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });
  const record = db.prepare(`SELECT password_reset_tokens.id, password_reset_tokens.user_id AS userId,
    password_reset_tokens.expires_at AS expiresAt, password_reset_tokens.used_at AS usedAt
    FROM password_reset_tokens JOIN users ON users.id = password_reset_tokens.user_id
    WHERE password_reset_tokens.token_hash = ? AND users.active = 1`).get(hashResetToken(req.body?.token));
  if (!resetTokenIsValid(record)) return res.status(400).json({ error: 'O link de recuperação é inválido ou expirou.' });
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1, failed_login_attempts = 0, locked_until = ? WHERE id = ?').run(bcrypt.hashSync(String(req.body.newPassword), 10), '', record.userId);
    db.prepare('UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?').run(record.id);
  })();
  res.json({ message: 'Senha atualizada. Entre novamente com a nova senha.' });
});

app.post('/api/auth/login', loginRateLimit, (req, res) => {
  const { email, password } = req.body;
  const matchingUsers = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').all(String(email || '').trim());
  const user = matchingUsers.length === 1 ? matchingUsers[0] : null;
  const clinicId = user?.clinic_id || '';
  if (user && accountIsLocked(user.locked_until)) {
    recordLoginEvent(clinicId, user.id, email, 'blocked', req.ip);
    return res.status(429).json({ error: 'Conta temporariamente bloqueada por tentativas incorretas. Tente novamente mais tarde ou fale com o administrador.' });
  }
  if (!user || !user.active || !bcrypt.compareSync(password || '', user.password_hash)) {
    if (user?.active) {
      const currentAttempts = user.locked_until && !accountIsLocked(user.locked_until) ? 0 : user.failed_login_attempts;
      const failure = loginFailureState(currentAttempts);
      db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ? AND clinic_id = ?').run(failure.attempts, failure.lockedUntil || '', user.id, user.clinic_id);
    }
    recordLoginEvent(clinicId, user?.id, email, 'failure', req.ip);
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  db.prepare("UPDATE users SET failed_login_attempts = 0, locked_until = '' WHERE id = ? AND clinic_id = ?").run(user.id, user.clinic_id);
  recordLoginEvent(clinicId, user.id, email, 'success', req.ip);
  const token = jwt.sign({ userId: user.id, clinicId: user.clinic_id, role: user.role, tokenVersion: Number(user.token_version || 0) }, jwtSecret, { expiresIn: '8h' });
  const clinic = db.prepare('SELECT id, name, unit FROM clinics WHERE id = ?').get(user.clinic_id);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role }, clinicId: user.clinic_id, clinic });
});

app.post('/api/auth/change-password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const passwordError = validateNewPassword(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND clinic_id = ?').get(req.session.userId, req.session.clinicId);
  if (!user || !bcrypt.compareSync(String(currentPassword || ''), user.password_hash)) return res.status(401).json({ error: 'A senha atual não confere.' });
  if (bcrypt.compareSync(String(newPassword), user.password_hash)) return res.status(400).json({ error: 'Escolha uma senha diferente da atual.' });
  const tokenVersion = Number(user.token_version || 0) + 1;
  db.prepare('UPDATE users SET password_hash = ?, token_version = ? WHERE id = ? AND clinic_id = ?').run(bcrypt.hashSync(String(newPassword), 10), tokenVersion, user.id, user.clinic_id);
  const token = jwt.sign({ userId: user.id, clinicId: user.clinic_id, role: user.role, tokenVersion }, jwtSecret, { expiresIn: '8h' });
  req.auditDetails = { sessionsRevoked: true };
  res.json({ token });
});

app.get('/api/legal-status', auth, requireRole('admin'), (req, res) => {
  const latest = db.prepare(`SELECT terms_version AS termsVersion, privacy_version AS privacyVersion, accepted_at AS acceptedAt
    FROM legal_acceptances WHERE clinic_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1`).get(req.session.clinicId, req.session.userId);
  const required = !latest || latest.termsVersion !== legalVersions.terms || latest.privacyVersion !== legalVersions.privacy;
  res.json({ required, current: legalVersions, latest: latest || null });
});

app.post('/api/legal-acceptance', auth, requireRole('admin'), (req, res) => {
  if (req.body?.accepted !== true) return res.status(400).json({ error: 'Confirme a leitura e o aceite dos documentos atuais.' });
  db.prepare('INSERT INTO legal_acceptances (clinic_id, user_id, terms_version, privacy_version, ip_address) VALUES (?, ?, ?, ?, ?)').run(req.session.clinicId, req.session.userId, legalVersions.terms, legalVersions.privacy, req.ip || null);
  req.auditDetails = { termsVersion: legalVersions.terms, privacyVersion: legalVersions.privacy };
  res.status(201).json({ required: false, current: legalVersions });
});

app.get('/api/settings', auth, (req, res) => {
  const clinic = db.prepare('SELECT id, name, unit FROM clinics WHERE id = ?').get(req.session.clinicId);
  const settings = db.prepare('SELECT * FROM clinic_settings WHERE clinic_id = ?').get(req.session.clinicId);
  res.json(mapClinicSettings(settings, clinic));
});

app.get('/api/subscription', auth, requireRole('admin'), (req, res) => {
  const subscription = db.prepare(`SELECT plan_code AS planCode, status, trial_end AS trialEnd, current_period_end AS currentPeriodEnd,
    external_subscription_id AS externalSubscriptionId, updated_at AS updatedAt FROM clinic_subscriptions WHERE clinic_id = ?`).get(req.session.clinicId);
  if (!subscription) return res.status(404).json({ error: 'Assinatura da clínica não encontrada.' });
  const usage = {
    patients: db.prepare('SELECT COUNT(*) AS count FROM patients WHERE clinic_id = ? AND active = 1').get(req.session.clinicId).count,
    users: db.prepare('SELECT COUNT(*) AS count FROM users WHERE clinic_id = ? AND active = 1').get(req.session.clinicId).count
  };
  const hasExternalSubscription = Boolean(subscription.externalSubscriptionId);
  delete subscription.externalSubscriptionId;
  const writeAccess = subscriptionWriteAccess(subscription);
  res.json({ ...subscription, hasExternalSubscription, effectiveStatus: subscriptionState(subscription), remainingTrialDays: remainingTrialDays(subscription.trialEnd), plan: subscriptionPlans[subscription.planCode], plans: Object.values(subscriptionPlans), usage,
    writeAccess, billing: { provider: 'asaas', configured: billingConfig.enabled, environment: billingConfig.environment } });
});

app.patch('/api/subscription/plan', auth, requireRole('admin'), (req, res) => {
  let plan;
  try { plan = validPlan(req.body?.planCode); } catch (error) { return res.status(400).json({ error: error.message }); }
  const subscription = db.prepare('SELECT status FROM clinic_subscriptions WHERE clinic_id = ?').get(req.session.clinicId);
  if (!subscription) return res.status(404).json({ error: 'Assinatura da clínica não encontrada.' });
  if (subscription.status !== 'trialing') return res.status(409).json({ error: 'Após o período de teste, alterações de plano devem ser processadas pela cobrança.' });
  db.prepare('UPDATE clinic_subscriptions SET plan_code = ?, updated_at = CURRENT_TIMESTAMP WHERE clinic_id = ?').run(plan.code, req.session.clinicId);
  res.json({ planCode: plan.code });
});

app.post('/api/subscription/checkout', auth, requireRole('admin'), async (req, res) => {
  if (!billingConfig.enabled) return res.status(503).json({ error: 'Configure primeiro as credenciais do sandbox Asaas.' });
  const subscription = db.prepare(`SELECT plan_code AS planCode, external_customer_id AS externalCustomerId,
    external_subscription_id AS externalSubscriptionId FROM clinic_subscriptions WHERE clinic_id = ?`).get(req.session.clinicId);
  if (!subscription) return res.status(404).json({ error: 'Assinatura da clínica não encontrada.' });
  if (subscription.externalSubscriptionId) return res.status(409).json({ error: 'Esta clínica já possui uma assinatura vinculada ao Asaas.' });
  const clinic = db.prepare(`SELECT clinics.id, COALESCE(NULLIF(clinic_settings.legal_name, ''), clinics.name) AS name,
    clinic_settings.cnpj, users.email FROM clinics JOIN clinic_settings ON clinic_settings.clinic_id = clinics.id
    JOIN users ON users.id = ? AND users.clinic_id = clinics.id WHERE clinics.id = ?`).get(req.session.userId, req.session.clinicId);
  try {
    const checkout = await createClinicSubscription(billingConfig, { ...clinic, externalCustomerId: subscription.externalCustomerId }, subscriptionPlans[subscription.planCode], String(req.body?.billingType || ''));
    db.prepare(`UPDATE clinic_subscriptions SET external_customer_id = ?, external_subscription_id = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP
      WHERE clinic_id = ?`).run(checkout.customerId, checkout.subscriptionId, checkout.dueDate, req.session.clinicId);
    req.auditDetails = { provider: 'asaas', planCode: subscription.planCode, billingType: req.body?.billingType };
    res.status(201).json({ paymentUrl: checkout.paymentUrl, dueDate: checkout.dueDate, environment: billingConfig.environment });
  } catch (error) {
    const status = error.statusCode >= 400 && error.statusCode < 500 ? 422 : 502;
    res.status(status).json({ error: error.message || 'Não foi possível iniciar a assinatura no Asaas.' });
  }
});

app.post('/api/platform/auth/login', platformLoginRateLimit, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const admin = db.prepare('SELECT * FROM platform_admins WHERE email = ? AND active = 1').get(email);
  if (admin && accountIsLocked(admin.locked_until)) return res.status(429).json({ error: 'Conta temporariamente bloqueada. Aguarde 15 minutos e tente novamente.' });
  if (!admin || !bcrypt.compareSync(String(req.body?.password || ''), admin.password_hash)) {
    if (admin) {
      const currentAttempts = admin.locked_until && !accountIsLocked(admin.locked_until) ? 0 : admin.failed_login_attempts;
      const failure = loginFailureState(currentAttempts);
      db.prepare('UPDATE platform_admins SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(failure.attempts, failure.lockedUntil || '', admin.id);
    }
    return res.status(401).json({ error: 'Credenciais da plataforma inválidas.' });
  }
  db.prepare("UPDATE platform_admins SET failed_login_attempts = 0, locked_until = '' WHERE id = ?").run(admin.id);
  const token = jwt.sign({ platformAdminId: admin.id, scope: 'platform-admin', tokenVersion: Number(admin.token_version || 0) }, jwtSecret, { expiresIn: '4h' });
  res.json({ token, admin: { name: admin.name, email: admin.email } });
});

app.post('/api/platform/auth/change-password', platformAuth, (req, res) => {
  const passwordError = validateNewPassword(req.body?.newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });
  const admin = db.prepare('SELECT * FROM platform_admins WHERE id = ?').get(req.platformAdmin.id);
  if (!bcrypt.compareSync(String(req.body?.currentPassword || ''), admin.password_hash)) return res.status(401).json({ error: 'A senha atual não confere.' });
  if (bcrypt.compareSync(String(req.body.newPassword), admin.password_hash)) return res.status(400).json({ error: 'Escolha uma senha diferente da atual.' });
  const tokenVersion = Number(admin.token_version || 0) + 1;
  db.prepare('UPDATE platform_admins SET password_hash = ?, token_version = ? WHERE id = ?').run(bcrypt.hashSync(String(req.body.newPassword), 12), tokenVersion, admin.id);
  recordPlatformAudit(req, 'change_platform_password', null, { sessionsRevoked: true });
  const token = jwt.sign({ platformAdminId: admin.id, scope: 'platform-admin', tokenVersion }, jwtSecret, { expiresIn: '4h' });
  res.json({ token });
});

app.get('/api/platform/overview', platformAuth, (req, res) => {
  const clinics = db.prepare(`SELECT clinics.id, clinics.name, clinics.unit, COALESCE(clinic_settings.cnpj, '') AS cnpj, COALESCE(clinic_settings.phone, '') AS phone,
    (SELECT email FROM users WHERE users.clinic_id = clinics.id AND users.role = 'admin' AND users.active = 1 ORDER BY users.id LIMIT 1) AS adminEmail,
    clinic_subscriptions.plan_code AS planCode,
    clinic_subscriptions.status, clinic_subscriptions.trial_end AS trialEnd, clinic_subscriptions.current_period_end AS currentPeriodEnd,
    clinic_subscriptions.updated_at AS updatedAt,
    (SELECT COUNT(*) FROM patients WHERE patients.clinic_id = clinics.id AND patients.active = 1) AS patients,
    (SELECT COUNT(*) FROM users WHERE users.clinic_id = clinics.id AND users.active = 1) AS users
    FROM clinics JOIN clinic_subscriptions ON clinic_subscriptions.clinic_id = clinics.id
    LEFT JOIN clinic_settings ON clinic_settings.clinic_id = clinics.id ORDER BY clinics.name`).all();
  const items = clinics.map(clinic => ({ ...clinic, effectiveStatus: subscriptionState(clinic), plan: subscriptionPlans[clinic.planCode] }));
  const leads = db.prepare(`SELECT id, contact_name AS contactName, clinic_name AS clinicName, email, phone,
    clinic_size AS clinicSize, plan_code AS planCode, status, created_at AS createdAt
    FROM commercial_leads ORDER BY id DESC LIMIT 100`).all();
  const leadCounts = db.prepare("SELECT COUNT(*) AS total, SUM(status = 'new') AS newCount, SUM(status = 'contacted') AS contactedCount, SUM(status = 'converted') AS convertedCount FROM commercial_leads").get();
  const leadTotals = { total: leadCounts.total, new: leadCounts.newCount || 0, contacted: leadCounts.contactedCount || 0, converted: leadCounts.convertedCount || 0 };
  res.json({ generatedAt: new Date().toISOString(), totals: {
    clinics: items.length,
    trials: items.filter(item => item.effectiveStatus === 'trialing').length,
    active: items.filter(item => item.effectiveStatus === 'active').length,
    attention: items.filter(item => ['past_due', 'trial_expired', 'canceled'].includes(item.effectiveStatus)).length
  }, commercial: { ...commercialMetrics(items, subscriptionPlans), leadTotals }, leads, clinics: items });
});

app.get('/api/platform/settings', platformAuth, (req, res) => {
  res.json(db.prepare(`SELECT trade_name AS tradeName, legal_name AS legalName, cnpj, address,
    support_email AS supportEmail, privacy_email AS privacyEmail, support_whatsapp AS supportWhatsapp FROM platform_settings WHERE id = 1`).get());
});

app.get('/api/platform/readiness', platformAuth, (req, res) => {
  const legalSettings = db.prepare(`SELECT legal_name AS legalName, cnpj, support_email AS supportEmail, privacy_email AS privacyEmail FROM platform_settings WHERE id = 1`).get();
  res.json(launchReadiness({ production: runtimeConfig.production, billingConfigured: billingConfig.enabled, passwordResetConfigured: Boolean(process.env.PASSWORD_RESET_WEBHOOK_URL), demoEnabled: runtimeConfig.demoEnabled, dataDirectoryConfigured: Boolean(String(process.env.DATA_DIR || '').trim()), legalSettings }));
});

app.put('/api/platform/settings', platformAuth, (req, res) => {
  const { tradeName, legalName, cnpj = '', address = '', supportEmail, privacyEmail, supportWhatsapp = '' } = req.body || {};
  if (String(tradeName || '').trim().length < 2 || String(legalName || '').trim().length < 2 || !/^\S+@\S+\.\S+$/.test(String(supportEmail || '')) || !/^\S+@\S+\.\S+$/.test(String(privacyEmail || ''))) return res.status(400).json({ error: 'Informe nome, razão social e e-mails válidos de suporte e privacidade.' });
  const whatsapp = String(supportWhatsapp).replace(/\D/g, '');
  if (whatsapp && !/^\d{10,15}$/.test(whatsapp)) return res.status(400).json({ error: 'Informe o WhatsApp com DDI e DDD, usando entre 10 e 15 dígitos.' });
  db.prepare(`UPDATE platform_settings SET trade_name = ?, legal_name = ?, cnpj = ?, address = ?, support_email = ?, privacy_email = ?, support_whatsapp = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(String(tradeName).trim(), String(legalName).trim(), String(cnpj).trim(), String(address).trim(), String(supportEmail).trim().toLowerCase(), String(privacyEmail).trim().toLowerCase(), whatsapp);
  recordPlatformAudit(req, 'update_platform_settings', null, { fields: ['tradeName', 'legalName', 'cnpj', 'address', 'supportEmail', 'privacyEmail', 'supportWhatsapp'] });
  res.json({ message: 'Dados institucionais atualizados.' });
});

app.patch('/api/platform/leads/:id', platformAuth, (req, res) => {
  const status = String(req.body?.status || '');
  if (!['new', 'contacted', 'converted', 'discarded'].includes(status)) return res.status(400).json({ error: 'Situação comercial inválida.' });
  const current = db.prepare('SELECT id, status FROM commercial_leads WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Contato comercial não encontrado.' });
  db.prepare('UPDATE commercial_leads SET status = ? WHERE id = ?').run(status, current.id);
  recordPlatformAudit(req, 'update_lead', null, { leadId: current.id, from: current.status, to: status });
  res.json({ id: current.id, status });
});

app.get('/api/platform/clinics.csv', platformAuth, (req, res) => {
  const clinics = db.prepare(`SELECT clinics.name, clinics.unit, COALESCE(clinic_settings.cnpj, '') AS cnpj,
    (SELECT email FROM users WHERE users.clinic_id = clinics.id AND users.role = 'admin' AND users.active = 1 ORDER BY users.id LIMIT 1) AS adminEmail,
    clinic_subscriptions.plan_code AS planCode, clinic_subscriptions.status, clinic_subscriptions.trial_end AS trialEnd,
    clinic_subscriptions.current_period_end AS currentPeriodEnd,
    (SELECT COUNT(*) FROM patients WHERE patients.clinic_id = clinics.id AND patients.active = 1) AS patients,
    (SELECT COUNT(*) FROM users WHERE users.clinic_id = clinics.id AND users.active = 1) AS users
    FROM clinics JOIN clinic_subscriptions ON clinic_subscriptions.clinic_id = clinics.id
    LEFT JOIN clinic_settings ON clinic_settings.clinic_id = clinics.id ORDER BY clinics.name`).all();
  const items = clinics.map(clinic => ({ ...clinic, effectiveStatus: subscriptionState(clinic), plan: subscriptionPlans[clinic.planCode] }));
  recordPlatformAudit(req, 'export_commercial_csv', null, { clinicCount: items.length });
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tissflow-clinicas-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(commercialCsv(items));
});

function recordPlatformAudit(req, action, clinicId, details = {}) {
  db.prepare('INSERT INTO platform_audit_logs (platform_admin_id, action, clinic_id, details_json) VALUES (?, ?, ?, ?)').run(req.platformAdmin.id, action, clinicId, JSON.stringify(details));
}

app.patch('/api/platform/clinics/:id/plan', platformAuth, (req, res) => {
  let plan;
  try { plan = validPlan(req.body?.planCode); } catch (error) { return res.status(400).json({ error: error.message }); }
  const current = db.prepare('SELECT plan_code AS planCode, external_subscription_id AS externalSubscriptionId FROM clinic_subscriptions WHERE clinic_id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Clínica ou assinatura não encontrada.' });
  if (current.externalSubscriptionId) return res.status(409).json({ error: 'Esta assinatura já está vinculada ao Asaas. A troca deve atualizar também a cobrança recorrente.' });
  db.prepare('UPDATE clinic_subscriptions SET plan_code = ?, updated_at = CURRENT_TIMESTAMP WHERE clinic_id = ?').run(plan.code, req.params.id);
  recordPlatformAudit(req, 'change_plan', req.params.id, { from: current.planCode, to: plan.code });
  res.json({ clinicId: req.params.id, planCode: plan.code });
});

app.post('/api/platform/clinics/:id/extend-trial', platformAuth, (req, res) => {
  const current = db.prepare('SELECT status, trial_end AS trialEnd, external_subscription_id AS externalSubscriptionId FROM clinic_subscriptions WHERE clinic_id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Clínica ou assinatura não encontrada.' });
  if (current.externalSubscriptionId) return res.status(409).json({ error: 'A clínica já possui uma assinatura vinculada ao Asaas.' });
  let trialEnd;
  try { trialEnd = extendedTrialEnd(req.body?.days); } catch (error) { return res.status(400).json({ error: error.message }); }
  db.prepare("UPDATE clinic_subscriptions SET status = 'trialing', trial_end = ?, updated_at = CURRENT_TIMESTAMP WHERE clinic_id = ?").run(trialEnd, req.params.id);
  recordPlatformAudit(req, 'extend_trial', req.params.id, { previousStatus: current.status, previousTrialEnd: current.trialEnd, trialEnd, days: Number(req.body.days) });
  res.json({ clinicId: req.params.id, status: 'trialing', trialEnd });
});

app.get('/api/platform/audit', platformAuth, (req, res) => {
  const logs = db.prepare(`SELECT platform_audit_logs.id, platform_audit_logs.action, platform_audit_logs.clinic_id AS clinicId,
    clinics.name AS clinicName, platform_audit_logs.details_json AS detailsJson, platform_audit_logs.created_at AS createdAt
    FROM platform_audit_logs LEFT JOIN clinics ON clinics.id = platform_audit_logs.clinic_id ORDER BY platform_audit_logs.id DESC LIMIT 100`).all();
  res.json(logs.map(log => ({ ...log, details: JSON.parse(log.detailsJson || '{}'), detailsJson: undefined })));
});

app.get('/api/platform/legal-acceptances', platformAuth, (req, res) => {
  const rows = db.prepare(`SELECT legal_acceptances.id, clinics.name AS clinicName, users.name AS userName, users.email,
    legal_acceptances.terms_version AS termsVersion, legal_acceptances.privacy_version AS privacyVersion,
    legal_acceptances.accepted_at AS acceptedAt
    FROM legal_acceptances JOIN clinics ON clinics.id = legal_acceptances.clinic_id
    JOIN users ON users.id = legal_acceptances.user_id ORDER BY legal_acceptances.id DESC LIMIT 200`).all();
  res.setHeader('Cache-Control', 'no-store');
  res.json(rows);
});

// Depois do período de tolerância os dados continuam disponíveis para consulta
// e exportação, mas novas alterações ficam bloqueadas até a regularização.
app.use('/api', (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  auth(req, res, () => {
    const subscription = db.prepare(`SELECT status, trial_end AS trialEnd, updated_at AS updatedAt
      FROM clinic_subscriptions WHERE clinic_id = ?`).get(req.session.clinicId);
    if (!subscription) return res.status(403).json({ error: 'A clínica não possui uma assinatura válida.' });
    const access = subscriptionWriteAccess(subscription);
    if (!access.allowed) return res.status(402).json({ error: access.effectiveStatus === 'trial_expired'
      ? 'O período de teste terminou. A consulta continua disponível; escolha um plano para voltar a alterar dados.'
      : 'A assinatura precisa ser regularizada. Os dados permanecem disponíveis em modo somente leitura.' });
    if (access.effectiveStatus === 'past_due') res.setHeader('X-Subscription-Grace-Days', access.graceDaysRemaining);
    next();
  });
});

function clinicPlanCapacity(clinicId, resource, additional = 1) {
  const subscription = db.prepare('SELECT plan_code AS planCode FROM clinic_subscriptions WHERE clinic_id = ?').get(clinicId);
  const plan = subscriptionPlans[subscription?.planCode];
  if (!plan) return { available: false, limit: 0 };
  const table = resource === 'patients' ? 'patients' : 'users';
  const current = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE clinic_id = ? AND active = 1`).get(clinicId).count;
  const limit = resource === 'patients' ? plan.patientLimit : plan.userLimit;
  return { available: planCapacityAvailable(current, limit, additional), current, limit, planName: plan.name };
}

app.get('/api/users', auth, requireRole('admin'), (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, active, failed_login_attempts AS failedLoginAttempts, locked_until AS lockedUntil FROM users WHERE clinic_id = ? ORDER BY active DESC, name').all(req.session.clinicId);
  res.json(users.map(user => ({ ...user, active: Boolean(user.active), locked: accountIsLocked(user.lockedUntil) })));
});

app.get('/api/security/login-events', auth, requireRole('admin'), (req, res) => {
  const events = db.prepare(`SELECT login_events.id, login_events.email, login_events.outcome, login_events.created_at AS createdAt,
    users.name AS userName FROM login_events LEFT JOIN users ON users.id = login_events.user_id
    WHERE login_events.clinic_id = ? ORDER BY login_events.created_at DESC, login_events.id DESC LIMIT 100`).all(req.session.clinicId);
  res.json(events);
});

app.post('/api/users', auth, requireRole('admin'), (req, res) => {
  const { name, email, password, role } = req.body;
  const allowedRoles = ['admin', 'faturamento', 'recepcao', 'medico'];
  if (!String(name || '').trim() || !/^\S+@\S+\.\S+$/.test(String(email || '')) || String(password || '').length < 12 || !allowedRoles.includes(role)) return res.status(400).json({ error: 'Informe nome, e-mail válido, perfil e uma senha de pelo menos 12 caracteres.' });
  if (db.prepare('SELECT 1 FROM users WHERE lower(email) = lower(?)').get(String(email).trim())) return res.status(409).json({ error: 'Este e-mail já possui acesso ao TISSFlow.' });
  const capacity = clinicPlanCapacity(req.session.clinicId, 'users');
  if (!capacity.available) return res.status(409).json({ error: `O plano ${capacity.planName} permite até ${capacity.limit} usuários ativos. Arquive um usuário ou altere o plano.` });
  const id = `USR-${req.session.clinicId}-${Date.now()}`;
  try {
    db.prepare('INSERT INTO users (id, clinic_id, name, email, password_hash, role, active) VALUES (?, ?, ?, ?, ?, ?, 1)').run(id, req.session.clinicId, String(name).trim(), String(email).trim().toLowerCase(), bcrypt.hashSync(password, 10), role);
    res.status(201).json({ id });
  } catch (error) { res.status(409).json({ error: error.message.includes('UNIQUE') ? 'Já existe um usuário com esse e-mail na clínica.' : error.message }); }
});

app.put('/api/users/:id', auth, requireRole('admin'), (req, res) => {
  const current = db.prepare('SELECT id, role, active FROM users WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!current) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const { name, email, password, role, active = true } = req.body;
  const allowedRoles = ['admin', 'faturamento', 'recepcao', 'medico'];
  if (!String(name || '').trim() || !/^\S+@\S+\.\S+$/.test(String(email || '')) || !allowedRoles.includes(role) || (password && String(password).length < 12)) return res.status(400).json({ error: 'Revise nome, e-mail, perfil e a nova senha (mínimo de 12 caracteres).' });
  if (db.prepare('SELECT 1 FROM users WHERE lower(email) = lower(?) AND id <> ?').get(String(email).trim(), current.id)) return res.status(409).json({ error: 'Este e-mail já possui acesso ao TISSFlow.' });
  if (current.id === req.session.userId && !active) return res.status(409).json({ error: 'Você não pode desativar o próprio acesso.' });
  if (current.id === req.session.userId && password) return res.status(409).json({ error: 'Altere sua própria senha na seção Segurança da conta.' });
  if (!current.active && active) {
    const capacity = clinicPlanCapacity(req.session.clinicId, 'users');
    if (!capacity.available) return res.status(409).json({ error: `O plano ${capacity.planName} permite até ${capacity.limit} usuários ativos. Altere o plano para reativar este usuário.` });
  }
  const removesAdmin = current.role === 'admin' && current.active && (role !== 'admin' || !active);
  const activeAdmins = db.prepare("SELECT count(*) AS total FROM users WHERE clinic_id = ? AND role = 'admin' AND active = 1").get(req.session.clinicId).total;
  if (removesAdmin && activeAdmins <= 1) return res.status(409).json({ error: 'A clínica precisa manter pelo menos um administrador ativo.' });
  try {
    if (password) db.prepare('UPDATE users SET name = ?, email = ?, role = ?, active = ?, password_hash = ?, token_version = token_version + 1 WHERE id = ? AND clinic_id = ?').run(String(name).trim(), String(email).trim().toLowerCase(), role, active ? 1 : 0, bcrypt.hashSync(password, 10), current.id, req.session.clinicId);
    else db.prepare('UPDATE users SET name = ?, email = ?, role = ?, active = ? WHERE id = ? AND clinic_id = ?').run(String(name).trim(), String(email).trim().toLowerCase(), role, active ? 1 : 0, current.id, req.session.clinicId);
    res.json({ id: current.id });
  } catch (error) { res.status(409).json({ error: error.message.includes('UNIQUE') ? 'Já existe um usuário com esse e-mail na clínica.' : error.message }); }
});

app.post('/api/users/:id/unlock', auth, requireRole('admin'), (req, res) => {
  const result = db.prepare("UPDATE users SET failed_login_attempts = 0, locked_until = '' WHERE id = ? AND clinic_id = ?").run(req.params.id, req.session.clinicId);
  if (!result.changes) return res.status(404).json({ error: 'Usuário não encontrado.' });
  req.auditDetails = { accountUnlocked: true };
  res.json({ id: req.params.id, unlocked: true });
});

app.get('/api/tuss', auth, (req, res) => {
  const tableCode = String(req.query.table || '22');
  const query = String(req.query.query || '').trim();
  const requestedVersion = String(req.query.version || '').trim();
  const activeOn = String(req.query.activeOn || new Date().toISOString().slice(0, 10));
  const includeInactive = req.query.includeInactive === 'true';
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  if (!/^\d{1,3}$/.test(tableCode)) return res.status(400).json({ error: 'Tabela TUSS inválida.' });
  if (requestedVersion && !/^\d{6}$/.test(requestedVersion)) return res.status(400).json({ error: 'Versão TUSS inválida.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(activeOn)) return res.status(400).json({ error: 'A data de vigência deve usar AAAA-MM-DD.' });

  const latest = requestedVersion || db.prepare('SELECT version FROM tuss_imports WHERE table_code = ? ORDER BY version DESC LIMIT 1').get(tableCode)?.version;
  if (!latest) return res.json({ tableCode, version: null, activeOn, terms: [] });
  const search = `%${query}%`;
  const activeClause = includeInactive ? '' : 'AND (valid_from IS NULL OR valid_from <= ?) AND (valid_to IS NULL OR valid_to >= ?)';
  const parameters = [tableCode, latest, search, search];
  if (!includeInactive) parameters.push(activeOn, activeOn);
  parameters.push(query, `${query}%`, limit);
  const terms = db.prepare(`SELECT table_code AS tableCode, code, term, detailed_description AS detailedDescription,
      valid_from AS validFrom, valid_to AS validTo, implementation_end AS implementationEnd, version
    FROM tuss_terms
    WHERE table_code = ? AND version = ? AND (code LIKE ? OR lower(term) LIKE lower(?)) ${activeClause}
    ORDER BY code = ? DESC, code LIKE ? DESC, term
    LIMIT ?`).all(...parameters);
  res.json({ tableCode, version: latest, activeOn, terms });
});

app.put('/api/settings', auth, requireRole('admin'), (req, res) => {
  const { legalName, tradeName, cnpj, cnes, phone, instagram, address, city, state, postalCode, logoDataUrl, letterheadDataUrl, letterheadHeaderMm = 35, letterheadFooterMm = 25, owners = [], professionals = [], consentTitle = '', consentText = '', privacyContact = '', consentRenewalMonths = 0 } = req.body;
  if (!tradeName) return res.status(400).json({ error: 'O nome da clínica é obrigatório.' });
  if (!Array.isArray(owners) || !Array.isArray(professionals)) return res.status(400).json({ error: 'Responsáveis e profissionais devem ser listas.' });
  if (cnes && !/^\d{7}$/.test(String(cnes))) return res.status(400).json({ error: 'O CNES deve possuir 7 dígitos.' });
  const invalidProfessional = professionals.find(professional => !professional.name || !professional.councilType || !professional.councilNumber || !/^[A-Z]{2}$/.test(String(professional.councilState || '').toUpperCase()) || !/^\d{6}$/.test(String(professional.cbo || '')));
  if (invalidProfessional) return res.status(400).json({ error: `Complete conselho, número, UF e CBO do profissional ${invalidProfessional.name || 'sem nome'}.` });
  if (logoDataUrl && !/^data:image\/(png|jpeg);base64,/i.test(logoDataUrl)) return res.status(400).json({ error: 'Use um logotipo PNG ou JPEG.' });
  if (letterheadDataUrl && !/^data:image\/(png|jpeg);base64,/i.test(letterheadDataUrl)) return res.status(400).json({ error: 'Use um papel timbrado em PNG ou JPEG.' });
  if (String(consentTitle).length > 120 || String(consentText).length > 5000 || String(privacyContact).length > 180) return res.status(400).json({ error: 'Revise o tamanho do título, texto do consentimento e contato de privacidade.' });
  const safeConsentRenewalMonths = Number(consentRenewalMonths);
  if (!Number.isInteger(safeConsentRenewalMonths) || safeConsentRenewalMonths < 0 || safeConsentRenewalMonths > 60) return res.status(400).json({ error: 'O prazo de renovação deve ser de 0 a 60 meses.' });
  const safeHeaderMm = Math.min(Math.max(Number(letterheadHeaderMm) || 35, 20), 70);
  const safeFooterMm = Math.min(Math.max(Number(letterheadFooterMm) || 25, 15), 50);
  db.prepare(`INSERT INTO clinic_settings (clinic_id, legal_name, trade_name, cnpj, cnes, phone, instagram, address, city, state, postal_code, logo_data_url, letterhead_data_url, letterhead_header_mm, letterhead_footer_mm, owners_json, professionals_json, consent_title, consent_text, privacy_contact, consent_renewal_months)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(clinic_id) DO UPDATE SET legal_name=excluded.legal_name, trade_name=excluded.trade_name, cnpj=excluded.cnpj, cnes=excluded.cnes, phone=excluded.phone, instagram=excluded.instagram, address=excluded.address, city=excluded.city, state=excluded.state, postal_code=excluded.postal_code, logo_data_url=excluded.logo_data_url, letterhead_data_url=excluded.letterhead_data_url, letterhead_header_mm=excluded.letterhead_header_mm, letterhead_footer_mm=excluded.letterhead_footer_mm, owners_json=excluded.owners_json, professionals_json=excluded.professionals_json, consent_title=excluded.consent_title, consent_text=excluded.consent_text, privacy_contact=excluded.privacy_contact, consent_renewal_months=excluded.consent_renewal_months, updated_at=CURRENT_TIMESTAMP`)
    .run(req.session.clinicId, legalName || '', tradeName, cnpj || '', cnes || '', phone || '', instagram || '', address || '', city || '', state || '', postalCode || '', logoDataUrl || '', letterheadDataUrl || '', safeHeaderMm, safeFooterMm, JSON.stringify(owners), JSON.stringify(professionals), String(consentTitle).trim(), String(consentText).trim(), String(privacyContact).trim(), safeConsentRenewalMonths);
  res.json({ saved: true });
});

function buildClinicBackup(clinicId) {
  const clinic = db.prepare('SELECT id, name, unit FROM clinics WHERE id = ?').get(clinicId);
  const byClinic = table => db.prepare(`SELECT * FROM ${table} WHERE clinic_id = ?`).all(clinicId);
  const users = db.prepare('SELECT id, clinic_id, name, email, role, active FROM users WHERE clinic_id = ?').all(clinicId);
  const documents = byClinic('patient_documents').map(document => {
    const storagePath = path.join(documentUploadRoot, clinicId, path.basename(document.storage_name));
    return { ...document, content_base64: fs.existsSync(storagePath) ? fs.readFileSync(storagePath).toString('base64') : null };
  });
  const batchDocuments = byClinic('billing_batch_documents').map(document => {
    const storagePath = path.join(documentUploadRoot, clinicId, path.basename(document.storage_name));
    return { ...document, content_base64: fs.existsSync(storagePath) ? fs.readFileSync(storagePath).toString('base64') : null };
  });
  const deliveryPackages = byClinic('billing_delivery_packages').map(item => {
    const storagePath = path.join(documentUploadRoot, clinicId, path.basename(item.storage_name));
    return { ...item, content_base64: fs.existsSync(storagePath) ? fs.readFileSync(storagePath).toString('base64') : null };
  });
  const batchGuides = db.prepare(`SELECT billing_batch_guides.* FROM billing_batch_guides JOIN billing_batches ON billing_batches.id = billing_batch_guides.batch_id WHERE billing_batches.clinic_id = ?`).all(clinicId);
  const batchStatusHistory = byClinic('billing_batch_status_history');
  const batchReturnItems = byClinic('billing_batch_return_items');
  const privacyRequests = byClinic('privacy_requests');
  return signBackup({ format: 'tiss-flow-backup', version: 1, exportedAt: new Date().toISOString(), clinic, data: {
    clinicSettings: db.prepare('SELECT * FROM clinic_settings WHERE clinic_id = ?').get(clinicId) || null,
    users, patients: byClinic('patients'), guides: byClinic('guides'), insurers: byClinic('insurers'), invoices: byClinic('invoices'),
    glosas: byClinic('glosas'), authorizations: byClinic('authorizations'), billingBatches: byClinic('billing_batches'),
    billingBatchGuides: batchGuides, billingBatchDocuments: batchDocuments, billingBatchStatusHistory: batchStatusHistory, billingBatchReturnItems: batchReturnItems, billingDeliveryPackages: deliveryPackages, billingBatchFollowups: byClinic('billing_batch_followups'), billingBatchPayments: byClinic('billing_batch_payments'), feedbacks: byClinic('feedbacks'), patientDocuments: documents,
    patientConsents: byClinic('patient_consents'), privacyRequests, appointments: byClinic('appointments'), auditLogs: byClinic('audit_logs')
  } });
}

function createRecoveryPoint(clinicId, reason = 'manual') {
  fs.mkdirSync(recoveryRoot, { recursive: true });
  const name = recoveryPointName(clinicId, reason);
  fs.writeFileSync(path.join(recoveryRoot, name), JSON.stringify(buildClinicBackup(clinicId)), { encoding: 'utf8', flag: 'wx' });
  recoveryPointsToRemove(fs.readdirSync(recoveryRoot), clinicId, 20).forEach(oldName => fs.unlinkSync(path.join(recoveryRoot, oldName)));
  return { name, reason };
}

function ensureDailyRecoveryPoints(now = new Date()) {
  fs.mkdirSync(recoveryRoot, { recursive: true });
  const names = fs.readdirSync(recoveryRoot);
  db.prepare('SELECT id FROM clinics').all().forEach(({ id }) => {
    const latestDaily = latestRecoveryPointName(names, id, 'daily');
    let latestIsValid = false;
    if (latestDaily && hasDailyRecoveryPoint(names, id, now)) {
      try { latestIsValid = validateBackup(JSON.parse(fs.readFileSync(path.join(recoveryRoot, latestDaily), 'utf8')), id).valid; } catch {}
    }
    if (!latestIsValid) createRecoveryPoint(id, 'daily');
  });
}

app.get('/api/backup', auth, requireRole('admin'), (req, res) => {
  const clinicId = req.session.clinicId;
  const clinic = db.prepare('SELECT id, name, unit FROM clinics WHERE id = ?').get(clinicId);
  const byClinic = table => db.prepare(`SELECT * FROM ${table} WHERE clinic_id = ?`).all(clinicId);
  const users = db.prepare('SELECT id, clinic_id, name, email, role, active FROM users WHERE clinic_id = ?').all(clinicId);
  const documents = byClinic('patient_documents').map(document => {
    const storagePath = path.join(documentUploadRoot, clinicId, path.basename(document.storage_name));
    return { ...document, content_base64: fs.existsSync(storagePath) ? fs.readFileSync(storagePath).toString('base64') : null };
  });
  const batchDocuments = byClinic('billing_batch_documents').map(document => {
    const storagePath = path.join(documentUploadRoot, clinicId, path.basename(document.storage_name));
    return { ...document, content_base64: fs.existsSync(storagePath) ? fs.readFileSync(storagePath).toString('base64') : null };
  });
  const deliveryPackages = byClinic('billing_delivery_packages').map(item => {
    const storagePath = path.join(documentUploadRoot, clinicId, path.basename(item.storage_name));
    return { ...item, content_base64: fs.existsSync(storagePath) ? fs.readFileSync(storagePath).toString('base64') : null };
  });
  const batchGuides = db.prepare(`SELECT billing_batch_guides.* FROM billing_batch_guides JOIN billing_batches ON billing_batches.id = billing_batch_guides.batch_id WHERE billing_batches.clinic_id = ?`).all(clinicId);
  const batchStatusHistory = byClinic('billing_batch_status_history');
  const batchReturnItems = byClinic('billing_batch_return_items');
  const privacyRequests = byClinic('privacy_requests');
  const backup = signBackup({
    format: 'tiss-flow-backup', version: 1, exportedAt: new Date().toISOString(), clinic,
    data: {
      clinicSettings: db.prepare('SELECT * FROM clinic_settings WHERE clinic_id = ?').get(clinicId) || null,
      users, patients: byClinic('patients'), guides: byClinic('guides'), insurers: byClinic('insurers'),
      invoices: byClinic('invoices'), glosas: byClinic('glosas'), authorizations: byClinic('authorizations'),
      billingBatches: byClinic('billing_batches'), billingBatchGuides: batchGuides, billingBatchDocuments: batchDocuments, billingBatchStatusHistory: batchStatusHistory, billingBatchReturnItems: batchReturnItems, billingDeliveryPackages: deliveryPackages, billingBatchFollowups: byClinic('billing_batch_followups'), billingBatchPayments: byClinic('billing_batch_payments'), feedbacks: byClinic('feedbacks'),
      patientDocuments: documents, patientConsents: byClinic('patient_consents'), privacyRequests, appointments: byClinic('appointments'), auditLogs: byClinic('audit_logs')
    }
  });
  recordAudit(req, 'download', 'backup', clinicId, { document: 'clinic-backup', version: backup.version });
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="backup-${clinicId}-${stamp}.json"`);
  res.send(JSON.stringify(backup));
});

app.post('/api/backup/encrypted', auth, requireRole('admin'), (req, res) => {
  try {
    const encrypted = encryptBackup(buildClinicBackup(req.session.clinicId), req.body?.password);
    req.auditDetails = { document: 'encrypted-clinic-backup', encryption: 'AES-256-GCM' };
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="backup-protegido-${req.session.clinicId}-${stamp}.tissbackup"`);
    res.send(JSON.stringify(encrypted));
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/backup/encrypted/validate', auth, requireRole('admin'), (req, res) => {
  try {
    const backup = decryptBackup(req.body?.envelope, req.body?.password);
    const result = validateBackup(backup, req.session.clinicId);
    req.auditDetails = { encryptedBackupValidation: result.valid ? 'valid' : 'invalid' };
    if (!result.valid) return res.status(400).json(result);
    res.json(result);
  } catch (error) {
    req.auditDetails = { encryptedBackupValidation: 'invalid' };
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/backup/encrypted/restore', auth, requireRole('admin'), (req, res) => {
  if (req.body?.confirmation !== 'RESTAURAR') return res.status(400).json({ error: 'Digite RESTAURAR para confirmar a substituição dos dados.' });
  let backup;
  try { backup = decryptBackup(req.body?.envelope, req.body?.password); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const validation = validateBackup(backup, req.session.clinicId);
  if (!validation.valid) return res.status(400).json(validation);
  const recoveryName = createRecoveryPoint(req.session.clinicId, 'before-restore').name;
  try {
    const restored = restoreBackupDatabase(db, backup, req.session.clinicId, req.session.userId);
    const clinicDirectory = path.join(documentUploadRoot, req.session.clinicId);
    fs.mkdirSync(clinicDirectory, { recursive: true });
    [...(backup.data.patientDocuments || []), ...(backup.data.billingBatchDocuments || []), ...(backup.data.billingDeliveryPackages || [])].forEach(document => {
      if (document.content_base64 && document.storage_name) fs.writeFileSync(path.join(clinicDirectory, path.basename(document.storage_name)), Buffer.from(document.content_base64, 'base64'));
    });
    req.auditDetails = { encryptedBackupRestore: 'completed', recoveryFile: recoveryName, restored };
    res.json({ restored: true, recoveryFile: recoveryName, summary: validation.summary });
  } catch (error) {
    console.error('Falha ao restaurar backup protegido:', error.message);
    res.status(500).json({ error: 'A restauração não pôde ser concluída. O ponto de recuperação foi preservado.' });
  }
});

app.post('/api/backup/validate', auth, requireRole('admin'), (req, res) => {
  const result = validateBackup(req.body, req.session.clinicId);
  req.auditDetails = { backupValidation: result.valid ? 'valid' : 'invalid' };
  if (!result.valid) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/backup/restore', auth, requireRole('admin'), (req, res) => {
  const { backup, confirmation } = req.body || {};
  if (confirmation !== 'RESTAURAR') return res.status(400).json({ error: 'Digite RESTAURAR para confirmar a substituição dos dados.' });
  const validation = validateBackup(backup, req.session.clinicId);
  if (!validation.valid) return res.status(400).json(validation);
  const recoveryName = createRecoveryPoint(req.session.clinicId, 'before-restore').name;
  try {
    const restored = restoreBackupDatabase(db, backup, req.session.clinicId, req.session.userId);
    const clinicDirectory = path.join(documentUploadRoot, req.session.clinicId);
    fs.mkdirSync(clinicDirectory, { recursive: true });
    [...(backup.data.patientDocuments || []), ...(backup.data.billingBatchDocuments || []), ...(backup.data.billingDeliveryPackages || [])].forEach(document => {
      if (document.content_base64 && document.storage_name) fs.writeFileSync(path.join(clinicDirectory, path.basename(document.storage_name)), Buffer.from(document.content_base64, 'base64'));
    });
    req.auditDetails = { backupRestore: 'completed', recoveryFile: recoveryName, restored };
    res.json({ restored: true, recoveryFile: recoveryName, summary: validation.summary });
  } catch (error) {
    console.error('Falha ao restaurar backup:', error.message);
    res.status(500).json({ error: 'A restauração não pôde ser concluída. O ponto de recuperação foi preservado.' });
  }
});

app.post('/api/backup/recovery-points', auth, requireRole('admin'), (req, res) => {
  try {
    const reason = req.body?.reason === 'daily' ? 'daily' : 'manual';
    const point = createRecoveryPoint(req.session.clinicId, reason);
    req.auditDetails = { recoveryPoint: 'created', file: point.name };
    res.status(201).json(point);
  } catch (error) { res.status(500).json({ error: 'Não foi possível criar o ponto de recuperação.' }); }
});

app.get('/api/backup/recovery-points', auth, requireRole('admin'), (req, res) => {
  if (!fs.existsSync(recoveryRoot)) return res.json([]);
  const points = fs.readdirSync(recoveryRoot)
    .filter(name => recoveryPointBelongsToClinic(name, req.session.clinicId))
    .map(name => { const stats = fs.statSync(path.join(recoveryRoot, name)); const reason = name.includes('--') ? name.split('--')[0] : 'before-restore'; return { name, reason, createdAt: stats.mtime.toISOString(), sizeBytes: stats.size }; })
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  res.json(points);
});

app.get('/api/backup/status', auth, requireRole('admin'), (req, res) => {
  const names = fs.existsSync(recoveryRoot) ? fs.readdirSync(recoveryRoot).filter(name => recoveryPointBelongsToClinic(name, req.session.clinicId)) : [];
  const health = backupHealth(names, req.session.clinicId);
  const latestDaily = latestRecoveryPointName(names, req.session.clinicId, 'daily');
  let integrityStatus = latestDaily ? 'corrupt' : 'missing';
  if (latestDaily) {
    try {
      const backup = JSON.parse(fs.readFileSync(path.join(recoveryRoot, latestDaily), 'utf8'));
      integrityStatus = validateBackup(backup, req.session.clinicId).valid ? 'valid' : 'corrupt';
    } catch {}
  }
  res.json({ ...health, healthy: health.healthy && integrityStatus === 'valid', integrityStatus, recoveryPointCount: names.length, retentionLimit: 20 });
});

app.get('/api/backup/recovery-points/:name', auth, requireRole('admin'), (req, res) => {
  const name = path.basename(req.params.name);
  if (!recoveryPointBelongsToClinic(req.params.name, req.session.clinicId)) return res.status(400).json({ error: 'Ponto de recuperação inválido.' });
  const filePath = path.join(recoveryRoot, name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Ponto de recuperação não encontrado.' });
  recordAudit(req, 'download', 'backup', req.session.clinicId, { document: 'recovery-point', file: name });
  res.download(filePath, name);
});

function csvCell(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function sendCsvReport(req, res, name, headers, rows) {
  const csv = `\uFEFF${headers.map(csvCell).join(';')}\r\n${rows.map(row => row.map(csvCell).join(';')).join('\r\n')}`;
  recordAudit(req, 'download', 'reports', name, { document: 'csv-report', competence: req.query.competence || 'all' });
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="relatorio-${name}-${req.query.competence || 'completo'}.csv"`);
  res.send(csv);
}

app.get('/api/reports/:type.csv', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const competence = String(req.query.competence || '');
  if (competence && !/^\d{4}-\d{2}$/.test(competence)) return res.status(400).json({ error: 'A competência deve usar AAAA-MM.' });
  const clinicId = req.session.clinicId;
  const suffix = competence ? ' AND competence = ?' : '';
  const params = competence ? [clinicId, competence] : [clinicId];
  if (req.params.type === 'guides') {
    const rows = db.prepare(`SELECT id, patient, insurer, competence, service_code, procedure, quantity, value_cents, status, created_at FROM guides WHERE clinic_id = ?${suffix} ORDER BY created_at DESC`).all(...params);
    return sendCsvReport(req, res, 'guias', ['Guia', 'Paciente', 'Convênio', 'Competência', 'Código TUSS', 'Procedimento', 'Quantidade', 'Valor', 'Status', 'Criada em'], rows.map(row => [row.id, row.patient, row.insurer, row.competence, row.service_code, row.procedure, row.quantity, (row.value_cents / 100).toFixed(2).replace('.', ','), row.status, row.created_at]));
  }
  if (req.params.type === 'invoices') {
    const rows = db.prepare(`SELECT id, guide_id, provider, description, amount_cents, expected_date, status, created_at FROM invoices WHERE clinic_id = ?${competence ? " AND substr(expected_date, 1, 7) = ?" : ''} ORDER BY expected_date DESC`).all(...params);
    return sendCsvReport(req, res, 'financeiro', ['Nota', 'Guia', 'Prestador', 'Descrição', 'Valor', 'Previsão', 'Status', 'Criada em'], rows.map(row => [row.id, row.guide_id, row.provider, row.description, (row.amount_cents / 100).toFixed(2).replace('.', ','), row.expected_date, row.status, row.created_at]));
  }
  if (req.params.type === 'batches') {
    const rows = db.prepare(`SELECT billing_batches.id, insurers.name AS insurer, billing_batches.competence,
      billing_batches.status, billing_batches.protocol, billing_batches.expected_payment_date, billing_batches.received_cents,
      billing_batches.received_at, billing_batches.reconciliation_notes,
      COALESCE((SELECT SUM(guides.value_cents) FROM billing_batch_guides JOIN guides ON guides.id = billing_batch_guides.guide_id WHERE billing_batch_guides.batch_id = billing_batches.id), 0) AS billed_cents,
      COALESCE((SELECT SUM(released_cents) FROM billing_batch_return_items WHERE billing_batch_return_items.batch_id = billing_batches.id), 0) AS released_cents,
      COALESCE((SELECT SUM(glosa_cents) FROM billing_batch_return_items WHERE billing_batch_return_items.batch_id = billing_batches.id), 0) AS glosa_cents
      FROM billing_batches JOIN insurers ON insurers.id = billing_batches.insurer_id
      WHERE billing_batches.clinic_id = ?${suffix} ORDER BY billing_batches.competence DESC, billing_batches.created_at DESC`).all(...params);
    return sendCsvReport(req, res, 'lotes-financeiros', ['Lote', 'Convênio', 'Competência', 'Status', 'Protocolo', 'Faturado', 'Liberado pela operadora', 'Glosado', 'Recebido', 'Conciliação', 'Previsão', 'Data do crédito', 'Observações'], rows.map(row => {
      const paymentStatus = reconciliationStatus(row.billed_cents, row.received_cents);
      return [row.id, row.insurer, row.competence, row.status, row.protocol, row.billed_cents, row.released_cents, row.glosa_cents, row.received_cents].map((value, index) => index >= 5 ? (Number(value) / 100).toFixed(2).replace('.', ',') : value).concat([paymentStatus, row.expected_payment_date, row.received_at, row.reconciliation_notes]);
    }));
  }
  if (req.params.type === 'glosas') {
    const rows = db.prepare(`SELECT glosas.id, glosas.guide_id, guides.patient, guides.competence, glosas.code, glosas.reason, glosas.amount_cents, glosas.status, glosas.justification, glosas.created_at, glosas.resolved_at FROM glosas JOIN guides ON guides.id = glosas.guide_id AND guides.clinic_id = glosas.clinic_id WHERE glosas.clinic_id = ?${competence ? ' AND guides.competence = ?' : ''} ORDER BY glosas.created_at DESC`).all(...params);
    return sendCsvReport(req, res, 'glosas', ['Glosa', 'Guia', 'Paciente', 'Competência', 'Código', 'Motivo', 'Valor', 'Status', 'Justificativa', 'Criada em', 'Resolvida em'], rows.map(row => [row.id, row.guide_id, row.patient, row.competence, row.code, row.reason, (row.amount_cents / 100).toFixed(2).replace('.', ','), row.status, row.justification, row.created_at, row.resolved_at]));
  }
  if (req.params.type === 'authorizations') {
    const rows = db.prepare(`SELECT authorizations.id, patients.name AS patient, insurers.name AS insurer, authorizations.authorization_number, authorizations.valid_from, authorizations.valid_to, authorizations.authorized_quantity, authorizations.used_quantity, authorizations.notes, authorizations.created_at FROM authorizations JOIN patients ON patients.id = authorizations.patient_id AND patients.clinic_id = authorizations.clinic_id JOIN insurers ON insurers.id = authorizations.insurer_id AND insurers.clinic_id = authorizations.clinic_id WHERE authorizations.clinic_id = ?${competence ? " AND substr(authorizations.valid_from, 1, 7) <= ? AND substr(authorizations.valid_to, 1, 7) >= ?" : ''} ORDER BY authorizations.valid_to`).all(...(competence ? [clinicId, competence, competence] : [clinicId]));
    return sendCsvReport(req, res, 'autorizacoes', ['ID', 'Paciente', 'Convênio', 'Número', 'Início', 'Vencimento', 'Autorizada', 'Utilizada', 'Observações', 'Criada em'], rows.map(row => [row.id, row.patient, row.insurer, row.authorization_number, row.valid_from, row.valid_to, row.authorized_quantity, row.used_quantity, row.notes, row.created_at]));
  }
  if (req.params.type === 'consents') {
    if (req.session.role !== 'admin') return res.status(403).json({ error: 'Somente administradores podem exportar consentimentos.' });
    const settings = db.prepare('SELECT consent_renewal_months FROM clinic_settings WHERE clinic_id = ?').get(clinicId);
    const renewalMonths = Number(settings?.consent_renewal_months || 0);
    const rows = db.prepare(`SELECT patients.id, patients.name, patients.insurer, patients.guardian_name, patients.guardian_relationship, patients.guardian_phone, patients.guardian_email, patients.consent_status, patients.consent_date, patients.active,
      patient_consents.event_date, patient_consents.signed_document_id, patient_documents.original_name AS signed_document_name, users.name AS recorded_by
      FROM patients
      LEFT JOIN patient_consents ON patient_consents.id = (SELECT latest.id FROM patient_consents latest WHERE latest.patient_id = patients.id AND latest.clinic_id = patients.clinic_id ORDER BY latest.event_date DESC, latest.created_at DESC LIMIT 1)
      LEFT JOIN patient_documents ON patient_documents.id = patient_consents.signed_document_id AND patient_documents.clinic_id = patients.clinic_id
      LEFT JOIN users ON users.id = patient_consents.recorded_by AND users.clinic_id = patients.clinic_id
      WHERE patients.clinic_id = ? ORDER BY patients.active DESC, patients.name`).all(clinicId);
    const reportRows = rows.map(row => {
      let renewalDate = '';
      let compliance = row.active ? 'Regular' : 'Paciente inativo';
      if (row.consent_status === 'pending') compliance = 'Consentimento pendente';
      else if (row.consent_status === 'revoked') compliance = 'Consentimento revogado';
      else if (!row.event_date) compliance = 'Sem histórico de manifestação';
      else if (!row.signed_document_id) compliance = 'Sem comprovante assinado';
      if (row.consent_status === 'granted' && row.event_date && renewalMonths > 0) {
        const date = new Date(`${row.event_date}T12:00:00`); date.setMonth(date.getMonth() + renewalMonths); renewalDate = date.toISOString().slice(0, 10);
        const days = Math.ceil((new Date(`${renewalDate}T00:00:00`) - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')) / 86400000);
        if (days < 0) compliance = 'Renovação vencida'; else if (days <= 30 && compliance === 'Regular') compliance = 'Renovação próxima';
      }
      return [row.id, row.name, row.insurer, row.guardian_name, row.guardian_relationship, row.guardian_phone, row.guardian_email, row.consent_status, row.event_date || row.consent_date, renewalDate, row.signed_document_name, row.recorded_by, compliance, row.active ? 'Sim' : 'Não'];
    });
    return sendCsvReport(req, res, 'consentimentos', ['Paciente ID', 'Paciente', 'Convênio', 'Responsável', 'Vínculo', 'Telefone', 'E-mail', 'Manifestação', 'Data', 'Próxima renovação', 'Comprovante', 'Registrado por', 'Conformidade', 'Paciente ativo'], reportRows);
  }
  res.status(404).json({ error: 'Tipo de relatório não encontrado.' });
});

app.get('/api/guides/:id/pdf', auth, (req, res) => {
  const guide = db.prepare('SELECT * FROM guides WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!guide) return res.status(404).json({ error: 'Guia não encontrada.' });
  const guardian = db.prepare('SELECT guardian_name, guardian_relationship FROM patients WHERE clinic_id = ? AND name = ?').get(req.session.clinicId, guide.patient);
  Object.assign(guide, guardian || {});
  const clinic = db.prepare('SELECT id, name, unit FROM clinics WHERE id = ?').get(req.session.clinicId);
  const row = db.prepare('SELECT * FROM clinic_settings WHERE clinic_id = ?').get(req.session.clinicId);
  recordAudit(req, 'download', 'guides', guide.id, { document: 'cover-and-guide-pdf' });
  generateGuidePackagePDF(mapClinicSettings(row, clinic), guide, res);
});

app.get('/api/guides/:id/audit-pdf', auth, requireRole('admin', 'faturamento', 'medico'), (req, res) => {
  const guide = db.prepare('SELECT * FROM guides WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!guide) return res.status(404).json({ error: 'Guia não encontrada.' });
  const guardian = db.prepare('SELECT guardian_name, guardian_relationship FROM patients WHERE clinic_id = ? AND name = ?').get(req.session.clinicId, guide.patient);
  Object.assign(guide, guardian || {});
  const feedbacks = db.prepare('SELECT id, guide_id AS guideId, patient, professional, attendance_date AS attendanceDate, attendance_type AS attendanceType, content, photo, created_at AS createdAt FROM feedbacks WHERE clinic_id = ? AND guide_id = ? ORDER BY attendance_date, created_at').all(req.session.clinicId, guide.id);
  if (!feedbacks.length) return res.status(404).json({ error: 'Esta guia ainda não possui feedbacks vinculados.' });
  const clinic = db.prepare('SELECT id, name, unit FROM clinics WHERE id = ?').get(req.session.clinicId);
  const row = db.prepare('SELECT * FROM clinic_settings WHERE clinic_id = ?').get(req.session.clinicId);
  recordAudit(req, 'download', 'guides', guide.id, { document: 'audit-pdf', feedbackCount: feedbacks.length });
  generateGuideAuditPDF(mapClinicSettings(row, clinic), guide, feedbacks, res);
});

app.get('/api/patients', auth, (req, res) => {
  const patients = db.prepare('SELECT id, name, birth_date AS birthDate, insurer, ans_code AS ansCode, card_number AS cardNumber, plan, plan_validity AS planValidity, guardian_name AS guardianName, guardian_relationship AS guardianRelationship, guardian_phone AS guardianPhone, guardian_email AS guardianEmail, consent_status AS consentStatus, consent_date AS consentDate, active FROM patients WHERE clinic_id = ? ORDER BY active DESC, name').all(req.session.clinicId);
  res.json(patients);
});

app.get('/api/patients/export.csv', auth, requireRole('admin', 'recepcao'), (req, res) => {
  const rows = db.prepare(`SELECT id, name, birth_date, insurer, ans_code, card_number, plan, plan_validity, guardian_name, guardian_relationship, guardian_phone, guardian_email, active
    FROM patients WHERE clinic_id = ? ORDER BY active DESC, name`).all(req.session.clinicId);
  return sendCsvReport(req, res, 'pacientes', ['id', 'nome', 'nascimento', 'convenio', 'codigo_ans', 'carteira', 'plano', 'validade_plano', 'responsavel', 'vinculo', 'telefone', 'email', 'ativo'], rows.map(row => [row.id, row.name, row.birth_date, row.insurer, row.ans_code, row.card_number, row.plan, row.plan_validity, row.guardian_name, row.guardian_relationship, row.guardian_phone, row.guardian_email, row.active ? 'sim' : 'não']));
});

app.post('/api/patients/import', auth, requireRole('admin', 'recepcao'), (req, res) => {
  const csvText = String(req.body.csvText || '');
  if (Buffer.byteLength(csvText, 'utf8') > 1024 * 1024) return res.status(413).json({ error: 'O CSV deve possuir no máximo 1 MB.' });
  const parsed = parsePatientCsv(csvText);
  if (parsed.errors.length) return res.status(400).json({ error: parsed.errors[0], errors: parsed.errors });
  if (!parsed.rows.length) return res.status(400).json({ error: 'O CSV não possui pacientes para importar.' });
  if (parsed.rows.length > 1000) return res.status(400).json({ error: 'Importe no máximo 1.000 pacientes por arquivo.' });
  const insurers = db.prepare('SELECT name, ans_code AS ansCode FROM insurers WHERE clinic_id = ?').all(req.session.clinicId);
  const existingPatients = db.prepare('SELECT id, insurer, card_number AS cardNumber FROM patients WHERE clinic_id = ?').all(req.session.clinicId);
  const validation = validatePatientImport(parsed.rows, insurers, existingPatients);
  if (validation.errors.length) return res.status(400).json({ error: `A importação possui ${validation.errors.length} linha(s) inválida(s). Nenhum paciente foi cadastrado.`, errors: validation.errors.slice(0, 50) });
  const activeToImport = validation.validRows.filter(patient => patient.active).length;
  const capacity = clinicPlanCapacity(req.session.clinicId, 'patients', activeToImport);
  if (!capacity.available) return res.status(409).json({ error: `A importação ultrapassa o limite de ${capacity.limit} pacientes ativos do plano ${capacity.planName}. Reduza o arquivo ou altere o plano.` });
  const insert = db.prepare('INSERT INTO patients (id, clinic_id, name, birth_date, insurer, ans_code, card_number, plan, plan_validity, guardian_name, guardian_relationship, guardian_phone, guardian_email, consent_status, consent_date, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  db.transaction(rows => rows.forEach(patient => insert.run(patient.id, req.session.clinicId, patient.name, patient.birthDate, patient.insurer, patient.ansCode, patient.cardNumber, patient.plan, patient.planValidity, patient.guardianName, patient.guardianRelationship, patient.guardianPhone, patient.guardianEmail, 'pending', '', patient.active ? 1 : 0)))(validation.validRows);
  req.auditDetails = { importedCount: validation.validRows.length };
  res.status(201).json({ imported: validation.validRows.length });
});

app.post('/api/patients', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const { id, name, birthDate, insurer, ansCode, cardNumber, plan, planValidity, guardianName = '', guardianRelationship = '', guardianPhone = '', guardianEmail = '', consentStatus = 'pending', consentDate = '' } = req.body;
  if (!id || !name || !birthDate || !insurer || !cardNumber || !plan || !planValidity) return res.status(400).json({ error: 'Nome, nascimento, convênio, carteira, plano e validade são obrigatórios.' });
  const capacity = clinicPlanCapacity(req.session.clinicId, 'patients');
  if (!capacity.available) return res.status(409).json({ error: `O plano ${capacity.planName} permite até ${capacity.limit} pacientes ativos. Arquive um paciente ou altere o plano.` });
  const clinicInsurers = db.prepare('SELECT name FROM insurers WHERE clinic_id = ?').all(req.session.clinicId);
  const validationError = validatePatientData(req.body, clinicInsurers);
  if (validationError) return res.status(400).json({ error: validationError });
  const clinicPatients = db.prepare('SELECT id, insurer, card_number AS cardNumber FROM patients WHERE clinic_id = ?').all(req.session.clinicId);
  if (findDuplicatePatient(clinicPatients, cardNumber)) return res.status(409).json({ error: 'Já existe um paciente com esta carteira.' });
  try {
    db.prepare('INSERT INTO patients (id, clinic_id, name, birth_date, insurer, ans_code, card_number, plan, plan_validity, guardian_name, guardian_relationship, guardian_phone, guardian_email, consent_status, consent_date, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').run(id, req.session.clinicId, name, birthDate, insurer, ansCode || '', cardNumber, plan, planValidity, guardianName, guardianRelationship, guardianPhone, guardianEmail, ['pending', 'granted', 'revoked'].includes(consentStatus) ? consentStatus : 'pending', consentDate);
    res.status(201).json({ id });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.patch('/api/patients/:id', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const { name, birthDate, insurer, ansCode, cardNumber, plan, planValidity, guardianName = '', guardianRelationship = '', guardianPhone = '', guardianEmail = '', consentStatus = 'pending', consentDate = '', active = 1 } = req.body;
  if (!name || !birthDate || !insurer || !cardNumber || !plan || !planValidity) return res.status(400).json({ error: 'Nome, nascimento, convênio, carteira, plano e validade são obrigatórios.' });
  const clinicInsurers = db.prepare('SELECT name FROM insurers WHERE clinic_id = ?').all(req.session.clinicId);
  const validationError = validatePatientData(req.body, clinicInsurers);
  if (validationError) return res.status(400).json({ error: validationError });
  const clinicPatients = db.prepare('SELECT id, insurer, card_number AS cardNumber, active FROM patients WHERE clinic_id = ?').all(req.session.clinicId);
  if (findDuplicatePatient(clinicPatients, cardNumber, req.params.id)) return res.status(409).json({ error: 'Já existe outro paciente com esta carteira.' });
  const currentPatient = clinicPatients.find(patient => patient.id === req.params.id);
  if (!currentPatient) return res.status(404).json({ error: 'Paciente não encontrado.' });
  if (!currentPatient.active && active) {
    const capacity = clinicPlanCapacity(req.session.clinicId, 'patients');
    if (!capacity.available) return res.status(409).json({ error: `O plano ${capacity.planName} permite até ${capacity.limit} pacientes ativos. Altere o plano para reativar este paciente.` });
  }
  req.auditDetails = patientStatusAuditDetails(currentPatient.active, active);
  const result = db.prepare('UPDATE patients SET name = ?, birth_date = ?, insurer = ?, ans_code = ?, card_number = ?, plan = ?, plan_validity = ?, guardian_name = ?, guardian_relationship = ?, guardian_phone = ?, guardian_email = ?, consent_status = ?, consent_date = ?, active = ? WHERE id = ? AND clinic_id = ?').run(name, birthDate, insurer, ansCode || '', cardNumber, plan, planValidity, guardianName, guardianRelationship, guardianPhone, guardianEmail, ['pending', 'granted', 'revoked'].includes(consentStatus) ? consentStatus : 'pending', consentDate, active ? 1 : 0, req.params.id, req.session.clinicId);
  if (!result.changes) return res.status(404).json({ error: 'Paciente não encontrado.' });
  res.json({ id: req.params.id });
});

app.get('/api/guides', auth, (req, res) => {
  const guides = db.prepare('SELECT id, patient, procedure, insurer, competence, ans_code AS ansCode, card_number AS cardNumber, patient_birth AS patientBirth, patient_plan AS patientPlan, plan_validity AS planValidity, authorization_number AS authorizationNumber, operator_guide AS operatorGuide, provider_name AS providerName, provider_cnpj AS providerCnpj, professional, professional_register AS professionalRegister, attendance_type AS attendanceType, service_code AS serviceCode, quantity, unit_value_cents AS unitValueCents, status, value_cents AS valueCents, sessions_json AS sessionsJson, guide_type AS guideType, cid, authorized_quantity AS authorizedQuantity, created_at AS createdAt FROM guides WHERE clinic_id = ? ORDER BY created_at DESC').all(req.session.clinicId).map(guide => ({ ...guide, sessions: JSON.parse(guide.sessionsJson || '[]') }));
  res.json(guides);
});

app.post('/api/guides', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const { id, patient, procedure, insurer, competence, ansCode, cardNumber, patientBirth, patientPlan, planValidity, authorizationNumber, operatorGuide, providerName, providerCnpj, professional, professionalRegister, attendanceType, serviceCode, quantity = 1, unitValue, status = 'sent', value, sessions = [], guideType = 'sp_sadt', cid, authorizedQuantity } = req.body;
  if (!id || !patient || !procedure || !insurer) return res.status(400).json({ error: 'Paciente, procedimento, convênio e identificador são obrigatórios.' });
  if (!db.prepare('SELECT id FROM patients WHERE clinic_id = ? AND name = ? AND active = 1').get(req.session.clinicId, patient)) return res.status(400).json({ error: 'Selecione um paciente ativo da clínica.' });
  const insurerContract = db.prepare('SELECT procedure_rules FROM insurers WHERE clinic_id = ? AND name = ?').get(req.session.clinicId, insurer);
  const contractRules = insurerContract ? JSON.parse(insurerContract.procedure_rules || '[]') : [];
  const procedureCode = String(serviceCode || procedure).split(' - ')[0].trim();
  const procedureRules = contractRules.filter(rule => rule.code === procedureCode);
  const referenceDate = competence ? `${competence}-01` : String(sessions[0]?.date || '');
  const applicableRules = procedureRules.filter(rule => (!rule.validFrom || !referenceDate || rule.validFrom <= referenceDate) && (!rule.validTo || !referenceDate || rule.validTo >= referenceDate));
  const contractRule = [...(applicableRules.length ? applicableRules : procedureRules)].sort((first, second) => String(second.validFrom || '').localeCompare(String(first.validFrom || '')))[0];
  if (contractRules.length && !procedureRules.length) return res.status(400).json({ error: `O procedimento ${procedureCode} não está na tabela contratada com ${insurer}.` });
  if (contractRule?.requiresAuthorization && !String(authorizationNumber || '').trim()) return res.status(400).json({ error: `O procedimento ${procedureCode} exige número de autorização prévia.` });
  // Validações de negócio no servidor (o front-end já checa isso, mas não confiamos só no cliente).
  if (planValidity && sessions.some(session => session.date > planValidity)) {
    return res.status(400).json({ error: `Existe atendimento fora da vigência do plano (válido até ${planValidity}).` });
  }
  try {
    db.prepare('INSERT INTO guides (id, clinic_id, patient, procedure, insurer, competence, ans_code, card_number, patient_birth, patient_plan, plan_validity, authorization_number, operator_guide, provider_name, provider_cnpj, professional, professional_register, attendance_type, service_code, quantity, unit_value_cents, status, value_cents, sessions_json, guide_type, cid, authorized_quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.session.clinicId, patient, procedure, insurer, competence || '', ansCode || '', cardNumber || '', patientBirth || '', patientPlan || '', planValidity || '', authorizationNumber || '', operatorGuide || '', providerName || '', providerCnpj || '', professional || '', professionalRegister || '', attendanceType || '', serviceCode || '', Number(quantity), moneyToCents(unitValue), status, moneyToCents(value), JSON.stringify(sessions), guideType, cid || null, authorizedQuantity || null);
    res.status(201).json({ id });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.patch('/api/guides/:id/sessions/:index', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const guide = db.prepare('SELECT sessions_json FROM guides WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!guide) return res.status(404).json({ error: 'Guia não encontrada.' });
  const sessions = JSON.parse(guide.sessions_json || '[]');
  const index = Number(req.params.index);
  if (!sessions[index]) return res.status(404).json({ error: 'Atendimento não encontrado.' });
  sessions[index].procedure = req.body.procedure;
  db.prepare('UPDATE guides SET sessions_json = ?, procedure = ? WHERE id = ? AND clinic_id = ?').run(JSON.stringify(sessions), String(req.body.procedure || '').split(' - ')[1] || req.body.procedure, req.params.id, req.session.clinicId);
  res.json({ id: req.params.id, index, procedure: sessions[index].procedure });
});

app.get('/api/invoices', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const invoices = db.prepare(`SELECT invoices.id, invoices.guide_id AS guideId, invoices.provider, invoices.description, invoices.amount_cents AS amountCents, invoices.expected_date AS expectedDate, invoices.status, guides.patient FROM invoices LEFT JOIN guides ON guides.id = invoices.guide_id WHERE invoices.clinic_id = ? ORDER BY invoices.expected_date`).all(req.session.clinicId);
  res.json(invoices);
});

app.post('/api/invoices', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const { id, guideId, provider, description, amount, expectedDate } = req.body;
  if (!id || !guideId || !provider || !description || !expectedDate || !moneyToCents(amount)) return res.status(400).json({ error: 'Guia, nota, fornecedor, descrição, valor e previsão são obrigatórios.' });
  const guide = db.prepare('SELECT id FROM guides WHERE id = ? AND clinic_id = ? AND status IN (\'sent\', \'approved\')').get(guideId, req.session.clinicId);
  if (!guide) return res.status(400).json({ error: 'A nota precisa estar vinculada a uma guia enviada ou aprovada da clínica.' });
  try {
    db.prepare('INSERT INTO invoices (id, clinic_id, guide_id, provider, description, amount_cents, expected_date) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, req.session.clinicId, guideId, provider, description, moneyToCents(amount), expectedDate);
    res.status(201).json({ id, guideId });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.patch('/api/invoices/:id/status', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const status = req.body.status === 'received' ? 'received' : 'pending';
  const result = db.prepare('UPDATE invoices SET status = ? WHERE id = ? AND clinic_id = ?').run(status, req.params.id, req.session.clinicId);
  if (!result.changes) return res.status(404).json({ error: 'Nota não encontrada.' });
  res.json({ id: req.params.id, status });
});

app.delete('/api/invoices/:id', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const result = db.prepare('DELETE FROM invoices WHERE id = ? AND clinic_id = ?').run(req.params.id, req.session.clinicId);
  if (!result.changes) return res.status(404).json({ error: 'Nota não encontrada.' });
  res.status(204).end();
});

app.get('/api/insurers', auth, (req, res) => {
  const insurers = db.prepare('SELECT id, name, ans_code AS ansCode, contact_email AS contactEmail, contact_phone AS contactPhone, provider_code AS providerCode, delivery_format AS deliveryFormat, return_alert_days AS returnAlertDays, return_critical_days AS returnCriticalDays, accepted_procedures AS acceptedProcedures, procedure_rules AS procedureRules FROM insurers WHERE clinic_id = ? ORDER BY name').all(req.session.clinicId);
  res.json(insurers.map(insurer => ({ ...insurer, acceptedProcedures: JSON.parse(insurer.acceptedProcedures || '[]'), procedureRules: JSON.parse(insurer.procedureRules || '[]') })));
});

app.get('/api/patient-consents', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const rows = db.prepare(`SELECT patient_consents.id, patient_consents.patient_id AS patientId, patient_consents.status, patient_consents.event_date AS eventDate, patient_consents.notes, patient_consents.document_hash AS documentHash, patient_consents.consent_title AS consentTitle, patient_consents.signed_document_id AS signedDocumentId, patient_documents.original_name AS signedDocumentName, patient_consents.created_at AS createdAt, users.name AS recordedBy
    FROM patient_consents JOIN users ON users.id = patient_consents.recorded_by AND users.clinic_id = patient_consents.clinic_id
    LEFT JOIN patient_documents ON patient_documents.id = patient_consents.signed_document_id AND patient_documents.clinic_id = patient_consents.clinic_id
    WHERE patient_consents.clinic_id = ? ORDER BY patient_consents.event_date DESC, patient_consents.created_at DESC`).all(req.session.clinicId);
  res.json(rows);
});

app.post('/api/patients/:id/consents', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const { status, eventDate, notes = '', signedDocumentId = '' } = req.body;
  if (!['granted', 'revoked'].includes(status)) return res.status(400).json({ error: 'Informe se o consentimento foi concedido ou revogado.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate || '')) return res.status(400).json({ error: 'Informe a data da manifestação.' });
  const patient = db.prepare('SELECT id FROM patients WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!patient) return res.status(404).json({ error: 'Paciente não encontrado.' });
  const signedDocument = signedDocumentId ? db.prepare('SELECT id FROM patient_documents WHERE id = ? AND patient_id = ? AND clinic_id = ?').get(signedDocumentId, patient.id, req.session.clinicId) : null;
  if (signedDocumentId && !signedDocument) return res.status(400).json({ error: 'O documento assinado deve pertencer à pasta deste paciente.' });
  const id = `CONS-${Date.now()}`;
  const clinic = db.prepare('SELECT id, name, unit FROM clinics WHERE id = ?').get(req.session.clinicId);
  const settings = db.prepare('SELECT * FROM clinic_settings WHERE clinic_id = ?').get(req.session.clinicId);
  const documentContent = consentDocumentContent(mapClinicSettings(settings, clinic));
  const documentHash = crypto.createHash('sha256').update(JSON.stringify(documentContent), 'utf8').digest('hex');
  db.transaction(() => {
    db.prepare('INSERT INTO patient_consents (id, clinic_id, patient_id, status, event_date, notes, consent_title, consent_text, privacy_contact, document_hash, signed_document_id, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.session.clinicId, patient.id, status, eventDate, String(notes).trim().slice(0, 500) || null, documentContent.title, documentContent.text, documentContent.privacyContact, documentHash, signedDocument?.id || null, req.session.userId);
    db.prepare('UPDATE patients SET consent_status = ?, consent_date = ? WHERE id = ? AND clinic_id = ?').run(status, eventDate, patient.id, req.session.clinicId);
  })();
  res.status(201).json({ id, status, eventDate, documentHash, signedDocumentId: signedDocument?.id || null });
});

app.get('/api/patient-consents/:id/pdf', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const consent = db.prepare(`SELECT patient_consents.*, patients.name, patients.birth_date AS birthDate, patients.guardian_name AS guardianName, patients.guardian_relationship AS guardianRelationship
    FROM patient_consents JOIN patients ON patients.id = patient_consents.patient_id AND patients.clinic_id = patient_consents.clinic_id
    WHERE patient_consents.id = ? AND patient_consents.clinic_id = ?`).get(req.params.id, req.session.clinicId);
  if (!consent) return res.status(404).json({ error: 'Registro de consentimento não encontrado.' });
  if (!consent.document_hash) return res.status(409).json({ error: 'Este registro antigo não possui uma versão histórica do documento.' });
  const clinic = db.prepare('SELECT id, name, unit FROM clinics WHERE id = ?').get(req.session.clinicId);
  const settings = db.prepare('SELECT * FROM clinic_settings WHERE clinic_id = ?').get(req.session.clinicId);
  const mappedSettings = { ...mapClinicSettings(settings, clinic), consentTitle: consent.consent_title, consentText: consent.consent_text, privacyContact: consent.privacy_contact };
  const patient = { id: consent.patient_id, name: consent.name, birthDate: consent.birthDate, guardianName: consent.guardianName, guardianRelationship: consent.guardianRelationship, consentStatus: consent.status, consentDate: consent.event_date };
  recordAudit(req, 'download', 'patient-consents', consent.id, { document: 'historical-consent-pdf', patientId: consent.patient_id, documentHash: consent.document_hash });
  generatePatientConsentPDF(mappedSettings, patient, res);
});

app.patch('/api/patient-consents/:id/document', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const consent = db.prepare('SELECT id, patient_id FROM patient_consents WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!consent) return res.status(404).json({ error: 'Registro de consentimento não encontrado.' });
  const documentId = String(req.body.documentId || '').trim();
  const document = documentId ? db.prepare('SELECT id FROM patient_documents WHERE id = ? AND patient_id = ? AND clinic_id = ?').get(documentId, consent.patient_id, req.session.clinicId) : null;
  if (documentId && !document) return res.status(400).json({ error: 'O comprovante deve pertencer à pasta do mesmo paciente.' });
  db.prepare('UPDATE patient_consents SET signed_document_id = ? WHERE id = ? AND clinic_id = ?').run(document?.id || null, consent.id, req.session.clinicId);
  res.json({ id: consent.id, signedDocumentId: document?.id || null });
});

app.get('/api/patients/:id/consent-pdf', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const patient = db.prepare('SELECT id, name, birth_date AS birthDate, guardian_name AS guardianName, guardian_relationship AS guardianRelationship, consent_status AS consentStatus, consent_date AS consentDate FROM patients WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!patient) return res.status(404).json({ error: 'Paciente não encontrado.' });
  const clinic = db.prepare('SELECT id, name, unit FROM clinics WHERE id = ?').get(req.session.clinicId);
  const settings = db.prepare('SELECT * FROM clinic_settings WHERE clinic_id = ?').get(req.session.clinicId);
  recordAudit(req, 'download', 'patients', patient.id, { document: 'consent-pdf' });
  generatePatientConsentPDF(mapClinicSettings(settings, clinic), patient, res);
});

const privacyRequestSelect = `SELECT privacy_requests.id, privacy_requests.patient_id AS patientId, patients.name AS patient,
  privacy_requests.request_type AS requestType, privacy_requests.requested_by AS requestedBy, privacy_requests.notes,
  privacy_requests.status, privacy_requests.resolution, privacy_requests.created_at AS createdAt, privacy_requests.resolved_at AS resolvedAt,
  creator.name AS createdBy, resolver.name AS resolvedBy
  FROM privacy_requests JOIN patients ON patients.id = privacy_requests.patient_id AND patients.clinic_id = privacy_requests.clinic_id
  JOIN users creator ON creator.id = privacy_requests.created_by LEFT JOIN users resolver ON resolver.id = privacy_requests.resolved_by`;

app.get('/api/privacy-requests', auth, requireRole('admin', 'recepcao'), (req, res) => {
  const patientId = String(req.query.patientId || '');
  const rows = db.prepare(`${privacyRequestSelect} WHERE privacy_requests.clinic_id = ?${patientId ? ' AND privacy_requests.patient_id = ?' : ''} ORDER BY privacy_requests.created_at DESC`).all(...(patientId ? [req.session.clinicId, patientId] : [req.session.clinicId]));
  res.json(rows);
});

app.post('/api/patients/:id/privacy-requests', auth, requireRole('admin', 'recepcao'), (req, res) => {
  const patient = db.prepare('SELECT id FROM patients WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!patient) return res.status(404).json({ error: 'Paciente não encontrado.' });
  let request;
  try { request = validatePrivacyRequest(req.body || {}); } catch (error) { return res.status(400).json({ error: error.message }); }
  const id = `PRIV-${crypto.randomUUID()}`;
  db.prepare('INSERT INTO privacy_requests (id, clinic_id, patient_id, request_type, requested_by, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, req.session.clinicId, patient.id, request.type, request.requestedBy, request.notes || null, req.session.userId);
  res.status(201).json({ id });
});

app.patch('/api/privacy-requests/:id', auth, requireRole('admin'), (req, res) => {
  let resolution;
  try { resolution = validatePrivacyResolution(req.body || {}); } catch (error) { return res.status(400).json({ error: error.message }); }
  const result = db.prepare(`UPDATE privacy_requests SET status = ?, resolution = ?, resolved_by = CASE WHEN ? IN ('fulfilled','denied') THEN ? ELSE NULL END,
    resolved_at = CASE WHEN ? IN ('fulfilled','denied') THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ? AND clinic_id = ?`)
    .run(resolution.status, resolution.resolution || null, resolution.status, req.session.userId, resolution.status, req.params.id, req.session.clinicId);
  if (!result.changes) return res.status(404).json({ error: 'Solicitação não encontrada.' });
  res.json({ id: req.params.id, status: resolution.status });
});

app.get('/api/patients/:id/privacy-export', auth, requireRole('admin'), (req, res) => {
  const clinicId = req.session.clinicId;
  const patient = db.prepare('SELECT * FROM patients WHERE id = ? AND clinic_id = ?').get(req.params.id, clinicId);
  if (!patient) return res.status(404).json({ error: 'Paciente não encontrado.' });
  const guides = db.prepare('SELECT * FROM guides WHERE clinic_id = ? AND patient = ? ORDER BY created_at').all(clinicId, patient.name);
  const guideIds = guides.map(guide => guide.id);
  const linked = (table, column) => guideIds.length ? db.prepare(`SELECT * FROM ${table} WHERE clinic_id = ? AND ${column} IN (${guideIds.map(() => '?').join(',')})`).all(clinicId, ...guideIds) : [];
  const payload = {
    format: 'tiss-flow-patient-export', version: 1, exportedAt: new Date().toISOString(),
    patient, guides,
    feedbacks: db.prepare('SELECT * FROM feedbacks WHERE clinic_id = ? AND patient = ? ORDER BY created_at').all(clinicId, patient.name),
    authorizations: db.prepare('SELECT * FROM authorizations WHERE clinic_id = ? AND patient_id = ? ORDER BY created_at').all(clinicId, patient.id),
    documents: db.prepare('SELECT id, guide_id, authorization_id, category, description, original_name, mime_type, size_bytes, valid_until, created_at FROM patient_documents WHERE clinic_id = ? AND patient_id = ? ORDER BY created_at').all(clinicId, patient.id),
    consents: db.prepare('SELECT status, event_date, notes, consent_title, privacy_contact, document_hash, signed_document_id, created_at FROM patient_consents WHERE clinic_id = ? AND patient_id = ? ORDER BY created_at').all(clinicId, patient.id),
    appointments: db.prepare('SELECT * FROM appointments WHERE clinic_id = ? AND patient_id = ? ORDER BY appointment_date').all(clinicId, patient.id),
    invoices: linked('invoices', 'guide_id'), glosas: linked('glosas', 'guide_id')
  };
  recordAudit(req, 'download', 'patients', patient.id, { document: 'privacy-data-export' });
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="dados-titular-${patient.id}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});

const allowedDocumentTypes = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const documentRow = `SELECT patient_documents.id, patient_documents.patient_id AS patientId, patient_documents.guide_id AS guideId, patient_documents.authorization_id AS authorizationId, patient_documents.category, patient_documents.description, patient_documents.original_name AS originalName, patient_documents.mime_type AS mimeType, patient_documents.size_bytes AS sizeBytes, patient_documents.valid_until AS validUntil, patient_documents.created_at AS createdAt, users.name AS uploadedBy
  FROM patient_documents JOIN users ON users.id = patient_documents.uploaded_by AND users.clinic_id = patient_documents.clinic_id`;

app.get('/api/patient-documents', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const documents = db.prepare(`${documentRow} WHERE patient_documents.clinic_id = ? ORDER BY patient_documents.created_at DESC`).all(req.session.clinicId);
  res.json(documents);
});

app.post('/api/patient-documents', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const { id, patientId, guideId, authorizationId, category, description, validUntil, originalName, mimeType, contentDataUrl } = req.body;
  if (!id || !patientId || !category || !originalName || !mimeType || !contentDataUrl) return res.status(400).json({ error: 'Paciente, categoria e arquivo são obrigatórios.' });
  if (!allowedDocumentTypes.has(mimeType)) return res.status(400).json({ error: 'Envie um arquivo PDF, PNG ou JPEG.' });
  const match = contentDataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[1] !== mimeType) return res.status(400).json({ error: 'O conteúdo do documento é inválido.' });
  const file = Buffer.from(match[2], 'base64');
  if (!file.length || file.length > 6 * 1024 * 1024) return res.status(400).json({ error: 'O documento deve possuir no máximo 6 MB.' });
  const validSignature = mimeType === 'application/pdf' ? file.subarray(0, 5).toString() === '%PDF-' : mimeType === 'image/png' ? file.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff;
  if (!validSignature) return res.status(400).json({ error: 'O conteúdo não corresponde ao tipo de arquivo informado.' });
  const patient = db.prepare('SELECT id FROM patients WHERE id = ? AND clinic_id = ?').get(patientId, req.session.clinicId);
  if (!patient) return res.status(404).json({ error: 'Paciente não encontrado.' });
  if (guideId && !db.prepare('SELECT guides.id FROM guides JOIN patients ON patients.name = guides.patient AND patients.clinic_id = guides.clinic_id WHERE guides.id = ? AND patients.id = ? AND guides.clinic_id = ?').get(guideId, patientId, req.session.clinicId)) return res.status(400).json({ error: 'A guia vinculada não pertence ao paciente.' });
  if (authorizationId && !db.prepare('SELECT id FROM authorizations WHERE id = ? AND patient_id = ? AND clinic_id = ?').get(authorizationId, patientId, req.session.clinicId)) return res.status(400).json({ error: 'Autorização vinculada não pertence ao paciente.' });
  const extension = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg' }[mimeType];
  const clinicDirectory = path.join(documentUploadRoot, req.session.clinicId);
  fs.mkdirSync(clinicDirectory, { recursive: true });
  const storageName = `${Date.now()}-${id.replace(/[^a-zA-Z0-9_-]/g, '')}${extension}`;
  const storagePath = path.join(clinicDirectory, storageName);
  try {
    fs.writeFileSync(storagePath, file, { flag: 'wx' });
    db.prepare('INSERT INTO patient_documents (id, clinic_id, patient_id, guide_id, authorization_id, category, description, original_name, storage_name, mime_type, size_bytes, valid_until, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.session.clinicId, patientId, guideId || null, authorizationId || null, category, description || null, originalName.slice(0, 180), storageName, mimeType, file.length, validUntil || null, req.session.userId);
    res.status(201).json({ id });
  } catch (error) {
    if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
    res.status(409).json({ error: error.message });
  }
});

app.get('/api/patient-documents/:id/download', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const document = db.prepare('SELECT * FROM patient_documents WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!document) return res.status(404).json({ error: 'Documento não encontrado.' });
  const storagePath = path.join(documentUploadRoot, req.session.clinicId, document.storage_name);
  if (!fs.existsSync(storagePath)) return res.status(404).json({ error: 'Arquivo não encontrado no armazenamento.' });
  res.setHeader('Content-Type', document.mime_type);
  res.setHeader('Content-Length', document.size_bytes);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(document.original_name)}`);
  recordAudit(req, 'download', 'patient-documents', document.id, { patientId: document.patient_id, category: document.category });
  res.sendFile(storagePath);
});

app.get('/api/audit-logs', auth, requireRole('admin'), (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 300, 1), 1000);
  const conditions = ['audit_logs.clinic_id = ?'];
  const params = [req.session.clinicId];
  if (req.query.action) { conditions.push('audit_logs.action = ?'); params.push(req.query.action); }
  if (req.query.userId) { conditions.push('audit_logs.user_id = ?'); params.push(req.query.userId); }
  if (req.query.dateFrom) { conditions.push('date(audit_logs.created_at) >= date(?)'); params.push(req.query.dateFrom); }
  if (req.query.dateTo) { conditions.push('date(audit_logs.created_at) <= date(?)'); params.push(req.query.dateTo); }
  const rows = db.prepare(`SELECT audit_logs.id, audit_logs.user_id AS userId, users.name AS userName, audit_logs.action, audit_logs.entity_type AS entityType, audit_logs.entity_id AS entityId, audit_logs.route, audit_logs.details_json AS detailsJson, audit_logs.ip_address AS ipAddress, audit_logs.created_at AS createdAt FROM audit_logs JOIN users ON users.id = audit_logs.user_id AND users.clinic_id = audit_logs.clinic_id WHERE ${conditions.join(' AND ')} ORDER BY audit_logs.created_at DESC LIMIT ?`).all(...params, limit).map(row => ({ ...row, details: JSON.parse(row.detailsJson || '{}') }));
  res.json(rows);
});

app.delete('/api/patient-documents/:id', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const document = db.prepare('SELECT * FROM patient_documents WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!document) return res.status(404).json({ error: 'Documento não encontrado.' });
  if (db.prepare('SELECT 1 FROM patient_consents WHERE signed_document_id = ? AND clinic_id = ? LIMIT 1').get(document.id, req.session.clinicId)) return res.status(409).json({ error: 'Desvincule este comprovante do histórico de consentimento antes de excluí-lo.' });
  if (db.prepare(`SELECT 1 FROM billing_batch_guides JOIN billing_batches ON billing_batches.id = billing_batch_guides.batch_id
    WHERE billing_batch_guides.signed_document_id = ? AND billing_batches.clinic_id = ? LIMIT 1`).get(document.id, req.session.clinicId)) return res.status(409).json({ error: 'Este PDF comprova uma guia de lote e não pode ser excluído enquanto estiver vinculado.' });
  db.prepare('DELETE FROM patient_documents WHERE id = ? AND clinic_id = ?').run(req.params.id, req.session.clinicId);
  const storagePath = path.join(documentUploadRoot, req.session.clinicId, document.storage_name);
  if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
  res.status(204).end();
});

const appointmentSelect = `SELECT appointments.id, appointments.patient_id AS patientId, patients.name AS patient, appointments.professional, appointments.appointment_date AS date, appointments.start_time AS start, appointments.duration, appointments.attendance_type AS type, appointments.status, appointments.recurrence_id AS recurrenceId, appointments.authorization_id AS authorizationId, appointments.authorization_counted AS authorizationCounted, authorizations.authorization_number AS authorizationNumber, appointments.created_at AS createdAt
  FROM appointments JOIN patients ON patients.id = appointments.patient_id AND patients.clinic_id = appointments.clinic_id LEFT JOIN authorizations ON authorizations.id = appointments.authorization_id AND authorizations.clinic_id = appointments.clinic_id`;

app.get('/api/appointments', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  res.json(db.prepare(`${appointmentSelect} WHERE appointments.clinic_id = ? ORDER BY appointments.appointment_date, appointments.start_time`).all(req.session.clinicId));
});

app.post('/api/appointments', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const { patientId, professional, date, start, duration, type, repeatWeeks = 1 } = req.body;
  const weeks = Math.min(Math.max(Number(repeatWeeks) || 1, 1), 24);
  if (!patientId || !professional || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(start || '') || !Number(duration) || !type) return res.status(400).json({ error: 'Paciente, profissional, data, horário, duração e tipo são obrigatórios.' });
  if (!db.prepare('SELECT id FROM patients WHERE id = ? AND clinic_id = ? AND active = 1').get(patientId, req.session.clinicId)) return res.status(404).json({ error: 'Paciente ativo não encontrado.' });
  const dates = weeklyDates(date, weeks);
  const existing = db.prepare(`SELECT professional, appointment_date AS date, start_time AS start, duration, status FROM appointments WHERE clinic_id = ? AND appointment_date IN (${dates.map(() => '?').join(',')})`).all(req.session.clinicId, ...dates);
  const candidates = dates.map((appointmentDate, index) => ({ id: `AG-${Date.now()}-${index + 1}`, patientId, professional, date: appointmentDate, start, duration: Number(duration), type }));
  const conflict = candidates.find(candidate => hasAppointmentConflict(existing, candidate));
  if (conflict) return res.status(409).json({ error: `O profissional já possui atendimento conflitante em ${conflict.date}.` });
  const recurrenceId = weeks > 1 ? `REC-${Date.now()}` : null;
  const findAuthorization = db.prepare(`SELECT id FROM authorizations WHERE clinic_id = ? AND patient_id = ? AND valid_from <= ? AND valid_to >= ? AND used_quantity < authorized_quantity ORDER BY valid_to LIMIT 1`);
  const insert = db.prepare('INSERT INTO appointments (id, clinic_id, patient_id, professional, appointment_date, start_time, duration, attendance_type, recurrence_id, authorization_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  db.transaction(() => candidates.forEach(item => { const authorization = findAuthorization.get(req.session.clinicId, item.patientId, item.date, item.date); insert.run(item.id, req.session.clinicId, item.patientId, item.professional, item.date, item.start, item.duration, item.type, recurrenceId, authorization?.id || null, req.session.userId); }))();
  res.status(201).json({ ids: candidates.map(item => item.id), recurrenceId });
});

app.patch('/api/appointments/:id/status', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const allowed = new Set(['scheduled', 'confirmed', 'completed', 'missed', 'cancelled']);
  if (!allowed.has(req.body.status)) return res.status(400).json({ error: 'Situação do atendimento inválida.' });
  const appointment = db.prepare('SELECT * FROM appointments WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!appointment) return res.status(404).json({ error: 'Atendimento não encontrado.' });
  try {
    db.transaction(() => {
      if (req.body.status === 'completed' && !appointment.authorization_counted && appointment.authorization_id) {
        const updated = db.prepare('UPDATE authorizations SET used_quantity = used_quantity + 1 WHERE id = ? AND clinic_id = ? AND used_quantity < authorized_quantity').run(appointment.authorization_id, req.session.clinicId);
        if (!updated.changes) throw new Error('A autorização vinculada não possui saldo disponível.');
        db.prepare('UPDATE appointments SET authorization_counted = 1 WHERE id = ?').run(appointment.id);
      } else if (appointment.status === 'completed' && appointment.authorization_counted && req.body.status !== 'completed' && appointment.authorization_id) {
        db.prepare('UPDATE authorizations SET used_quantity = MAX(0, used_quantity - 1) WHERE id = ? AND clinic_id = ?').run(appointment.authorization_id, req.session.clinicId);
        db.prepare('UPDATE appointments SET authorization_counted = 0 WHERE id = ?').run(appointment.id);
      }
      db.prepare('UPDATE appointments SET status = ? WHERE id = ? AND clinic_id = ?').run(req.body.status, appointment.id, req.session.clinicId);
    })();
    res.json({ id: req.params.id, status: req.body.status });
  } catch (error) { res.status(409).json({ error: error.message }); }
});

app.delete('/api/appointments/:id', auth, requireRole('admin', 'recepcao'), (req, res) => {
  const appointment = db.prepare('SELECT * FROM appointments WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!appointment) return res.status(404).json({ error: 'Atendimento não encontrado.' });
  db.transaction(() => {
    if (appointment.authorization_counted && appointment.authorization_id) db.prepare('UPDATE authorizations SET used_quantity = MAX(0, used_quantity - 1) WHERE id = ? AND clinic_id = ?').run(appointment.authorization_id, req.session.clinicId);
    db.prepare('DELETE FROM appointments WHERE id = ? AND clinic_id = ?').run(req.params.id, req.session.clinicId);
  })();
  res.status(204).end();
});

function normalizeProcedureRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules.map(rule => ({ code: String(rule.code || '').trim(), unitValue: Number(rule.unitValue || 0), requiresAuthorization: Boolean(rule.requiresAuthorization), maxSessions: Math.max(0, Math.floor(Number(rule.maxSessions || 0))), validFrom: /^\d{4}-\d{2}-\d{2}$/.test(rule.validFrom || '') ? rule.validFrom : '', validTo: /^\d{4}-\d{2}-\d{2}$/.test(rule.validTo || '') ? rule.validTo : '' }))
    .filter(rule => /^\d+$/.test(rule.code) && Number.isFinite(rule.unitValue) && rule.unitValue >= 0);
}
function unknownProcedureCodes(rules) {
  const latest = db.prepare("SELECT version FROM tuss_imports WHERE table_code = '22' ORDER BY version DESC LIMIT 1").get()?.version;
  if (!latest || !rules.length) return [];
  const exists = db.prepare("SELECT 1 FROM tuss_terms WHERE table_code = '22' AND version = ? AND code = ?");
  return rules.map(rule => rule.code).filter(code => !exists.get(latest, code));
}

app.post('/api/insurers', auth, requireRole('admin'), (req, res) => {
  const { id, name, ansCode, contactEmail, contactPhone, providerCode, deliveryFormat = 'both', returnAlertDays = 7, returnCriticalDays = 15, acceptedProcedures = [], procedureRules = [] } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'Nome e identificador são obrigatórios.' });
  if (providerCode && String(providerCode).length > 14) return res.status(400).json({ error: 'O código do prestador pode ter no máximo 14 caracteres.' });
  if (!['pdf', 'xml', 'both'].includes(deliveryFormat)) return res.status(400).json({ error: 'Forma de envio inválida.' });
  const alertDays = Number(returnAlertDays), criticalDays = Number(returnCriticalDays);
  if (!Number.isInteger(alertDays) || alertDays < 1 || alertDays > 90 || !Number.isInteger(criticalDays) || criticalDays <= alertDays || criticalDays > 180) return res.status(400).json({ error: 'Defina o primeiro alerta entre 1 e 90 dias e a urgência em um prazo posterior, de até 180 dias.' });
  try {
    const rules = normalizeProcedureRules(procedureRules);
    if (rules.some(rule => rule.validFrom && rule.validTo && rule.validFrom > rule.validTo)) return res.status(400).json({ error: 'A data final da vigência não pode ser anterior à data inicial.' });
    const unknownCodes = unknownProcedureCodes(rules);
    if (unknownCodes.length) return res.status(400).json({ error: `Código TUSS não encontrado na versão oficial: ${unknownCodes.join(', ')}.` });
    db.prepare('INSERT INTO insurers (id, clinic_id, name, ans_code, contact_email, contact_phone, provider_code, delivery_format, return_alert_days, return_critical_days, accepted_procedures, procedure_rules) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.session.clinicId, name, ansCode || null, contactEmail || null, contactPhone || null, providerCode || null, deliveryFormat, alertDays, criticalDays, JSON.stringify(rules.length ? [...new Set(rules.map(rule => rule.code))] : acceptedProcedures), JSON.stringify(rules));
    res.status(201).json({ id });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.put('/api/insurers/:id', auth, requireRole('admin'), (req, res) => {
  const { name, ansCode, contactEmail, contactPhone, providerCode, deliveryFormat = 'both', returnAlertDays = 7, returnCriticalDays = 15, acceptedProcedures = [], procedureRules = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório.' });
  if (providerCode && String(providerCode).length > 14) return res.status(400).json({ error: 'O código do prestador pode ter no máximo 14 caracteres.' });
  if (!['pdf', 'xml', 'both'].includes(deliveryFormat)) return res.status(400).json({ error: 'Forma de envio inválida.' });
  const alertDays = Number(returnAlertDays), criticalDays = Number(returnCriticalDays);
  if (!Number.isInteger(alertDays) || alertDays < 1 || alertDays > 90 || !Number.isInteger(criticalDays) || criticalDays <= alertDays || criticalDays > 180) return res.status(400).json({ error: 'Defina o primeiro alerta entre 1 e 90 dias e a urgência em um prazo posterior, de até 180 dias.' });
  try {
    const rules = normalizeProcedureRules(procedureRules);
    if (rules.some(rule => rule.validFrom && rule.validTo && rule.validFrom > rule.validTo)) return res.status(400).json({ error: 'A data final da vigência não pode ser anterior à data inicial.' });
    const unknownCodes = unknownProcedureCodes(rules);
    if (unknownCodes.length) return res.status(400).json({ error: `Código TUSS não encontrado na versão oficial: ${unknownCodes.join(', ')}.` });
    const codes = rules.length ? [...new Set(rules.map(rule => rule.code))] : acceptedProcedures;
    const result = db.prepare('UPDATE insurers SET name = ?, ans_code = ?, contact_email = ?, contact_phone = ?, provider_code = ?, delivery_format = ?, return_alert_days = ?, return_critical_days = ?, accepted_procedures = ?, procedure_rules = ? WHERE id = ? AND clinic_id = ?').run(name, ansCode || null, contactEmail || null, contactPhone || null, providerCode || null, deliveryFormat, alertDays, criticalDays, JSON.stringify(codes), JSON.stringify(rules), req.params.id, req.session.clinicId);
    if (!result.changes) return res.status(404).json({ error: 'Convênio não encontrado.' });
    res.json({ id: req.params.id });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.delete('/api/insurers/:id', auth, requireRole('admin'), (req, res) => {
  const result = db.prepare('DELETE FROM insurers WHERE id = ? AND clinic_id = ?').run(req.params.id, req.session.clinicId);
  if (!result.changes) return res.status(404).json({ error: 'Convênio não encontrado.' });
  res.status(204).end();
});

app.get('/api/authorizations', auth, (req, res) => {
  const rows = db.prepare(`SELECT authorizations.id, authorizations.patient_id AS patientId, patients.name AS patient,
      authorizations.insurer_id AS insurerId, insurers.name AS insurer, authorizations.authorization_number AS authorizationNumber,
      authorizations.valid_from AS validFrom, authorizations.valid_to AS validTo,
      authorizations.authorized_quantity AS authorizedQuantity, authorizations.used_quantity AS usedQuantity,
      authorizations.notes, authorizations.created_at AS createdAt
    FROM authorizations JOIN patients ON patients.id = authorizations.patient_id
    JOIN insurers ON insurers.id = authorizations.insurer_id
    WHERE authorizations.clinic_id = ? ORDER BY authorizations.valid_to, patients.name`).all(req.session.clinicId);
  res.json(rows);
});

app.post('/api/authorizations', auth, requireRole('admin', 'faturamento', 'recepcao'), (req, res) => {
  const { patientId, insurerId, authorizationNumber, validFrom, validTo, authorizedQuantity, usedQuantity = 0, notes } = req.body;
  const quantity = Math.floor(Number(authorizedQuantity));
  const used = Math.floor(Number(usedQuantity));
  if (!patientId || !insurerId || !authorizationNumber || !/^\d{4}-\d{2}-\d{2}$/.test(validFrom || '') || !/^\d{4}-\d{2}-\d{2}$/.test(validTo || '')) return res.status(400).json({ error: 'Preencha paciente, convênio, número e período de validade.' });
  if (validFrom > validTo) return res.status(400).json({ error: 'A data final não pode ser anterior à data inicial.' });
  if (!Number.isInteger(quantity) || quantity < 1 || !Number.isInteger(used) || used < 0) return res.status(400).json({ error: 'Informe quantidades válidas.' });
  const patient = db.prepare('SELECT insurer FROM patients WHERE id = ? AND clinic_id = ? AND active = 1').get(patientId, req.session.clinicId);
  const insurer = db.prepare('SELECT name FROM insurers WHERE id = ? AND clinic_id = ?').get(insurerId, req.session.clinicId);
  if (!patient || !insurer) return res.status(404).json({ error: 'Paciente ativo ou convênio não encontrado.' });
  if (patient.insurer !== insurer.name) return res.status(400).json({ error: 'O convênio selecionado é diferente do cadastro do paciente.' });
  const id = `AUT-${Date.now()}`;
  try {
    db.prepare('INSERT INTO authorizations (id, clinic_id, patient_id, insurer_id, authorization_number, valid_from, valid_to, authorized_quantity, used_quantity, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.session.clinicId, patientId, insurerId, String(authorizationNumber).trim(), validFrom, validTo, quantity, used, notes || null);
    res.status(201).json({ id });
  } catch (error) { res.status(409).json({ error: error.message.includes('UNIQUE') ? 'Essa autorização já está cadastrada para o convênio.' : error.message }); }
});

app.put('/api/authorizations/:id', auth, requireRole('admin', 'faturamento', 'recepcao'), (req, res) => {
  const quantity = Math.floor(Number(req.body.authorizedQuantity));
  const used = Math.floor(Number(req.body.usedQuantity));
  if (!Number.isInteger(quantity) || quantity < 1 || !Number.isInteger(used) || used < 0) return res.status(400).json({ error: 'Informe quantidades válidas.' });
  const result = db.prepare('UPDATE authorizations SET used_quantity = ?, authorized_quantity = ?, valid_to = ?, notes = ? WHERE id = ? AND clinic_id = ?').run(used, quantity, req.body.validTo, req.body.notes || null, req.params.id, req.session.clinicId);
  if (!result.changes) return res.status(404).json({ error: 'Autorização não encontrada.' });
  res.json({ id: req.params.id });
});

app.delete('/api/authorizations/:id', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const result = db.prepare('DELETE FROM authorizations WHERE id = ? AND clinic_id = ?').run(req.params.id, req.session.clinicId);
  if (!result.changes) return res.status(404).json({ error: 'Autorização não encontrada.' });
  res.status(204).end();
});

function batchDetails(batch) {
  const guides = db.prepare(`SELECT guides.id, guides.patient, guides.procedure, guides.insurer, guides.competence,
      guides.value_cents AS valueCents, guides.status, billing_batch_guides.signed_pdf_received AS signedPdfReceived,
      billing_batch_guides.signed_document_id AS signedDocumentId, patient_documents.original_name AS signedDocumentName
    FROM billing_batch_guides
    JOIN guides ON guides.id = billing_batch_guides.guide_id
    LEFT JOIN patient_documents ON patient_documents.id = billing_batch_guides.signed_document_id
    WHERE billing_batch_guides.batch_id = ?
    ORDER BY guides.patient, guides.id`).all(batch.id);
  const requiresPdf = batch.deliveryFormat === 'pdf' || batch.deliveryFormat === 'both';
  const requiresXml = batch.deliveryFormat === 'xml' || batch.deliveryFormat === 'both';
  const documents = db.prepare(`SELECT billing_batch_documents.id, billing_batch_documents.category, billing_batch_documents.original_name AS originalName,
    billing_batch_documents.mime_type AS mimeType, billing_batch_documents.size_bytes AS sizeBytes, billing_batch_documents.created_at AS createdAt,
    users.name AS uploadedBy FROM billing_batch_documents JOIN users ON users.id = billing_batch_documents.uploaded_by
    WHERE billing_batch_documents.batch_id = ? AND billing_batch_documents.clinic_id = ? ORDER BY billing_batch_documents.created_at DESC`).all(batch.id, batch.clinicId);
  const statusHistory = db.prepare(`SELECT billing_batch_status_history.id, billing_batch_status_history.previous_status AS previousStatus,
      billing_batch_status_history.new_status AS newStatus, billing_batch_status_history.created_at AS createdAt,
      users.name AS changedBy
    FROM billing_batch_status_history JOIN users ON users.id = billing_batch_status_history.changed_by
    WHERE billing_batch_status_history.batch_id = ? AND billing_batch_status_history.clinic_id = ?
    ORDER BY billing_batch_status_history.created_at DESC, billing_batch_status_history.rowid DESC`).all(batch.id, batch.clinicId);
  const returnItems = db.prepare(`SELECT billing_batch_return_items.id, billing_batch_return_items.guide_id AS guideId,
      billing_batch_return_items.released_cents AS releasedCents, billing_batch_return_items.glosa_cents AS glosaCents,
      billing_batch_return_items.glosa_code AS glosaCode, billing_batch_return_items.created_at AS createdAt,
      billing_batch_return_items.document_id AS documentId
    FROM billing_batch_return_items WHERE batch_id = ? AND clinic_id = ? ORDER BY created_at DESC`).all(batch.id, batch.clinicId);
  const deliveryPackages = db.prepare(`SELECT billing_delivery_packages.id, billing_delivery_packages.sha256,
    billing_delivery_packages.size_bytes AS sizeBytes, billing_delivery_packages.created_at AS createdAt, users.name AS createdBy
    FROM billing_delivery_packages JOIN users ON users.id = billing_delivery_packages.created_by
    WHERE billing_delivery_packages.batch_id = ? AND billing_delivery_packages.clinic_id = ? ORDER BY billing_delivery_packages.created_at DESC`).all(batch.id, batch.clinicId);
  const followups = db.prepare(`SELECT billing_batch_followups.id, billing_batch_followups.contact_date AS contactDate,
    billing_batch_followups.channel, billing_batch_followups.outcome, billing_batch_followups.notes,
    billing_batch_followups.next_followup_date AS nextFollowupDate, billing_batch_followups.created_at AS createdAt,
    users.name AS createdBy FROM billing_batch_followups JOIN users ON users.id = billing_batch_followups.created_by
    WHERE billing_batch_followups.batch_id = ? AND billing_batch_followups.clinic_id = ?
    ORDER BY billing_batch_followups.contact_date DESC, billing_batch_followups.created_at DESC`).all(batch.id, batch.clinicId);
  const payments = db.prepare(`SELECT billing_batch_payments.id, billing_batch_payments.payment_date AS paymentDate,
    billing_batch_payments.amount_cents AS amountCents, billing_batch_payments.reference, billing_batch_payments.notes,
    billing_batch_payments.created_at AS createdAt, creator.name AS createdBy,
    billing_batch_payments.reversed_at AS reversedAt, reverser.name AS reversedBy,
    billing_batch_payments.reversal_reason AS reversalReason
    FROM billing_batch_payments JOIN users creator ON creator.id = billing_batch_payments.created_by
    LEFT JOIN users reverser ON reverser.id = billing_batch_payments.reversed_by
    WHERE billing_batch_payments.batch_id = ? AND billing_batch_payments.clinic_id = ?
    ORDER BY billing_batch_payments.payment_date DESC, billing_batch_payments.created_at DESC`).all(batch.id, batch.clinicId);
  const missingSignedPdfs = requiresPdf ? guides.filter(guide => !signedPdfRequirementMet(guide)).length : 0;
  const xmlPending = requiresXml && (!batch.xmlGenerated || !batch.xmlValid);
  const totalValueCents = guides.reduce((sum, guide) => sum + Number(guide.valueCents || 0), 0);
  return {
    ...batch,
    guideCount: guides.length,
    totalValueCents,
    receivedCents: Number(batch.receivedCents || 0),
    reconciliationStatus: reconciliationStatus(totalValueCents, batch.receivedCents),
    missingSignedPdfs,
    xmlPending,
    xmlValid: Boolean(batch.xmlValid),
    xmlValidationErrors: Array.isArray(batch.xmlValidationErrors) ? batch.xmlValidationErrors : JSON.parse(batch.xmlValidationErrors || '[]'),
    readyForSending: guides.length > 0 && missingSignedPdfs === 0 && !xmlPending,
    documents,
    statusHistory,
    returnItems,
    deliveryPackages,
    followups,
    payments,
    guides: guides.map(guide => ({ ...guide, signedPdfReceived: Boolean(guide.signedDocumentId) }))
  };
}

app.get('/api/batches', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const batches = db.prepare(`SELECT billing_batches.id, billing_batches.insurer_id AS insurerId, insurers.name AS insurer,
      billing_batches.competence, billing_batches.delivery_format AS deliveryFormat, billing_batches.status,
      billing_batches.protocol, billing_batches.sent_at AS sentAt, billing_batches.xml_generated AS xmlGenerated,
      billing_batches.sent_package_id AS sentPackageId,
      (SELECT users.name FROM users WHERE users.id = billing_batches.sent_by) AS sentBy,
      insurers.return_alert_days AS returnAlertDays, insurers.return_critical_days AS returnCriticalDays,
      insurers.contact_email AS insurerContactEmail, insurers.contact_phone AS insurerContactPhone,
      billing_batches.xml_valid AS xmlValid, billing_batches.xml_validation_errors AS xmlValidationErrors,
      billing_batches.tiss_version AS tissVersion,
      billing_batches.expected_payment_date AS expectedPaymentDate, billing_batches.received_cents AS receivedCents,
      billing_batches.received_at AS receivedAt, billing_batches.reconciliation_notes AS reconciliationNotes,
      billing_batches.created_at AS createdAt
    FROM billing_batches
    JOIN insurers ON insurers.id = billing_batches.insurer_id
    WHERE billing_batches.clinic_id = ?
    ORDER BY billing_batches.competence DESC, billing_batches.created_at DESC`).all(req.session.clinicId);
  res.json(batches.map(batch => batchDetails({ ...batch, clinicId: req.session.clinicId, xmlGenerated: Boolean(batch.xmlGenerated) })));
});

app.post('/api/batches', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const { insurerId, competence, guideIds = [] } = req.body;
  if (!insurerId || !/^\d{4}-\d{2}$/.test(competence || '') || !Array.isArray(guideIds) || !guideIds.length) {
    return res.status(400).json({ error: 'Informe convênio, competência e pelo menos uma guia.' });
  }
  const insurer = db.prepare('SELECT id, name, delivery_format AS deliveryFormat FROM insurers WHERE id = ? AND clinic_id = ?').get(insurerId, req.session.clinicId);
  if (!insurer) return res.status(404).json({ error: 'Convênio não encontrado.' });
  const uniqueGuideIds = [...new Set(guideIds.map(String))];
  const placeholders = uniqueGuideIds.map(() => '?').join(',');
  const guides = db.prepare(`SELECT id, insurer, competence, sessions_json FROM guides WHERE clinic_id = ? AND id IN (${placeholders})`).all(req.session.clinicId, ...uniqueGuideIds);
  if (guides.length !== uniqueGuideIds.length) return res.status(400).json({ error: 'Uma ou mais guias não pertencem à clínica.' });
  if (guides.some(guide => guide.insurer !== insurer.name || guideCompetence(guide) !== competence)) return res.status(400).json({ error: 'Todas as guias devem pertencer ao convênio e à competência do lote.' });
  const alreadyAssigned = db.prepare(`SELECT guide_id AS guideId FROM billing_batch_guides WHERE guide_id IN (${placeholders})`).all(...uniqueGuideIds);
  if (alreadyAssigned.length) return res.status(409).json({ error: `Guia já incluída em outro lote: ${alreadyAssigned.map(item => item.guideId).join(', ')}.` });
  const year = competence.slice(0, 4);
  const lastId = db.prepare("SELECT id FROM billing_batches WHERE clinic_id = ? AND id LIKE ? ORDER BY id DESC LIMIT 1").get(req.session.clinicId, `L-${year}-%`)?.id;
  const nextNumber = Number(lastId?.split('-').pop() || 0) + 1;
  const id = `L-${year}-${String(nextNumber).padStart(4, '0')}`;
  try {
    db.transaction(() => {
      db.prepare('INSERT INTO billing_batches (id, clinic_id, insurer_id, competence, delivery_format) VALUES (?, ?, ?, ?, ?)').run(id, req.session.clinicId, insurer.id, competence, insurer.deliveryFormat);
      const insertGuide = db.prepare('INSERT INTO billing_batch_guides (batch_id, guide_id) VALUES (?, ?)');
      uniqueGuideIds.forEach(guideId => insertGuide.run(id, guideId));
      db.prepare(`INSERT INTO billing_batch_status_history (id, clinic_id, batch_id, previous_status, new_status, changed_by)
        VALUES (?, ?, ?, NULL, 'draft', ?)`).run(crypto.randomUUID(), req.session.clinicId, id, req.session.userId);
    })();
    res.status(201).json({ id });
  } catch (error) {
    res.status(409).json({ error: error.message.includes('UNIQUE') ? 'Já existe um lote para esse convênio e competência.' : error.message });
  }
});

app.patch('/api/batches/:id/guides/:guideId', auth, requireRole('admin', 'faturamento'), (req, res) => {
  res.status(410).json({ error: 'A confirmação manual foi substituída pelo envio obrigatório do PDF assinado.' });
});

app.post('/api/batches/:id/guides/:guideId/signed-pdf', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const { originalName, contentDataUrl } = req.body || {};
  let file;
  try { file = decodeSignedPdf(contentDataUrl); } catch (error) { return res.status(400).json({ error: error.message }); }
  const item = db.prepare(`SELECT billing_batches.id AS batchId, guides.id AS guideId, guides.patient,
      billing_batch_guides.signed_document_id AS previousDocumentId
    FROM billing_batch_guides JOIN billing_batches ON billing_batches.id = billing_batch_guides.batch_id
    JOIN guides ON guides.id = billing_batch_guides.guide_id
    WHERE billing_batches.id = ? AND guides.id = ? AND billing_batches.clinic_id = ?`).get(req.params.id, req.params.guideId, req.session.clinicId);
  if (!item) return res.status(404).json({ error: 'Guia não encontrada neste lote.' });
  const matchingPatients = db.prepare('SELECT id FROM patients WHERE clinic_id = ? AND name = ?').all(req.session.clinicId, item.patient);
  if (matchingPatients.length !== 1) return res.status(409).json({ error: 'Não foi possível identificar unicamente o paciente da guia. Revise o cadastro antes de anexar.' });
  const documentId = `DOC-SIGNED-${Date.now()}`;
  const clinicDirectory = path.join(documentUploadRoot, req.session.clinicId);
  fs.mkdirSync(clinicDirectory, { recursive: true });
  const storageName = `${Date.now()}-${documentId}.pdf`;
  const storagePath = path.join(clinicDirectory, storageName);
  try {
    fs.writeFileSync(storagePath, file, { flag: 'wx' });
    db.transaction(() => {
      if (item.previousDocumentId) db.prepare("UPDATE patient_documents SET description = 'Versão anterior do PDF assinado da guia' WHERE id = ? AND clinic_id = ?").run(item.previousDocumentId, req.session.clinicId);
      db.prepare(`INSERT INTO patient_documents (id, clinic_id, patient_id, guide_id, category, description, original_name, storage_name, mime_type, size_bytes, uploaded_by)
        VALUES (?, ?, ?, ?, 'Guia assinada', 'PDF assinado recebido para faturamento', ?, ?, 'application/pdf', ?, ?)`).run(documentId, req.session.clinicId, matchingPatients[0].id, item.guideId, String(originalName || `guia-assinada-${item.guideId}.pdf`).slice(0, 180), storageName, file.length, req.session.userId);
      db.prepare('UPDATE billing_batch_guides SET signed_pdf_received = 1, signed_document_id = ? WHERE batch_id = ? AND guide_id = ?').run(documentId, item.batchId, item.guideId);
    })();
    req.auditDetails = { signedGuidePdf: true, replacement: Boolean(item.previousDocumentId), previousDocumentId: item.previousDocumentId || null, guideId: item.guideId, patientId: matchingPatients[0].id };
    res.status(201).json({ documentId });
  } catch (error) {
    if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
    res.status(409).json({ error: 'Não foi possível armazenar o PDF assinado.' });
  }
});

app.get('/api/batches/:id/guides/:guideId/signed-pdf', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const document = db.prepare(`SELECT patient_documents.* FROM billing_batch_guides
    JOIN billing_batches ON billing_batches.id = billing_batch_guides.batch_id
    JOIN patient_documents ON patient_documents.id = billing_batch_guides.signed_document_id
    WHERE billing_batches.id = ? AND billing_batch_guides.guide_id = ? AND billing_batches.clinic_id = ?`).get(req.params.id, req.params.guideId, req.session.clinicId);
  if (!document) return res.status(404).json({ error: 'PDF assinado não encontrado.' });
  const storagePath = path.join(documentUploadRoot, req.session.clinicId, document.storage_name);
  if (!fs.existsSync(storagePath)) return res.status(404).json({ error: 'Arquivo não encontrado no armazenamento.' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', document.size_bytes);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(document.original_name)}`);
  recordAudit(req, 'download', 'batches', req.params.id, { document: 'signed-guide-pdf', guideId: req.params.guideId });
  res.sendFile(storagePath);
});

app.post('/api/batches/:id/documents', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const batch = db.prepare('SELECT id FROM billing_batches WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });
  const { category, originalName, mimeType, contentDataUrl } = req.body || {};
  let file;
  try { file = decodeBatchDocument({ category, mimeType, contentDataUrl }); } catch (error) { return res.status(400).json({ error: error.message }); }
  let parsedReturn = null;
  if (category === 'operator_return' && mimeType !== 'application/pdf') {
    try { parsedReturn = parseTissOperatorReturn(file); } catch (error) { return res.status(400).json({ error: error.message }); }
  }
  const id = `BDOC-${Date.now()}`;
  const extension = mimeType === 'application/pdf' ? '.pdf' : '.xml';
  const clinicDirectory = path.join(documentUploadRoot, req.session.clinicId);
  fs.mkdirSync(clinicDirectory, { recursive: true });
  const storageName = `${Date.now()}-${id}${extension}`;
  const storagePath = path.join(clinicDirectory, storageName);
  try {
    fs.writeFileSync(storagePath, file, { flag: 'wx' });
    const processing = { matched: 0, unmatched: [], glosasCreated: 0 };
    db.transaction(() => {
      db.prepare(`INSERT INTO billing_batch_documents (id, clinic_id, batch_id, category, original_name, storage_name, mime_type, size_bytes, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, req.session.clinicId, batch.id, category, String(originalName || `documento-${batch.id}${extension}`).slice(0, 180), storageName, mimeType, file.length, req.session.userId);
      for (const entry of parsedReturn?.entries || []) {
        const linked = db.prepare('SELECT guide_id AS guideId FROM billing_batch_guides WHERE batch_id = ? AND guide_id = ?').get(batch.id, entry.guideId);
        if (!linked) { processing.unmatched.push(entry.guideId); continue; }
        let glosaId = null;
        if (entry.glosaCents > 0) {
          glosaId = `GL-${crypto.randomUUID()}`;
          db.prepare('INSERT INTO glosas (id, clinic_id, guide_id, code, reason, amount_cents) VALUES (?, ?, ?, ?, ?, ?)').run(glosaId, req.session.clinicId, entry.guideId, entry.glosaCode || '', entry.reason || 'Glosa informada no retorno XML da operadora.', entry.glosaCents);
          db.prepare("UPDATE guides SET status = 'error' WHERE id = ? AND clinic_id = ?").run(entry.guideId, req.session.clinicId);
          processing.glosasCreated += 1;
        } else db.prepare("UPDATE guides SET status = 'approved' WHERE id = ? AND clinic_id = ?").run(entry.guideId, req.session.clinicId);
        db.prepare(`INSERT INTO billing_batch_return_items (id, clinic_id, batch_id, document_id, guide_id, released_cents, glosa_cents, glosa_code, created_glosa_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(crypto.randomUUID(), req.session.clinicId, batch.id, id, entry.guideId, entry.releasedCents, entry.glosaCents, entry.glosaCode || null, glosaId);
        processing.matched += 1;
      }
      if (parsedReturn?.protocol) db.prepare('UPDATE billing_batches SET protocol = COALESCE(NULLIF(protocol, \'\'), ?) WHERE id = ? AND clinic_id = ?').run(parsedReturn.protocol, batch.id, req.session.clinicId);
    })();
    req.auditDetails = { batchDocument: true, batchId: batch.id, category, returnProcessing: processing };
    res.status(201).json({ id, processing });
  } catch (error) {
    if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
    res.status(409).json({ error: 'Não foi possível armazenar o documento do lote.' });
  }
});

app.get('/api/batches/:id/documents/:documentId/download', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const document = db.prepare('SELECT * FROM billing_batch_documents WHERE id = ? AND batch_id = ? AND clinic_id = ?').get(req.params.documentId, req.params.id, req.session.clinicId);
  if (!document) return res.status(404).json({ error: 'Documento do lote não encontrado.' });
  const storagePath = path.join(documentUploadRoot, req.session.clinicId, document.storage_name);
  if (!fs.existsSync(storagePath)) return res.status(404).json({ error: 'Arquivo não encontrado no armazenamento.' });
  res.setHeader('Content-Type', document.mime_type); res.setHeader('Content-Length', document.size_bytes);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(document.original_name)}`);
  recordAudit(req, 'download', 'batches', req.params.id, { document: 'batch-document', documentId: document.id, category: document.category });
  res.sendFile(storagePath);
});

app.delete('/api/batches/:id/documents/:documentId', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const document = db.prepare('SELECT * FROM billing_batch_documents WHERE id = ? AND batch_id = ? AND clinic_id = ?').get(req.params.documentId, req.params.id, req.session.clinicId);
  if (!document) return res.status(404).json({ error: 'Documento do lote não encontrado.' });
  if (db.prepare('SELECT 1 FROM billing_batch_return_items WHERE document_id = ? AND clinic_id = ? LIMIT 1').get(document.id, req.session.clinicId)) return res.status(409).json({ error: 'Este XML já gerou resultados e glosas. Ele deve permanecer vinculado para preservar a auditoria.' });
  db.prepare('DELETE FROM billing_batch_documents WHERE id = ? AND clinic_id = ?').run(document.id, req.session.clinicId);
  const storagePath = path.join(documentUploadRoot, req.session.clinicId, document.storage_name);
  if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
  req.auditDetails = { batchDocument: true, batchId: req.params.id, category: document.category };
  res.status(204).end();
});

function escapeXml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function buildBatchXml(batch, guides) {
  const guideXml = guides.map(guide => `<ans:guia><ans:numeroGuiaPrestador>${escapeXml(guide.id)}</ans:numeroGuiaPrestador><ans:beneficiario>${escapeXml(guide.patient)}</ans:beneficiario><ans:numeroCarteira>${escapeXml(guide.card_number)}</ans:numeroCarteira><ans:codigoTUSS>${escapeXml(guide.service_code)}</ans:codigoTUSS><ans:quantidade>${escapeXml(guide.quantity)}</ans:quantidade><ans:valorTotal>${(Number(guide.value_cents || 0) / 100).toFixed(2)}</ans:valorTotal></ans:guia>`).join('');
  const now = new Date(), date = now.toISOString().slice(0, 10), time = now.toTimeString().slice(0, 8);
  const values = ['ENVIO_LOTE_GUIAS', batch.id.replace(/\D/g, '').slice(-12) || '1', date, time, batch.ansCode || '', TISS_VERSION, batch.id, ...guides.flatMap(guide => [guide.id, guide.patient, guide.card_number, guide.service_code, guide.quantity, (Number(guide.value_cents || 0) / 100).toFixed(2)])];
  const hash = calculateTissHash(values);
  const xml = `<?xml version="1.0" encoding="ISO-8859-1"?><ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas"><ans:cabecalho><ans:identificacaoTransacao><ans:tipoTransacao>ENVIO_LOTE_GUIAS</ans:tipoTransacao><ans:sequencialTransacao>${escapeXml(values[1])}</ans:sequencialTransacao><ans:dataRegistroTransacao>${date}</ans:dataRegistroTransacao><ans:horaRegistroTransacao>${time}</ans:horaRegistroTransacao></ans:identificacaoTransacao><ans:origem><ans:identificacaoPrestador><ans:CNPJ>${escapeXml(guides[0]?.provider_cnpj || '')}</ans:CNPJ></ans:identificacaoPrestador></ans:origem><ans:destino><ans:registroANS>${escapeXml(batch.ansCode)}</ans:registroANS></ans:destino><ans:Padrao>${TISS_VERSION}</ans:Padrao></ans:cabecalho><ans:prestadorParaOperadora><ans:loteGuias><ans:numeroLote>${escapeXml(batch.id)}</ans:numeroLote><ans:guiasTISS>${guideXml}</ans:guiasTISS></ans:loteGuias></ans:prestadorParaOperadora><ans:epilogo><ans:hash>${hash}</ans:hash></ans:epilogo></ans:mensagemTISS>`;
  const validation = await validateTissXml(xml);
  return { xml, validation };
}

app.get('/api/batches/:id/xml', auth, requireRole('admin', 'faturamento'), async (req, res) => {
  const batch = db.prepare(`SELECT billing_batches.*, insurers.name AS insurer, insurers.ans_code AS ansCode
    FROM billing_batches JOIN insurers ON insurers.id = billing_batches.insurer_id
    WHERE billing_batches.id = ? AND billing_batches.clinic_id = ?`).get(req.params.id, req.session.clinicId);
  if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });
  if (batch.delivery_format === 'pdf') return res.status(400).json({ error: 'Este convênio exige somente PDF assinado.' });
  const guides = db.prepare(`SELECT guides.* FROM billing_batch_guides JOIN guides ON guides.id = billing_batch_guides.guide_id WHERE billing_batch_guides.batch_id = ? ORDER BY guides.id`).all(batch.id);
  const guideXml = guides.map(guide => `<ans:guia><ans:numeroGuiaPrestador>${escapeXml(guide.id)}</ans:numeroGuiaPrestador><ans:beneficiario>${escapeXml(guide.patient)}</ans:beneficiario><ans:numeroCarteira>${escapeXml(guide.card_number)}</ans:numeroCarteira><ans:codigoTUSS>${escapeXml(guide.service_code)}</ans:codigoTUSS><ans:quantidade>${escapeXml(guide.quantity)}</ans:quantidade><ans:valorTotal>${(Number(guide.value_cents || 0) / 100).toFixed(2)}</ans:valorTotal></ans:guia>`).join('');
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8);
  const values = ['ENVIO_LOTE_GUIAS', batch.id.replace(/\D/g, '').slice(-12) || '1', date, time, batch.ansCode || '', TISS_VERSION, batch.id, ...guides.flatMap(guide => [guide.id, guide.patient, guide.card_number, guide.service_code, guide.quantity, (Number(guide.value_cents || 0) / 100).toFixed(2)])];
  const hash = calculateTissHash(values);
  const xml = `<?xml version="1.0" encoding="ISO-8859-1"?><ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas"><ans:cabecalho><ans:identificacaoTransacao><ans:tipoTransacao>ENVIO_LOTE_GUIAS</ans:tipoTransacao><ans:sequencialTransacao>${escapeXml(values[1])}</ans:sequencialTransacao><ans:dataRegistroTransacao>${date}</ans:dataRegistroTransacao><ans:horaRegistroTransacao>${time}</ans:horaRegistroTransacao></ans:identificacaoTransacao><ans:origem><ans:identificacaoPrestador><ans:CNPJ>${escapeXml(guides[0]?.provider_cnpj || '')}</ans:CNPJ></ans:identificacaoPrestador></ans:origem><ans:destino><ans:registroANS>${escapeXml(batch.ansCode)}</ans:registroANS></ans:destino><ans:Padrao>${TISS_VERSION}</ans:Padrao></ans:cabecalho><ans:prestadorParaOperadora><ans:loteGuias><ans:numeroLote>${escapeXml(batch.id)}</ans:numeroLote><ans:guiasTISS>${guideXml}</ans:guiasTISS></ans:loteGuias></ans:prestadorParaOperadora><ans:epilogo><ans:hash>${hash}</ans:hash></ans:epilogo></ans:mensagemTISS>`;
  const validation = await validateTissXml(xml);
  db.prepare('UPDATE billing_batches SET xml_generated = 1, xml_valid = ?, xml_validation_errors = ?, tiss_version = ? WHERE id = ? AND clinic_id = ?').run(validation.valid ? 1 : 0, JSON.stringify(validation.errors), TISS_VERSION, batch.id, req.session.clinicId);
  res.setHeader('X-TISS-Version', TISS_VERSION);
  res.setHeader('X-TISS-Valid', validation.valid ? 'true' : 'false');
  res.setHeader('Content-Type', 'application/xml; charset=ISO-8859-1');
  res.setHeader('Content-Disposition', `attachment; filename="lote-${batch.id}.xml"`);
  res.send(Buffer.from(xml, 'latin1'));
});

app.get('/api/batches/:id/package', auth, requireRole('admin', 'faturamento'), async (req, res) => {
  const batch = db.prepare(`SELECT billing_batches.id, billing_batches.clinic_id AS clinicId, billing_batches.competence,
    billing_batches.delivery_format AS deliveryFormat, insurers.name AS insurer, insurers.ans_code AS ansCode
    FROM billing_batches JOIN insurers ON insurers.id = billing_batches.insurer_id
    WHERE billing_batches.id = ? AND billing_batches.clinic_id = ?`).get(req.params.id, req.session.clinicId);
  if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });
  const guides = db.prepare(`SELECT guides.*, billing_batch_guides.signed_document_id AS signedDocumentId,
    patient_documents.storage_name AS storageName FROM billing_batch_guides JOIN guides ON guides.id = billing_batch_guides.guide_id
    LEFT JOIN patient_documents ON patient_documents.id = billing_batch_guides.signed_document_id
    WHERE billing_batch_guides.batch_id = ? ORDER BY guides.id`).all(batch.id);
  if (!guides.length) return res.status(409).json({ error: 'O lote não possui guias.' });
  const requiresPdf = ['pdf', 'both'].includes(batch.deliveryFormat), requiresXml = ['xml', 'both'].includes(batch.deliveryFormat);
  if (requiresPdf && guides.some(guide => !guide.signedDocumentId || !guide.storageName)) return res.status(409).json({ error: 'Anexe todos os PDFs assinados antes de gerar o pacote.' });
  const zip = new JSZip();
  if (requiresXml) {
    const generated = await buildBatchXml(batch, guides);
    db.prepare('UPDATE billing_batches SET xml_generated = 1, xml_valid = ?, xml_validation_errors = ?, tiss_version = ? WHERE id = ? AND clinic_id = ?').run(generated.validation.valid ? 1 : 0, JSON.stringify(generated.validation.errors), TISS_VERSION, batch.id, req.session.clinicId);
    if (!generated.validation.valid) return res.status(409).json({ error: 'O XML não passou na validação TISS. Corrija as pendências antes de gerar o pacote.', errors: generated.validation.errors });
    zip.file(`lote-${batch.id}.xml`, Buffer.from(generated.xml, 'latin1'));
  }
  if (requiresPdf) for (const guide of guides) {
    const filePath = path.join(documentUploadRoot, req.session.clinicId, guide.storageName);
    if (!fs.existsSync(filePath)) return res.status(409).json({ error: `O arquivo assinado da guia ${guide.id} não foi encontrado.` });
    zip.file(`pdf-assinados/guia-${guide.id}.pdf`, fs.readFileSync(filePath));
  }
  zip.file('manifesto.json', JSON.stringify({ batchId: batch.id, insurer: batch.insurer, competence: batch.competence, deliveryFormat: batch.deliveryFormat, tissVersion: TISS_VERSION, guideIds: guides.map(guide => guide.id), generatedAt: new Date().toISOString() }, null, 2));
  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const packageId = `PKG-${crypto.randomUUID()}`, storageName = `${Date.now()}-${packageId}.zip`;
  const clinicDirectory = path.join(documentUploadRoot, req.session.clinicId); fs.mkdirSync(clinicDirectory, { recursive: true });
  const storagePath = path.join(clinicDirectory, storageName), sha256 = crypto.createHash('sha256').update(archive).digest('hex');
  try { fs.writeFileSync(storagePath, archive, { flag: 'wx' }); db.prepare('INSERT INTO billing_delivery_packages (id, clinic_id, batch_id, storage_name, sha256, size_bytes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(packageId, req.session.clinicId, batch.id, storageName, sha256, archive.length, req.session.userId); }
  catch (error) { if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath); return res.status(409).json({ error: 'Não foi possível preservar a cópia do pacote.' }); }
  recordAudit(req, 'download', 'batches', batch.id, { document: 'delivery-package', deliveryFormat: batch.deliveryFormat, guideCount: guides.length });
  res.setHeader('X-Package-ID', packageId); res.setHeader('X-Content-SHA256', sha256);
  res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Length', archive.length);
  res.setHeader('Content-Disposition', `attachment; filename="pacote-${batch.id}.zip"`); res.send(archive);
});

app.get('/api/batches/:id/packages/:packageId', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const item = db.prepare('SELECT * FROM billing_delivery_packages WHERE id = ? AND batch_id = ? AND clinic_id = ?').get(req.params.packageId, req.params.id, req.session.clinicId);
  if (!item) return res.status(404).json({ error: 'Versão do pacote não encontrada.' });
  const storagePath = path.join(documentUploadRoot, req.session.clinicId, item.storage_name);
  if (!fs.existsSync(storagePath)) return res.status(404).json({ error: 'Cópia do pacote não encontrada no armazenamento.' });
  const archive = fs.readFileSync(storagePath), currentHash = crypto.createHash('sha256').update(archive).digest('hex');
  if (currentHash !== item.sha256 || archive.length !== Number(item.size_bytes)) {
    recordAudit(req, 'integrity_failure', 'batches', req.params.id, { document: 'archived-delivery-package', packageId: item.id });
    return res.status(409).json({ error: 'A cópia preservada falhou na verificação de integridade e não será entregue.' });
  }
  recordAudit(req, 'download', 'batches', req.params.id, { document: 'archived-delivery-package', packageId: item.id, sha256: item.sha256 });
  res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Length', item.size_bytes); res.setHeader('X-Content-SHA256', item.sha256);
  res.setHeader('Content-Disposition', `attachment; filename="pacote-${req.params.id}-${item.id}.zip"`); res.send(archive);
});

app.post('/api/batches/:id/followups', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const batch = db.prepare('SELECT id FROM billing_batches WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });
  const { contactDate, channel, outcome, notes = '', nextFollowupDate = '' } = req.body || {};
  const channels = ['portal', 'email', 'phone', 'whatsapp', 'other'];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(contactDate || '') || !channels.includes(channel) || !String(outcome || '').trim()) return res.status(400).json({ error: 'Informe data, canal e resultado do contato.' });
  if (nextFollowupDate && (!/^\d{4}-\d{2}-\d{2}$/.test(nextFollowupDate) || nextFollowupDate < contactDate)) return res.status(400).json({ error: 'A próxima cobrança não pode ser anterior ao contato realizado.' });
  const id = `BC-${crypto.randomUUID()}`;
  db.prepare('INSERT INTO billing_batch_followups (id, clinic_id, batch_id, contact_date, channel, outcome, notes, next_followup_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.session.clinicId, batch.id, contactDate, channel, String(outcome).trim().slice(0, 180), String(notes).trim().slice(0, 1000) || null, nextFollowupDate || null, req.session.userId);
  req.auditDetails = { batchFollowup: true, batchId: batch.id, channel, nextFollowupDate: nextFollowupDate || null };
  res.status(201).json({ id });
});

app.post('/api/batches/:id/payments', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const batch = db.prepare('SELECT id, status, received_cents AS receivedCents FROM billing_batches WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });
  if (!['sent', 'processing', 'approved', 'error'].includes(batch.status)) return res.status(409).json({ error: 'O lote precisa ter sido enviado antes de receber um crédito.' });
  const { paymentDate, amount, reference = '', notes = '' } = req.body || {};
  let amountCents;
  try { amountCents = parseReceivedAmount(amount); } catch (error) { return res.status(400).json({ error: error.message }); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate || '') || amountCents <= 0) return res.status(400).json({ error: 'Informe uma data e um valor de crédito maior que zero.' });
  const totalValueCents = db.prepare('SELECT COALESCE(SUM(guides.value_cents), 0) AS total FROM billing_batch_guides JOIN guides ON guides.id = billing_batch_guides.guide_id WHERE billing_batch_guides.batch_id = ?').get(batch.id).total;
  const outstanding = Math.max(0, Number(totalValueCents) - Number(batch.receivedCents || 0));
  if (amountCents > outstanding) return res.status(400).json({ error: `O crédito ultrapassa o saldo pendente de ${(outstanding / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.` });
  const id = `BP-${crypto.randomUUID()}`;
  db.transaction(() => {
    db.prepare('INSERT INTO billing_batch_payments (id, clinic_id, batch_id, payment_date, amount_cents, reference, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.session.clinicId, batch.id, paymentDate, amountCents, String(reference).trim().slice(0, 120) || null, String(notes).trim().slice(0, 500) || null, req.session.userId);
    db.prepare('UPDATE billing_batches SET received_cents = received_cents + ?, received_at = ? WHERE id = ? AND clinic_id = ?').run(amountCents, paymentDate, batch.id, req.session.clinicId);
  })();
  req.auditDetails = { batchPayment: true, batchId: batch.id, amountCents, paymentDate };
  res.status(201).json({ id, receivedCents: Number(batch.receivedCents || 0) + amountCents });
});

app.post('/api/batches/:id/payments/:paymentId/reverse', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5 || reason.length > 500) return res.status(400).json({ error: 'Informe uma justificativa entre 5 e 500 caracteres.' });
  const payment = db.prepare(`SELECT billing_batch_payments.id, billing_batch_payments.amount_cents AS amountCents,
      billing_batch_payments.reversed_at AS reversedAt, billing_batches.received_cents AS receivedCents,
      billing_batches.received_at AS receivedAt
    FROM billing_batch_payments JOIN billing_batches ON billing_batches.id = billing_batch_payments.batch_id
    WHERE billing_batch_payments.id = ? AND billing_batch_payments.batch_id = ? AND billing_batch_payments.clinic_id = ?`)
    .get(req.params.paymentId, req.params.id, req.session.clinicId);
  if (!payment) return res.status(404).json({ error: 'Crédito não encontrado neste lote.' });
  if (payment.reversedAt) return res.status(409).json({ error: 'Este crédito já foi estornado.' });
  let receivedCents;
  db.transaction(() => {
    db.prepare(`UPDATE billing_batch_payments SET reversed_at = CURRENT_TIMESTAMP, reversed_by = ?, reversal_reason = ?
      WHERE id = ? AND clinic_id = ? AND reversed_at IS NULL`).run(req.session.userId, reason, payment.id, req.session.clinicId);
    receivedCents = Math.max(0, Number(payment.receivedCents || 0) - Number(payment.amountCents || 0));
    const latestPayment = db.prepare(`SELECT payment_date AS paymentDate FROM billing_batch_payments
      WHERE batch_id = ? AND clinic_id = ? AND reversed_at IS NULL
      ORDER BY payment_date DESC, created_at DESC LIMIT 1`).get(req.params.id, req.session.clinicId);
    const receivedAt = latestPayment?.paymentDate || (receivedCents > 0 ? payment.receivedAt : null);
    db.prepare('UPDATE billing_batches SET received_cents = ?, received_at = ? WHERE id = ? AND clinic_id = ?')
      .run(receivedCents, receivedAt, req.params.id, req.session.clinicId);
  })();
  req.auditDetails = { batchPaymentReversal: true, batchId: req.params.id, paymentId: payment.id, amountCents: payment.amountCents };
  res.json({ id: payment.id, receivedCents });
});

app.get('/api/batches/:id/audit-pdf', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const raw = db.prepare(`SELECT billing_batches.id, billing_batches.clinic_id AS clinicId, billing_batches.competence,
    billing_batches.delivery_format AS deliveryFormat, billing_batches.status, billing_batches.protocol,
    billing_batches.sent_at AS sentAt, billing_batches.sent_package_id AS sentPackageId,
    billing_batches.xml_generated AS xmlGenerated, billing_batches.xml_valid AS xmlValid,
    billing_batches.xml_validation_errors AS xmlValidationErrors, billing_batches.tiss_version AS tissVersion,
    billing_batches.received_cents AS receivedCents, insurers.name AS insurer,
    (SELECT users.name FROM users WHERE users.id = billing_batches.sent_by) AS sentBy
    FROM billing_batches JOIN insurers ON insurers.id = billing_batches.insurer_id WHERE billing_batches.id = ? AND billing_batches.clinic_id = ?`).get(req.params.id, req.session.clinicId);
  if (!raw) return res.status(404).json({ error: 'Lote não encontrado.' });
  const clinic = db.prepare('SELECT * FROM clinics WHERE id = ?').get(req.session.clinicId);
  const settings = db.prepare('SELECT * FROM clinic_settings WHERE clinic_id = ?').get(req.session.clinicId);
  recordAudit(req, 'download', 'batches', raw.id, { document: 'batch-audit-pdf' });
  generateBatchAuditPDF(mapClinicSettings(settings, clinic), batchDetails({ ...raw, xmlGenerated: Boolean(raw.xmlGenerated) }), res);
});

app.patch('/api/batches/:id', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const allowedStatuses = ['draft', 'ready', 'sent', 'processing', 'approved', 'error'];
  const status = allowedStatuses.includes(req.body.status) ? req.body.status : 'draft';
  const protocol = String(req.body.protocol || '').trim();
  const requestedPackageId = String(req.body.packageId || '').trim();
  const batch = db.prepare(`SELECT id, status, delivery_format AS deliveryFormat, xml_generated AS xmlGenerated, xml_valid AS xmlValid,
    xml_validation_errors AS xmlValidationErrors, expected_payment_date AS expectedPaymentDate, received_cents AS receivedCents,
    received_at AS receivedAt, reconciliation_notes AS reconciliationNotes, sent_package_id AS sentPackageId
    FROM billing_batches WHERE id = ? AND clinic_id = ?`).get(req.params.id, req.session.clinicId);
  if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });
  let receivedCents;
  try { receivedCents = Object.hasOwn(req.body, 'receivedAmount') ? parseReceivedAmount(req.body.receivedAmount) : Number(batch.receivedCents || 0); } catch (error) { return res.status(400).json({ error: error.message }); }
  const expectedPaymentDate = Object.hasOwn(req.body, 'expectedPaymentDate') ? (/^\d{4}-\d{2}-\d{2}$/.test(req.body.expectedPaymentDate || '') ? req.body.expectedPaymentDate : null) : batch.expectedPaymentDate;
  const receivedAt = Object.hasOwn(req.body, 'receivedAt') ? (/^\d{4}-\d{2}-\d{2}$/.test(req.body.receivedAt || '') ? req.body.receivedAt : null) : batch.receivedAt;
  const reconciliationNotes = Object.hasOwn(req.body, 'reconciliationNotes') ? String(req.body.reconciliationNotes || '').trim().slice(0, 1000) : batch.reconciliationNotes;
  const currentStatus = batch.status;
  if (!canTransitionBatch(currentStatus, status)) return res.status(409).json({ error: `Transição inválida: altere o lote de ${currentStatus} para a próxima etapa do fluxo antes de usar ${status}.` });
  const readiness = batchDetails({ ...batch, clinicId: req.session.clinicId, xmlGenerated: Boolean(batch.xmlGenerated) });
  if (['ready', 'sent', 'processing', 'approved'].includes(status) && !readiness.readyForSending) return res.status(409).json({ error: 'Conclua os PDFs assinados e/ou gere o XML antes de liberar o lote.' });
  if (['sent', 'processing', 'approved'].includes(status) && !protocol) return res.status(400).json({ error: 'Informe o protocolo da operadora para esse status.' });
  let sentPackageId = batch.sentPackageId;
  if (status === 'sent' && currentStatus !== 'sent') {
    const selectedPackage = db.prepare('SELECT id FROM billing_delivery_packages WHERE id = ? AND batch_id = ? AND clinic_id = ?').get(requestedPackageId, batch.id, req.session.clinicId);
    if (!selectedPackage) return res.status(400).json({ error: 'Selecione o pacote preservado que foi enviado à operadora.' });
    sentPackageId = selectedPackage.id;
  }
  db.transaction(() => {
    db.prepare(`UPDATE billing_batches SET status = ?, protocol = ?, expected_payment_date = ?, received_cents = ?, received_at = ?, reconciliation_notes = ?,
      sent_at = CASE WHEN ? = 'sent' AND sent_at IS NULL THEN CURRENT_TIMESTAMP ELSE sent_at END,
      sent_package_id = CASE WHEN ? = 'sent' THEN ? ELSE sent_package_id END,
      sent_by = CASE WHEN ? = 'sent' AND sent_by IS NULL THEN ? ELSE sent_by END WHERE id = ? AND clinic_id = ?`)
      .run(status, protocol || null, expectedPaymentDate, receivedCents, receivedAt, reconciliationNotes || null, status, status, sentPackageId, status, req.session.userId, batch.id, req.session.clinicId);
    if (status !== currentStatus) db.prepare(`INSERT INTO billing_batch_status_history (id, clinic_id, batch_id, previous_status, new_status, changed_by)
      VALUES (?, ?, ?, ?, ?, ?)`).run(crypto.randomUUID(), req.session.clinicId, batch.id, currentStatus, status, req.session.userId);
  })();
  res.json({ id: batch.id, status, protocol, sentPackageId, receivedCents, reconciliationStatus: reconciliationStatus(readiness.totalValueCents, receivedCents) });
});

app.delete('/api/batches/:id', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const batch = db.prepare('SELECT status FROM billing_batches WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });
  if (batch.status !== 'draft') return res.status(409).json({ error: 'Somente lotes em preparação podem ser excluídos.' });
  db.prepare('DELETE FROM billing_batches WHERE id = ? AND clinic_id = ?').run(req.params.id, req.session.clinicId);
  res.status(204).end();
});

app.get('/api/feedbacks', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const feedbacks = db.prepare(`SELECT feedbacks.id, feedbacks.guide_id AS guideId, feedbacks.patient, feedbacks.professional, feedbacks.attendance_date AS attendanceDate, feedbacks.attendance_type AS attendanceType, feedbacks.content, feedbacks.photo, feedbacks.created_at AS createdAt, guides.competence AS guideCompetence, guides.procedure AS guideProcedure
    FROM feedbacks LEFT JOIN guides ON guides.id = feedbacks.guide_id AND guides.clinic_id = feedbacks.clinic_id
    WHERE feedbacks.clinic_id = ? ORDER BY feedbacks.created_at DESC`).all(req.session.clinicId);
  res.json(feedbacks);
});

app.post('/api/feedbacks', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const { id, guideId, patient, professional, attendanceDate, attendanceType, content, photo } = req.body;
  if (!id || !patient || !professional || !attendanceDate || !content) {
    return res.status(400).json({ error: 'Paciente, profissional, data do atendimento e o texto do feedback são obrigatórios.' });
  }
  if (guideId) {
    const guide = db.prepare('SELECT id, patient, competence, sessions_json FROM guides WHERE id = ? AND clinic_id = ?').get(guideId, req.session.clinicId);
    if (!guide) return res.status(400).json({ error: 'A guia selecionada não existe nesta clínica.' });
    if (guide.patient !== patient) return res.status(400).json({ error: 'A guia selecionada pertence a outro paciente.' });
    if (!feedbackDateBelongsToGuide(guide, attendanceDate)) return res.status(400).json({ error: 'A data do feedback não corresponde a um atendimento desta guia.' });
  }
  try {
    db.prepare('INSERT INTO feedbacks (id, clinic_id, guide_id, patient, professional, attendance_date, attendance_type, content, photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.session.clinicId, guideId || null, patient, professional, attendanceDate, attendanceType || null, content, photo || null);
    res.status(201).json({ id });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.delete('/api/feedbacks/:id', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const result = db.prepare('DELETE FROM feedbacks WHERE id = ? AND clinic_id = ?').run(req.params.id, req.session.clinicId);
  if (!result.changes) return res.status(404).json({ error: 'Feedback não encontrado.' });
  res.status(204).end();
});

app.get('/api/glosas', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const glosas = db.prepare(`SELECT glosas.id, glosas.guide_id AS guideId, glosas.code, glosas.reason,
    glosas.amount_cents AS amountCents, glosas.status, glosas.justification, glosas.created_at AS createdAt,
    glosas.resolved_at AS resolvedAt, glosas.recovered_cents AS recoveredCents, glosas.recovered_date AS recoveredDate,
    glosas.recovery_reference AS recoveryReference, glosas.recovery_notes AS recoveryNotes,
    glosas.recovery_recorded_at AS recoveryRecordedAt, users.name AS recoveredBy
    FROM glosas LEFT JOIN users ON users.id = glosas.recovered_by
    WHERE glosas.clinic_id = ? ORDER BY glosas.created_at DESC`).all(req.session.clinicId);
  res.json(glosas);
});

app.post('/api/guides/:id/glosa', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const { code, reason, amount } = req.body;
  if (!reason) return res.status(400).json({ error: 'Informe o motivo da glosa.' });
  const guide = db.prepare('SELECT id FROM guides WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!guide) return res.status(404).json({ error: 'Guia não encontrada.' });
  const glosaId = `GL-${Date.now()}`;
  try {
    const insertAndUpdate = db.transaction(() => {
      db.prepare('INSERT INTO glosas (id, clinic_id, guide_id, code, reason, amount_cents) VALUES (?, ?, ?, ?, ?, ?)').run(glosaId, req.session.clinicId, req.params.id, code || '', reason, moneyToCents(amount));
      db.prepare("UPDATE guides SET status = 'error' WHERE id = ? AND clinic_id = ?").run(req.params.id, req.session.clinicId);
    });
    insertAndUpdate();
    res.status(201).json({ id: glosaId });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.post('/api/glosas/:id/recurso', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const { justification } = req.body;
  if (!justification) return res.status(400).json({ error: 'Informe a justificativa do recurso.' });
  const glosa = db.prepare('SELECT * FROM glosas WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!glosa) return res.status(404).json({ error: 'Glosa não encontrada.' });
  const updateAll = db.transaction(() => {
    db.prepare("UPDATE glosas SET status = 'recurso_enviado', justification = ? WHERE id = ?").run(justification, req.params.id);
    db.prepare("UPDATE guides SET status = 'recurso' WHERE id = ? AND clinic_id = ?").run(glosa.guide_id, req.session.clinicId);
  });
  updateAll();
  res.json({ id: req.params.id, status: 'recurso_enviado' });
});

app.post('/api/glosas/:id/resolve', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const outcome = req.body.outcome === 'revertida' ? 'revertida' : 'mantida';
  const glosa = db.prepare('SELECT * FROM glosas WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!glosa) return res.status(404).json({ error: 'Glosa não encontrada.' });
  const updateAll = db.transaction(() => {
    db.prepare('UPDATE glosas SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?').run(outcome, req.params.id);
    db.prepare('UPDATE guides SET status = ? WHERE id = ? AND clinic_id = ?').run(outcome === 'revertida' ? 'approved' : 'error', glosa.guide_id, req.session.clinicId);
  });
  updateAll();
  res.json({ id: req.params.id, status: outcome });
});

app.post('/api/glosas/:id/recovery', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const glosa = db.prepare('SELECT id, status, amount_cents AS amountCents, recovered_cents AS recoveredCents FROM glosas WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!glosa) return res.status(404).json({ error: 'Glosa não encontrada.' });
  if (glosa.status !== 'revertida') return res.status(409).json({ error: 'A recuperação só pode ser baixada após a reversão da glosa.' });
  if (glosa.recoveredCents !== null) return res.status(409).json({ error: 'A recuperação desta glosa já foi registrada.' });
  const { recoveredDate, amount, reference = '', notes = '' } = req.body || {};
  let recoveredCents;
  try { recoveredCents = parseReceivedAmount(amount); } catch (error) { return res.status(400).json({ error: error.message }); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recoveredDate || '') || recoveredCents <= 0) return res.status(400).json({ error: 'Informe a data e um valor recuperado maior que zero.' });
  if (recoveredCents > Number(glosa.amountCents || 0)) return res.status(400).json({ error: 'O valor recuperado não pode ultrapassar o valor glosado.' });
  db.prepare(`UPDATE glosas SET recovered_cents = ?, recovered_date = ?, recovery_reference = ?, recovery_notes = ?,
    recovered_by = ?, recovery_recorded_at = CURRENT_TIMESTAMP WHERE id = ? AND clinic_id = ?`)
    .run(recoveredCents, recoveredDate, String(reference).trim().slice(0, 120) || null, String(notes).trim().slice(0, 500) || null, req.session.userId, glosa.id, req.session.clinicId);
  req.auditDetails = { glosaRecovery: true, glosaId: glosa.id, recoveredCents, recoveredDate };
  res.status(201).json({ id: glosa.id, recoveredCents });
});

app.use((error, req, res, next) => {
  if (error.message === 'Origem não autorizada.') return res.status(403).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: 'Erro interno do servidor.', requestId: req.requestId });
});

const server = app.listen(port, () => {
  console.log(`TISS Flow API disponível em http://localhost:${port}`);
  try { ensureDailyRecoveryPoints(); } catch (error) { console.error('Falha ao criar backup diário:', error.message); }
  const dailyBackupTimer = setInterval(() => {
    try { ensureDailyRecoveryPoints(); } catch (error) { console.error('Falha ao criar backup diário:', error.message); }
  }, 6 * 60 * 60 * 1000);
  dailyBackupTimer.unref();
});

function shutdown(signal) {
  console.log(`${signal} recebido; encerrando o servidor com segurança.`);
  server.close(() => { try { db.close(); } finally { process.exit(0); } });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
