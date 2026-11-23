# Luz da Esperança · CRM

## Sobre o Projeto

O **CRM Luz da Esperança** é uma aplicação web de gestão de relacionamento, captação de recursos e acompanhamento de doadores desenvolvida para a **Luz da Esperança — Centro Espírita e Obras Sociais** *(Parnaíba, PI)*.

### Do que se trata
O sistema centraliza toda a jornada de relacionamento com potenciais doadores e doadores recorrentes ou pontuais: cadastro unificado de contatos PF/PJ, Ficha 360° com histórico imutável de interações e controle de opt-out, condução pelos funis de captação e de perdas, organização de listas e campanhas de e-mail, acompanhamento de doações/pendências e trilha completa de auditoria.

Construído em **Next.js 16 (App Router)**, **React 19**, **Prisma ORM 7** e **PostgreSQL 13+**.

### Para quem foi feito
O sistema foi projetado para os **voluntários da Luz da Esperança e coordenadores** envolvidos na captação de recursos, no cuidado com doadores e na gestão das obras sociais da instituição — oferecendo um espaço único, simples e confiável para organizar o relacionamento diário, acompanhar contribuições e apoiar decisões administrativas com transparência.

### Estado atual da entrega
- **Integrado ao PostgreSQL (Sprint 1 completa):** autenticação, sessões revogáveis, recuperação e redefinição de senha (`PB-001` a `PB-003`), operadores e módulo completo de **Contatos / Ficha 360°** (`PB-007` a `PB-011`: listagem, filtros, CSV, cadastro/edição em 2 etapas, exclusão lógica, interações imutáveis e respostas/opt-out).
- **Em evolução (Sprints 2 a 6):** Funis, Doadores/Adesões, Listas, E-mails/Automações, Doações e Pendências, Relatórios, Usuários e Auditoria na interface permanecem no armazenamento local (`luz-crm-v1`) até suas respectivas entregas. Fluxos de e-mail permanecem simulados no console (`[DEV E-MAIL]`).

> Acompanhe a matriz detalhada por issue/PBI em [docs/integracao-sprint-1-postgresql.md](./docs/integracao-sprint-1-postgresql.md).

---

## Telas e Abas do Sistema

Espaço reservado para as capturas oficiais de cada aba do CRM (salve as imagens em `docs/images/` e descomente a tag `<img>` correspondente).

