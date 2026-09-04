function parseCsvLine(line, delimiter) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === delimiter && !quoted) { cells.push(value.trim()); value = ''; }
    else value += character;
  }
  cells.push(value.trim());
  return cells;
}

function parsePatientCsv(csvText) {
  const text = String(csvText || '').replace(/^\uFEFF/, '').trim();
  if (!text) return { rows: [], errors: ['O arquivo CSV está vazio.'] };
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const headers = parseCsvLine(lines[0], delimiter).map(header => header.trim().toLowerCase());
  const required = ['nome', 'nascimento', 'convenio', 'carteira', 'plano', 'validade_plano'];
  const missing = required.filter(header => !headers.includes(header));
  if (missing.length) return { rows: [], errors: [`Colunas obrigatórias ausentes: ${missing.join(', ')}.`] };
  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line, delimiter);
    return { line: index + 2, data: Object.fromEntries(headers.map((header, cellIndex) => [header, values[cellIndex] || ''])) };
  });
  return { rows, errors: [] };
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validatePatientImport(parsedRows, insurers, existingPatients) {
  const insurerByName = new Map(insurers.map(insurer => [String(insurer.name).trim().toLowerCase(), insurer]));
  const knownIds = new Set(existingPatients.map(patient => patient.id));
  const knownCards = new Set(existingPatients.map(patient => String(patient.cardNumber || patient.card_number)));
  const fileIds = new Set();
  const fileCards = new Set();
  const errors = [];
  const validRows = [];
  parsedRows.forEach(({ line, data }, index) => {
    const id = String(data.id || `P-IMP-${Date.now()}-${index + 1}`).trim();
    const insurer = insurerByName.get(String(data.convenio).trim().toLowerCase());
    const lineErrors = [];
    if (!data.nome) lineErrors.push('nome obrigatório');
    if (!isValidIsoDate(data.nascimento)) lineErrors.push('nascimento deve ser uma data válida em AAAA-MM-DD');
    if (!insurer) lineErrors.push('convênio não cadastrado');
    if (!data.carteira) lineErrors.push('carteira obrigatória');
    if (!data.plano) lineErrors.push('plano obrigatório');
    if (!isValidIsoDate(data.validade_plano)) lineErrors.push('validade_plano deve ser uma data válida em AAAA-MM-DD');
    if (knownIds.has(id) || fileIds.has(id)) lineErrors.push('ID duplicado');
    if (knownCards.has(data.carteira) || fileCards.has(data.carteira)) lineErrors.push('carteira duplicada');
    if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) lineErrors.push('e-mail inválido');
    if (lineErrors.length) errors.push(`Linha ${line}: ${lineErrors.join('; ')}.`);
    else {
      fileIds.add(id); fileCards.add(data.carteira);
      validRows.push({ id, name: data.nome, birthDate: data.nascimento, insurer: insurer.name, ansCode: data.codigo_ans || insurer.ansCode || '', cardNumber: data.carteira, plan: data.plano, planValidity: data.validade_plano, guardianName: data.responsavel || '', guardianRelationship: data.vinculo || '', guardianPhone: data.telefone || '', guardianEmail: data.email || '', active: !/^(n[aã]o|0|false)$/i.test(data.ativo || '') });
    }
  });
  return { validRows, errors };
}

module.exports = { parseCsvLine, parsePatientCsv, isValidIsoDate, validatePatientImport };
