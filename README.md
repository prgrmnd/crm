# Luz da Esperança · React / Next.js

Aplicação independente em React e Next.js para gestão da Luz da Esperança. Não é necessário executar o servidor nem carregar arquivos do protótipo original.

Requisito: Node.js 20.19 ou superior e PostgreSQL 13 ou superior para o Prisma.

```powershell
git clone --branch develop https://github.com/prgrmnd/crm.git
cd crm
npm.cmd ci
npm.cmd run dev
```

A interface carrega sem conexão com o banco, mas o login exige PostgreSQL acessível. Copie `.env.example` para `.env`, informe `DATABASE_URL` e aplique as migrations antes de autenticar usuários.

Para criar o primeiro acesso administrativo, defina `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` no ambiente (a senha deve ter pelo menos 12 caracteres) e execute `npm run db:bootstrap-admin`. O comando só funciona quando a tabela `usuarios` está vazia, armazena senha com Argon2id e registra o provisionamento na auditoria. Não armazene essas variáveis no repositório; remova-as do ambiente após o uso. Para uma conta já existente, não execute o bootstrap.

## Banco de dados e Prisma

O projeto usa Prisma ORM 7 com PostgreSQL. O modelo fica em `prisma/schema.prisma`, a configuração da CLI em `prisma.config.ts`, o cliente gerado em `src/generated/prisma` e as migrations versionadas em `prisma/migrations/`.

No Prisma 7, `prisma.config.ts` resolve obrigatoriamente `env("DATABASE_URL")` ao carregar a CLI — inclusive em comandos que não abrem conexão com o banco, como `prisma generate`. No Windows (PowerShell), caso não exista um arquivo `.env` configurado localmente, defina `$env:DATABASE_URL` na sessão antes de executar os comandos da CLI:

```powershell
npm.cmd ci
$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm"
npm.cmd run db:generate
npm.cmd run db:migrate
```

`db:migrate` aplica as migrations no ambiente de desenvolvimento e requer um servidor PostgreSQL acessível pela `DATABASE_URL`. Para aplicar migrations já geradas em ambientes de implantação, use `npm.cmd run db:deploy`.

Abra `http://127.0.0.1:3000`. Para executar junto com o protótipo, use `npm.cmd run dev -- --port 3001`.

### Instituição titular (PB-051)

O modelo `Instituicao` (`instituicoes`) armazena o cadastro institucional com chave primária UUID (`gen_random_uuid()`), metadados utilizados na emissão de recibos e comunicações (`nome`, `documento` CNPJ de 14 dígitos opcional e único, `cidade`, `uf`, `email_remetente`, `nome_remetente` e `logo_arquivo_id`) e configuração de fuso horário (`fuso_horario`, padrão `America/Sao_Paulo`).

- **Unicidade institucional**: o índice único sobre expressão constante `instituicoes_uma_unica_linha ON instituicoes ((TRUE))` garante fisicamente no banco a existência de no máximo uma instituição titular.
- **Validação de fuso IANA e atualização**: o trigger `instituicoes_validar_e_atualizar` (`BEFORE INSERT OR UPDATE`) valida `fuso_horario` contra o catálogo `pg_timezone_names` do PostgreSQL (rejeitando fusos inválidos com `ERRCODE = '22023'`) e atualiza `atualizado_em` automaticamente.
- O identificador opcional da logo (`logo_arquivo_id`) será ligado por FK a `arquivos.id` quando a PB-061 criar essa tabela.

### Auditoria append-only (PB-070)

O modelo `EventoAuditoria` (`eventos_auditoria`) registra a trilha de auditoria do CRM com suporte a rastreamento distribuído por operação (`correlacao_id` UUID obrigatório) e indexação para consulta na timeline do contato (`(contato_id, criado_em DESC)`) e por correlação (`(correlacao_id)`).

