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
    active INTEGER NOT NULL DEFAULT 1,
    UNIQUE (clinic_id, card_number)
  );
  CREATE TABLE IF NOT EXISTS guides (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id),
    patient TEXT NOT NULL,
    procedure TEXT NOT NULL,
    insurer TEXT NOT NULL,
    competence TEXT,
    ans_code TEXT,
    card_number TEXT,
    patient_birth TEXT,
    patient_plan TEXT,
    plan_validity TEXT,
    authorization_number TEXT,
    operator_guide TEXT,
    provider_name TEXT,
    provider_cnpj TEXT,
    professional TEXT,
    professional_register TEXT,
    attendance_type TEXT,
    service_code TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_value_cents INTEGER NOT NULL DEFAULT 0,
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
  CREATE TABLE IF NOT EXISTS glosas (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id),
    guide_id TEXT NOT NULL REFERENCES guides(id),
    code TEXT,
    reason TEXT NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'recurso_enviado', 'revertida', 'mantida')),
    justification TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT
  );
  CREATE TABLE IF NOT EXISTS insurers (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id),
    name TEXT NOT NULL,
    ans_code TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    provider_code TEXT,
    delivery_format TEXT NOT NULL DEFAULT 'both' CHECK (delivery_format IN ('pdf', 'xml', 'both')),
    accepted_procedures TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(clinic_id, name)
  );
  CREATE TABLE IF NOT EXISTS billing_batches (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id),
    insurer_id TEXT NOT NULL REFERENCES insurers(id),
    competence TEXT NOT NULL,
    delivery_format TEXT NOT NULL CHECK (delivery_format IN ('pdf', 'xml', 'both')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'sent', 'processing', 'approved', 'error')),
    protocol TEXT,
    sent_at TEXT,
    xml_generated INTEGER NOT NULL DEFAULT 0,
    xml_valid INTEGER NOT NULL DEFAULT 0,
    xml_validation_errors TEXT NOT NULL DEFAULT '[]',
    tiss_version TEXT NOT NULL DEFAULT '4.03.00',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(clinic_id, insurer_id, competence)
  );
  CREATE TABLE IF NOT EXISTS billing_batch_guides (
    batch_id TEXT NOT NULL REFERENCES billing_batches(id) ON DELETE CASCADE,
    guide_id TEXT NOT NULL REFERENCES guides(id),
    signed_pdf_received INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(batch_id, guide_id)
  );
  CREATE INDEX IF NOT EXISTS idx_billing_batches_clinic ON billing_batches(clinic_id, competence);
  CREATE INDEX IF NOT EXISTS idx_billing_batch_guides_guide ON billing_batch_guides(guide_id);
  CREATE TABLE IF NOT EXISTS authorizations (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id),
    patient_id TEXT NOT NULL REFERENCES patients(id),
    insurer_id TEXT NOT NULL REFERENCES insurers(id),
    authorization_number TEXT NOT NULL,
    valid_from TEXT NOT NULL,
    valid_to TEXT NOT NULL,
    authorized_quantity INTEGER NOT NULL DEFAULT 1,
    used_quantity INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(clinic_id, insurer_id, authorization_number)
  );
  CREATE INDEX IF NOT EXISTS idx_authorizations_expiry ON authorizations(clinic_id, valid_to);
  CREATE TABLE IF NOT EXISTS feedbacks (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id),
    guide_id TEXT REFERENCES guides(id),
    patient TEXT NOT NULL,
    professional TEXT NOT NULL,
    attendance_date TEXT NOT NULL,
    attendance_type TEXT,
    content TEXT NOT NULL,
    photo TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS clinic_settings (
    clinic_id TEXT PRIMARY KEY REFERENCES clinics(id),
    legal_name TEXT NOT NULL DEFAULT '',
    trade_name TEXT NOT NULL DEFAULT '',
    cnpj TEXT NOT NULL DEFAULT '',
    cnes TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    instagram TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    logo_data_url TEXT NOT NULL DEFAULT '',
    letterhead_data_url TEXT NOT NULL DEFAULT '',
    letterhead_header_mm INTEGER NOT NULL DEFAULT 35,
    letterhead_footer_mm INTEGER NOT NULL DEFAULT 25,
    owners_json TEXT NOT NULL DEFAULT '[]',
    professionals_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tuss_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_code TEXT NOT NULL,
    version TEXT NOT NULL,
    source_file TEXT NOT NULL,
    term_count INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(table_code, version)
  );
  CREATE TABLE IF NOT EXISTS tuss_terms (
    table_code TEXT NOT NULL,
    code TEXT NOT NULL,
    term TEXT NOT NULL,
    detailed_description TEXT,
    valid_from TEXT,
    valid_to TEXT,
    implementation_end TEXT,
    version TEXT NOT NULL,
    source_file TEXT NOT NULL,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(table_code, code, version)
  );
  CREATE INDEX IF NOT EXISTS idx_tuss_terms_search ON tuss_terms(table_code, version, code, term);
