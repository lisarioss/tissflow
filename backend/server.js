const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) throw new Error('JWT_SECRET não configurado no arquivo backend/.env.');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

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

function moneyToCents(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'tiss-flow-api' }));

app.post('/api/auth/login', (req, res) => {
  const { clinicId, email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE clinic_id = ? AND lower(email) = lower(?)').get(clinicId, email);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) return res.status(401).json({ error: 'Credenciais inválidas.' });

  const token = jwt.sign({ userId: user.id, clinicId: user.clinic_id, role: user.role }, jwtSecret, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role }, clinicId: user.clinic_id });
});

app.get('/api/patients', auth, (req, res) => {
  const patients = db.prepare('SELECT id, name, birth_date AS birthDate, insurer, ans_code AS ansCode, card_number AS cardNumber, plan, plan_validity AS planValidity, active FROM patients WHERE clinic_id = ? ORDER BY active DESC, name').all(req.session.clinicId);
  res.json(patients);
});

app.post('/api/patients', auth, (req, res) => {
  const { id, name, birthDate, insurer, ansCode, cardNumber, plan, planValidity } = req.body;
  if (!id || !name || !birthDate || !insurer || !cardNumber || !plan || !planValidity) return res.status(400).json({ error: 'Nome, nascimento, convênio, carteira, plano e validade são obrigatórios.' });
  try {
    db.prepare('INSERT INTO patients (id, clinic_id, name, birth_date, insurer, ans_code, card_number, plan, plan_validity, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').run(id, req.session.clinicId, name, birthDate, insurer, ansCode || '', cardNumber, plan, planValidity);
    res.status(201).json({ id });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.patch('/api/patients/:id', auth, (req, res) => {
  const { name, birthDate, insurer, ansCode, cardNumber, plan, planValidity, active = 1 } = req.body;
  if (!name || !birthDate || !insurer || !cardNumber || !plan || !planValidity) return res.status(400).json({ error: 'Nome, nascimento, convênio, carteira, plano e validade são obrigatórios.' });
  const result = db.prepare('UPDATE patients SET name = ?, birth_date = ?, insurer = ?, ans_code = ?, card_number = ?, plan = ?, plan_validity = ?, active = ? WHERE id = ? AND clinic_id = ?').run(name, birthDate, insurer, ansCode || '', cardNumber, plan, planValidity, active ? 1 : 0, req.params.id, req.session.clinicId);
  if (!result.changes) return res.status(404).json({ error: 'Paciente não encontrado.' });
  res.json({ id: req.params.id });
});

app.get('/api/guides', auth, (req, res) => {
  const guides = db.prepare('SELECT id, patient, procedure, insurer, competence, ans_code AS ansCode, card_number AS cardNumber, patient_birth AS patientBirth, patient_plan AS patientPlan, plan_validity AS planValidity, authorization_number AS authorizationNumber, operator_guide AS operatorGuide, provider_name AS providerName, provider_cnpj AS providerCnpj, professional, professional_register AS professionalRegister, attendance_type AS attendanceType, service_code AS serviceCode, quantity, unit_value_cents AS unitValueCents, status, value_cents AS valueCents, sessions_json AS sessionsJson, guide_type AS guideType, created_at AS createdAt FROM guides WHERE clinic_id = ? ORDER BY created_at DESC').all(req.session.clinicId).map(guide => ({ ...guide, sessions: JSON.parse(guide.sessionsJson || '[]') }));
  res.json(guides);
});

app.post('/api/guides', auth, (req, res) => {
  const { id, patient, procedure, insurer, competence, ansCode, cardNumber, patientBirth, patientPlan, planValidity, authorizationNumber, operatorGuide, providerName, providerCnpj, professional, professionalRegister, attendanceType, serviceCode, quantity = 1, unitValue, status = 'sent', value, sessions = [], guideType = 'sp_sadt' } = req.body;
  if (!id || !patient || !procedure || !insurer) return res.status(400).json({ error: 'Paciente, procedimento, convênio e identificador são obrigatórios.' });
  try {
    db.prepare('INSERT INTO guides (id, clinic_id, patient, procedure, insurer, competence, ans_code, card_number, patient_birth, patient_plan, plan_validity, authorization_number, operator_guide, provider_name, provider_cnpj, professional, professional_register, attendance_type, service_code, quantity, unit_value_cents, status, value_cents, sessions_json, guide_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, req.session.clinicId, patient, procedure, insurer, competence || '', ansCode || '', cardNumber || '', patientBirth || '', patientPlan || '', planValidity || '', authorizationNumber || '', operatorGuide || '', providerName || '', providerCnpj || '', professional || '', professionalRegister || '', attendanceType || '', serviceCode || '', Number(quantity), moneyToCents(unitValue), status, moneyToCents(value), JSON.stringify(sessions), guideType);
    res.status(201).json({ id });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.patch('/api/guides/:id/sessions/:index', auth, (req, res) => {
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

app.post('/api/invoices', auth, (req, res) => {
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

app.patch('/api/invoices/:id/status', auth, (req, res) => {
  const status = req.body.status === 'received' ? 'received' : 'pending';
  const result = db.prepare('UPDATE invoices SET status = ? WHERE id = ? AND clinic_id = ?').run(status, req.params.id, req.session.clinicId);
  if (!result.changes) return res.status(404).json({ error: 'Nota não encontrada.' });
  res.json({ id: req.params.id, status });
});

app.delete('/api/invoices/:id', auth, (req, res) => {
  const result = db.prepare('DELETE FROM invoices WHERE id = ? AND clinic_id = ?').run(req.params.id, req.session.clinicId);
  if (!result.changes) return res.status(404).json({ error: 'Nota não encontrada.' });
  res.status(204).end();
});

app.get('/api/reports', auth, (req, res) => {
  const guides = db.prepare('SELECT status, COUNT(*) AS count FROM guides WHERE clinic_id = ? GROUP BY status').all(req.session.clinicId);
  const invoices = db.prepare('SELECT status, COALESCE(SUM(amount_cents), 0) AS amountCents FROM invoices WHERE clinic_id = ? GROUP BY status').all(req.session.clinicId);
  res.json({ guides, invoices });
});

app.get('/api/glosas', auth, (req, res) => {
  const glosas = db.prepare('SELECT id, guide_id AS guideId, code, reason, amount_cents AS amountCents, status, justification, created_at AS createdAt, resolved_at AS resolvedAt FROM glosas WHERE clinic_id = ? ORDER BY created_at DESC').all(req.session.clinicId);
  res.json(glosas);
});

app.post('/api/guides/:id/glosa', auth, (req, res) => {
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

app.post('/api/glosas/:id/recurso', auth, (req, res) => {
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

app.post('/api/glosas/:id/resolve', auth, (req, res) => {
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