const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decodeSignedPdf, signedPdfRequirementMet } = require('./signedPdfService');

test('decodeSignedPdf aceita somente conteúdo PDF real', () => {
  const dataUrl = `data:application/pdf;base64,${Buffer.from('%PDF-1.7\nconteudo').toString('base64')}`;
  assert.equal(decodeSignedPdf(dataUrl).subarray(0, 5).toString(), '%PDF-');
  assert.throws(() => decodeSignedPdf(`data:application/pdf;base64,${Buffer.from('arquivo falso').toString('base64')}`), /PDF válido/);
  assert.throws(() => decodeSignedPdf('data:image/png;base64,AAAA'), /PDF assinado/);
});

test('signedPdfRequirementMet exige documento vinculado, não uma marcação manual', () => {
  assert.equal(signedPdfRequirementMet({ signedPdfReceived: true }), false);
  assert.equal(signedPdfRequirementMet({ signedDocumentId: 'DOC-1' }), true);
});
