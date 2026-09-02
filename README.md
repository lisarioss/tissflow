# TISS Flow

Protótipo de portfólio para operação de faturamento clínico. Demonstra o ciclo de vida de uma guia TISS — do preenchimento ao recurso de glosa — com autenticação real via API, geração de XML demonstrativo, validações de negócio, RBAC e isolamento multi-clínica.

## Funcionalidades

- **Dois tipos de guia**: SP/SADT (competência com múltiplos atendimentos, ex. terapias recorrentes) e Consulta (atendimento avulso), cada uma gerando a tag TISS correspondente (`<guiaSP_SADT>` ou `<guiaConsulta>`) no XML.
- **Ciclo de glosa e recurso**: registro de glosa com código, motivo e valor; envio de recurso com justificativa; simulação de retorno da operadora (reversão ou manutenção).
- **Validações de negócio** (client-side e espelhadas no servidor):
  - Vigência do plano do beneficiário
  - Quantidade de atendimentos vs. quantidade pré-autorizada
  - Compatibilidade demonstrativa entre CID-10 e procedimento (tabela simplificada, não substitui a tabela oficial da ANS)
- **Convênios**: CRUD de operadoras (nome, código ANS, contato, forma de envio e procedimentos aceitos) que alimenta dinamicamente os seletores de guia e de paciente.
- **Lotes de faturamento**: agrupa guias por convênio e competência, confere os PDFs assinados, gera o XML exigido, registra o protocolo e bloqueia o envio enquanto houver pendências.
- **Feedback de atendimento**: profissionais registram evolução/observações por atendimento, com foto opcional e vínculo à guia faturada quando o paciente é de convênio; geração de PDF do feedback.
- **Autenticação real** via JWT + bcrypt, com dados persistidos em SQLite e isolados por `clinic_id` em todas as consultas.
- **RBAC nas rotas de escrita**: cada papel (admin, faturamento, recepção, médico) só cria/edita/exclui os recursos que a navegação já expõe para ele — reforçado no servidor, não só escondendo botões na UI.
- **Financeiro**: cadastro, baixa e exclusão de notas fiscais vinculadas a guias aprovadas.
- **Agenda**: checagem de conflito de horário por profissional/data.
- **Busca/filtro** nas listagens de guias, pacientes, convênios e feedbacks.
- **Relatórios**: distribuição de guias por status (incluindo em recurso), valor pendente/recebido e valor em glosa aberta.
- **Modo somente-visual**: guias, agenda, pacientes, convênios, feedbacks e notas fiscais funcionam offline via `localStorage` (ver limitações abaixo).
- **PDF da pasta da guia**: gera um arquivo A4 com a capa de atendimentos e a guia SP/SADT na página seguinte. A capa usa o timbrado, os responsáveis e os profissionais cadastrados em Configurações.
- **Catálogo TUSS oficial**: importa a planilha de procedimentos da ANS, preserva histórico por versão e disponibiliza busca por código ou descrição, considerando a vigência do termo.

### Configurar a capa e o timbrado

Entre com um usuário administrador e abra **Configurações**. Cadastre os dados institucionais, o logotipo (PNG ou JPEG), as proprietárias que assinam a capa e os profissionais da clínica. Em seguida, abra uma guia TISS e use **Gerar PDF da pasta**.

Cada pessoa deve ser informada em uma linha, no formato:

```text
Nome | Cargo ou especialidade | Conselho e registro
```

O PDF deixa os campos de assinatura em branco para assinatura manual do profissional e do responsável pela criança. O XML continua sendo gerado separadamente para transmissão eletrônica.

## Executar

Para usar apenas a demonstração visual, abra `frontend/index.html` no navegador. **Atenção:** o login sempre depende da API (`/api/auth/login`); sem o backend rodando, a tela de login não autentica. As demais telas têm fallback local em `localStorage` e continuam funcionando normalmente depois que a sessão é aberta com a API no ar.

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

### Atualizar o catálogo TUSS

Baixe no portal da ANS a planilha da tabela 22 da versão desejada e execute:

```powershell
cd backend
npm.cmd run import:tuss -- --file="caminho\tuss-22.xlsx" --version=202603 --table=22
```

O importador lê as colunas normativas, mantém os códigos como texto e substitui somente a mesma tabela e versão. A rota autenticada `GET /api/tuss?query=fisioterapia` pesquisa os termos vigentes; use `activeOn=AAAA-MM-DD` para consultar outra data e `includeInactive=true` para incluir termos encerrados.

### Testes automatizados

As funções puras do front-end (geração de ID sequencial, escape de XML, conflito de agenda, validações de negócio, filtros de busca) ficam em `frontend/lib.js` e têm cobertura de testes com `node:test`:

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
  server.js        API Express (auth, RBAC, guias, glosas, convênios, feedbacks, pacientes, notas fiscais)
  db.js            schema SQLite, migrations e seed de dados demo
  scripts/
    importTuss.js   importador versionado das planilhas oficiais TUSS
README.md          este arquivo
```

## Decisões técnicas

- **Sem framework de front-end**: HTML/CSS/JS puro, para deixar explícita a lógica de renderização e manipulação de DOM sem depender de build step.
- **SQLite via `better-sqlite3`**: suficiente para um protótipo single-tenant-per-clinic, com API síncrona que simplifica transações (usadas nos fluxos de glosa/recurso).
- **Migrations manuais em `db.js`**: cada coluna nova tem um `ALTER TABLE` idempotente, aplicado uma vez por coluna ausente — evita `DROP TABLE`/perda de dados ao evoluir o schema.
- **Funções puras extraídas para `lib.js`**: o restante de `app.js` manipula DOM diretamente e não é facilmente testável; separar a lógica de negócio permite testá-la sem um DOM simulado.
- **RBAC só no lado de escrita**: leitura (GET) continua aberta a qualquer usuário autenticado da clínica, porque o dashboard carrega todos os dados de uma vez no login. Restringir leitura por papel exigiria repensar esse carregamento; o que importa por segurança — impedir escrita indevida via chamada direta à API — já está coberto.
- **Feedback com foto em base64 no SQLite**: adequado para o volume de um protótipo; não é como se guardaria arquivo em produção (isso viraria object storage / S3).

## Acesso da demonstração

Escolha uma clínica na tela de login (contas demo listadas na própria tela). O ambiente possui dois espaços fictícios (Clínica Sabiá e Instituto Vital) com dados isolados por `clinic_id` no banco.

## Limitações conhecidas

- O XML gerado é **demonstrativo**: segue a estrutura geral do padrão TISS 4.01, mas não foi validado contra o XSD oficial da ANS nem contempla epílogo/assinatura de lote.
- A guia SP/SADT em PDF é um modelo imprimível baseado na estrutura visual fornecida, mas ainda precisa ser conferida campo a campo com a versão vigente do formulário da ANS antes do uso comercial.
- A tabela de compatibilidade CID-procedimento cobre só os quatro procedimentos usados no demo — não é uma base de conhecimento clínico real.
- Sem suporte a envio real para operadoras (webservice/portal) — o "envio" é a geração e download do XML.
- RBAC cobre rotas de escrita; leitura não é restrita por papel (ver decisões técnicas acima).
- Agenda existe só no `localStorage` — não é persistida no backend, então não sincroniza entre dispositivos/usuários.

## Próximos passos

- Persistir a agenda no backend (hoje é só local).
- Tela de Configurações real (hoje é placeholder).
- Ficha do paciente reunindo guias e feedbacks daquele paciente em um só lugar.
- Trilha de auditoria (quem alterou o quê e quando).
