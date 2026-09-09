function localTag(name) { return `(?:[A-Za-z_][\\w.-]*:)?${name}`; }

function textFrom(xml, name) {
  const match = String(xml).match(new RegExp(`<${localTag(name)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${localTag(name)}>`, 'i'));
  return match ? match[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : '';
}

function moneyToCents(value) {
  const amount = Number(String(value || '0').replace(',', '.'));
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0;
}

function parseTissOperatorReturn(xml) {
  const utf8 = Buffer.isBuffer(xml) ? xml.toString('utf8') : String(xml || '');
  const content = Buffer.isBuffer(xml) && /encoding=["'](?:ISO-8859-1|latin1)["']/i.test(utf8.slice(0, 160)) ? xml.toString('latin1') : utf8;
  if (!content.trim().startsWith('<')) throw new Error('O retorno da operadora não contém um XML válido.');
  const blocks = [...content.matchAll(new RegExp(`<${localTag('relacaoGuias')}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${localTag('relacaoGuias')}>`, 'gi'))].map(match => match[1]);
  const entries = blocks.map(block => {
    const guideId = textFrom(block, 'numeroGuiaPrestador');
    const releasedCents = moneyToCents(textFrom(block, 'valorLiberadoGuia'));
    const glosaCents = moneyToCents(textFrom(block, 'valorGlosaGuia'));
    const glosaCode = textFrom(block, 'codigoGlosa') || textFrom(block, 'tipoGlosa') || textFrom(block, 'codigoGlosaProtocolo');
    const observation = textFrom(block, 'observacao');
    return { guideId, releasedCents, glosaCents, glosaCode, reason: observation || (glosaCode ? `Glosa informada pela operadora · código ${glosaCode}` : '') };
  }).filter(entry => entry.guideId);
  if (!entries.length) throw new Error('Nenhuma guia identificada no XML de retorno. Verifique se o arquivo contém numeroGuiaPrestador.');
  return { protocol: textFrom(content, 'numeroProtocolo'), entries };
}

module.exports = { parseTissOperatorReturn };
