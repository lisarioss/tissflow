# TISS Flow

Protótipo de portfólio para operação de faturamento clínico. A interface usa dados fictícios e demonstra um dashboard de guias TISS, validação de preenchimento, estados operacionais, geração de XML demonstrativo e espaços isolados por clínica.

## Executar

Para usar apenas a demonstração visual, abra `frontend/index.html` no navegador.

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
npm.cmd start
```

A API ficará disponível em `http://localhost:3000` e servirá o front-end automaticamente. O banco SQLite `backend/tiss-flow.db` é criado na primeira execução.

## Estrutura

```text
frontend/   interface HTML, CSS e JavaScript
backend/    API Express, autenticação e banco SQLite
README.md   documentação do projeto
```

## Acesso da demonstração

Escolha uma clínica na tela de login. O ambiente possui dois espaços fictícios e grava guias, agenda e rascunhos em chaves separadas no navegador. A autenticação atual é apenas uma simulação visual; em produção, credenciais, sessões e permissões devem ser tratados por um backend seguro.

## Próximos passos

- Conectar o front-end à API e substituir o `localStorage`.
- Validador baseado na versão TISS vigente.
- Geração real de XML e testes de contrato (o download atual é uma demonstração client-side).
- Login, permissões e trilha de auditoria.
