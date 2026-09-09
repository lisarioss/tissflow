const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decodeBatchDocument } = require('./batchDocumentService');

const dataUrl = (mime, text) => `data:${mime};base64,${Buffer.from(text).toString('base64')}`;

test('decodeBatchDocument aceita comprovantes PDF e retornos XML', () => {
  assert.equal(decodeBatchDocument({ category: 'protocol_receipt', mimeType: 'application/pdf', contentDataUrl: dataUrl('application/pdf', '%PDF-1.7') }).subarray(0, 5).toString(), '%PDF-');
  assert.match(decodeBatchDocument({ category: 'operator_return', mimeType: 'application/xml', contentDataUrl: dataUrl('application/xml', '<?xml version="1.0"?><retorno/>') }).toString(), /retorno/);
});

test('decodeBatchDocument rejeita categoria e conteúdo incompatíveis', () => {
  assert.throws(() => decodeBatchDocument({ category: 'invalida', mimeType: 'application/pdf', contentDataUrl: dataUrl('application/pdf', '%PDF-') }), /categoria válida/);
  assert.throws(() => decodeBatchDocument({ category: 'other', mimeType: 'application/pdf', contentDataUrl: dataUrl('application/pdf', 'não é pdf') }), /não corresponde/);
});