`);

const guideColumns = db.prepare('PRAGMA table_info(guides)').all();
const guideColumnNames = new Set(guideColumns.map(column => column.name));
const guideMigrations = {
  sessions_json: "ALTER TABLE guides ADD COLUMN sessions_json TEXT NOT NULL DEFAULT '[]'",
  competence: 'ALTER TABLE guides ADD COLUMN competence TEXT',
  ans_code: 'ALTER TABLE guides ADD COLUMN ans_code TEXT',
  card_number: 'ALTER TABLE guides ADD COLUMN card_number TEXT',
  patient_birth: 'ALTER TABLE guides ADD COLUMN patient_birth TEXT',
  patient_plan: 'ALTER TABLE guides ADD COLUMN patient_plan TEXT',
  plan_validity: 'ALTER TABLE guides ADD COLUMN plan_validity TEXT',
  authorization_number: 'ALTER TABLE guides ADD COLUMN authorization_number TEXT',
  operator_guide: 'ALTER TABLE guides ADD COLUMN operator_guide TEXT',
  provider_name: 'ALTER TABLE guides ADD COLUMN provider_name TEXT',
  provider_cnpj: 'ALTER TABLE guides ADD COLUMN provider_cnpj TEXT',
  professional: 'ALTER TABLE guides ADD COLUMN professional TEXT',
  professional_register: 'ALTER TABLE guides ADD COLUMN professional_register TEXT',
  attendance_type: 'ALTER TABLE guides ADD COLUMN attendance_type TEXT',
  service_code: 'ALTER TABLE guides ADD COLUMN service_code TEXT',
  quantity: 'ALTER TABLE guides ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1',
  unit_value_cents: 'ALTER TABLE guides ADD COLUMN unit_value_cents INTEGER NOT NULL DEFAULT 0',
  guide_type: "ALTER TABLE guides ADD COLUMN guide_type TEXT NOT NULL DEFAULT 'sp_sadt'",
  cid: 'ALTER TABLE guides ADD COLUMN cid TEXT',
  authorized_quantity: 'ALTER TABLE guides ADD COLUMN authorized_quantity INTEGER'
};
Object.entries(guideMigrations).forEach(([column, statement]) => { if (!guideColumnNames.has(column)) db.exec(statement); });
const patientColumns = new Set(db.prepare('PRAGMA table_info(patients)').all().map(column => column.name));
if (!patientColumns.has('active')) db.exec('ALTER TABLE patients ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
const settingsColumns = new Set(db.prepare('PRAGMA table_info(clinic_settings)').all().map(column => column.name));
if (!settingsColumns.has('letterhead_data_url')) db.exec("ALTER TABLE clinic_settings ADD COLUMN letterhead_data_url TEXT NOT NULL DEFAULT ''");
if (!settingsColumns.has('letterhead_header_mm')) db.exec('ALTER TABLE clinic_settings ADD COLUMN letterhead_header_mm INTEGER NOT NULL DEFAULT 35');
if (!settingsColumns.has('letterhead_footer_mm')) db.exec('ALTER TABLE clinic_settings ADD COLUMN letterhead_footer_mm INTEGER NOT NULL DEFAULT 25');
if (!settingsColumns.has('cnes')) db.exec("ALTER TABLE clinic_settings ADD COLUMN cnes TEXT NOT NULL DEFAULT ''");
const insurerColumns = new Set(db.prepare('PRAGMA table_info(insurers)').all().map(column => column.name));
if (!insurerColumns.has('procedure_rules')) db.exec("ALTER TABLE insurers ADD COLUMN procedure_rules TEXT NOT NULL DEFAULT '[]'");
if (!insurerColumns.has('delivery_format')) db.exec("ALTER TABLE insurers ADD COLUMN delivery_format TEXT NOT NULL DEFAULT 'both' CHECK (delivery_format IN ('pdf', 'xml', 'both'))");
if (!insurerColumns.has('provider_code')) db.exec('ALTER TABLE insurers ADD COLUMN provider_code TEXT');
const batchColumns = new Set(db.prepare('PRAGMA table_info(billing_batches)').all().map(column => column.name));
if (!batchColumns.has('xml_valid')) db.exec('ALTER TABLE billing_batches ADD COLUMN xml_valid INTEGER NOT NULL DEFAULT 0');
if (!batchColumns.has('xml_validation_errors')) db.exec("ALTER TABLE billing_batches ADD COLUMN xml_validation_errors TEXT NOT NULL DEFAULT '[]'");
if (!batchColumns.has('tiss_version')) db.exec("ALTER TABLE billing_batches ADD COLUMN tiss_version TEXT NOT NULL DEFAULT '4.03.00'");
const clinicCount = db.prepare('SELECT COUNT(*) AS count FROM clinics').get().count;
if (clinicCount === 0) {
  const insertClinic = db.prepare('INSERT INTO clinics (id, name, unit) VALUES (?, ?, ?)');
  const insertUser = db.prepare('INSERT INTO users (id, clinic_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)');
  const insertGuide = db.prepare('INSERT INTO guides (id, clinic_id, patient, procedure, insurer, status, value_cents, sessions_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insertPatient = db.prepare('INSERT INTO patients (id, clinic_id, name, birth_date, insurer, ans_code, card_number, plan, plan_validity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertInsurer = db.prepare('INSERT INTO insurers (id, clinic_id, name, ans_code, accepted_procedures) VALUES (?, ?, ?, ?, ?)');

  const seed = db.transaction(() => {
    insertClinic.run('sabia', 'Clínica Sabiá', 'Unidade Centro');
    insertClinic.run('vital', 'Instituto Vital', 'Unidade Jardins');
    insertUser.run('marina', 'sabia', 'Marina Souza', 'marina@clinicasabia.com.br', bcrypt.hashSync(demoPassword, 10), 'admin');
    insertUser.run('fernando', 'sabia', 'Fernando Diniz', 'faturamento@clinicasabia.com.br', bcrypt.hashSync(demoPassword, 10), 'faturamento');
    insertUser.run('paulo', 'vital', 'Paulo Mendes', 'paulo@institutovital.com.br', bcrypt.hashSync(demoPassword, 10), 'admin');
    insertGuide.run('G-2026-00481', 'sabia', 'Helena Martins', 'Consulta ambulatorial', 'Unimed', 'approved', 18000, JSON.stringify([
      { date: '2026-08-05', start: '08:00', end: '09:00', type: 'Terapia ABA', procedure: '50000000 - Atendimento terapêutico ABA', professional: 'Marina Souza' },
      { date: '2026-08-07', start: '08:00', end: '09:00', type: 'Terapia ABA', procedure: '50000000 - Atendimento terapêutico ABA', professional: 'Marina Souza' },
      { date: '2026-08-12', start: '08:00', end: '09:00', type: 'Terapia ABA', procedure: '50000000 - Atendimento terapêutico ABA', professional: 'Marina Souza' }
    ]));
    insertGuide.run('G-2026-00478', 'sabia', 'João Pedro Lima', 'Consulta ambulatorial', 'Amil', 'sent', 18000, '[]');
    insertPatient.run('P-001', 'sabia', 'Helena Martins', '1988-03-14', 'Unimed', '004701', '0123456789012', 'Unimed Nacional Apartamento', '2027-12-31');
    insertPatient.run('P-002', 'sabia', 'Rafael Nogueira', '2014-09-22', 'Bradesco Saúde', '005711', '9876543210001', 'Bradesco Efetivo', '2027-06-30');
    insertPatient.run('P-003', 'sabia', 'Bianca Torres', '1992-11-08', 'SulAmérica', '006246', '2468135790004', 'SulAmérica Exato', '2026-12-31');
    insertInsurer.run('INS-001', 'sabia', 'Unimed', '004701', JSON.stringify(['10101012', '50000470', '50000000', '40901122']));
    insertInsurer.run('INS-002', 'sabia', 'Bradesco Saúde', '005711', JSON.stringify(['10101012', '50000470', '40901122']));
    insertInsurer.run('INS-003', 'sabia', 'SulAmérica', '006246', JSON.stringify(['10101012', '50000470']));
    insertInsurer.run('INS-004', 'sabia', 'Amil', '326305', JSON.stringify(['10101012']));
    insertInsurer.run('INS-005', 'sabia', 'Promédica', '', JSON.stringify([]));
  });
  seed();
}


const demoSeed = db.transaction(() => {
  const insertDemoUser = db.prepare('INSERT OR IGNORE INTO users (id, clinic_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)');
  const demoUsers = [
    { id: 'julia', clinicId: 'sabia', name: 'Julia Andrade', email: 'recepcao@clinicasabia.com.br', role: 'recepcao' },
    { id: 'camila', clinicId: 'sabia', name: 'Camila Rocha', email: 'medica@clinicasabia.com.br', role: 'medico' },
    { id: 'leticia', clinicId: 'vital', name: 'Leticia Prado', email: 'recepcao@institutovital.com.br', role: 'recepcao' },
    { id: 'bruno', clinicId: 'vital', name: 'Bruno Castro', email: 'faturamento@institutovital.com.br', role: 'faturamento' }
  ];
  for (const u of demoUsers) insertDemoUser.run(u.id, u.clinicId, u.name, u.email, bcrypt.hashSync(demoPassword, 10), u.role);
});
demoSeed();

module.exports = db;
