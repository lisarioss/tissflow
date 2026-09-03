const PdfPrinter = require('pdfmake');
const fs = require('fs');
const path = require('path');

const printer = new PdfPrinter({ Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' } });
const text = value => String(value ?? '');
const ptDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '';
const minutes = value => { const [h = 0, m = 0] = text(value).split(':').map(Number); return h * 60 + m; };
const duration = session => Math.max(0, minutes(session.end) - minutes(session.start));
const hoursLabel = total => Number.isInteger(total / 60) ? `${total / 60}h` : `${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}`;
const competenceLabel = value => { if (!value || !/^\d{4}-\d{2}$/.test(value)) return text(value); const [year, month] = value.split('-'); return `${month}/${year}`; };
const field = (label, value, width = '*') => ({ width, stack: [{ text: label, fontSize: 6, bold: true }, { text: text(value) || ' ', fontSize: 8, margin: [0, 2, 0, 0] }], margin: [3, 3, 3, 4] });
const ownerBlock = (owner, compact = false) => ({ width: '*', alignment: 'center', stack: [{ text: '________________________________', fontSize: compact ? 6.5 : 8, margin: [0, compact ? 12 : 28, 0, 2] }, { text: 'RESPONSÁVEL PELA CLÍNICA', bold: true, fontSize: compact ? 6 : 7, color: '#496158', margin: [0, 0, 0, 2] }, { text: text(owner.name) || 'Responsável da clínica', bold: true, fontSize: compact ? 7 : 8 }, { text: [owner.title, owner.council].filter(Boolean).join(' - '), fontSize: compact ? 6 : 7, color: '#42534c' }] });
const insurerLogoFiles = {
  unimed: 'unimed.png',
  amil: 'amil.png',
  'bradesco saude': 'bradescosaude.png',
  sulamerica: 'sulamerica.png',
  promedica: 'promedica.png'
};
function insurerLogoPath(insurer) {
  const key = text(insurer).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const filename = insurerLogoFiles[key];
  if (!filename) return null;
  const logoPath = path.join(__dirname, '..', 'frontend', 'assets', 'planos', filename);
  return fs.existsSync(logoPath) ? logoPath : null;
}

function coverContent(clinic, guide, sessions) {
  const pointsPerMillimeter = 72 / 25.4;
  const headerSafeSpace = Math.max(20, Math.min(Number(clinic.letterheadHeaderMm) || 35, 70)) * pointsPerMillimeter;
  const footerSafeSpace = Math.max(15, Math.min(Number(clinic.letterheadFooterMm) || 25, 50)) * pointsPerMillimeter;
  const totalMinutes = sessions.reduce((sum, session) => sum + duration(session), 0);
  const activeOwners = clinic.owners.filter(owner => owner.active !== false);
  const owners = activeOwners.length ? activeOwners : [{ name: 'Responsável da clínica', isOwner: true }];
  const safeSessions = sessions.length ? sessions : [{}];
  const compact = safeSessions.length > 12;
  const ownerPositionY = clinic.letterheadDataUrl ? 841.89 - footerSafeSpace - (compact ? 58 : 82) : null;
  const sessionRows = safeSessions.map(session => {
    const registered = clinic.professionals.find(person => text(person.name).trim().toLocaleLowerCase('pt-BR') === text(session.professional).trim().toLocaleLowerCase('pt-BR'));
    const professionalLines = [session.professional || guide.professional, registered?.title, registered?.council || guide.professional_register].filter(Boolean).join(' - ');
    return [
    { text: ptDate(session.date), alignment: 'center', margin: [0, compact ? 1 : 7, 0, compact ? 1 : 7] },
    { text: session.start && session.end ? `${session.start} - ${session.end}` : hoursLabel(duration(session)), alignment: 'center', margin: [0, compact ? 1 : 7, 0, compact ? 1 : 7] },
    { stack: [{ text: professionalLines, fontSize: compact ? 5.7 : 7 }, { text: compact ? 'Ass.: ____________________' : '\nAss.: __________________________', fontSize: compact ? 5.7 : 6.5 }], margin: [4, compact ? 1 : 4, 3, compact ? 1 : 4] },
    { stack: [{ text: [guide.guardian_name, guide.guardian_relationship].filter(Boolean).join(' - '), fontSize: compact ? 5.7 : 7 }, { text: compact ? 'Ass.: ____________________' : '\nAss.: __________________________', fontSize: compact ? 5.7 : 6.5 }], margin: [4, compact ? 1 : 4, 3, compact ? 1 : 4] }
    ];
  });
  const infoCell = (label, value, options = {}) => ({
    stack: [
      { text: label, bold: true, fontSize: 6, color: '#496158', alignment: 'center' },
      { text: text(value) || 'Não informado', fontSize: 8, color: '#17241f', alignment: 'center', margin: [0, 4, 0, 0] }
    ],
    colSpan: options.colSpan,
    margin: [6, compact ? 3 : 6, 6, compact ? 4 : 7]
  });
  return [
    clinic.letterheadDataUrl ? { text: '', margin: [0, Math.max(headerSafeSpace - 24, 0), 0, 0] } : clinic.logoDataUrl ? { image: clinic.logoDataUrl, fit: [145, 68], alignment: 'center', margin: [0, 0, 0, 10] } : { text: clinic.tradeName, fontSize: 19, bold: true, color: '#173d30', alignment: 'center', margin: [0, 8, 0, 12] },
    { text: 'CAPA DE ATENDIMENTOS', fontSize: 13, bold: true, color: '#173d30', alignment: 'center', characterSpacing: 0.5 },
    { text: text(guide.attendance_type || 'Atendimentos terapêuticos').toUpperCase(), fontSize: 8, color: '#617168', alignment: 'center', margin: [0, 3, 0, compact ? 6 : 12] },
    { table: { widths: ['*', '*'], body: [[infoCell('PACIENTE', guide.patient), infoCell('CONVÊNIO', guide.insurer)], [infoCell('COMPETÊNCIA', competenceLabel(guide.competence) || ptDate(sessions[0]?.date)), infoCell('GUIA', guide.id)], [infoCell('PROCEDIMENTO TUSS', `${guide.service_code || text(sessions[0]?.procedure).split(' - ')[0]} - ${guide.procedure}`, { colSpan: 2 }), {}]] }, layout: { hLineColor: () => '#cdd9d3', vLineColor: () => '#cdd9d3', hLineWidth: () => 0.7, vLineWidth: () => 0.7, fillColor: rowIndex => rowIndex % 2 ? '#f7faf8' : '#ffffff' }, margin: [0, 0, 0, 12] },
    { table: { headerRows: 1, widths: [78, 65, '*', '*'], body: [[
      { text: 'DATA', bold: true, fillColor: '#d9e8f3', color: '#18364b', alignment: 'center', margin: [0, 4, 0, 4] },
      { text: 'HORÁRIO', bold: true, fillColor: '#d9e8f3', color: '#18364b', alignment: 'center', margin: [0, 4, 0, 4] },
      { text: 'PROFISSIONAL E ASSINATURA', bold: true, fillColor: '#d9e8f3', color: '#18364b', alignment: 'center', margin: [0, 4, 0, 4] },
      { text: 'RESPONSÁVEL PELO PACIENTE', bold: true, fillColor: '#d9e8f3', color: '#18364b', alignment: 'center', margin: [0, 4, 0, 4] }
    ], ...sessionRows, [{ text: 'TOTAL', bold: true, fillColor: '#eef4f0', margin: [4, compact ? 1 : 3, 0, compact ? 1 : 3] }, { text: hoursLabel(totalMinutes), bold: true, alignment: 'center', fillColor: '#eef4f0', margin: [0, compact ? 1 : 3, 0, compact ? 1 : 3] }, { text: `${sessions.length} atendimento(s)`, colSpan: 2, alignment: 'right', fillColor: '#eef4f0', margin: [0, compact ? 1 : 3, 5, compact ? 1 : 3] }, {}]] }, layout: { hLineWidth: () => 0.7, vLineWidth: () => 0.7, hLineColor: () => '#52665d', vLineColor: () => '#52665d' }, fontSize: compact ? 5.8 : 7.5, margin: [0, 0, 0, compact ? 10 : 24] },
    { text: 'Data de fechamento: ____/____/________', fontSize: compact ? 7 : 8, alignment: 'right', margin: clinic.letterheadDataUrl ? undefined : [0, 0, 4, compact ? 4 : 14], absolutePosition: clinic.letterheadDataUrl ? { x: 25, y: ownerPositionY - 22 } : undefined, width: clinic.letterheadDataUrl ? 541 : undefined },
    { columns: owners.map(owner => ownerBlock(owner, compact)), columnGap: 12, absolutePosition: clinic.letterheadDataUrl ? { x: 25, y: ownerPositionY } : undefined, width: clinic.letterheadDataUrl ? 545 : undefined },
    clinic.letterheadDataUrl ? { text: '' } : { text: [clinic.cnpj && `CNPJ: ${clinic.cnpj}`, clinic.phone && `Telefone: ${clinic.phone}`, clinic.instagram, [clinic.address, clinic.city && `${clinic.city}-${clinic.state}`, clinic.postalCode && `CEP ${clinic.postalCode}`].filter(Boolean).join(', ')].filter(Boolean).join('   |   '), fontSize: 7, color: '#555', alignment: 'center', absolutePosition: { x: 35, y: 790 }, width: 525 }
  ];
}

function guideContent(guide, sessions) {
  const procedures = sessions.length ? sessions : [{ procedure: guide.procedure, professional: guide.professional }];
  const planLogo = insurerLogoPath(guide.insurer);
  const box = (label, value = '', options = {}) => ({ width: options.width || '*', stack: [{ text: label, fontSize: 4.8, bold: true }, { text: text(value) || ' ', fontSize: 6.5, margin: [0, 1, 0, 0] }], margin: [2, 2, 2, 3] });
  const row = cells => ({ table: { widths: ['*'], body: [[{ columns: cells }]] }, layout: { hLineWidth: () => 0.6, vLineWidth: () => 0.6, hLineColor: () => '#111', vLineColor: () => '#111' }, margin: [0, 0, 0, 2] });
  const section = title => ({ text: title, bold: true, fontSize: 5.5, fillColor: '#dedede', margin: [2, 1, 0, 1] });
  const procedureRows = procedures.slice(0, 5).map((item, index) => [
    { text: String(index + 1), alignment: 'center' }, { text: ptDate(item.date) }, { text: item.start || '' }, { text: item.end || '' },
    { text: text(item.procedure).split(' - ')[0] || guide.service_code || '' }, { text: text(item.procedure).split(' - ').slice(1).join(' - ') || guide.procedure || '' },
    { text: '1', alignment: 'center' }, { text: (Number(guide.unit_value_cents || 0) / 100).toFixed(2).replace('.', ',') }, { text: (Number(guide.unit_value_cents || 0) / 100).toFixed(2).replace('.', ',') }
  ]);
  while (procedureRows.length < 5) procedureRows.push(Array.from({ length: 9 }, () => ({ text: ' ' })));
  return [
    { columns: [{ width: 120, stack: planLogo ? [{ image: planLogo, fit: [95, 35], alignment: 'left' }] : [{ text: guide.insurer || '', bold: true, fontSize: 8 }] }, { width: '*', text: 'GUIA DE SERVIÇO PROFISSIONAL / SERVIÇO AUXILIAR DE DIAGNÓSTICO E TERAPIA - SP/SADT', bold: true, fontSize: 9, alignment: 'center', margin: [0, 8, 0, 0] }, { width: 120, text: '2ª VIA - GUIA NO PRESTADOR', fontSize: 5.5, alignment: 'right', margin: [0, 2, 0, 0] }], pageBreak: 'before', pageOrientation: 'landscape', margin: [0, 0, 0, 3] },
    row([box('1 - Registro ANS', guide.ans_code), box('2 - Nº Guia no Prestador', guide.id), box('3 - Nº Guia Principal', '')]),
    section('DADOS DA AUTORIZAÇÃO'),
    row([box('4 - Data da Autorização', ''), box('5 - Senha', guide.authorization_number), box('6 - Data de Validade da Senha', ''), box('7 - Nº Guia Atribuído pela Operadora', guide.operator_guide)]),
    section('DADOS DO BENEFICIÁRIO'),
    row([box('8 - Número da Carteira', guide.card_number), box('9 - Validade da Carteira', guide.plan_validity), box('10 - Nome', guide.patient), box('11 - Cartão Nacional de Saúde', ''), box('12 - Atendimento a RN', 'N')]),
    section('DADOS DO CONTRATADO SOLICITANTE'),
    row([box('13 - Código na Operadora / CNPJ / CPF', guide.provider_cnpj), box('14 - Nome do Contratado', guide.provider_name), box('15 - Código CNES', '')]),
    row([box('16 - Nome do Profissional Solicitante', guide.professional), box('17 - Conselho Profissional', text(guide.professional_register).split(' ')[0]), box('18 - Nº no Conselho', text(guide.professional_register).split(' ').slice(1).join(' ')), box('19 - UF', ''), box('20 - Código CBO', '')]),
    row([box('21 - Assinatura do Profissional Solicitante', '\n')]),
    section('DADOS DA SOLICITAÇÃO / PROCEDIMENTOS OU ITENS ASSISTENCIAIS SOLICITADOS'),
    row([box('22 - Caráter do Atendimento', ''), box('23 - Data da Solicitação', guide.created_at ? text(guide.created_at).slice(0, 10) : ''), box('24 - Indicação Clínica', guide.cid ? `CID-10: ${guide.cid}` : '')]),
    { table: { headerRows: 1, widths: [28, 62, 62, '*', 42, 42], body: [[{ text: '25 - Tabela', bold: true }, { text: 'Código do Procedimento', bold: true }, { text: 'Descrição', bold: true }, { text: ' ', bold: true }, { text: 'Qtde. Solicitada', bold: true }, { text: 'Qtde. Autorizada', bold: true }], [{ text: '22' }, { text: guide.service_code || text(procedures[0]?.procedure).split(' - ')[0] }, { text: guide.procedure, colSpan: 2 }, {}, { text: text(guide.quantity || procedures.length), alignment: 'center' }, { text: text(guide.authorized_quantity || ''), alignment: 'center' }]] }, fontSize: 5.5, margin: [0, 0, 0, 2] },
    section('DADOS DA EXECUÇÃO / PROCEDIMENTOS E EXAMES REALIZADOS'),
    row([box('26 - Código na Operadora / CNPJ / CPF do Executante', guide.provider_cnpj), box('27 - Nome do Contratado Executante', guide.provider_name), box('28 - Código CNES', '')]),
    row([box('29 - Tipo de Atendimento', guide.attendance_type), box('30 - Indicação de Acidente', ''), box('31 - Tipo de Consulta', ''), box('32 - Motivo de Encerramento', '')]),
    { table: { headerRows: 1, widths: [18, 45, 34, 34, 56, '*', 28, 40, 40], body: [[{ text: 'Seq.', bold: true }, { text: 'Data', bold: true }, { text: 'Hora Inicial', bold: true }, { text: 'Hora Final', bold: true }, { text: 'Código', bold: true }, { text: '33 - Procedimentos Realizados', bold: true }, { text: 'Qtde.', bold: true }, { text: 'Valor Unit.', bold: true }, { text: 'Valor Total', bold: true }], ...procedureRows] }, fontSize: 5.2, margin: [0, 0, 0, 2] },
    section('IDENTIFICAÇÃO DO(S) PROFISSIONAL(IS) EXECUTANTE(S)'),
    { table: { headerRows: 1, widths: [55, '*', 55, 55, 35, 45], body: [[{ text: 'Código / CPF', bold: true }, { text: '46 - Nome do Profissional', bold: true }, { text: 'Conselho', bold: true }, { text: 'Nº Conselho', bold: true }, { text: 'UF', bold: true }, { text: 'CBO', bold: true }], ...Array.from(new Map(procedures.map(item => [item.professional || guide.professional, item])).values()).map(item => [{ text: '' }, { text: item.professional || guide.professional }, { text: text(guide.professional_register).split(' ')[0] }, { text: text(guide.professional_register).split(' ').slice(1).join(' ') }, { text: '' }, { text: '' }])] }, fontSize: 5.2, margin: [0, 0, 0, 2] },
    row([box('52 - Assinatura do Responsável pelo Atendimento', '\n'), box('53 - Assinatura do Beneficiário ou Responsável', '\n')]),
    section('TOTAIS DA GUIA'),
    row([box('54 - Total Procedimentos', (Number(guide.value_cents || 0) / 100).toFixed(2).replace('.', ',')), box('55 - Total Taxas', '0,00'), box('56 - Total Materiais', '0,00'), box('57 - Total Medicamentos', '0,00'), box('58 - Total OPME', '0,00'), box('59 - Total Gases', '0,00'), box('60 - Total Geral', (Number(guide.value_cents || 0) / 100).toFixed(2).replace('.', ','))])
  ];
}

function generateGuidePackagePDF(clinic, guide, res) {
  let sessions = [];
  try { sessions = JSON.parse(guide.sessions_json || '[]'); } catch { sessions = []; }
  const footerSafeSpace = clinic.letterheadDataUrl ? Math.max(15, Math.min(Number(clinic.letterheadFooterMm) || 25, 50)) * (72 / 25.4) : 30;
  const definition = { pageSize: 'A4', pageMargins: [25, 24, 25, footerSafeSpace], background: currentPage => currentPage === 1 && clinic.letterheadDataUrl ? { image: clinic.letterheadDataUrl, width: 595.28, height: 841.89, absolutePosition: { x: 0, y: 0 } } : null, defaultStyle: { font: 'Helvetica', fontSize: 9 }, content: [...coverContent(clinic, guide, sessions), ...guideContent(guide, sessions)], info: { title: `Capa e guia ${guide.id}`, author: clinic.tradeName } };
  const pdfDoc = printer.createPdfKitDocument(definition);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="capa-e-guia-${guide.id}.pdf"`);
  pdfDoc.pipe(res);
  pdfDoc.end();
}

function generateGuideAuditPDF(clinic, guide, feedbacks, res) {
  const rule = { hLineColor: () => '#cbd8d2', vLineColor: () => '#cbd8d2', hLineWidth: () => 0.7, vLineWidth: () => 0.7 };
  const dateRange = feedbacks.map(item => item.attendanceDate).filter(Boolean).sort();
  const feedbackBlocks = feedbacks.map((item, index) => ({
    unbreakable: true,
    margin: [0, 0, 0, 12],
    stack: [
      { table: { widths: [72, '*', 95], body: [[
        { text: ptDate(item.attendanceDate), bold: true, color: '#173d30', margin: [5, 5, 5, 5] },
        { text: item.professional, bold: true, margin: [5, 5, 5, 5] },
        { text: item.attendanceType || 'Atendimento', alignment: 'center', margin: [5, 5, 5, 5] }
      ]] }, layout: rule },
      { table: { widths: ['*'], body: [[{ text: item.content, lineHeight: 1.25, margin: [8, 8, 8, 8] }]] }, layout: rule },
      ...(item.photo && /^data:image\/(png|jpeg);base64,/i.test(item.photo) ? [{ image: item.photo, fit: [220, 130], alignment: 'center', margin: [0, 8, 0, 0] }] : []),
      { text: `Registro ${index + 1} de ${feedbacks.length} · ID ${item.id}`, fontSize: 7, color: '#718078', alignment: 'right', margin: [0, 4, 0, 0] }
    ]
  }));
  const definition = {
    pageSize: 'A4', pageMargins: [42, 48, 42, 48], defaultStyle: { font: 'Helvetica', fontSize: 9, color: '#17241f' },
    footer: (current, total) => ({ text: `Guia ${guide.id} · Página ${current} de ${total}`, alignment: 'center', fontSize: 7, color: '#718078', margin: [0, 16, 0, 0] }),
    content: [
      { columns: [clinic.logoDataUrl ? { image: clinic.logoDataUrl, fit: [110, 48], width: 125 } : { text: clinic.tradeName, bold: true, color: '#173d30', width: 180 }, { stack: [{ text: 'RELATÓRIO DE AUDITORIA ASSISTENCIAL', bold: true, fontSize: 15, color: '#173d30', alignment: 'right' }, { text: `Feedbacks vinculados à guia ${guide.id}`, fontSize: 8, color: '#607168', alignment: 'right', margin: [0, 4, 0, 0] }] }], margin: [0, 0, 0, 18] },
      { table: { widths: ['*', '*'], body: [
        [field('PACIENTE', guide.patient), field('CONVÊNIO', guide.insurer)],
        [field('COMPETÊNCIA', competenceLabel(guide.competence)), field('AUTORIZAÇÃO', guide.authorization_number)],
        [field('PROCEDIMENTO / TUSS', `${guide.service_code || ''} - ${guide.procedure}`, '*'), field('PERÍODO DOS REGISTROS', dateRange.length ? `${ptDate(dateRange[0])} a ${ptDate(dateRange.at(-1))}` : '')]
      ] }, layout: rule, margin: [0, 0, 0, 16] },
      { text: `${feedbacks.length} feedback(s) assistencial(is)`, bold: true, fontSize: 11, color: '#173d30', margin: [0, 0, 0, 10] },
      ...feedbackBlocks,
      { text: `Documento gerado em ${new Date().toLocaleString('pt-BR')} com registros vinculados à guia e às respectivas datas de atendimento.`, fontSize: 7, color: '#718078', margin: [0, 8, 0, 0] }
    ],
    info: { title: `Auditoria da guia ${guide.id}`, author: clinic.tradeName }
  };
  const pdfDoc = printer.createPdfKitDocument(definition);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="auditoria-guia-${guide.id}.pdf"`);
  pdfDoc.pipe(res);
  pdfDoc.end();
}

module.exports = { generateGuidePackagePDF, generateGuideAuditPDF };