- **Imutabilidade física**: os triggers `eventos_auditoria_sem_update_delete` (`BEFORE UPDATE OR DELETE FOR EACH ROW`) e `eventos_auditoria_sem_truncate` (`BEFORE TRUNCATE FOR EACH STATEMENT`) executam `eventos_auditoria_bloquear_mutacao()`, bloqueando qualquer tentativa de `UPDATE`, `DELETE` ou `TRUNCATE` com `ERRCODE = '55000'`.
- **Sanitização de credenciais e segredos**: as `CHECK` constraints `eventos_auditoria_antes_sanitizado` e `eventos_auditoria_depois_sanitizado` inspecionam recursivamente os payloads JSONB (`antes` e `depois`) por meio da função `eventos_auditoria_contem_dado_sensivel`, rejeitando chaves associadas a `senha`, `password`, `credential`, `credencial`, `token`, `secret`, `segredo`, `salt`, `hash`, `authorization` ou `cookie`.
- **Integridade do ator**: valida que `ator_tipo` seja `'usuario'` (exigindo `ator_id` preenchido) ou `'sistema'` (exigindo `ator_id` nulo).

### Usuários, credenciais e sessões (PB-052)

Os modelos `Usuario` (`usuarios`), `Sessao` (`sessoes`) e `TentativaLogin` (`tentativas_login`) implementam a camada física de controle de acesso, autenticação e rastreamento de bloqueios:

- **Usuários e senhas em Argon2id (formato PHC)**: `usuarios` exige e-mail único normalizado por índice funcional (`lower(trim(email))`), perfil restrito a `'administrador'` ou `'operador_captacao'`, controle de concorrência otimista (`versao > 0`) e atualização automática de `atualizado_em` via trigger. A coluna `senha_hash` possui `CHECK` constraint que aceita exclusivamente strings no formato PHC do algoritmo `argon2id` (`^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]{11,}\$[A-Za-z0-9+/]{16,}$`), impedindo a gravação acidental de senhas em texto puro ou hashes fora do padrão.
- **Sessões revogáveis**: `sessoes` referencia `usuarios(id)` com `ON DELETE RESTRICT`, controla validade temporal (`expira_em > criado_em`, `ultimo_acesso_em >= criado_em`, `revogada_em >= criado_em`) e armazena em `token_hash` exclusivamente o hash SHA-256 em hexadecimal minúsculo de 64 caracteres (`^[0-9a-f]{64}$`), nunca o token bruto enviado ao navegador.
- **Tentativas de login**: `tentativas_login` registra `identificador_hash` também restrito a SHA-256 hexadecimal de 64 caracteres (calculado sobre `lower(trim(email))`), `ip` (`INET`), `sucesso` e janela de bloqueio (`bloqueado_ate > criado_em`, proibida quando `sucesso = TRUE`).

### Login e sessão no servidor (PB-001)

- `POST /api/auth/login` valida credenciais Argon2id, registra tentativas e eventos de auditoria; a quinta falha consecutiva para o mesmo e-mail/IP inicia bloqueio de 1 minuto.
- O login bem-sucedido cria uma sessão revogável, persiste somente o SHA-256 do token e envia o token em cookie `HttpOnly`, `SameSite=Lax` e `Secure` em produção.
- `GET /api/auth/session` valida a sessão e `PUT /api/auth/session` registra atividade; após 30 minutos sem atividade, a sessão é revogada. `POST /api/auth/logout` revoga a sessão.
- O perfil retornado pelo servidor direciona administradores à visão geral e operadores ao funil de captação. Configure `DATABASE_URL` e aplique as migrations para habilitar o fluxo.

### Tokens de recuperação de senha (PB-053)

O modelo `TokenRecuperacao` (`tokens_recuperacao`) gerencia tokens de uso único para redefinição de senha vinculados a `usuarios(id)` (`ON DELETE RESTRICT`):

