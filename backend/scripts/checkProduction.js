const path = require('path'); const fs = require('fs'); const dotenv = require('dotenv'); const { productionConfigurationChecks } = require('../productionCheckService');
const file = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', '..', '.env.production');
if (!fs.existsSync(file)) { console.error(`✗ Arquivo não encontrado: ${file}`); process.exit(1); }
const result = productionConfigurationChecks(dotenv.parse(fs.readFileSync(file)));
console.log(`\nTISSFlow · verificação de produção\n${file}\n`); result.checks.forEach(item => console.log(`${item.ready ? '✓' : '✗'} ${item.id}${item.ready ? '' : ` — ${item.detail}`}`)); console.log(result.ready ? '\n✓ Configuração externa pronta. Confirme também o painel de prontidão após iniciar o servidor.' : '\n✗ Corrija as pendências antes de publicar.'); process.exitCode = result.ready ? 0 : 1;
