function decodeSignedPdf(contentDataUrl, maxBytes = 6 * 1024 * 1024) {
  const match = String(contentDataUrl || '').match(/^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Envie o PDF assinado da guia.');
  const file = Buffer.from(match[1], 'base64');
  if (!file.length || file.length > maxBytes || file.subarray(0, 5).toString() !== '%PDF-') throw new Error('O arquivo deve ser um PDF válido de até 6 MB.');
  return file;
}

function signedPdfRequirementMet(guide) { return Boolean(guide?.signedDocumentId); }

module.exports = { decodeSignedPdf, signedPdfRequirementMet };
