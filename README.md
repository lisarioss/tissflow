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
- **Comprovação do PDF assinado**: lotes que exigem impressão só ficam prontos após o arquivo PDF real ser enviado; o comprovante fica vinculado à guia e à pasta do paciente e pode ser baixado pelo faturamento.
- **Substituição rastreável**: um PDF assinado incorreto pode ser substituído no lote; a versão anterior permanece na pasta do paciente identificada como histórica e a troca é registrada na auditoria.
- **Fluxo obrigatório do lote**: o servidor impede saltos indevidos entre preparação, pronto, enviado, processamento e aprovado, além de exigir documentos, XML válido e protocolo conforme a etapa.
- **Documentos de retorno do lote**: comprovante de protocolo, retorno XML, demonstrativo de pagamento e outros arquivos ficam armazenados no próprio lote, com validação, download, auditoria e inclusão no backup da clínica.
- **Linha do tempo do lote**: cada mudança de etapa registra automaticamente data, hora e usuário responsável, aparece no acompanhamento do faturamento e também integra o backup da clínica.
- **Conciliação financeira do lote**: registra previsão opcional, valor efetivamente recebido, data do crédito e observações, indicando automaticamente pagamento pendente, parcial ou quitado sem bloquear ajustes posteriores.
- **Contas a receber e aging**: acompanha vencimento, dias em atraso e saldo de cada lote, organiza a carteira em faixas de atraso e exporta CSV próprio para cobrança e conferência.
- **Filtros operacionais dos lotes**: pesquisa por convênio, competência, situação, conciliação e faixa de vencimento, com ordenação por maior atraso ou maior saldo e atalhos diretos a partir do Financeiro.
- **Pré-auditoria de risco**: avalia pendências de documentos, XML, datas e valores antes do envio, registra a revisão do faturamento e exige nova conferência quando os dados relevantes do lote mudam.
- **Histórico de revisão**: mantém o resultado das análises de risco, usuário, data e observações no lote, inclui a informação na linha do tempo, no PDF e no backup da clínica.
- **Importação do retorno TISS**: ao anexar o XML da operadora, identifica as guias do lote, valores liberados e glosados, atualiza a situação das guias e abre as glosas correspondentes com código e motivo, preservando o arquivo original para auditoria.
- **Relatório financeiro dos convênios**: consolida por competência o valor faturado, liberado, recebido, glosado e ainda a receber, mantém as notas fiscais em visão separada e exporta os lotes em CSV para conferência no Excel.
- **Análise de glosas por operadora**: mede valores glosados e recuperados, taxa de recuperação e causas recorrentes, permitindo configurar um limite preventivo por convênio para destacar desempenhos que exigem atenção.
- **Direitos do titular**: registra pedidos de acesso, correção, portabilidade, anonimização ou eliminação na pasta do paciente, exige justificativa para a conclusão, permite exportar os dados em JSON e mantém as decisões na auditoria e no backup. O sistema não elimina prontuários automaticamente.
- **Base comercial de assinaturas**: novas clínicas recebem 30 dias de teste no plano Profissional, podem comparar Essencial, Profissional e Rede, acompanham uso de pacientes e usuários e mantêm a situação da assinatura separada dos dados operacionais e dos backups.
- **Controle de autorizações**: registra a guia/senha autorizada por paciente, período de validade, quantidade liberada e utilizada; destaca autorizações vigentes, próximas do vencimento ou vencidas e permite atualizar o saldo de sessões.
- **Validação TISS oficial**: confere o XML com os schemas de Comunicação 04.03.00 publicados pela ANS, calcula o hash MD5 em ISO-8859-1 e mantém inválido qualquer lote que não passe no XSD.
- **Feedback de atendimento**: profissionais registram evolução/observações por atendimento, com foto opcional e vínculo validado pelo paciente e pela data da guia faturada; geração do PDF individual e de um relatório consolidado por guia para auditoria.
- **Pasta do paciente**: reúne cadastro, guias e PDFs, feedbacks, autorizações, agenda, lotes, notas e glosas relacionados ao mesmo paciente, com acesso direto aos documentos.
- **Documentos do paciente**: armazena PDFs e imagens em diretórios separados por clínica, com categoria, validade, vínculo opcional à guia/autorização e controle de download e exclusão.
- **Responsável legal e consentimento**: registra vínculo, contato e situação do consentimento do paciente; o nome do responsável é reaproveitado automaticamente na capa para assinatura.
- **Termo de consentimento em PDF**: gera pela pasta do paciente um modelo administrativo no timbrado da clínica, preenchido com paciente e responsável, para impressão, assinatura e posterior armazenamento do arquivo assinado.
- **Histórico de consentimento**: preserva cada concessão ou revogação com data, observação e usuário responsável pelo registro, atualizando a situação vigente do paciente sem apagar eventos anteriores.
- **Termo configurável por clínica**: administradores podem definir o título, o conteúdo revisado e o contato de privacidade usados no PDF de consentimento, sem alterar o código do sistema.
- **Versão histórica do consentimento**: cada manifestação preserva título, texto, contato e hash SHA-256 da versão apresentada, permitindo reemitir o PDF original mesmo depois de mudanças no modelo da clínica.
- **Comprovante assinado**: o registro de consentimento pode ser vinculado ao PDF ou à imagem assinada armazenada na pasta do próprio paciente, com validação desse vínculo pela API.
- **Atualização do comprovante**: permite anexar, substituir ou desvincular posteriormente o arquivo assinado sem modificar a data, a situação, o texto ou o hash da manifestação original.
- **Alertas de consentimento**: notifica perfis assistenciais sobre pacientes com manifestação pendente, consentimento revogado ou comprovante assinado ausente, com acesso direto à pasta correspondente.
- **Renovação configurável do consentimento**: cada clínica pode desativar o controle ou escolher um ciclo de 6, 12, 24 ou 36 meses; o sistema avisa 30 dias antes e destaca termos vencidos.
- **Relatório de consentimentos**: administradores acompanham a conformidade dos pacientes ativos e exportam CSV com responsável, manifestação vigente, renovação, comprovante e situação para auditoria.
- **Checklist de implantação**: orienta o administrador na configuração inicial da clínica e reúne atalhos para timbrado, responsáveis, profissionais, convênios, equipe e primeiro paciente.
- **Importação de pacientes por CSV**: administradores e recepção podem baixar um modelo e cadastrar até 1.000 pacientes de uma vez, com validação integral de datas, convênios, carteiras, IDs e e-mails antes de gravar qualquer registro.
- **Relatório de erros da importação**: linhas inválidas são apresentadas na própria tela para correção, incluindo datas impossíveis, sem permitir cadastros parciais.
- **Exportação de pacientes**: administradores e recepção podem baixar o cadastro no mesmo formato CSV da importação, facilitando conferência e migração com download registrado na auditoria.
- **Arquivamento de pacientes**: pacientes podem ser inativados sem perder guias, documentos ou histórico; registros inativos deixam de aparecer em novas guias, autorizações e agendamentos e podem ser reativados pelo cadastro.
- **Rastreabilidade do cadastro**: a auditoria identifica importações em massa, arquivamentos e reativações sem copiar nome, carteira ou conteúdo clínico para o log.
- **Integridade do backup**: cada exportação recebe uma assinatura SHA-256 e pode ser validada antes da restauração, detectando arquivo corrompido, alterado ou pertencente a outra clínica.
- **Prévia da restauração**: após validar o backup, o sistema mostra data da exportação e totais de pacientes, guias, documentos, feedbacks, autorizações, lotes, agenda e convênios antes de qualquer alteração.
- **Restauração protegida**: somente administradores podem restaurar um backup íntegro da própria clínica; a operação exige confirmação textual, preserva usuários e auditoria e cria automaticamente um ponto de recuperação local.
- **Pontos de recuperação**: administradores podem consultar e baixar as cópias automáticas anteriores a cada restauração, sempre isoladas por clínica e com download auditado.
- **Backup diário automático**: enquanto o servidor estiver ativo, cada clínica recebe um ponto de recuperação diário; o sistema conserva as 20 cópias mais recentes e identifica se foram criadas automaticamente, manualmente ou antes de uma restauração.
- **Monitoramento do backup**: a área de configurações informa a data da última cópia, o uso da retenção e verifica se o backup diário continua íntegro; arquivos ausentes, atrasados ou corrompidos geram alerta e podem ser substituídos por uma nova cópia imediata.
- **Troca segura de senha**: cada usuário pode alterar a própria senha confirmando a senha atual; a nova senha exige 12 caracteres e invalida imediatamente todas as sessões anteriores da conta.
- **Proteção contra tentativas de acesso**: após cinco senhas incorretas, a conta fica bloqueada por 15 minutos; administradores visualizam o bloqueio e podem liberar o usuário, com registro na auditoria.
- **Histórico de autenticação**: logins autorizados, senhas incorretas e tentativas em contas bloqueadas ficam disponíveis somente aos administradores da clínica por 180 dias, sem armazenar senhas.
- **Cópia manual e retenção**: o administrador pode criar um ponto antes de mudanças importantes; o servidor conserva as 20 cópias mais recentes de cada clínica para controlar o espaço utilizado.
- **Backup criptografado**: a clínica pode exportar e restaurar uma cópia `.tissbackup` protegida por senha com AES-256-GCM e derivação scrypt; antes da restauração, o arquivo é descriptografado, validado e exibido em uma prévia. A senha nunca é armazenada nem registrada na auditoria.
- **Filtro de pacientes arquivados**: a listagem informa os totais de ativos e arquivados e permite consultar cada grupo ou todos os cadastros.
- **Paginação de pacientes**: busca e filtros exibem até 20 registros por página, mantendo o cadastro organizado à medida que a clínica cresce.
- **Alertas de validade do plano**: a central de notificações avisa 30 dias antes do vencimento da carteira e destaca planos já vencidos, com acesso ao paciente para atualização.
- **Prevenção de duplicidades**: o cadastro, a edição e a importação impedem carteiras repetidas, inclusive quando o número foi digitado com pontos, espaços, barras ou hífens.
- **Validação cadastral no servidor**: datas impossíveis, e-mails inválidos e convênios que não pertencem à clínica são recusados antes de gravar o paciente.
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