<table>
  <tr>
    <td width="50%" valign="top">
      <strong>Acesso · Login e Recuperação de Senha</strong><br />
      <sub>Autenticação com proteção contra força bruta, sessão por inatividade, recuperação neutra e redefinição com token único.</sub><br /><br />
      <img src="https://imgur.com/Z2lGCnk.png" alt="Tela de Login e Recuperação de Senha" width="100%" />
    </td>
    <td width="50%" valign="top">
      <strong>Visão geral</strong> <em>(Admin)</em><br />
      <sub>Painel executivo com indicadores de relacionamento, evolução de arrecadação, pendências e ações prioritárias.</sub><br /><br />
      <img src="https://imgur.com/jtLmXhM.png" alt="Aba Visão geral" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>Funil de captação</strong><br />
      <sub>Acompanhamento em quadro Kanban e lista pelas 4 etapas oficiais até a decisão de doação.</sub><br /><br />
      <img src="https://imgur.com/9FHvgEz.png" alt="Aba Funil de captação" width="100%" />
    </td>
    <td width="50%" valign="top">
      <strong>Funil de perdas</strong><br />
      <sub>Gestão de perdas nas 5 etapas oficiais, com motivos padronizados e agendamento de retomada.</sub><br /><br />
      <img src="https://imgur.com/B6PZI8L.png" alt="Aba Funil de perdas" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>Contatos e Ficha 360°</strong><br />
      <sub>Base central PF/PJ com filtros, CSV, cadastro em 2 etapas, interações imutáveis, respostas e opt-out.</sub><br /><br />
      <img src="https://imgur.com/B6PZI8L.png" alt="Aba Contatos e Ficha 360°" width="100%" />
    </td>
    <td width="50%" valign="top">
      <strong>Doadores</strong><br />
      <sub>Acompanhamento de doadores ativos, planos pontuais ou recorrentes e comprovante de adesão.</sub><br /><br />
      <img src="https://imgur.com/Z4UtXbN.png" alt="Aba Doadores" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>Listas e campanhas</strong><br />
      <sub>Segmentação de contatos, importação de planilhas e organização de listas para campanhas.</sub><br /><br />
      <img src="https://imgur.com/3duaNnq.png" alt="Aba Listas e campanhas" width="100%" />
    </td>
    <td width="50%" valign="top">
      <strong>E-mails</strong><br />
      <sub>Envios, templates institucionais, recorrências e automações respeitando o opt-out vigente.</sub><br /><br />
      <img src="https://imgur.com/qh74qmM.png" alt="Aba E-mails" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>Doações e pendências</strong><br />
      <sub>Controle de contribuições recebidas, parcelas em aberto/atraso, baixa e emissão de recibos.</sub><br /><br />
      <img src="https://imgur.com/3udzbwC.png" alt="Aba Doações e pendências" width="100%" />
    </td>
    <td width="50%" valign="top">
      <strong>Relatórios</strong> <em>(Admin)</em><br />
      <sub>Consolidados analíticos de captação, conversão, perdas e arrecadação com suporte à impressão.</sub><br /><br />
      <img src="https://imgur.com/DEM9Fpe.png" alt="Aba Relatórios" width="100%" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>Usuários e acessos</strong> <em>(Admin)</em><br />
      <sub>Gestão de contas da equipe, atribuição de perfis de permissão e ativação/inativação de acessos.</sub><br /><br />
      <img src="https://imgur.com/jqlaUd7.png" alt="Aba Usuários e acessos" width="100%" />
    </td>
    <td width="50%" valign="top">
      <strong>Histórico de auditoria</strong> <em>(Admin)</em><br />
      <sub>Trilha imutável (<code>append-only</code>) de eventos críticos com ator, entidade, antes/depois sanitizado e correlação.</sub><br /><br />
      <img src="https://imgur.com/B0DULX9.png" alt="Aba Histórico de auditoria" width="100%" />
    </td>
  </tr>
</table>

---

## Pré-requisitos

- **Node.js 20.19+**
- **PostgreSQL 13+** (necessário para autenticação, APIs e migrations)
- **Docker Desktop** (necessário para a suíte automatizada `npm test`)
- **Google Chrome / Chromium** (opcional, para `test:browser` e `test:visual`)

---

## Início Rápido

1. **Clone e instale as dependências:**

```powershell
git clone --branch develop https://github.com/prgrmnd/crm.git
cd crm
npm.cmd ci
```

2. **Configure o ambiente:**

Copie [`.env.example`](./.env.example) para `.env` e informe `DATABASE_URL` apontando para o seu PostgreSQL.

> A interface carrega sem banco, mas login e rotas da API exigem PostgreSQL acessível. [prisma.config.ts](./prisma.config.ts) prioriza `DIRECT_URL` → `DATABASE_URL_UNPOOLED` → `DATABASE_URL` (com fallback local apenas para `db:generate`).

3. **Gere o Prisma Client e aplique as migrations:**

```powershell
npm.cmd run db:generate
npm.cmd run db:migrate
```

4. **Crie o primeiro administrador (apenas com a tabela `usuarios` vazia):**

Defina `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` (mínimo 12 caracteres) no ambiente, execute `npm.cmd run db:bootstrap-admin` e remova as variáveis em seguida (não salve credenciais no repositório).

5. **Inicie o servidor local:**

```powershell
npm.cmd run dev
```

Abra `http://127.0.0.1:3000` (ou use `npm.cmd run dev -- --port 3001` para rodar em paralelo com o protótipo).

---

## Produção e Deploy

```powershell
npm.cmd run db:deploy
npm.cmd run build
npm.cmd start
```

