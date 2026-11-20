# Plano e Status da Integração Sprint 1 → PostgreSQL (Saída do `localStorage`)

> **Status Atual:** ✅ **Integração aplicada na branch atual** (exceto issue `#13` / `PB-003`, em desenvolvimento paralelo na sua própria branch).  
> **Documentos relacionados:** [README técnico](../README.md) · [Guia de Auditoria e Code Review](./guia-auditoria-code-review.md) · [Caderno de Homologação QA](./homologacao-qa.md) · [Caderno de Homologação UX](./homologacao-ux.md)

---

## 1. Matriz Consolidada da Sprint 1 (Estado Atual)

| Issue / PBI | Banco (`prisma/migrations`) | API (`src/app/api`) | Interface (`src/lib/crm-controller.js`) | Status |
| :--- | :--- | :--- | :--- | :--- |
| **`#11` (`PB-001`)** Login/Sessão/Logout | ✅ `usuarios`, `sessoes`, `tentativas_login`, `eventos_auditoria` | ✅ `POST /api/auth/login`, `GET/PUT /api/auth/session`, `POST /api/auth/logout` (com auditoria de logout em `eventos_auditoria`) | ✅ Integrado via `fetch` (sem gravar auditoria de logout no `localStorage`) | ✅ **Integrado** |
| **`#12` (`PB-002`)** Recuperação de Senha | ✅ `tokens_recuperacao`, `eventos_auditoria` | ✅ `POST /api/auth/recuperar-senha` (com auditoria sanitizada em `eventos_auditoria`) | ✅ Botão **"Esqueci minha senha"** restaurado em `renderLogin()` + tratamento explícito de `HTTP 429`/`400` em `recover()` | ✅ **Integrado** *(SMTP real na Sprint 3; rate limit distribuído em backlog de infra)* |
| **`#13` (`PB-003`)** Redefinição de Senha | ✅ `tokens_recuperacao` | ⏳ Em andamento em branch dedicada (`feat/issue-13-redefinicao-senha`) | ⏳ Em andamento | ⏳ **Fora deste pacote (em execução separada)** |
| **`#14` (`PB-007`)** Listagem, Filtros, Seleção e CSV | ✅ `contatos`, `origens`, `etapas_captacao`, `usuarios`, `preferencias_comunicacao` | ✅ `GET /api/contacts` + `GET /api/users?ativo=true`; corrigidos `situacao: "descadastrado"`, `vigenteDesde <= now`, `stage` (`0–3`) ↔ `ordem` (`1–4`), `ownerName`, validação de UUID em `ids`/`owner`, nomes oficiais das etapas no CSV e remoção de fallback silencioso | ✅ Sem mesclagem em `state.contacts` (`localStorage`); operadores carregados via `/api/users`; seleção em lote e exportação CSV via API | ✅ **Integrado** *(aba Doadores mantém fallback até `PB-060`/`PB-061`)* |
| **`#15` (`PB-008`)** Cadastro/Edição em 2 Etapas | ✅ `contatos` + trigger `contatos_preparar_gravacao` + `contatos_inicializar_preferencia` | ✅ `POST /api/contacts` (idempotente + auditoria) e `PATCH /api/contacts/[id]` (concorrência otimista via `versao`, preservação obrigatória da etapa + auditoria `antes`/`depois`) | ✅ Formulário guiado em 2 etapas conectado a `POST`/`PATCH` via `fetch`, com `Idempotency-Key` e operadores do banco | ✅ **Integrado** |
| **`#16` (`PB-009`)** Ficha 360° e Exclusão Lógica | ✅ `contatos.excluido_em`, `eventos_auditoria`, `requisicoes_idempotentes` | ✅ `GET /api/contacts/[id]` (Ficha 360° consolidada) e `DELETE /api/contacts/[id]` refatorado (sem `body.state`, exige Admin `403`, idempotência, soft-delete em `contatos`, auditoria transacional e hook `hasFinancialHistoryInDatabase`) | ✅ Ficha 360° carrega de `GET /api/contacts/[id]` e exclusão chama `DELETE /api/contacts/[id]` com `Idempotency-Key` | ✅ **Integrado** *(trava financeira real liga quando `PB-060`/`PB-061` existirem)* |
| **`#17` (`PB-010`)** Interações Imutáveis | ✅ `interacoes` + triggers de imutabilidade | ✅ `GET/POST /api/contacts/[id]/interacoes` (autenticado, idempotente, valida canal incluindo `"Reunião presencial" → "reuniao"`, bloqueia data futura e resumo vazio/>3.000 chars, sem `PUT`/`PATCH`/`DELETE`) | ✅ Formulário rápido conectado a `POST /api/contacts/[id]/interacoes` e removido uso direto de `document.getElementById` | ✅ **Integrado** |
| **`#18` (`PB-011`)** Respostas e Opt-out | ✅ `respostas_contato`, `preferencias_comunicacao` + trigger `respostas_registrar_descadastro` | ✅ `GET/POST /api/contacts/[id]/respostas` (e `POST /api/contacts/[id]` legado agora autenticado + idempotente), delegando integralmente `descadastro` à trigger `PB-058` e garantindo conteúdo padrão quando motivo é omitido | ✅ Ambos os fluxos (`responseForm` e `optOutForm`) conectados a `POST /api/contacts/[id]/respostas` via `fetch` | ✅ **Integrado** |

