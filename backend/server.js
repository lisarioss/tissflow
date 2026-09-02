const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./db');
const { generateGuidePackagePDF } = require('./pdfService');

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) throw new Error('JWT_SECRET não configurado no arquivo backend/.env.');

app.use(cors());
app.use(express.json({ limit: '8mb' })); // fotos de feedback em base64 podem passar do limite padrão de 100kb
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('/login', (req, res) => res.redirect('/'));

function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token não informado.' });
  try {
    req.session = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}

// RBAC leve: restringe rotas de escrita por papel. Leitura (GET) continua
// aberta para qualquer usuário autenticado da clínica - o dashboard carrega
// tudo de uma vez hoje, então bloquear leitura por papel exigiria refatorar
// o carregamento de dados do front-end. O que importa por segurança é
// impedir que alguém sem o papel certo escreva/apague dados via chamada
// direta à API, mesmo que a UI já esconda os botões correspondentes.
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

function parseJsonArray(value) {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function guideCompetence(guide) {
  return guide.competence || parseJsonArray(guide.sessions_json)[0]?.date?.slice(0, 7) || '';
}

function mapClinicSettings(row, clinic) {
  return {
    legalName: row?.legal_name || clinic?.name || '', tradeName: row?.trade_name || clinic?.name || '',
    cnpj: row?.cnpj || '', phone: row?.phone || '', instagram: row?.instagram || '',
    address: row?.address || '', city: row?.city || '', state: row?.state || '', postalCode: row?.postal_code || '',
    logoDataUrl: row?.logo_data_url || '', letterheadDataUrl: row?.letterhead_data_url || '',
    letterheadHeaderMm: Number(row?.letterhead_header_mm || 35), letterheadFooterMm: Number(row?.letterhead_footer_mm || 25),
    owners: parseJsonArray(row?.owners_json), professionals: parseJsonArray(row?.professionals_json)
  };
}

app.post('/api/auth/login', (req, res) => {
  const { clinicId, email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE clinic_id = ? AND lower(email) = lower(?)').get(clinicId, email);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) return res.status(401).json({ error: 'Credenciais inválidas.' });

  const token = jwt.sign({ userId: user.id, clinicId: user.clinic_id, role: user.role }, jwtSecret, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role }, clinicId: user.clinic_id });
});

app.get('/api/settings', auth, (req, res) => {
  const clinic = db.prepare('SELECT id, name, unit FROM clinics WHERE id = ?').get(req.session.clinicId);
  const settings = db.prepare('SELECT * FROM clinic_settings WHERE clinic_id = ?').get(req.session.clinicId);
  res.json(mapClinicSettings(settings, clinic));
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
  const { legalName, tradeName, cnpj, phone, instagram, address, city, state, postalCode, logoDataUrl, letterheadDataUrl, letterheadHeaderMm = 35, letterheadFooterMm = 25, owners = [], professionals = [] } = req.body;
  if (!tradeName) return res.status(400).json({ error: 'O nome da clínica é obrigatório.' });
  if (!Array.isArray(owners) || !Array.isArray(professionals)) return res.status(400).json({ error: 'Responsáveis e profissionais devem ser listas.' });
  if (logoDataUrl && !/^data:image\/(png|jpeg);base64,/i.test(logoDataUrl)) return res.status(400).json({ error: 'Use um logotipo PNG ou JPEG.' });
  if (letterheadDataUrl && !/^data:image\/(png|jpeg);base64,/i.test(letterheadDataUrl)) return res.status(400).json({ error: 'Use um papel timbrado em PNG ou JPEG.' });
  const safeHeaderMm = Math.min(Math.max(Number(letterheadHeaderMm) || 35, 20), 70);
  const safeFooterMm = Math.min(Math.max(Number(letterheadFooterMm) || 25, 15), 50);
  db.prepare(`INSERT INTO clinic_settings (clinic_id, legal_name, trade_name, cnpj, phone, instagram, address, city, state, postal_code, logo_data_url, letterhead_data_url, letterhead_header_mm, letterhead_footer_mm, owners_json, professionals_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(clinic_id) DO UPDATE SET legal_name=excluded.legal_name, trade_name=excluded.trade_name, cnpj=excluded.cnpj, phone=excluded.phone, instagram=excluded.instagram, address=excluded.address, city=excluded.city, state=excluded.state, postal_code=excluded.postal_code, logo_data_url=excluded.logo_data_url, letterhead_data_url=excluded.letterhead_data_url, letterhead_header_mm=excluded.letterhead_header_mm, letterhead_footer_mm=excluded.letterhead_footer_mm, owners_json=excluded.owners_json, professionals_json=excluded.professionals_json, updated_at=CURRENT_TIMESTAMP`)
    .run(req.session.clinicId, legalName || '', tradeName, cnpj || '', phone || '', instagram || '', address || '', city || '', state || '', postalCode || '', logoDataUrl || '', letterheadDataUrl || '', safeHeaderMm, safeFooterMm, JSON.stringify(owners), JSON.stringify(professionals));
  res.json({ saved: true });
});

