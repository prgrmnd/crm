# Documentação Técnica — CRM Luz da Esperança

> **Documentos relacionados:** [README](../README.md) · [Integração Sprint 1 → PostgreSQL](./integracao-sprint-1-postgresql.md) · [Guia de Auditoria e Code Review](./guia-auditoria-code-review.md) · [Caderno de Homologação QA](./homologacao-qa.md) · [Caderno de Homologação UX](./homologacao-ux.md)

Referência técnica consolidada do projeto: banco de dados (Prisma 7 + PostgreSQL), regras físicas por PBI, autenticação/provisionamento, contratos de API, arquitetura de apresentação, deploy (Vercel + Neon) e verificação/testes.

## Sumário

1. [Banco de Dados, Prisma 7 e Deploy (Vercel + Neon)](#1-banco-de-dados-prisma-7-e-deploy-vercel--neon)
2. [Modelagem e Regras Físicas por PBI](#2-modelagem-e-regras-físicas-por-pbi)
3. [Provisionamento de Contas, Autenticação e Contratos de API](#3-provisionamento-de-contas-autenticação-e-contratos-de-api)
4. [Arquitetura de Apresentação e Estrutura](#4-arquitetura-de-apresentação-e-estrutura)
5. [Verificação e Testes](#5-verificação-e-testes)

---

## 1. Banco de Dados, Prisma 7 e Deploy (Vercel + Neon)

O projeto usa **Prisma ORM 7** com **PostgreSQL 13+**:

- **Modelo relacional:** [prisma/schema.prisma](../prisma/schema.prisma)
- **Configuração da CLI:** [prisma.config.ts](../prisma.config.ts)
- **Cliente TypeScript gerado:** `src/generated/prisma/`
- **Migrations SQL versionadas:** [prisma/migrations/](../prisma/migrations/)
- **Variáveis de ambiente:** [`.env.example`](../.env.example)

### Resolução de conexão na CLI (`prisma.config.ts`)

[prisma.config.ts](../prisma.config.ts) prioriza conexão direta (unpooled) para migrations na seguinte ordem de fallback:

1. `DIRECT_URL`
2. `DATABASE_URL_UNPOOLED`
3. `DATABASE_URL`
4. Fallback local padrão (`postgresql://localhost:5432/postgres`) — permite executar `npm run db:generate` mesmo sem `.env` local.

Comandos principais:

```powershell
npm.cmd ci
npm.cmd run db:generate   # gera o Prisma Client em src/generated/prisma/
npm.cmd run db:migrate    # aplica migrations em desenvolvimento (exige PostgreSQL acessível)
npm.cmd run db:deploy     # aplica migrations versionadas em produção/CI
npm.cmd run db:studio     # inspeciona tabelas no Prisma Studio
```

### Deploy em produção (Vercel + Neon)

- **Build na Vercel ([vercel.json](../vercel.json)):** executa `npm run db:generate && npm run build`.
- **Next.js ([next.config.mjs](../next.config.mjs)):** mantém `serverExternalPackages: ["argon2"]` (para empacotamento correto do módulo nativo de hash), `poweredByHeader: false`, `reactStrictMode: false` e `devIndicators: false`.
- **Neon PostgreSQL:** configure `DATABASE_URL` com a string **pooled** (runtime da aplicação) e `DIRECT_URL` (ou `DATABASE_URL_UNPOOLED`) com a string **direct/sem `-pooler`** para executar `npm run db:deploy`.

---

## 2. Modelagem e Regras Físicas por PBI

### Instituição titular (`PB-051`)

O modelo `Instituicao` (`instituicoes`) armazena o cadastro institucional com chave primária UUID (`gen_random_uuid()`), metadados utilizados na emissão de recibos e comunicações (`nome`, `documento` CNPJ de 14 dígitos opcional e único, `cidade`, `uf`, `email_remetente`, `nome_remetente` e `logo_arquivo_id`) e configuração de fuso horário (`fuso_horario`, padrão `America/Sao_Paulo`).

- **Unicidade institucional:** o índice único sobre expressão constante `instituicoes_uma_unica_linha ON instituicoes ((TRUE))` garante fisicamente no banco a existência de no máximo uma instituição titular.
- **Validação de fuso IANA e atualização:** o trigger `instituicoes_validar_e_atualizar` (`BEFORE INSERT OR UPDATE`) valida `fuso_horario` contra o catálogo `pg_timezone_names` do PostgreSQL (rejeitando fusos inválidos com `ERRCODE = '22023'`) e atualiza `atualizado_em` automaticamente.
- O identificador opcional da logo (`logo_arquivo_id`) será ligado por FK a `arquivos.id` quando a `PB-061` criar essa tabela.

### Auditoria append-only (`PB-070`)

O modelo `EventoAuditoria` (`eventos_auditoria`) registra a trilha de auditoria do CRM com suporte a rastreamento distribuído por operação (`correlacao_id` UUID obrigatório) e indexação para consulta na timeline do contato (`(contato_id, criado_em DESC)`) e por correlação (`(correlacao_id)`).

- **Imutabilidade física:** os triggers `eventos_auditoria_sem_update_delete` (`BEFORE UPDATE OR DELETE FOR EACH ROW`) e `eventos_auditoria_sem_truncate` (`BEFORE TRUNCATE FOR EACH STATEMENT`) executam `eventos_auditoria_bloquear_mutacao()`, bloqueando qualquer tentativa de `UPDATE`, `DELETE` ou `TRUNCATE` com `ERRCODE = '55000'`.
- **Sanitização de credenciais e segredos:** as `CHECK` constraints `eventos_auditoria_antes_sanitizado` e `eventos_auditoria_depois_sanitizado` inspecionam recursivamente os payloads JSONB (`antes` e `depois`) por meio da função `eventos_auditoria_contem_dado_sensivel`, rejeitando chaves associadas a `senha`, `password`, `credential`, `credencial`, `token`, `secret`, `segredo`, `salt`, `hash`, `authorization` ou `cookie`.
- **Integridade do ator:** valida que `ator_tipo` seja `'usuario'` (exigindo `ator_id` preenchido) ou `'sistema'` (exigindo `ator_id` nulo).
- **Pendência conhecida:** as FKs de `eventos_auditoria` para usuários e contatos permanecem pendentes (não foram adicionadas na `PB-058` para não alterar contratos e fixtures fora do escopo).

### Usuários, credenciais e sessões (`PB-052`)

Os modelos `Usuario` (`usuarios`), `Sessao` (`sessoes`) e `TentativaLogin` (`tentativas_login`) implementam a camada física de controle de acesso, autenticação e rastreamento de bloqueios:

- **Usuários e senhas em Argon2id (formato PHC):** `usuarios` exige e-mail único normalizado por índice funcional (`lower(trim(email))`), perfil restrito a `'administrador'` ou `'operador_captacao'`, controle de concorrência otimista (`versao > 0`) e atualização automática de `atualizado_em` via trigger. A coluna `senha_hash` possui `CHECK` constraint que aceita exclusivamente strings no formato PHC do algoritmo `argon2id` (`^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]{11,}\$[A-Za-z0-9+/]{16,}$`), impedindo a gravação acidental de senhas em texto puro ou hashes fora do padrão.
- **Sessões revogáveis:** `sessoes` referencia `usuarios(id)` com `ON DELETE RESTRICT`, controla validade temporal (`expira_em > criado_em`, `ultimo_acesso_em >= criado_em`, `revogada_em >= criado_em`) e armazena em `token_hash` exclusivamente o hash SHA-256 em hexadecimal minúsculo de 64 caracteres (`^[0-9a-f]{64}$`), nunca o token bruto enviado ao navegador.
- **Tentativas de login:** `tentativas_login` registra `identificador_hash` também restrito a SHA-256 hexadecimal de 64 caracteres (calculado sobre `lower(trim(email))`), `ip` (`INET`), `sucesso` e janela de bloqueio (`bloqueado_ate > criado_em`, proibida quando `sucesso = TRUE`).

### Tokens de recuperação de senha (`PB-053`)

O modelo `TokenRecuperacao` (`tokens_recuperacao`) gerencia tokens de uso único para redefinição de senha vinculados a `usuarios(id)` (`ON DELETE RESTRICT`):

- **Hash SHA-256 e TTL estrito de 15 minutos:** `token_hash` é único e validado por `CHECK` (`^[0-9a-f]{64}$`). A expiração (`expira_em`) tem padrão `CURRENT_TIMESTAMP + INTERVAL '15 minutes'` e `CHECK` constraint estrita garantindo `expira_em > criado_em AND expira_em <= criado_em + INTERVAL '15 minutes'`.
- **Unicidade de token ativo por usuário:** o índice único parcial `tokens_recuperacao_um_ativo_por_usuario ON tokens_recuperacao (usuario_id) WHERE consumido_em IS NULL AND invalidado_em IS NULL` permite apenas um token pendente por usuário (exigindo a invalidação de tokens anteriores na emissão de um novo).
- **Estados finais imutáveis:** `CHECK` constraints garantem consumo dentro do prazo (`consumido_em <= expira_em`) e exclusão mútua entre consumo e invalidação. O trigger `tokens_recuperacao_proteger` impede qualquer alteração após `consumido_em` ou `invalidado_em` serem preenchidos e bloqueia mutações nos atributos de identificação e validade do token.

### Domínios estáticos dos funis e carga idempotente (`PB-055`)

Os modelos `Origem` (`origens`), `EtapaCaptacao` (`etapas_captacao`), `EtapaPerda` (`etapas_perda`) e `MotivoPerda` (`motivos_perda`) representam as tabelas de referência dos funis com códigos estáveis (`^[a-z][a-z0-9_]*$`):

- **Imutabilidade de domínio:** o trigger `proteger_tabela_dominio` (`BEFORE UPDATE OR DELETE`) é aplicado às quatro tabelas, proibindo a exclusão de registros (`DELETE`) e a alteração da coluna `codigo` (`ERRCODE = '55000'`) para preservar referências históricas.
- **Carga oficial idempotente (`ON CONFLICT (codigo) DO NOTHING`):**
  - **6 origens (`origens`):** `instagram` e `site` (ambas com `classificacao_fixa = 'inbound'`), `indicacao`, `email`, `evento` e `whatsapp` (com seleção manual).
  - **4 etapas de captação (`etapas_captacao`, ordem 1 a 4):** `aprendizado_descoberta` (1), `reconhecimento_problema` (2), `consideracao_solucao` (3) e `decisao_doacao` (4).
  - **5 etapas de perda (`etapas_perda`, ordem 1 a 5):** `perda_registrada` (1), `em_analise` (2), `retomada_agendada` (3, com `exige_agendamento = TRUE`), `em_reaproximacao` (4) e `encerrado_sem_retomada` (5).
  - **5 motivos de perda (`motivos_perda`):** `sem_interesse`, `sem_disponibilidade_financeira`, `sem_retorno`, `momento_inadequado` e `outros` (com `exige_observacao = TRUE`).

### Cadastro central de contatos (`PB-057`)

O modelo `Contato` cria a tabela `contatos` com FKs para `origens`, `etapas_captacao` e `usuarios` (`responsavel_id` e `criado_por`), preservando as referências com `ON DELETE RESTRICT ON UPDATE RESTRICT`. A migration depende das tabelas de acesso e dos domínios dos funis já versionados.

- **Normalização, unicidade e contato obrigatório:** o trigger `contatos_preparar_gravacao` normaliza `email` com `lower(trim(email))` e converte `email`, `telefone` e `documento` vazios em `NULL` antes da validação das constraints. A `CHECK` constraint `contatos_meio_comunicacao_obrigatorio` exige `email IS NOT NULL OR telefone IS NOT NULL`. `email` e `documento` possuem constraints `UNIQUE` que abrangem inclusive contatos excluídos logicamente (`excluido_em` preenchido).
- **Tipagem PF/PJ e validação de dígitos verificadores:** `tipo_pessoa` aceita `'PF'` ou `'PJ'`. `telefone` deve conter 10 ou 11 dígitos numéricos com DDD (`^[0-9]{10,11}$`). A função `contatos_documento_valido(documento, tipo_pessoa)` valida CPF/CNPJ exclusivamente numérico quanto ao tamanho (11 dígitos para PF, 14 para PJ), rejeição de sequências repetidas e cálculo dos dígitos verificadores.
- **Regras de classificação e concorrência por versão:** o trigger `contatos_preparar_gravacao` garante que origens `site` e `instagram` aceitem somente classificação `'inbound'` (`ERRCODE = '23514'`) e mantém `atualizado_em` em atualizações. `data_cadastro` é obrigatória e permite preservar datas de migração; `versao` começa em `1` (`versao > 0`) e deve ser usada pelo consumidor em atualizações condicionais com incremento atômico para controle otimista de concorrência. A tabela oferece `excluido_em` para exclusão lógica.

### Histórico e opt-out (`PB-058`)

Os modelos `Interacao`, `RespostaContato` e `PreferenciaComunicacao` representam as tabelas `interacoes`, `respostas_contato` e `preferencias_comunicacao`. A migration depende de contatos, usuários e auditoria e exige a extensão PostgreSQL `btree_gist` (instalada com `CREATE EXTENSION IF NOT EXISTS`; o usuário das migrations precisa dessa permissão).

- **Interações imutáveis:** aceitam telefone, WhatsApp, reunião ou e-mail, data não futura e resumo obrigatório de até 3.000 caracteres. Triggers bloqueiam `UPDATE`, `DELETE` e `TRUNCATE` de interações e respostas, inclusive pelo Prisma. As FKs preservam contato e autoria com `RESTRICT`.
- **Preferências temporais sem sobreposição:** cobrem o canal `email`, com situações `permitido` e `descadastrado`. Os períodos são semiabertos `[vigente_desde, vigente_ate)`, com fim nulo para a versão atual. Um índice único parcial limita uma versão sem fim por contato/canal; uma exclusion constraint GiST impede qualquer sobreposição, inclusive entre transações concorrentes. Uma versão só pode ser alterada para encerrar a vigência; exclusão e reescrita do histórico são bloqueadas.
- **Preferência inicial:** contatos existentes recebem uma preferência inicial `permitido` desde `criado_em` durante a migration; novos contatos recebem a mesma preferência por trigger (reproduzindo `optOut=false` do protótipo; a política institucional de consentimento ainda precisa de ratificação).
- **Fluxo atômico de descadastro:** para registrar descadastro, inserir uma `RespostaContato` com `classificacao = 'descadastro'`. O trigger (`respostas_registrar_descadastro`) serializa os pedidos do contato, encerra a preferência anterior, cria a versão descadastrada vinculada à resposta e registra `comunicacao.descadastro` em `eventos_auditoria`, tudo na transação da inserção. Falha em qualquer etapa desfaz todos esses efeitos. **Não duplicar esses efeitos na aplicação.** Uma nova resposta de descadastro é um novo registro histórico; repetir a mesma requisição ainda exige idempotência no consumidor.
- **Pendências de evolução:** `envio_destinatario_id` é UUID opcional sem FK até a tabela `envio_destinatarios` existir. Não há tela ou fluxo de reopt-in nesta entrega.
- **Regra para consumidores de envios e réguas:** consulte a preferência vigente no instante do envio exigindo `situacao = 'permitido'` via `vigente_desde <= instante AND (vigente_ate IS NULL OR instante < vigente_ate)`. A estrutura de banco não envia mensagens nem cancela agendamentos por si só.

---

## 3. Provisionamento de Contas, Autenticação e Contratos de API

### Provisionamento do primeiro administrador (`db:bootstrap-admin`)

Executado via [scripts/bootstrap-admin.mjs](../scripts/bootstrap-admin.mjs):

- Defina `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` (mínimo 12 caracteres) no ambiente e rode `npm run db:bootstrap-admin`.
- Só funciona quando a tabela `usuarios` está vazia, grava senha em **Argon2id** e registra evento em `eventos_auditoria`.
- Não salve essas variáveis no repositório; remova-as do ambiente após o uso. Para contas já existentes, não execute o bootstrap.

### Login e sessão no servidor (`PB-001`)

- `POST /api/auth/login` valida credenciais Argon2id, registra tentativas e eventos de auditoria; a quinta falha consecutiva para o mesmo e-mail/IP inicia bloqueio de **1 minuto**.
- O login bem-sucedido cria uma sessão revogável, persiste somente o SHA-256 do token e envia o token em cookie `HttpOnly`, `SameSite=Lax` e `Secure` em produção.
- `GET /api/auth/session` valida a sessão e `PUT /api/auth/session` registra atividade; após **30 minutos sem atividade**, a sessão é revogada. `POST /api/auth/logout` revoga a sessão com auditoria.
- O perfil retornado pelo servidor direciona administradores à visão geral e operadores ao funil de captação.

### Solicitação segura de recuperação (`PB-002`) e Redefinição de senha (`PB-003`)

- **`POST /api/auth/recuperar-senha` (`PB-002`):** valida o formato do e-mail antes de consumir cota de rate limit por IP e e-mail normalizado (`HTTP 429` em excesso de tentativas), invalida atomicamente tokens pendentes anteriores de contas ativas e persiste apenas o hash SHA-256. Retorna sempre `HTTP 200` com resposta neutra idêntica para prevenir enumeração de contas; em `NODE_ENV=development`, simula o envio no console com o prefixo `[DEV E-MAIL]`.
- **`GET` e `POST /api/auth/redefinir-senha` (`PB-003`):**
  - A tela de nova senha é aberta pelo link `#redefinir=<token>`, bloqueia o formulário até validar o token com `GET /api/auth/redefinir-senha?token=...` e limpa o token da URL na interface; links expirados, consumidos ou cancelados são recusados (com erro opaco/uniforme também para conta inativa).
  - `POST /api/auth/redefinir-senha` exige token válido e senha com **8 a 1024 caracteres**, incluindo letra maiúscula, minúscula, número e caractere especial (armazenada como Argon2id em formato PHC).
  - Consumo do token, troca da senha, incremento de versão, revogação de todas as sessões ativas e registro de auditoria ocorrem em **uma única transação**, com bloqueio da linha do token para impedir uso concorrente.

### Middleware de requisições idempotentes (`PB-071`)

O modelo `RequisicaoIdempotente` (`requisicoes_idempotentes`) e o wrapper `withIdempotency` ([src/lib/idempotency-service.ts](../src/lib/idempotency-service.ts)) garantem deduplicação transacional de comandos mutáveis da API:

- Exige o cabeçalho `Idempotency-Key` no formato UUID válido, persiste `hash_requisicao` (SHA-256 hexadecimal do payload) com unicidade por `(usuario_id, operacao, chave)` e retenção de 24 horas (`expira_em`).
- Reutilizar a mesma chave com payload diferente ou enquanto a operação original estiver em estado `'processando'` retorna `HTTP 409` (com `Retry-After: 1` quando em processamento); repetições idênticas de requisições concluídas devolvem a resposta consolidada sem reexecutar efeitos colaterais.

### Contatos, Ficha 360°, Interações e Opt-out (`PB-007` a `PB-011`)

- **Listagem, filtros, seleção e CSV (`GET /api/contacts` e `GET /api/users`):** paginação no servidor (`page`, `pageSize`), filtros (`tab`, `q`, `origin`, `owner`, `period`, `funnel`, `status`, `stage`, `ids`), operadores ativos vindos de `usuarios`, exportação CSV em UTF-8 com BOM e separador `;` com nomes oficiais das etapas (`etapas_captacao`). Com `DATABASE_URL` configurada, retorna *empty state* real quando `contatos` está vazia; apenas a aba **Doadores** mantém fallback de demonstração até `PB-060`/`PB-061`.
- **Cadastro e edição em duas etapas (`POST /api/contacts` e `PATCH /api/contacts/[id]`):** persistência transacional com `withIdempotency`, regra Inbound (`Site`/`Instagram`), bloqueio de duplicidade (`HTTP 409`, inclusive contra excluídos logicamente), controle otimista de concorrência (`versao`), preservação obrigatória da etapa na edição cadastral e trilha em `eventos_auditoria`.
- **Ficha 360° e exclusão lógica (`GET /api/contacts/[id]` e `DELETE /api/contacts/[id]`):** consolida contato, preferência vigente de comunicação, interações, respostas e auditoria; a exclusão exige perfil `Administrador` (`HTTP 403`), usa `withIdempotency`, aplica exclusão lógica (`excluido_em`) com auditoria e expõe `hasFinancialHistoryInDatabase` (`HTTP 409`) para integração com planos/pagamentos.
- **Interações imutáveis (`GET/POST /api/contacts/[id]/interacoes`) e Respostas/Opt-out (`GET/POST /api/contacts/[id]/respostas`):** rotas append-only autenticadas e idempotentes; o registro de `descadastro` aciona atomicamente a trigger `respostas_registrar_descadastro` (`PB-058`).

---

## 4. Arquitetura de Apresentação e Estrutura

```text
prisma/schema.prisma        modelo relacional do Prisma ORM 7
prisma/migrations/          migrations SQL versionadas (constraints, triggers e seeds)
src/generated/prisma/       cliente TypeScript gerado pelo Prisma
src/app/                    entrada App Router, rotas de API, documento e CSS global original
src/components/             componentes funcionais CRMApp e ViewNode
src/hooks/useCRM.ts         estado React, inicialização e ciclo de vida dos efeitos
src/lib/crm-controller.js   fluxos, modelos de apresentação e eventos migrados
src/lib/view-state.js       estado de apresentação e interface com APIs nativas
src/lib/domain.cjs          regras de domínio originais, Ficha 360° e interações
public/favicon.png          logo e favicon originais
tests/                      domínio, estado, integração PostgreSQL, fluxos no Chrome e comparação visual
docs/                       documentação técnica, guia de code review e cadernos de homologação QA/UX
source-manifest.json        hashes SHA-256 dos arquivos de origem
```

- `ViewNode` converte o modelo de apresentação em elementos React, atributos JSX, objetos de estilo e eventos React. O controlador ([src/lib/crm-controller.js](../src/lib/crm-controller.js)) consulta e atualiza apenas essa árvore de estado, sem alterar o DOM montado; o React faz a renderização e reconciliação preservando estrutura, textos e seletores originais.
- [scripts/import-source.cjs](../scripts/import-source.cjs) registra a transformação inicial e sua procedência em [source-manifest.json](../source-manifest.json); não faz parte do build, instalação ou execução e só deve ser usado para uma nova importação deliberada da fonte original.
- Base da estrutura Next.js: [documentação oficial de instalação e App Router](https://nextjs.org/docs/app/getting-started/installation).

---

## 5. Verificação e Testes

### Checagem estática (TypeScript)

Gere antes o Prisma Client (`src/generated/prisma`) e rode o compilador sem emissão:

```powershell
npm.cmd run db:generate
npx.cmd tsc --noEmit
```

### Suíte automatizada com PostgreSQL (`npm test`)

[scripts/test-with-postgres.cjs](../scripts/test-with-postgres.cjs) usa Docker Compose ([compose.test.yaml](../compose.test.yaml)) para iniciar um **PostgreSQL 16** temporário em `127.0.0.1:55432`, gera o Prisma Client, aplica todas as migrations (`prisma migrate deploy`), executa toda a suíte (incluindo testes de integração) e remove container e volume ao terminar.

- Requer **Docker Desktop ativo**.
- O banco `crm_test` é descartável e **não altera** a `DATABASE_URL` de desenvolvimento.
- Novos testes de integração devem usar `testWithDatabase` de [tests/helpers/postgres-test.cjs](../tests/helpers/postgres-test.cjs) (cada teste roda em transação com `ROLLBACK` ao final).

### Pipeline completo e testes de navegador / paridade visual

```powershell
npx.cmd tsc --noEmit
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run test:visual
```

- Os testes de navegador usam o Chrome em `C:\Program Files\Google\Chrome\Application\chrome.exe` (personalizável via `$env:CHROME_PATH`), sobem servidores e navegadores isolados e não utilizam seu perfil pessoal.
- `test:browser` é independente do protótipo; `test:visual` compara com o protótipo na pasta superior ou em `$env:PROTOTYPE_ROOT`. Resultados e capturas vão para `test-results/` (portas `3108–3110`).
