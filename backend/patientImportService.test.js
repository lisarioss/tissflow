const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePatientCsv, isValidIsoDate, validatePatientImport } = require('./patientImportService');

test('parsePatientCsv lê ponto e vírgula e campos entre aspas', () => {
  const csv = 'nome;nascimento;convenio;carteira;plano;validade_plano\n"Ana; Maria";2010-01-02;Unimed;123;Plano A;2027-12-31';
  const parsed = parsePatientCsv(csv);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows[0].data.nome, 'Ana; Maria');
});

test('parsePatientCsv informa cabeçalhos obrigatórios ausentes', () => {
  const parsed = parsePatientCsv('nome;convenio\nAna;Unimed');
  assert.equal(parsed.rows.length, 0);
  assert.match(parsed.errors[0], /nascimento/);
});

test('isValidIsoDate rejeita datas impossíveis mesmo com formato correto', () => {
  assert.equal(isValidIsoDate('2026-02-28'), true);
  assert.equal(isValidIsoDate('2026-02-30'), false);
  assert.equal(isValidIsoDate('2026-13-01'), false);
});

test('validatePatientImport valida convênio, datas e duplicidades antes de inserir', () => {
  const parsed = parsePatientCsv('id;nome;nascimento;convenio;carteira;plano;validade_plano\nP-10;Ana;2010-01-02;Unimed;123;Plano A;2027-12-31\nP-11;Bia;data;Inexistente;123;Plano B;2027-12-31');
  const result = validatePatientImport(parsed.rows, [{ name: 'Unimed', ansCode: '004701' }], []);
  assert.equal(result.validRows.length, 1);
  assert.equal(result.validRows[0].ansCode, '004701');
  assert.equal(result.validRows[0].active, true);
  assert.match(result.errors[0], /nascimento deve ser uma data válida/);
  assert.match(result.errors[0], /convênio não cadastrado/);
});

test('validatePatientImport preserva paciente inativo em uma reimportação', () => {
  const parsed = parsePatientCsv('nome;nascimento;convenio;carteira;plano;validade_plano;ativo\nAna;2010-01-02;Unimed;123;Plano A;2027-12-31;não');
  const result = validatePatientImport(parsed.rows, [{ name: 'Unimed', ansCode: '004701' }], []);
  assert.equal(result.errors.length, 0);
  assert.equal(result.validRows[0].active, false);
});