- **Hash SHA-256 e TTL estrito de 15 minutos**: `token_hash` é único e validado por `CHECK` (`^[0-9a-f]{64}$`). A expiração (`expira_em`) tem padrão `CURRENT_TIMESTAMP + INTERVAL '15 minutes'` e `CHECK` constraint estrita garantindo `expira_em > criado_em AND expira_em <= criado_em + INTERVAL '15 minutes'`.
- **Unicidade de token ativo por usuário**: o índice único parcial `tokens_recuperacao_um_ativo_por_usuario ON tokens_recuperacao (usuario_id) WHERE consumido_em IS NULL AND invalidado_em IS NULL` permite apenas um token pendente por usuário (exigindo a invalidação de tokens anteriores na emissão de um novo).
- **Estados finais imutáveis**: `CHECK` constraints garantem consumo dentro do prazo (`consumido_em <= expira_em`) e exclusão mútua entre consumo e invalidação. O trigger `tokens_recuperacao_proteger` impede qualquer alteração após `consumido_em` ou `invalidado_em` serem preenchidos e bloqueia mutações nos atributos de identificação e validade do token.

### Domínios estáticos dos funis e carga idempotente (PB-055)

Os modelos `Origem` (`origens`), `EtapaCaptacao` (`etapas_captacao`), `EtapaPerda` (`etapas_perda`) e `MotivoPerda` (`motivos_perda`) representam as tabelas de referência dos funis com códigos estáveis (`^[a-z][a-z0-9_]*$`):

- **Imutabilidade de domínio**: o trigger `proteger_tabela_dominio` (`BEFORE UPDATE OR DELETE`) é aplicado às quatro tabelas, proibindo a exclusão de registros (`DELETE`) e a alteração da coluna `codigo` (`ERRCODE = '55000'`) para preservar referências históricas.
- **Carga oficial idempotente (`ON CONFLICT (codigo) DO NOTHING`)**:
  - **6 origens (`origens`)**: `instagram` e `site` (ambas com `classificacao_fixa = 'inbound'`), `indicacao`, `email`, `evento` e `whatsapp` (com seleção manual).
  - **4 etapas de captação (`etapas_captacao`, ordem 1 a 4)**: `aprendizado_descoberta` (1), `reconhecimento_problema` (2), `consideracao_solucao` (3) e `decisao_doacao` (4).
  - **5 etapas de perda (`etapas_perda`, ordem 1 a 5)**: `perda_registrada` (1), `em_analise` (2), `retomada_agendada` (3, com `exige_agendamento = TRUE`), `em_reaproximacao` (4) e `encerrado_sem_retomada` (5).
  - **5 motivos de perda (`motivos_perda`)**: `sem_interesse`, `sem_disponibilidade_financeira`, `sem_retorno`, `momento_inadequado` e `outros` (com `exige_observacao = TRUE`).

### Cadastro central de contatos (PB-057)

O modelo `Contato` cria a tabela `contatos` com FKs para `origens`, `etapas_captacao` e `usuarios` (`responsavel_id` e `criado_por`), preservando as referências com `ON DELETE RESTRICT ON UPDATE RESTRICT`. A migration depende das tabelas de acesso e dos domínios dos funis já versionados.

- **Normalização, unicidade e contato obrigatório**: o trigger `contatos_preparar_gravacao` normaliza `email` com `lower(trim(email))` e converte `email`, `telefone` e `documento` vazios em `NULL` antes da validação das constraints. A `CHECK` constraint `contatos_meio_comunicacao_obrigatorio` exige `email IS NOT NULL OR telefone IS NOT NULL`. `email` e `documento` possuem constraints `UNIQUE` que abrangem inclusive contatos excluídos logicamente (`excluido_em` preenchido).
- **Tipagem PF/PJ e validação de dígitos verificadores**: `tipo_pessoa` aceita `'PF'` ou `'PJ'`. `telefone` deve conter 10 ou 11 dígitos numéricos com DDD (`^[0-9]{10,11}$`). A função `contatos_documento_valido(documento, tipo_pessoa)` valida CPF/CNPJ exclusivamente numérico quanto ao tamanho (11 dígitos para PF, 14 para PJ), rejeição de sequências repetidas e cálculo dos dígitos verificadores.
- **Regras de classificação e concorrência por versão**: o trigger `contatos_preparar_gravacao` garante que origens `site` e `instagram` aceitem somente classificação `'inbound'` (`ERRCODE = '23514'`) e mantém `atualizado_em` em atualizações. `data_cadastro` é obrigatória e permite preservar datas de migração; `versao` começa em `1` (`versao > 0`) e deve ser usada pelo consumidor em atualizações condicionais com incremento atômico para controle otimista de concorrência. A tabela oferece `excluido_em` para exclusão lógica.

