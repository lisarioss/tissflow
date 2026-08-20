# TISS Flow

Protótipo de portfólio para operação de faturamento clínico. A interface usa dados fictícios e demonstra um dashboard de guias TISS, validação de preenchimento, estados operacionais, geração de XML demonstrativo e espaços isolados por clínica.

## Executar

Abra `index.html` no navegador. Não há dependências ou dados reais.

## Acesso da demonstração

Escolha uma clínica na tela de login. O ambiente possui dois espaços fictícios e grava guias, agenda e rascunhos em chaves separadas no navegador. A autenticação atual é apenas uma simulação visual; em produção, credenciais, sessões e permissões devem ser tratados por um backend seguro.

## Próximos passos

- API para persistir pacientes, guias e convênios.
- Validador baseado na versão TISS vigente.
- Geração real de XML e testes de contrato (o download atual é uma demonstração client-side).
- Login, permissões e trilha de auditoria.
