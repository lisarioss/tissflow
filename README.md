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
- **Controle de autorizações**: registra a guia/senha autorizada por paciente, período de validade, quantidade liberada e utilizada; destaca autorizações vigentes, próximas do vencimento ou vencidas e permite atualizar o saldo de sessões.
- **Validação TISS oficial**: confere o XML com os schemas de Comunicação 04.03.00 publicados pela ANS, calcula o hash MD5 em ISO-8859-1 e mantém inválido qualquer lote que não passe no XSD.
- **Feedback de atendimento**: profissionais registram evolução/observações por atendimento, com foto opcional e vínculo validado pelo paciente e pela data da guia faturada; geração do PDF individual e de um relatório consolidado por guia para auditoria.
- **Pasta do paciente**: reúne cadastro, guias e PDFs, feedbacks, autorizações, agenda, lotes, notas e glosas relacionados ao mesmo paciente, com acesso direto aos documentos.
- **Documentos do paciente**: armazena PDFs e imagens em diretórios separados por clínica, com categoria, validade, vínculo opcional à guia/autorização e controle de download e exclusão.
- **Responsável legal e consentimento**: registra vínculo, contato e situação do consentimento do paciente; o nome do responsável é reaproveitado automaticamente na capa para assinatura.
- **Termo de consentimento em PDF**: gera pela pasta do paciente um modelo administrativo no timbrado da clínica, preenchido com paciente e responsável, para impressão, assinatura e posterior armazenamento do arquivo assinado.
- **Trilha de auditoria**: registra automaticamente criações, alterações, exclusões e downloads, identificando usuário, data, registro e origem sem duplicar conteúdo clínico sensível no log.
- **Autenticação real** via JWT + bcrypt, com dados persistidos em SQLite e isolados por `clinic_id` em todas as consultas.
- **RBAC no servidor**: cada papel (admin, faturamento, recepção, médico) só consulta ou altera os recursos necessários ao seu trabalho; dados financeiros, feedbacks, documentos e agenda possuem leitura protegida pela API, não apenas menus ocultos.
- **Gestão de usuários**: administradores cadastram a equipe, definem perfis, redefinem senhas e desativam acessos sem apagar o histórico; o sistema impede a remoção do último administrador ativo.
- **Central de notificações**: reúne por perfil autorizações e documentos vencendo, saldos de sessões baixos, lotes incompletos, guias com glosa e atendimentos próximos.
- **Dashboard dinâmico**: apresenta indicadores calculados com as guias, notas, lotes, autorizações e agenda reais da clínica, respeitando os dados que cada perfil pode visualizar.
- **Backup por clínica**: administradores exportam um arquivo JSON versionado com os registros e documentos da sua clínica, sem hashes de senha e com o download registrado na auditoria.
- **Onboarding de clínicas**: cria um novo espaço isolado, suas configurações iniciais e o primeiro administrador diretamente pela tela de acesso.
- **Proteção da API**: limita tentativas de autenticação e cadastro, restringe origens pelo ambiente, desativa cache de respostas sensíveis e aplica cabeçalhos contra incorporação e execução indevida.
- **Financeiro**: cadastro, baixa e exclusão de notas fiscais vinculadas a guias aprovadas.
- **Agenda compartilhada**: horários persistidos no servidor, checagem de conflitos, recorrência semanal de até 24 semanas e controle de confirmação, presença, falta e cancelamento. A presença consome uma sessão da autorização válida e libera o feedback já pré-preenchido.
- **Busca/filtro** nas listagens de guias, pacientes, convênios e feedbacks.
- **Relatórios**: distribuição de guias por status (incluindo em recurso), valor pendente/recebido e valor em glosa aberta.
- **Exportação para Excel**: gera relatórios CSV de guias, financeiro, glosas e autorizações, com filtro por competência, isolamento por clínica e registro de download na auditoria.
- **Modo somente-visual**: guias, agenda, pacientes, convênios, feedbacks e notas fiscais funcionam offline via `localStorage` (ver limitações abaixo).
- **PDF da pasta da guia**: gera um arquivo A4 com a capa de atendimentos e a guia SP/SADT na página seguinte. A capa usa o timbrado, os responsáveis e os profissionais cadastrados em Configurações.
- **Catálogo TUSS oficial**: importa a planilha de procedimentos da ANS, preserva histórico por versão e disponibiliza busca por código ou descrição, considerando a vigência do termo.

### Configurar a capa e o timbrado

Entre com um usuário administrador e abra **Configurações**. Cadastre os dados institucionais, o CNES, o logotipo (PNG ou JPEG), as proprietárias que assinam a capa e os profissionais da clínica. Para cada profissional, informe conselho, número, UF e CBO. No cadastro de cada convênio, informe também o código que a operadora atribuiu ao prestador. Esses campos serão reutilizados no XML TISS e nos documentos impressos.

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
- **RBAC também na leitura**: o front-end carrega apenas os conjuntos autorizados para o perfil conectado e a API responde `403` a consultas diretas sem permissão.
- **Feedback com foto em base64 no SQLite**: adequado para o volume de um protótipo; não é como se guardaria arquivo em produção (isso viraria object storage / S3).

## Acesso da demonstração

Escolha uma clínica na tela de login (contas demo listadas na própria tela). O ambiente possui dois espaços fictícios (Clínica Sabiá e Instituto Vital) com dados isolados por `clinic_id` no banco.

## Limitações conhecidas

- O envelope do XML usa o padrão TISS 04.03.00 e é validado contra o XSD oficial da ANS. Os dados atuais ainda não contemplam todos os campos obrigatórios de uma guia SP/SADT; por isso o sistema exibe as incompatibilidades e bloqueia seu envio até os cadastros serem completados.
- A guia SP/SADT em PDF é um modelo imprimível baseado na estrutura visual fornecida, mas ainda precisa ser conferida campo a campo com a versão vigente do formulário da ANS antes do uso comercial.
- A tabela de compatibilidade CID-procedimento cobre só os quatro procedimentos usados no demo — não é uma base de conhecimento clínico real.
- Sem suporte a envio real para operadoras (webservice/portal) — o "envio" é a geração e download do XML.
