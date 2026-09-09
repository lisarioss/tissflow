const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTissOperatorReturn } = require('./tissReturnService');

test('interpreta guias liberadas e glosadas com namespace TISS', () => {
  const result = parseTissOperatorReturn(`<?xml version="1.0"?><ans:demonstrativo xmlns:ans="urn:tiss"><ans:numeroProtocolo>PROTO-9</ans:numeroProtocolo><ans:relacaoGuias><ans:numeroGuiaPrestador>G-1</ans:numeroGuiaPrestador><ans:valorLiberadoGuia>80.50</ans:valorLiberadoGuia><ans:valorGlosaGuia>19.50</ans:valorGlosaGuia><ans:motivoGlosaGuia><ans:codigoGlosa>1234</ans:codigoGlosa></ans:motivoGlosaGuia><ans:observacao>Documento incompleto</ans:observacao></ans:relacaoGuias><ans:relacaoGuias><ans:numeroGuiaPrestador>G-2</ans:numeroGuiaPrestador><ans:valorLiberadoGuia>75,00</ans:valorLiberadoGuia></ans:relacaoGuias></ans:demonstrativo>`);
  assert.equal(result.protocol, 'PROTO-9');
  assert.deepEqual(result.entries[0], { guideId: 'G-1', releasedCents: 8050, glosaCents: 1950, glosaCode: '1234', reason: 'Documento incompleto' });
  assert.equal(result.entries[1].releasedCents, 7500);
});

test('rejeita arquivo sem relação de guias', () => {
  assert.throws(() => parseTissOperatorReturn('<retorno><protocolo>1</protocolo></retorno>'), /Nenhuma guia/);
});