## Preparação para produção

A página pública fica em `/`, o acesso das clínicas em `/login` e a administração comercial em `/platform`. Os botões dos planos levam ao cadastro já identificando Essencial, Profissional ou Rede; a nova clínica recebe 30 dias de teste no plano escolhido.

Em produção, configure `NODE_ENV=production`, gere um `JWT_SECRET` aleatório com pelo menos 32 caracteres, mantenha `ENABLE_DEMO_DATA=false`, informe somente origens HTTPS em `CORS_ORIGINS`, use `TRUST_PROXY=true` atrás do proxy que encerra o HTTPS e defina `DATA_DIR` com o caminho absoluto de um volume persistente. O servidor recusa a inicialização se alguma dessas proteções estiver ausente.

O `DATA_DIR` reúne o banco `tiss-flow.db`, os documentos enviados e os pontos locais de recuperação. Assim, uma nova versão da aplicação pode substituir o código sem apagar os dados da clínica. O volume deve ter leitura e escrita permitidas somente para o processo da aplicação e precisa fazer parte da rotina externa de backup do provedor.

Use `GET /api/health` para verificar se o processo está ativo e `GET /api/ready` para confirmar também o acesso ao banco e ao armazenamento de documentos. O encerramento por `SIGTERM` ou `SIGINT` aguarda as conexões abertas e fecha o banco antes de finalizar.

