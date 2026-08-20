const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || 'tiss-flow-development-secret';

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

app.get('/api/guides', auth, (req, res) => {
  const guides = db.prepare('SELECT id, patient, procedure, insurer, status, value_cents AS valueCents, created_at AS createdAt FROM guides WHERE clinic_id = ? ORDER BY created_at DESC').all(req.session.clinicId);
  res.json(guides);
});

app.post('/api/guides', auth, (req, res) => {
  const { id, patient, procedure, insurer, status = 'sent', value } = req.body;
  if (!id || !patient || !procedure || !insurer) return res.status(400).json({ error: 'Paciente, procedimento, convênio e identificador são obrigatórios.' });
  try {
    db.prepare('INSERT INTO guides (id, clinic_id, patient, procedure, insurer, status, value_cents) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, req.session.clinicId, patient, procedure, insurer, status, moneyToCents(value));
    res.status(201).json({ id });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
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

app.get('/api/reports', auth, (req, res) => {
  const guides = db.prepare('SELECT status, COUNT(*) AS count FROM guides WHERE clinic_id = ? GROUP BY status').all(req.session.clinicId);
  const invoices = db.prepare('SELECT status, COALESCE(SUM(amount_cents), 0) AS amountCents FROM invoices WHERE clinic_id = ? GROUP BY status').all(req.session.clinicId);
  res.json({ guides, invoices });
});

app.listen(port, () => console.log(`TISS Flow API disponível em http://localhost:${port}`));