---

## 2. Rotas da API Entregues e Contratos Ativos

- **`GET /api/users?ativo=true`** (`src/app/api/users/route.ts`): lista operadores ativos da tabela `usuarios` para filtros e atribuição de responsável.
- **`GET /api/contacts`** (`src/app/api/contacts/route.ts`): consulta paginada e exportação CSV no PostgreSQL (retorna lista vazia quando `DATABASE_URL` está configurada e não há registros; fallback de demonstração restrito à aba `donors` até `PB-060` ou ambientes sem `DATABASE_URL`).
- **`POST /api/contacts`** (`src/app/api/contacts/route.ts`): cadastro de contato com `getActiveSession`, `withIdempotency`, validação de duplicidade (`409` inclusive contra excluídos logicamente), regra Inbound (`Site`/`Instagram`) e `recordAuditEvent`.
- **`GET /api/contacts/[id]`** (`src/app/api/contacts/[id]/route.ts`): Ficha 360° consolidando `contatos`, `origens`, `etapas_captacao`, `usuarios`, `interacoes`, `respostas_contato`, `preferencias_comunicacao` e `eventos_auditoria`.
- **`PATCH /api/contacts/[id]`** (`src/app/api/contacts/[id]/route.ts`): edição cadastral com controle otimista (`versao`, `409` em conflito), preservação obrigatória da etapa atual e trilha de auditoria (`Origem e direção alteradas` + `Cadastro atualizado`).
- **`DELETE /api/contacts/[id]`** (`src/app/api/contacts/[id]/route.ts`): exclusão lógica (`excluido_em`), trava `403` para não-Administradores, `withIdempotency`, `recordAuditEvent` e ponto de extensão `hasFinancialHistoryInDatabase` (`409`).
- **`GET / POST /api/contacts/[id]/interacoes`** (`src/app/api/contacts/[id]/interacoes/route.ts`): listagem e registro append-only imutável em `interacoes` + auditoria.
- **`GET / POST /api/contacts/[id]/respostas`** (`src/app/api/contacts/[id]/respostas/route.ts`): listagem e registro append-only em `respostas_contato`, acionando a trigger `respostas_registrar_descadastro` quando `classificacao = 'descadastro'`.

---

## 3. Pontos Pendentes Esperados (Fora do Escopo desta Correção)

1. **Issue `#13` (`PB-003`) — Redefinição de Senha:** rota `POST /api/auth/redefinir-senha` e tela de redefinição estão sendo desenvolvidas em paralelo na branch `feat/issue-13-redefinicao-senha`.
2. **Planos de Doação, Aba Doadores e Trava Financeira Real (`PB-060`/`PB-061`):** previstos nas Sprints 2 e 5; o serviço `hasFinancialHistoryInDatabase` já está isolado em `src/lib/contact-service.ts` para receber a consulta assim que as tabelas existirem.
3. **Envio SMTP real (`PB-002`):** previsto na Sprint 3 (permanece `[DEV E-MAIL]` em desenvolvimento).
4. **Rate limit distribuído em serverless para `POST /api/auth/recuperar-senha`:** `src/lib/rate-limit.ts` permanece em memória de processo (funcional localmente; em produção serverless Vercel/Neon recomenda-se migrar para store distribuído ou tabela dedicada em melhoria futura).
5. **Módulos de Sprints 2 a 6:** Funis, Listas, E-mails/Automações, Financeiro, Relatórios, Gestão de Usuários e tela de Auditoria permanecem no estado de protótipo até suas respectivas sprints; `luz-crm-theme` continua no `localStorage`.

---

## 4. Validação Técnica (DoD)

Execute na raiz do projeto com PostgreSQL / Docker Desktop ativo:

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/luz_crm?schema=public"
npx prisma validate
npm run db:generate
npx tsc --noEmit
npm run build
npm test
```

### Casos de QA destravados no `docs/homologacao-qa.md`

| Caso | Status para homologação ponta a ponta no PostgreSQL |
| :--- | :--- |
| `CT-01.01` a `CT-01.04` | ✅ Destravados (incluindo botão *"Esqueci minha senha"*, `429` na UI e auditoria de logout/recuperação) |
| `CT-01.05` (`#13`) | ⏳ Aguardando merge da branch `feat/issue-13-redefinicao-senha` |
| `CT-03.01` a `CT-03.05` | ✅ Destravados 100% no PostgreSQL (exceto aba *Doadores* / vínculo financeiro real até `PB-060`/`PB-061`) |