### Histórico e opt-out (PB-058)

Os modelos `Interacao`, `RespostaContato` e `PreferenciaComunicacao` representam as tabelas `interacoes`, `respostas_contato` e `preferencias_comunicacao`. A migration depende de contatos, usuários e auditoria e exige a extensão PostgreSQL `btree_gist` (instalada com `CREATE EXTENSION IF NOT EXISTS`; o usuário das migrations precisa dessa permissão).

- Interações aceitam telefone, WhatsApp, reunião ou e-mail, data não futura e resumo obrigatório de até 3000 caracteres. Triggers bloqueiam UPDATE, DELETE e TRUNCATE de interações e respostas, inclusive pelo Prisma. As FKs preservam contato e autoria com RESTRICT.
- Preferências cobrem o canal `email`, com situações `permitido` e `descadastrado`. Os períodos são semiabertos `[vigente_desde, vigente_ate)`, com fim nulo para a versão atual. Um índice único parcial limita uma versão sem fim por contato/canal; uma exclusion constraint GiST impede qualquer sobreposição, inclusive entre transações concorrentes. Uma versão só pode ser alterada para encerrar a vigência; exclusão e reescrita do histórico são bloqueadas.
- Contatos existentes recebem uma preferência inicial `permitido` desde `criado_em` durante a migration; novos contatos recebem a mesma preferência por trigger. Isso reproduz `optOut=false` do protótipo. A política institucional de consentimento ainda precisa de ratificação; essa carga não representa consentimento ratificado.
- Para registrar descadastro, inserir uma `RespostaContato` com `classificacao = 'descadastro'`. O trigger serializa os pedidos do contato, encerra a preferência anterior, cria a versão descadastrada vinculada à resposta e registra `comunicacao.descadastro` em `eventos_auditoria`, tudo na transação da inserção. Falha em qualquer etapa desfaz todos esses efeitos. Não duplicar esses efeitos na aplicação. Uma nova resposta de descadastro é um novo registro histórico; repetir a mesma requisição ainda exige idempotência no consumidor.
- `envio_destinatario_id` é UUID opcional sem FK até a tabela `envio_destinatarios` existir. Não há tela ou fluxo de reopt-in nesta entrega.

Os consumidores de envios e réguas devem consultar a preferência vigente no instante do envio e exigir `situacao = 'permitido'`, usando `vigente_desde <= instante AND (vigente_ate IS NULL OR instante < vigente_ate)`. A estrutura não envia mensagens nem cancela agendamentos por si só. O frontend ainda usa o estado do protótipo (`optOut`); a ligação das telas e dos serviços de envio a essas tabelas permanece nas tarefas operacionais correspondentes.

As FKs pendentes de `eventos_auditoria` para usuários e contatos permanecem uma pendência da auditoria; não foram adicionadas nesta issue para evitar alterar seus contratos e fixtures fora do escopo.


### Ficha 360° e formulário rápido de interações (PB-009 / PB-010)

A Ficha 360° do contato e a linha do tempo (`src/lib/domain.cjs` e `src/lib/crm-controller.js`) implementam as travas operacionais de proteção do histórico e de registro de interações:

- **Trava de exclusão por histórico financeiro (PB-009)**: a exclusão de contatos exige perfil `Administrador` (`deleteContact`) e verificação prévia via `canDeleteContact`. Se o contato possuir qualquer pagamento ou contribuição registrada no histórico financeiro, a exclusão é bloqueada no domínio e na interface (orientando a alteração do status do plano para `Cancelado` para encerrar recorrências).
- **Formulário rápido de interações na timeline (PB-010)**: `registerInteraction` registra interações diretamente na ficha do contato exigindo usuário autenticado, seleção obrigatória de canal (`telefone`, `whatsapp`, `reuniao` ou `email`), data/hora válida com bloqueio estrito de datas futuras (`interactionDate <= now`) e resumo obrigatório da conversa (não vazio, limite de 3.000 caracteres). Os registros são inseridos como eventos imutáveis na timeline do contato e na trilha de auditoria (`Contato por <Canal>`).

