const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateXML } = require('xmllint-wasm');

const TISS_VERSION = '4.03.00';
const SCHEMA_FILE = 'tissV4_03_00.xsd';
const schemaRoot = path.join(__dirname, 'schemas', 'ans-202511');

function findFile(directory, fileName) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(fullPath, fileName);
      if (found) return found;
    } else if (entry.name === fileName) return fullPath;
  }
  return null;
}

const mainSchemaPath = findFile(schemaRoot, SCHEMA_FILE);
if (!mainSchemaPath) throw new Error(`Schema oficial ${SCHEMA_FILE} não encontrado.`);
const communicationSchemaDirectory = path.dirname(mainSchemaPath);

function schemaInput(filePath) {
  return {
    fileName: path.basename(filePath),
    contents: fs.readFileSync(filePath, 'latin1')
  };
}

const mainSchema = schemaInput(mainSchemaPath);
const schemaDependencies = fs.readdirSync(communicationSchemaDirectory)
  .filter(fileName => fileName.endsWith('.xsd') && fileName !== SCHEMA_FILE)
  .map(fileName => schemaInput(path.join(communicationSchemaDirectory, fileName)));

async function validateTissXml(xml) {
  const result = await validateXML({
    xml: [{ fileName: 'lote-tiss.xml', contents: xml }],
    schema: [mainSchema],
    preload: schemaDependencies,
    maxMemoryPages: 8192
  });
  return {
    valid: result.valid,
    errors: result.errors.slice(0, 20).map(error => ({
      message: error.message,
      line: error.loc?.lineNumber || null
    }))
  };
}

// A ANS determina MD5 sobre a concatenação literal dos valores, em ISO-8859-1.
function calculateTissHash(values) {
  return crypto.createHash('md5').update(Buffer.from(values.map(value => String(value ?? '')).join(''), 'latin1')).digest('hex');
}

module.exports = { TISS_VERSION, calculateTissHash, validateTissXml };
