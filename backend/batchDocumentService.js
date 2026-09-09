const allowedCategories = new Set(['protocol_receipt', 'operator_return', 'payment_statement', 'other']);
const allowedTypes = new Set(['application/pdf', 'application/xml', 'text/xml']);

function decodeBatchDocument({ category, mimeType, contentDataUrl }, maxBytes = 6 * 1024 * 1024) {
  if (!allowedCategories.has(category)) throw new Error('Selecione uma categoria válida para o documento.');
  if (!allowedTypes.has(mimeType)) throw new Error('Envie um arquivo PDF ou XML.');
  const escapedType = mimeType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(contentDataUrl || '').match(new RegExp(`^data:${escapedType};base64,([A-Za-z0-9+/=]+)$`));
  if (!match) throw new Error('O conteúdo do documento é inválido.');
  const file = Buffer.from(match[1], 'base64');
  if (!file.length || file.length > maxBytes) throw new Error('O documento deve possuir no máximo 6 MB.');
  const valid = mimeType === 'application/pdf' ? file.subarray(0, 5).toString() === '%PDF-' : file.toString('utf8', 0, Math.min(file.length, 200)).trimStart().startsWith('<?xml');
  if (!valid) throw new Error('O conteúdo não corresponde ao tipo de arquivo informado.');
  return file;
}

module.exports = { allowedCategories, allowedTypes, decodeBatchDocument };