Para deploy na **Vercel + Neon** ([vercel.json](./vercel.json), `DATABASE_URL` pooled e `DIRECT_URL` direct), consulte [docs/documentacao-tecnica.md](./docs/documentacao-tecnica.md#deploy-em-produção-vercel--neon).

---

## Scripts Disponíveis

| Script | Descrição |
| :--- | :--- |
| `npm run dev` | Inicia o servidor Next.js em desenvolvimento (`127.0.0.1:3000`). |
| `npm run build` / `start` | Compila e inicia a aplicação em produção. |
| `npm run db:generate` | Gera o Prisma Client em `src/generated/prisma/`. |
| `npm run db:migrate` | Aplica migrations em desenvolvimento (`prisma migrate dev`). |
| `npm run db:deploy` | Aplica migrations versionadas em produção (`prisma migrate deploy`). |
| `npm run db:bootstrap-admin` | Cria o primeiro administrador quando `usuarios` está vazia. |
| `npm run db:studio` | Abre o Prisma Studio para inspeção das tabelas. |
| `npm test` | Sobe PostgreSQL 16 via Docker e executa a suíte de testes. |
| `npm run test:browser` | Executa testes de fluxo no Chrome (`CHROME_PATH`). |
| `npm run test:visual` | Compara visualmente com o protótipo original (`PROTOTYPE_ROOT`). |

---

## Verificação

```powershell
npm.cmd run db:generate
npx.cmd tsc --noEmit
npm.cmd test
npm.cmd run build
```

Detalhes sobre Docker (`crm_test`), `testWithDatabase` e testes de navegador/visuais estão em [docs/documentacao-tecnica.md](./docs/documentacao-tecnica.md#5-verificação-e-testes).

---

## Estrutura Detalhada do Projeto

```text
crm/
├── prisma/
│   ├── schema.prisma                         # Modelo relacional do Prisma ORM 7 (13 tabelas)
│   └── migrations/                           # Migrations SQL versionadas (constraints, triggers, índices e seeds)
├── public/
│   └── favicon.png                           # Logo e favicon institucionais
├── scripts/
│   ├── bootstrap-admin.mjs                   # Provisionamento seguro do primeiro administrador (Argon2id + auditoria)
│   ├── test-with-postgres.cjs                # Orquestra PostgreSQL 16 via Docker Compose para `npm test`
│   └── import-source.cjs                     # Registro de procedência da importação inicial do protótipo
├── src/
│   ├── app/
│   │   ├── layout.tsx                        # Layout raiz e metadados do App Router
│   │   ├── page.tsx                          # Ponto de entrada da aplicação React (CRMApp)
│   │   ├── globals.css                       # Folha de estilos global, temas claro/escuro e impressão
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/route.ts            # POST login com Argon2id, bloqueio por força bruta e cookie HttpOnly
│   │       │   ├── logout/route.ts           # POST revogação de sessão com auditoria
│   │       │   ├── session/route.ts          # GET validação de sessão e PUT renovação de atividade (30 min)
│   │       │   ├── recuperar-senha/route.ts  # POST solicitação neutra de recuperação com rate limit e SHA-256
│   │       │   └── redefinir-senha/route.ts  # GET validação de token e POST redefinição transacional de senha
│   │       ├── users/
│   │       │   └── route.ts                  # GET listagem de operadores ativos para filtros e atribuição
│   │       └── contacts/
│   │           ├── route.ts                  # GET listagem paginada/CSV e POST cadastro idempotente de contato
│   │           └── [id]/
│   │               ├── route.ts              # GET Ficha 360°, PATCH edição otimista e DELETE exclusão lógica
│   │               ├── interacoes/route.ts   # GET/POST registro append-only imutável de interações
│   │               └── respostas/route.ts    # GET/POST respostas e disparo atômico de opt-out (descadastro)
│   ├── components/
│   │   ├── CRMApp.tsx                        # Componente raiz que conecta o hook de estado à árvore ViewNode
│   │   └── ViewNode.tsx                      # Renderizador React do modelo de apresentação (sem mutação direta do DOM)
│   ├── hooks/
│   │   └── useCRM.ts                         # Estado React, inicialização e ciclo de vida dos efeitos
│   ├── lib/
│   │   ├── prisma.ts                         # Instância singleton do Prisma Client com adapter `pg`
│   │   ├── auth-service.ts                   # Regras de autenticação, sessões, Argon2id e recuperação de senha
│   │   ├── contact-service.ts                # Regras de Contatos, Ficha 360°, exclusão lógica, interações e opt-out
│   │   ├── audit-service.ts                  # Registro padronizado e sanitizado em `eventos_auditoria`
│   │   ├── idempotency-service.ts            # Wrapper `withIdempotency` (chave UUID, hash SHA-256 e replay seguro)
│   │   ├── rate-limit.ts                     # Contenção de taxa por IP/e-mail na recuperação de senha
│   │   ├── crm-controller.js                 # Controlador de telas, navegação, eventos e integração com APIs
│   │   ├── view-state.js                     # Árvore de estado de apresentação e ponte com APIs do navegador
│   │   └── domain.cjs                        # Regras de domínio compartilhadas, validações e utilitários
│   ├── types/
│   │   └── crm.ts                            # Tipagens TypeScript compartilhadas do CRM
│   └── generated/prisma/                     # Cliente TypeScript gerado pelo Prisma (não versionado)
├── tests/
│   ├── *.integration.test.{cjs,ts}           # Testes reais no PostgreSQL (migrations, triggers, auth, idempotência)
│   ├── *.test.{cjs,ts,js}                    # Testes de domínio, rotas, serviços, formulários, estado e UI
│   ├── browser-parity.mjs                    # Fluxos ponta a ponta executados em Chrome isolado
│   ├── visual-parity.mjs                     # Comparação visual automatizada contra o protótipo original
│   ├── helpers/                              # Utilitários compartilhados (`postgres-test.cjs` com `testWithDatabase`)
│   └── fixtures/                             # Massas e dados auxiliares para os testes
├── docs/
│   ├── documentacao-tecnica.md               # Referência técnica completa (Prisma 7, PBIs, APIs, deploy e testes)
│   ├── integracao-sprint-1-postgresql.md     # Matriz de status da Sprint 1 e contratos ativos de API
│   ├── guia-auditoria-code-review.md         # Governança de branches/PRs e critérios de revisão técnica
│   ├── homologacao-qa.md                     # Caderno mestre de testes funcionais (QA)
│   ├── homologacao-ux.md                     # Caderno mestre de usabilidade, UI e responsividade (UX)
│   └── issues-sprint-2-qa-ux.md              # Recorte e templates de issues de QA/UX da Sprint 2
├── .env.example                              # Modelo de variáveis de ambiente (`DATABASE_URL`, `DIRECT_URL`, bootstrap)
├── compose.test.yaml                         # Definição do PostgreSQL 16 descartável usado por `npm test`
├── next.config.mjs                           # Configuração do Next.js (incluindo `serverExternalPackages: ["argon2"]`)
├── package.json                              # Dependências, engines e scripts npm
├── prisma.config.ts                          # Configuração da CLI do Prisma 7 com prioridade para `DIRECT_URL`
├── source-manifest.json                      # Hashes SHA-256 de procedência dos arquivos do protótipo
├── tsconfig.json                             # Configuração do compilador TypeScript
└── vercel.json                               # Comando de build para deploy na Vercel (`db:generate && build`)
```

---

## Documentação

| Documento | Finalidade |
| :--- | :--- |
| [Documentação Técnica](./docs/documentacao-tecnica.md) | Banco/Prisma 7, deploy Vercel+Neon, regras físicas por PBI (`PB-051` a `PB-071`), autenticação/APIs (`PB-001` a `PB-011`), `ViewNode` e testes. |
| [Integração Sprint 1 → PostgreSQL](./docs/integracao-sprint-1-postgresql.md) | Matriz de status das entregas da Sprint 1, contratos ativos de API e pendências conhecidas. |
| [Guia de Auditoria e Code Review](./docs/guia-auditoria-code-review.md) | Governança de branches/PRs, pipeline local e critérios obrigatórios de revisão. |
| [Caderno de Homologação QA](./docs/homologacao-qa.md) | Casos de teste funcionais e critérios de aprovação por ciclo. |
| [Caderno de Homologação UX](./docs/homologacao-ux.md) | Validação de usabilidade, responsividade, acessibilidade e artefatos visuais. |
| [Issues de QA e UX — Sprint 2](./docs/issues-sprint-2-qa-ux.md) | Recorte e templates de issues de homologação para a Milestone Sprint 2. |