app.get('/api/guides/:id/pdf', auth, (req, res) => {
  const guide = db.prepare('SELECT * FROM guides WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!guide) return res.status(404).json({ error: 'Guia não encontrada.' });
  const clinic = db.prepare('SELECT id, name, unit FROM clinics WHERE id = ?').get(req.session.clinicId);
  const row = db.prepare('SELECT * FROM clinic_settings WHERE clinic_id = ?').get(req.session.clinicId);
  generateGuidePackagePDF(mapClinicSettings(row, clinic), guide, res);
});

app.get('/api/patients', auth, (req, res) => {
  const patients = db.prepare('SELECT id, name, birth_date AS birthDate, insurer, ans_code AS ansCode, card_number AS cardNumber, plan, plan_validity AS planValidity, active FROM patients WHERE clinic_id = ? ORDER BY active DESC, name').all(req.session.clinicId);
  res.json(patients);
});

app.post('/api/patients', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const { id, name, birthDate, insurer, ansCode, cardNumber, plan, planValidity } = req.body;
  if (!id || !name || !birthDate || !insurer || !cardNumber || !plan || !planValidity) return res.status(400).json({ error: 'Nome, nascimento, convênio, carteira, plano e validade são obrigatórios.' });
  try {
    db.prepare('INSERT INTO patients (id, clinic_id, name, birth_date, insurer, ans_code, card_number, plan, plan_validity, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').run(id, req.session.clinicId, name, birthDate, insurer, ansCode || '', cardNumber, plan, planValidity);
    res.status(201).json({ id });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.patch('/api/patients/:id', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const { name, birthDate, insurer, ansCode, cardNumber, plan, planValidity, active = 1 } = req.body;
  if (!name || !birthDate || !insurer || !cardNumber || !plan || !planValidity) return res.status(400).json({ error: 'Nome, nascimento, convênio, carteira, plano e validade são obrigatórios.' });
  const result = db.prepare('UPDATE patients SET name = ?, birth_date = ?, insurer = ?, ans_code = ?, card_number = ?, plan = ?, plan_validity = ?, active = ? WHERE id = ? AND clinic_id = ?').run(name, birthDate, insurer, ansCode || '', cardNumber, plan, planValidity, active ? 1 : 0, req.params.id, req.session.clinicId);
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

app.get('/api/invoices', auth, (req, res) => {
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
  const insurers = db.prepare('SELECT id, name, ans_code AS ansCode, contact_email AS contactEmail, contact_phone AS contactPhone, delivery_format AS deliveryFormat, accepted_procedures AS acceptedProcedures, procedure_rules AS procedureRules FROM insurers WHERE clinic_id = ? ORDER BY name').all(req.session.clinicId);
  res.json(insurers.map(insurer => ({ ...insurer, acceptedProcedures: JSON.parse(insurer.acceptedProcedures || '[]'), procedureRules: JSON.parse(insurer.procedureRules || '[]') })));
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
  const { id, name, ansCode, contactEmail, contactPhone, deliveryFormat = 'both', acceptedProcedures = [], procedureRules = [] } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'Nome e identificador são obrigatórios.' });
  if (!['pdf', 'xml', 'both'].includes(deliveryFormat)) return res.status(400).json({ error: 'Forma de envio inválida.' });
  try {
    const rules = normalizeProcedureRules(procedureRules);
    if (rules.some(rule => rule.validFrom && rule.validTo && rule.validFrom > rule.validTo)) return res.status(400).json({ error: 'A data final da vigência não pode ser anterior à data inicial.' });
    const unknownCodes = unknownProcedureCodes(rules);
    if (unknownCodes.length) return res.status(400).json({ error: `Código TUSS não encontrado na versão oficial: ${unknownCodes.join(', ')}.` });
    db.prepare('INSERT INTO insurers (id, clinic_id, name, ans_code, contact_email, contact_phone, delivery_format, accepted_procedures, procedure_rules) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.session.clinicId, name, ansCode || null, contactEmail || null, contactPhone || null, deliveryFormat, JSON.stringify(rules.length ? [...new Set(rules.map(rule => rule.code))] : acceptedProcedures), JSON.stringify(rules));
    res.status(201).json({ id });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.put('/api/insurers/:id', auth, requireRole('admin'), (req, res) => {
  const { name, ansCode, contactEmail, contactPhone, deliveryFormat = 'both', acceptedProcedures = [], procedureRules = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório.' });
  if (!['pdf', 'xml', 'both'].includes(deliveryFormat)) return res.status(400).json({ error: 'Forma de envio inválida.' });
  try {
    const rules = normalizeProcedureRules(procedureRules);
    if (rules.some(rule => rule.validFrom && rule.validTo && rule.validFrom > rule.validTo)) return res.status(400).json({ error: 'A data final da vigência não pode ser anterior à data inicial.' });
    const unknownCodes = unknownProcedureCodes(rules);
    if (unknownCodes.length) return res.status(400).json({ error: `Código TUSS não encontrado na versão oficial: ${unknownCodes.join(', ')}.` });
    const codes = rules.length ? [...new Set(rules.map(rule => rule.code))] : acceptedProcedures;
    const result = db.prepare('UPDATE insurers SET name = ?, ans_code = ?, contact_email = ?, contact_phone = ?, delivery_format = ?, accepted_procedures = ?, procedure_rules = ? WHERE id = ? AND clinic_id = ?').run(name, ansCode || null, contactEmail || null, contactPhone || null, deliveryFormat, JSON.stringify(codes), JSON.stringify(rules), req.params.id, req.session.clinicId);
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

function batchDetails(batch) {
  const guides = db.prepare(`SELECT guides.id, guides.patient, guides.procedure, guides.insurer, guides.competence,
      guides.value_cents AS valueCents, guides.status, billing_batch_guides.signed_pdf_received AS signedPdfReceived
    FROM billing_batch_guides
    JOIN guides ON guides.id = billing_batch_guides.guide_id
    WHERE billing_batch_guides.batch_id = ?
    ORDER BY guides.patient, guides.id`).all(batch.id);
  const requiresPdf = batch.deliveryFormat === 'pdf' || batch.deliveryFormat === 'both';
  const requiresXml = batch.deliveryFormat === 'xml' || batch.deliveryFormat === 'both';
  const missingSignedPdfs = requiresPdf ? guides.filter(guide => !guide.signedPdfReceived).length : 0;
  const xmlPending = requiresXml && !batch.xmlGenerated;
  return {
    ...batch,
    guideCount: guides.length,
    totalValueCents: guides.reduce((sum, guide) => sum + Number(guide.valueCents || 0), 0),
    missingSignedPdfs,
    xmlPending,
    readyForSending: guides.length > 0 && missingSignedPdfs === 0 && !xmlPending,
    guides: guides.map(guide => ({ ...guide, signedPdfReceived: Boolean(guide.signedPdfReceived) }))
  };
}

app.get('/api/batches', auth, (req, res) => {
  const batches = db.prepare(`SELECT billing_batches.id, billing_batches.insurer_id AS insurerId, insurers.name AS insurer,
      billing_batches.competence, billing_batches.delivery_format AS deliveryFormat, billing_batches.status,
      billing_batches.protocol, billing_batches.sent_at AS sentAt, billing_batches.xml_generated AS xmlGenerated,
      billing_batches.created_at AS createdAt
    FROM billing_batches
    JOIN insurers ON insurers.id = billing_batches.insurer_id
    WHERE billing_batches.clinic_id = ?
    ORDER BY billing_batches.competence DESC, billing_batches.created_at DESC`).all(req.session.clinicId);
  res.json(batches.map(batch => batchDetails({ ...batch, xmlGenerated: Boolean(batch.xmlGenerated) })));
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
    })();
    res.status(201).json({ id });
  } catch (error) {
    res.status(409).json({ error: error.message.includes('UNIQUE') ? 'Já existe um lote para esse convênio e competência.' : error.message });
  }
});

app.patch('/api/batches/:id/guides/:guideId', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const batch = db.prepare('SELECT id FROM billing_batches WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });
  const result = db.prepare('UPDATE billing_batch_guides SET signed_pdf_received = ? WHERE batch_id = ? AND guide_id = ?').run(req.body.signedPdfReceived ? 1 : 0, batch.id, req.params.guideId);
  if (!result.changes) return res.status(404).json({ error: 'Guia não encontrada neste lote.' });
  res.json({ batchId: batch.id, guideId: req.params.guideId, signedPdfReceived: Boolean(req.body.signedPdfReceived) });
});

function escapeXml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

app.get('/api/batches/:id/xml', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const batch = db.prepare(`SELECT billing_batches.*, insurers.name AS insurer, insurers.ans_code AS ansCode
    FROM billing_batches JOIN insurers ON insurers.id = billing_batches.insurer_id
    WHERE billing_batches.id = ? AND billing_batches.clinic_id = ?`).get(req.params.id, req.session.clinicId);
  if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });
  if (batch.delivery_format === 'pdf') return res.status(400).json({ error: 'Este convênio exige somente PDF assinado.' });
  const guides = db.prepare(`SELECT guides.* FROM billing_batch_guides JOIN guides ON guides.id = billing_batch_guides.guide_id WHERE billing_batch_guides.batch_id = ? ORDER BY guides.id`).all(batch.id);
  const guideXml = guides.map(guide => `<guia><numeroGuiaPrestador>${escapeXml(guide.id)}</numeroGuiaPrestador><beneficiario>${escapeXml(guide.patient)}</beneficiario><numeroCarteira>${escapeXml(guide.card_number)}</numeroCarteira><codigoTUSS>${escapeXml(guide.service_code)}</codigoTUSS><quantidade>${escapeXml(guide.quantity)}</quantidade><valorTotal>${(Number(guide.value_cents || 0) / 100).toFixed(2)}</valorTotal></guia>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><mensagemTISS versao="4.01.00"><loteGuias><numeroLote>${escapeXml(batch.id)}</numeroLote><registroANS>${escapeXml(batch.ansCode)}</registroANS><competencia>${escapeXml(batch.competence)}</competencia><guias>${guideXml}</guias></loteGuias></mensagemTISS>`;
  db.prepare('UPDATE billing_batches SET xml_generated = 1 WHERE id = ? AND clinic_id = ?').run(batch.id, req.session.clinicId);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="lote-${batch.id}.xml"`);
  res.send(xml);
});

app.patch('/api/batches/:id', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const allowedStatuses = ['draft', 'ready', 'sent', 'processing', 'approved', 'error'];
  const status = allowedStatuses.includes(req.body.status) ? req.body.status : 'draft';
  const protocol = String(req.body.protocol || '').trim();
  const batch = db.prepare(`SELECT id, delivery_format AS deliveryFormat, xml_generated AS xmlGenerated FROM billing_batches WHERE id = ? AND clinic_id = ?`).get(req.params.id, req.session.clinicId);
  if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });
  const readiness = batchDetails({ ...batch, xmlGenerated: Boolean(batch.xmlGenerated) });
  if (['ready', 'sent', 'processing', 'approved'].includes(status) && !readiness.readyForSending) return res.status(409).json({ error: 'Conclua os PDFs assinados e/ou gere o XML antes de liberar o lote.' });
  if (['sent', 'processing', 'approved'].includes(status) && !protocol) return res.status(400).json({ error: 'Informe o protocolo da operadora para esse status.' });
  db.prepare(`UPDATE billing_batches SET status = ?, protocol = ?, sent_at = CASE WHEN ? = 'sent' AND sent_at IS NULL THEN CURRENT_TIMESTAMP ELSE sent_at END WHERE id = ? AND clinic_id = ?`).run(status, protocol || null, status, batch.id, req.session.clinicId);
  res.json({ id: batch.id, status, protocol });
});

app.delete('/api/batches/:id', auth, requireRole('admin', 'faturamento'), (req, res) => {
  const batch = db.prepare('SELECT status FROM billing_batches WHERE id = ? AND clinic_id = ?').get(req.params.id, req.session.clinicId);
  if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });
  if (batch.status !== 'draft') return res.status(409).json({ error: 'Somente lotes em preparação podem ser excluídos.' });
  db.prepare('DELETE FROM billing_batches WHERE id = ? AND clinic_id = ?').run(req.params.id, req.session.clinicId);
  res.status(204).end();
});

app.get('/api/feedbacks', auth, (req, res) => {
  const feedbacks = db.prepare('SELECT id, guide_id AS guideId, patient, professional, attendance_date AS attendanceDate, attendance_type AS attendanceType, content, photo, created_at AS createdAt FROM feedbacks WHERE clinic_id = ? ORDER BY created_at DESC').all(req.session.clinicId);
  res.json(feedbacks);
});

app.post('/api/feedbacks', auth, requireRole('admin', 'recepcao', 'medico'), (req, res) => {
  const { id, guideId, patient, professional, attendanceDate, attendanceType, content, photo } = req.body;
  if (!id || !patient || !professional || !attendanceDate || !content) {
    return res.status(400).json({ error: 'Paciente, profissional, data do atendimento e o texto do feedback são obrigatórios.' });
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

app.get('/api/glosas', auth, (req, res) => {
  const glosas = db.prepare('SELECT id, guide_id AS guideId, code, reason, amount_cents AS amountCents, status, justification, created_at AS createdAt, resolved_at AS resolvedAt FROM glosas WHERE clinic_id = ? ORDER BY created_at DESC').all(req.session.clinicId);
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

app.listen(port, () => console.log(`TISS Flow API disponível em http://localhost:${port}`));
