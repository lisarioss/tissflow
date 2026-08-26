const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nextSequentialId, timeToMinutes, hasScheduleConflictWith, escapeXml } = require('./lib.js');

test('nextSequentialId gera o próximo número com base no maior ID existente', () => {
  const list = [{ id: 'G-2026-00478' }, { id: 'G-2026-00481' }];
  assert.equal(nextSequentialId(list, 'G-2026-', 5), 'G-2026-00482');
});

test('nextSequentialId não colide após remoção de itens (bug corrigido)', () => {
  // Antes da correção, o ID era baseado em list.length; ao remover uma guia
  // de uma lista de 3, list.length virava 2 e o próximo ID gerado colidia
  // com um ID já existente. Usar o maior número presente evita isso.
  const listAfterDeletion = [{ id: 'P-001' }, { id: 'P-003' }]; // P-002 foi removido
  assert.equal(nextSequentialId(listAfterDeletion, 'P-', 3), 'P-004');
});

test('nextSequentialId parte de 1 quando a lista está vazia', () => {
  assert.equal(nextSequentialId([], 'A-', 3), 'A-001');
});

test('timeToMinutes converte HH:MM para minutos desde meia-noite', () => {
  assert.equal(timeToMinutes('08:00'), 480);
  assert.equal(timeToMinutes('00:00'), 0);
  assert.equal(timeToMinutes('23:45'), 1425);
});

test('hasScheduleConflictWith detecta sobreposição de horário para o mesmo profissional/data', () => {
  const appointments = [{ professional: 'Marina Souza', date: '2026-08-10', start: '08:00', duration: 60 }];
  const conflict = hasScheduleConflictWith(appointments, { professional: 'Marina Souza', date: '2026-08-10', start: '08:30', duration: 30 });
  assert.ok(conflict, 'deveria encontrar conflito quando os intervalos se sobrepõem');
});

test('hasScheduleConflictWith não acusa conflito para profissionais diferentes no mesmo horário', () => {
  const appointments = [{ professional: 'Marina Souza', date: '2026-08-10', start: '08:00', duration: 60 }];
  const conflict = hasScheduleConflictWith(appointments, { professional: 'Fernando Diniz', date: '2026-08-10', start: '08:00', duration: 60 });
  assert.equal(conflict, undefined);
});

test('hasScheduleConflictWith não acusa conflito quando os horários apenas se tocam (sem sobreposição real)', () => {
  const appointments = [{ professional: 'Marina Souza', date: '2026-08-10', start: '08:00', duration: 60 }];
  // Atendimento das 09:00 às 09:30 começa exatamente quando o anterior termina (09:00) — não é sobreposição.
  const conflict = hasScheduleConflictWith(appointments, { professional: 'Marina Souza', date: '2026-08-10', start: '09:00', duration: 30 });
  assert.equal(conflict, undefined);
});

test('escapeXml escapa os cinco caracteres especiais de XML', () => {
  assert.equal(escapeXml(`<tag> & 'aspas' "duplas"`), '&lt;tag&gt; &amp; &apos;aspas&apos; &quot;duplas&quot;');
});

test('escapeXml previne injeção de marcação vinda de dados do formulário', () => {
  const nomeMalicioso = '</nomeBeneficiario><observacao>injetado';
  const escaped = escapeXml(nomeMalicioso);
  assert.ok(!escaped.includes('<'), 'não deve conter "<" literal após o escape');
  assert.ok(!escaped.includes('>'), 'não deve conter ">" literal após o escape');
});