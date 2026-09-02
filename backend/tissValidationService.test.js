const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateTissHash, validateTissXml } = require('./tissValidationService');

test('calculateTissHash usa a concatenação dos valores em ISO-8859-1', () => {
  assert.equal(calculateTissHash(['ABC', '123']), 'bbf2dead374654cbb32a917afd236656');
});

test('validateTissXml rejeita XML fora do schema oficial', async () => {
  const result = await validateTissXml('<?xml version="1.0"?><mensagemTISS><loteGuias /></mensagemTISS>');
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});
