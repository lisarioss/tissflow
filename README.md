# TISS Flow

Protótipo de portfólio para operação de faturamento clínico. Demonstra o ciclo de vida de uma guia TISS — do preenchimento ao recurso de glosa — com autenticação real via API, geração de XML demonstrativo, validações de negócio e isolamento multi-clínica.

## Funcionalidades

- **Dois tipos de guia**: SP/SADT (competência com múltiplos atendimentos, ex. terapias recorrentes) e Consulta (atendimento avulso), cada uma gerando a tag TISS correspondente (`<guiaSP_SADT>` ou `<guiaConsulta>`) no XML.
- **Ciclo de glosa e recurso**: registro de glosa com código, motivo e valor; envio de recurso com justificativa; simulação de retorno da operadora (reversão ou manutenção).
- **Validações de negócio** (client-side e espelhadas no servidor):
  - Vigência do plano do beneficiário
  - Quantidade de atendimentos vs. quantidade pré-autorizada
  - Compatibilidade demonstrativa entre CID-10 e procedimento (tabela simplificada, não substitui a tabela oficial da ANS)
- **Autenticação real** via JWT + bcrypt, com dados persistidos em SQLite e isolados por `clinic_id` em todas as consultas.
- **Financeiro**: cadastro, baixa e exclusão de notas fiscais vinculadas a guias aprovadas.
- **Agenda**: checagem de conflito de horário por profissional/data.
- **Modo somente-visual**: guias, agenda, pacientes e notas fiscais funcionam offline via `localStorage` (ver limitações abaixo).

## Executar

Para usar apenas a demonstração visual, abra `frontend/index.html` no navegador. **Atenção:** o login sempre depende da API (`/api/auth/login`); sem o backend rodando, a tela de login não autentica. Guias, agenda, pacientes e notas fiscais têm fallback local em `localStorage` e continuam funcionando normalmente depois que a sessão é aberta com a API no ar.

Para iniciar a API local:

É necessário ter o Node.js 20 LTS instalado e disponível no PATH. O projeto usa `better-sqlite3`, que ainda pode exigir compilação manual no Node 24.

```bash
cd backend
npm install
npm start
```

No PowerShell do Windows, use `npm.cmd` caso a política de execução bloqueie o `npm.ps1`:

```powershell
cd backend
npm.cmd install
Copy-Item .env.example .env
npm.cmd start
```

A API ficará disponível em `http://localhost:3000` e servirá o front-end automaticamente. O banco SQLite `backend/tiss-flow.db` é criado (e populado com dados demo) na primeira execução.

### Testes automatizados

As funções puras do front-end (geração de ID sequencial, escape de XML, conflito de agenda, validações de negócio) ficam em `frontend/lib.js` e têm cobertura de testes com `node:test`:

```bash
cd frontend
npm test
```

## Estrutura

```text
frontend/
  index.html      esqueleto da interface
  app.js           lógica de renderização, formulários e chamadas à API
  lib.js           funções puras (testáveis) usadas por app.js
  lib.test.js      suíte de testes de lib.js
  styles.css       estilos
backend/
  server.js        API Express (auth, guias, glosas, pacientes, notas fiscais)
  db.js            schema SQLite, migrations e seed de dados demo
README.md          este arquivo
```

## Decisões técnicas

- **Sem framework de front-end**: HTML/CSS/JS puro, para deixar explícita a lógica de renderização e manipulação de DOM sem depender de build step.
- **SQLite via `better-sqlite3`**: suficiente para um protótipo single-tenant-per-clinic, com API síncrona que simplifica transações (usadas nos fluxos de glosa/recurso).
- **Migrations manuais em `db.js`**: cada coluna nova tem um `ALTER TABLE` idempotente, aplicado uma vez por coluna ausente — evita `DROP TABLE`/perda de dados ao evoluir o schema.
- **Funções puras extraídas para `lib.js`**: o restante de `app.js` manipula DOM diretamente e não é facilmente testável; separar a lógica de negócio permite testá-la sem um DOM simulado.

## Acesso da demonstração

Escolha uma clínica na tela de login (contas demo listadas na própria tela). O ambiente possui dois espaços fictícios (Clínica Sabiá e Instituto Vital) com dados isolados por `clinic_id` no banco.

## Limitações conhecidas

- O XML gerado é **demonstrativo**: segue a estrutura geral do padrão TISS 4.01, mas não foi validado contra o XSD oficial da ANS nem contempla epílogo/assinatura de lote.
- A tabela de compatibilidade CID-procedimento cobre só os quatro procedimentos usados no demo — não é uma base de conhecimento clínico real.
- Sem suporte a envio real para operadoras (webservice/portal) — o "envio" é a geração e download do XML.
- Sem RBAC granular: os papéis (admin/faturamento) existem nos dados demo, mas as rotas da API não restringem por papel ainda.

## Próximos passos

- Tela de Convênios com CRUD de operadoras (código ANS, tabela de procedimentos aceitos).
- Busca/filtro nas listagens de guias e pacientes.
- RBAC por papel nas rotas da API.
- Trilha de auditoria (quem alterou o quê e quando).