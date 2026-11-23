# Luz da Esperança · CRM (Next.js + Prisma + PostgreSQL)

Aplicação web independente em **React 19** e **Next.js 16 (App Router)** com **Prisma ORM 7** e **PostgreSQL** para gestão de relacionamento, captação e doadores da *Luz da Esperança*. Não é necessário executar o servidor nem carregar arquivos do protótipo original.

---

## Estado Atual

- **Integrado ao PostgreSQL (Sprint 1 completa):** autenticação, sessões revogáveis, recuperação e redefinição de senha (`PB-001` a `PB-003`), operadores e módulo de **Contatos** (`PB-007` a `PB-011`: listagem, filtros, CSV, cadastro/edição em 2 etapas, Ficha 360°, exclusão lógica, interações imutáveis e respostas/opt-out).
- **Em evolução (Sprints 2 a 6):** Funis, Listas, E-mails/Automações, Financeiro, Relatórios e Administração permanecem no armazenamento local (`luz-crm-v1`) até suas respectivas entregas. Fluxos de e-mail permanecem simulados no console (`[DEV E-MAIL]`).

> Veja a matriz completa por issue/PBI em [docs/integracao-sprint-1-postgresql.md](./docs/integracao-sprint-1-postgresql.md).

---

## Pré-requisitos

- **Node.js 20.19+**
- **PostgreSQL 13+** (necessário para autenticação, APIs e migrations)
- **Docker Desktop** (necessário para `npm test`)
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

## Scripts

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

## Estrutura

```text
prisma/         schema.prisma e migrations SQL versionadas
src/app/        App Router, rotas de API (/api/*), layout e CSS global
src/components/ componentes React (CRMApp e ViewNode)
src/hooks/      estado e ciclo de vida React (useCRM.ts)
src/lib/        serviços de domínio, autenticação, idempotência, auditoria e controlador
scripts/        testes com Postgres, bootstrap admin e importação de origem
tests/          domínio, estado, integração PostgreSQL, navegador e paridade visual
docs/           documentação técnica, integração, code review e cadernos de QA/UX
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