### Implantação com Docker e HTTPS

O projeto inclui `Dockerfile`, `compose.prod.yml` e `Caddyfile`. O Caddy atua como proxy reverso e solicita automaticamente o certificado HTTPS do domínio configurado.

1. Copie `.env.production.example` para `.env.production` e substitua o domínio e o segredo.
2. Antes de publicar, execute `cd backend && npm run check:production -- ../.env.production`. O comando lista todas as variáveis pendentes sem imprimir seus valores secretos.
3. Aponte o DNS do domínio para o servidor.
4. Libere as portas 80 e 443 no servidor.
5. Execute `docker compose --env-file .env.production -f compose.prod.yml up -d --build`.
6. Confirme `https://seu-dominio/api/health` e `https://seu-dominio/api/ready`.

O volume `app_data` preserva banco, documentos e recuperações entre atualizações. Os volumes do Caddy preservam certificados. Configure no provedor uma cópia externa recorrente do `app_data`; os pontos de recuperação dentro do mesmo volume não substituem um backup externo.

Em produção, cada requisição recebe um `X-Request-ID`. Os logs técnicos registram apenas método, status, duração e identificadores internos, sem URL, parâmetros ou corpo clínico. Respostas de erro interno devolvem o identificador para facilitar o suporte.

### Cobrança recorrente