Produção:

```powershell
npm.cmd run build
npm.cmd start
```

Contas devem estar cadastradas em `usuarios` com senha Argon2id antes do primeiro acesso. A autenticação e as sessões são validadas no servidor; os demais dados operacionais da interface continuam no armazenamento local `luz-crm-v1`. Fluxos de e-mail permanecem simulados.

## Estrutura

```text
prisma/schema.prisma     modelo relacional do Prisma ORM 7
prisma/migrations/       migrations SQL versionadas (constraints, triggers e seeds)
src/generated/prisma/    cliente TypeScript gerado pelo Prisma
src/app/                 entrada App Router, documento e CSS global original
src/components/          componentes funcionais CRMApp e ViewNode
src/hooks/useCRM.js      estado React, inicialização e ciclo de vida dos efeitos
src/lib/crm-controller.js fluxos, modelos de apresentação e eventos migrados
src/lib/view-state.js    estado de apresentação e interface com APIs nativas
src/lib/domain.cjs       regras de domínio originais, Ficha 360° e interações
public/favicon.png       logo e favicon originais
tests/                   domínio, estado, integração PostgreSQL, fluxos no Chrome e comparação visual
source-manifest.json     hashes SHA-256 dos arquivos de origem
INVENTARIO.md            checklist anterior à implementação
RELATORIO-PARIDADE.md    correspondência e resultados de validação
```

`ViewNode` converte o modelo de apresentação em elementos React, atributos JSX, objetos de estilo e eventos React. O controlador consulta e atualiza apenas essa árvore de estado; não altera o DOM montado. O React faz a renderização e reconciliação. Os templates preservam a estrutura, textos e seletores originais, incluindo fragmentos compartilhados por fichas, formulários, impressão e telas.

## Verificação

Para executar a checagem estática de tipos do TypeScript (`npx tsc --noEmit`), gere antes o Prisma Client (`src/generated/prisma`). Como `prisma.config.ts` exige `DATABASE_URL` definida no ambiente mesmo durante a geração estática no Windows:

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/crm"
npm.cmd run db:generate
npx.cmd tsc --noEmit
```

`npm test` usa Docker Compose para iniciar um PostgreSQL 16 temporário em `127.0.0.1:55432`, gera o Prisma Client, aplica todas as migrations versionadas com `prisma migrate deploy`, executa a suite (incluindo os testes de integração) e remove container e volume temporário ao terminar. É necessário ter Docker Desktop ativo. O banco `crm_test` é descartável e não usa nem altera a `DATABASE_URL` do ambiente de desenvolvimento. Novos testes de integração devem usar `testWithDatabase` de `tests/helpers/postgres-test.cjs`; cada teste roda em uma transação que é desfeita ao final.

```powershell
npx.cmd tsc --noEmit
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run test:visual
```

Os testes de navegador usam o Chrome instalado em `C:\Program Files\Google\Chrome\Application\chrome.exe`. É possível definir `$env:CHROME_PATH` para outro executável Chromium. Eles iniciam e encerram servidores e navegadores de teste próprios; não usam seu perfil pessoal. `test:browser` é independente do protótipo.

`test:visual` compara com o protótipo na pasta superior, ou na pasta definida por `$env:PROTOTYPE_ROOT`; apenas essa comparação precisa dos originais. Os resultados e capturas são gerados em `test-results/`. As portas utilizadas são 3108–3110.

`scripts/import-source.cjs` registra a transformação inicial e sua procedência. Não faz parte do build, da instalação nem da execução; só deve ser usado para uma nova importação deliberada da fonte original.

Base da estrutura Next: [documentação oficial de instalação e App Router](https://nextjs.org/docs/app/getting-started/installation).
