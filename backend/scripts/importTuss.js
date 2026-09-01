const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const db = require('../db');

function argument(name, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'object' && value.text) return String(value.text).trim();
  if (typeof value === 'object' && Array.isArray(value.richText)) return value.richText.map(part => part.text).join('').trim();
  return String(value).trim();
}

function codeText(value) {
  const raw = cellText(value);
  return /^\d+(\.0+)?$/.test(raw) ? raw.replace(/\.0+$/, '') : raw;
}

function isoDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  const raw = cellText(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
}

async function main() {
  const fileArg = argument('file');
  const version = argument('version');
  const tableCode = argument('table', '22');
  if (!fileArg || !version) throw new Error('Uso: npm run import:tuss -- --file="caminho.xlsx" --version=202603 --table=22');
  if (!/^\d{6}$/.test(version)) throw new Error('A versão deve usar o formato AAAAMM, por exemplo 202603.');
  if (!/^\d{1,3}$/.test(tableCode)) throw new Error('O código da tabela TUSS é inválido.');

  const sourcePath = path.resolve(fileArg);
  if (!fs.existsSync(sourcePath)) throw new Error(`Arquivo não encontrado: ${sourcePath}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(sourcePath);

  let sourceSheet;
  let headerRowNumber;
  workbook.eachSheet(sheet => {
    if (sourceSheet) return;
    sheet.eachRow((row, rowNumber) => {
      const values = row.values.slice(1).map(normalize);
      if (values.includes('codigo do termo') && values.includes('termo')) {
        sourceSheet = sheet;
        headerRowNumber = rowNumber;
      }
    });
  });
  if (!sourceSheet) throw new Error('Não foi possível localizar as colunas "Código do Termo" e "Termo".');

  const headers = sourceSheet.getRow(headerRowNumber).values.slice(1).map(normalize);
  const column = label => headers.indexOf(normalize(label)) + 1;
  const columns = {
    code: column('Código do Termo'), term: column('Termo'), description: column('Descrição Detalhada'),
    validFrom: column('Data de início de vigência'), validTo: column('Data de fim de vigência'),
    implementationEnd: column('Data de fim de implantação')
  };
  if (!columns.code || !columns.term) throw new Error('As colunas obrigatórias da TUSS não foram encontradas.');

  const records = [];
  for (let rowNumber = headerRowNumber + 1; rowNumber <= sourceSheet.rowCount; rowNumber += 1) {
    const row = sourceSheet.getRow(rowNumber);
    const code = codeText(row.getCell(columns.code).value);
    const term = cellText(row.getCell(columns.term).value);
    if (!code || !term) continue;
    records.push({
      code, term,
      description: columns.description ? cellText(row.getCell(columns.description).value) || null : null,
      validFrom: columns.validFrom ? isoDate(row.getCell(columns.validFrom).value) : null,
      validTo: columns.validTo ? isoDate(row.getCell(columns.validTo).value) : null,
      implementationEnd: columns.implementationEnd ? isoDate(row.getCell(columns.implementationEnd).value) : null
    });
  }
  if (!records.length) throw new Error('Nenhum termo TUSS válido foi encontrado.');

  const sourceFile = path.basename(sourcePath);
  const insert = db.prepare(`INSERT INTO tuss_terms (table_code, code, term, detailed_description, valid_from, valid_to, implementation_end, version, source_file)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const save = db.transaction(() => {
    db.prepare('DELETE FROM tuss_terms WHERE table_code = ? AND version = ?').run(tableCode, version);
    db.prepare('DELETE FROM tuss_imports WHERE table_code = ? AND version = ?').run(tableCode, version);
    for (const record of records) insert.run(tableCode, record.code, record.term, record.description, record.validFrom, record.validTo, record.implementationEnd, version, sourceFile);
    db.prepare('INSERT INTO tuss_imports (table_code, version, source_file, term_count) VALUES (?, ?, ?, ?)').run(tableCode, version, sourceFile, records.length);
  });
  save();
  console.log(`TUSS ${tableCode} versão ${version}: ${records.length} termos importados de ${sourceFile}.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.close());
