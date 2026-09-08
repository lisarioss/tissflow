const crypto = require('crypto');

function encryptBackup(backup, password) {
  if (typeof password !== 'string' || password.length < 12) throw new Error('A senha do backup deve possuir pelo menos 12 caracteres.');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(backup), 'utf8'), cipher.final()]);
  return { format: 'tiss-flow-encrypted-backup', version: 1, cipher: 'AES-256-GCM', kdf: 'scrypt', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}

function decryptBackup(envelope, password) {
  if (!envelope || envelope.format !== 'tiss-flow-encrypted-backup' || envelope.version !== 1 || envelope.cipher !== 'AES-256-GCM' || envelope.kdf !== 'scrypt') throw new Error('Backup criptografado inválido ou incompatível.');
  try {
    const salt = Buffer.from(envelope.salt, 'base64'); const iv = Buffer.from(envelope.iv, 'base64'); const tag = Buffer.from(envelope.tag, 'base64');
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) throw new Error('invalid envelope');
    const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(password, salt, 32), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
  } catch { throw new Error('Senha incorreta ou arquivo criptografado corrompido.'); }
}

module.exports = { encryptBackup, decryptBackup };