A base da integração com o Asaas usa o sandbox por padrão. Configure `ASAAS_API_KEY` e um `ASAAS_WEBHOOK_TOKEN` exclusivo; enquanto ambos estiverem vazios, nenhuma cobrança é ativada. No painel do Asaas, cadastre `https://seu-dominio/api/billing/webhooks/asaas` como webhook e use o mesmo token no cabeçalho de autenticação.

O endpoint persiste o identificador de cada evento para impedir processamento duplicado. Confirmações ativam a assinatura, atrasos marcam pendência e a inativação/cancelamento encerra o acesso comercial. A cobrança real só deve ser liberada depois da homologação completa no sandbox.

Os valores iniciais aprovados são R$ 149/mês no Essencial, R$ 299/mês no Profissional e R$ 599/mês no Rede. Com o sandbox configurado, o administrador escolhe Pix ou boleto nas configurações. O backend reutiliza o cliente e a assinatura identificados pela referência interna da clínica, cria a recorrência mensal quando necessário e abre a primeira cobrança hospedada pelo Asaas.

Os limites são aplicados somente a novos pacientes e usuários ativos; registros já existentes nunca são apagados. Pagamentos atrasados possuem sete dias de tolerância. Depois disso, ou quando o teste/assinatura termina, a clínica entra em modo somente leitura: consultas e exportações permanecem disponíveis, enquanto alterações são liberadas novamente após a regularização.

### Administração da plataforma

O painel da proprietária fica em `/platform` e possui autenticação separada das clínicas. Defina `PLATFORM_ADMIN_EMAIL` e `PLATFORM_ADMIN_PASSWORD` antes da primeira inicialização do banco; a senha precisa ter pelo menos 12 caracteres e é armazenada somente como hash. O painel apresenta clínicas, planos, status e contagens agregadas, sem exibir nomes de pacientes, guias ou prontuários.

Administradores da plataforma podem trocar o plano de clínicas ainda não vinculadas ao Asaas e prorrogar testes por 7, 15 ou 30 dias. Alterações em assinaturas já vinculadas ao gateway são bloqueadas para evitar divergência de preço. Todas essas ações são gravadas em uma auditoria comercial separada.

O painel calcula também MRR (receita recorrente mensal das assinaturas ativas), projeção anual, potencial mensal dos testes, distribuição por plano e testes que vencem nos próximos sete dias. Esses valores representam as assinaturas do TISSFlow e são mantidos separados do faturamento assistencial das clínicas.

A proprietária pode trocar a própria senha em `/platform`. A operação incrementa a versão da sessão, invalida imediatamente os tokens emitidos anteriormente e registra o evento na auditoria. Cinco tentativas de login incorretas bloqueiam temporariamente a conta por 15 minutos.

A carteira comercial exibe o CNPJ e o e-mail do administrador de cada clínica e pode ser exportada em CSV. O arquivo contém somente dados cadastrais, assinatura e contagens agregadas; nenhuma identificação de paciente ou informação assistencial é incluída. Células iniciadas por caracteres de fórmula são neutralizadas antes da exportação.

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
