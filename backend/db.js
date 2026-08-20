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
  CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id),
    name TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    insurer TEXT NOT NULL,
    ans_code TEXT,
    card_number TEXT NOT NULL,
    plan TEXT NOT NULL,
    plan_validity TEXT NOT NULL,
    UNIQUE (clinic_id, card_number)
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

const guideColumns = db.prepare('PRAGMA table_info(guides)').all();
if (!guideColumns.some(column => column.name === 'sessions_json')) {
  db.exec("ALTER TABLE guides ADD COLUMN sessions_json TEXT NOT NULL DEFAULT '[]'");
}
db.prepare("UPDATE guides SET sessions_json = ? WHERE id = 'G-2026-00481' AND sessions_json = '[]'").run(JSON.stringify([
  { date: '2026-08-05', start: '08:00', end: '09:00', type: 'Terapia ABA', procedure: '50000000 - Atendimento terapêutico ABA', professional: 'Marina Souza' },
  { date: '2026-08-07', start: '08:00', end: '09:00', type: 'Terapia ABA', procedure: '50000000 - Atendimento terapêutico ABA', professional: 'Marina Souza' },
  { date: '2026-08-12', start: '08:00', end: '09:00', type: 'Terapia ABA', procedure: '50000000 - Atendimento terapêutico ABA', professional: 'Marina Souza' }
]));

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

const insertDemoPatient = db.prepare('INSERT OR IGNORE INTO patients (id, clinic_id, name, birth_date, insurer, ans_code, card_number, plan, plan_validity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
insertDemoPatient.run('P-001', 'sabia', 'Helena Martins', '1988-03-14', 'Unimed', '004701', '0123456789012', 'Unimed Nacional Apartamento', '2027-12-31');
insertDemoPatient.run('P-002', 'sabia', 'Rafael Nogueira', '2014-09-22', 'Bradesco Saúde', '005711', '9876543210001', 'Bradesco Efetivo', '2027-06-30');
insertDemoPatient.run('P-003', 'sabia', 'Bianca Torres', '1992-11-08', 'SulAmérica', '006246', '2468135790004', 'SulAmérica Exato', '2026-12-31');

module.exports = db;
