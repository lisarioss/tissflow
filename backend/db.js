const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const demoPassword = process.env.DEMO_PASSWORD;
if (!demoPassword) throw new Error('DEMO_PASSWORD não configurado no arquivo backend/.env.');

const db = new Database(path.join(__dirname, 'tiss-flow.db'));
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS clinics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'faturamento', 'recepcao', 'medico')),
    UNIQUE (clinic_id, email)
  );
  CREATE TABLE IF NOT EXISTS guides (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id),
    patient TEXT NOT NULL,
    procedure TEXT NOT NULL,
    insurer TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent',
    value_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id),
    guide_id TEXT REFERENCES guides(id),
    provider TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    expected_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const clinicCount = db.prepare('SELECT COUNT(*) AS count FROM clinics').get().count;
if (clinicCount === 0) {
  const insertClinic = db.prepare('INSERT INTO clinics (id, name, unit) VALUES (?, ?, ?)');
  const insertUser = db.prepare('INSERT INTO users (id, clinic_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)');
  const insertGuide = db.prepare('INSERT INTO guides (id, clinic_id, patient, procedure, insurer, status, value_cents) VALUES (?, ?, ?, ?, ?, ?, ?)');

  const seed = db.transaction(() => {
    insertClinic.run('sabia', 'Clínica Sabiá', 'Unidade Centro');
    insertClinic.run('vital', 'Instituto Vital', 'Unidade Jardins');
    insertUser.run('marina', 'sabia', 'Marina Souza', 'marina@clinicasabia.com.br', bcrypt.hashSync(demoPassword, 10), 'admin');
    insertUser.run('fernando', 'sabia', 'Fernando Diniz', 'faturamento@clinicasabia.com.br', bcrypt.hashSync(demoPassword, 10), 'faturamento');
    insertUser.run('paulo', 'vital', 'Paulo Mendes', 'paulo@institutovital.com.br', bcrypt.hashSync(demoPassword, 10), 'admin');
    insertGuide.run('G-2026-00481', 'sabia', 'Helena Martins', 'Consulta ambulatorial', 'Unimed', 'approved', 18000);
    insertGuide.run('G-2026-00478', 'sabia', 'João Pedro Lima', 'Consulta ambulatorial', 'Amil', 'sent', 18000);
  });
  seed();
}

module.exports = db;
