const path = require('path');

function resolveStoragePaths(environment = process.env, applicationDirectory = __dirname) {
  const production = environment.NODE_ENV === 'production';
  const configured = String(environment.DATA_DIR || '').trim();
  if (production && !configured) throw new Error('DATA_DIR deve apontar para um volume persistente em produção.');
  if (production && !path.isAbsolute(configured)) throw new Error('DATA_DIR deve ser um caminho absoluto em produção.');
  const dataDirectory = configured ? path.resolve(configured) : path.resolve(applicationDirectory);
  return {
    dataDirectory,
    databasePath: path.join(dataDirectory, 'tiss-flow.db'),
    documentUploadRoot: path.join(dataDirectory, 'uploads'),
    recoveryRoot: path.join(dataDirectory, 'recovery-backups')
  };
}

module.exports = { resolveStoragePaths };
