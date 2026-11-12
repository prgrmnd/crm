# Guia de Auditoria Técnica e Revisão de Código (Code Review) — CRM Luz da Esperança

> **Versão:** 1.0 (Consolidação Sprint 1)  
> **Público-alvo:** Engenheiros de Software, Revisores e Liderança Técnica (Tech Lead)  
> **Caráter:** Referência normativa obrigatória para abertura, manutenção e homologação de Pull Requests (PRs)

---

## Sumário

1. [Diretrizes Gerais de Governança](#1-diretrizes-gerais-de-governança)
2. [Checklist de Pré-Requisitos e Inspeção Estática (Pipeline Local)](#2-checklist-de-pré-requisitos-e-inspeção-estática-pipeline-local)
3. [Critérios Obrigatórios de Arquitetura e Segurança](#3-critérios-obrigatórios-de-arquitetura-e-segurança)
4. [Fluxo Operacional de Homologação (Passo a Passo do Revisor)](#4-fluxo-operacional-de-homologação-passo-a-passo-do-revisor)

---

## 1. Diretrizes Gerais de Governança

A estabilidade da branch principal de integração (`develop`) depende do cumprimento rigoroso de escopo, nomenclatura e sincronização prévia.

### 1.1. Regra de Escopo Estrito (Zero Alterações Espúrias)

Cada Pull Request deve conter **exclusivamente** os arquivos criados ou modificados para atender aos critérios de aceite da respectiva Issue/Product Backlog Item (PBI).

- **Proibição expressa de regressão ou deleção cruzada:** É terminantemente proibido reverter, sobrescrever ou excluir arquivos introduzidos por outras issues já integradas na `develop`, tais como:
  - Migrations do Prisma (`prisma/migrations/*`).
  - Modelos, enums ou índices em `prisma/schema.prisma`.
  - Suítes de testes de integração ou banco de dados (ex.: `tests/tokens-recuperacao.integration.test.cjs`).
  - Utilitários compartilhados de infraestrutura (`src/lib/*`, `scripts/*`).
- **Higiene de artefatos:** Arquivos temporários de ambiente, logs, dumps ou pastas de build (`.next/`, `node_modules/`) nunca devem ser versionados.

### 1.2. Padrão de Branches e Amarração com Issues

| Tipo de Entrega | Padrão de Nomenclatura da Branch | Exemplo |
| :--- | :--- | :--- |
| Nova Funcionalidade / História | `feat/issue-<numero>-<slug>` | `feat/issue-20-api-recuperacao-senha` |
| Correção de Bug / Hotfix | `fix/issue-<numero>-<slug>` | `fix/issue-24-trigger-tokens-recuperacao` |
| Refatoração / Infraestrutura | `chore/issue-<numero>-<slug>` | `chore/issue-12-setup-prisma-docker` |

- **Vinculação obrigatória no PR:** A descrição do Pull Request (e preferencialmente o commit principal de fechamento) deve conter a diretiva automática do GitHub:
  ```markdown
  Closes #<numero>
  ```

### 1.3. Política de Merge e Sincronização Prévia

- **Responsabilidade do Autor:** Antes de solicitar revisão (Code Review) ou marcar o PR como *Ready for Review*, o autor **deve obrigatoriamente** atualizar sua branch com o estado mais recente de `origin/develop` (`git fetch origin && git rebase origin/develop` ou `git merge origin/develop`).
- **Vedação de transferência de conflitos:** PRs com conflitos de merge abertos no GitHub ou defasados em relação às migrations e contratos da `develop` serão rejeitados imediatamente (*Changes Requested*), não cabendo à liderança técnica resolver conflitos de código elementares do autor.

---

## 2. Checklist de Pré-Requisitos e Inspeção Estática (Pipeline Local)

Nenhum PR pode ser aprovado sem que toda a esteira local de validação estática, geração de tipos e compilação execute com **zero erros**.

### 2.1. Sequência Obrigatória de Comandos

Execute os comandos abaixo na raiz do projeto antes de submeter ou aprovar qualquer PR:

#### PowerShell (Windows)

```powershell
# 1. Carregamento da variável de ambiente do banco de dados
$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/luz_crm?schema=public"

# 2. Validação de integridade sintática e relacional do schema Prisma
npx prisma validate

# 3. Geração do Prisma Client atualizado em node_modules/.prisma
npm run db:generate

# 4. Validação estática de tipos TypeScript (exigido: 0 erros)
npx tsc --noEmit

# 5. Compilação completa de produção Next.js
npm run build
```

#### Bash / Zsh (Linux / macOS / Git Bash)

```bash
# 1. Carregamento da variável de ambiente do banco de dados
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/luz_crm?schema=public"

# 2. Validação do schema Prisma
npx prisma validate

# 3. Geração do Prisma Client
npm run db:generate

# 4. Typecheck estrito (0 erros)
npx tsc --noEmit

# 5. Build de produção Next.js
npm run build
```

### 2.2. Validação da Suíte de Testes (Unidade/UI vs. Integração com PostgreSQL)

O projeto possui testes com diferentes requisitos de infraestrutura que devem ser compreendidos e executados adequadamente:

| Categoria de Teste | Dependência de Banco (Docker) | Como Executar | Escopo de Validação |
| :--- | :---: | :--- | :--- |
| **Testes de Unidade / Route Handlers / UI Isolada** | Não (ou via mocks controlados) | `node --test tests/<arquivo>.test.cjs` | Contratos de rota HTTP, validações de payload, regras de domínio isoladas, sanitização e respostas opacas. |
| **Testes de Integração de Banco de Dados** | **Sim (PostgreSQL ativo)** | `npm test` (usa `scripts/test-with-postgres.cjs`) | Migrations, constraints, triggers PL/pgSQL (`55000`), índices parciais e transações reais no PostgreSQL (ex.: `tests/tokens-recuperacao.integration.test.cjs`). |

> **Atenção:** Certifique-se de que o serviço Docker do PostgreSQL esteja em execução antes de rodar `npm test` para que a suíte de integração valide os triggers e constraints reais do banco.

---

## 3. Critérios Obrigatórios de Arquitetura e Segurança

Durante o Code Review, o revisor deve inspecionar o código linha a linha contra as seguintes regras arquiteturais e de segurança estabelecidas na Sprint 1:

### 3.1. Triggers e Imutabilidade no PostgreSQL

O banco de dados do CRM Luz da Esperança implementa **triggers de imutabilidade e integridade de estado** (ex.: tabela `tokens_recuperacao_senha` e registros de auditoria). Tentativas de atualizar registros já finalizados (consumidos ou invalidados) disparam erro nativo do PostgreSQL com código SQLSTATE `55000` (*object_not_in_prerequisite_state*).

- **Regra 1 — Filtros Restritivos Obrigatórios em Updates:** Nunca execute `update` ou `updateMany` amplos baseados apenas em `usuarioId`. Sempre restrinja a cláusula `where` apenas aos registros ativos:
  ```typescript
  // CORRETO: Atualiza apenas tokens ativos, evitando acionar a trigger de imutabilidade (erro 55000)
  await tx.tokenRecuperacaoSenha.updateMany({
    where: {
      usuarioId: usuario.id,
      consumidoEm: null,
      invalidadoEm: null,
    },
    data: {
      invalidadoEm: agora,
    },
  });
  ```
- **Regra 2 — Transações Atômicas (`prisma.$transaction`):** Operações que invalidam estados anteriores e criam um novo registro (ou alteram múltiplas tabelas correlatas) devem sempre ser encapsuladas em `prisma.$transaction(async (tx) => { ... })` para garantir atomicidade e evitar violação de índices únicos parciais em concorrência.

### 3.2. Proteção de Rota e Prevenção de Enumeração de Contas

Rotas públicas ou sensíveis de autenticação (ex.: `POST /api/auth/recuperar-senha`, login, redefinição de credenciais) não podem revelar se um e-mail, CPF ou identificador existe ou está inativo na base.

- **Resposta Opaca e Neutra:** O status HTTP (ex.: `200 OK` ou `202 Accepted`) e a estrutura/mensagem do payload JSON devem ser **idênticos** nos cenários de:
  1. Conta existente e ativa.
  2. Conta inexistente.
  3. Conta inativa ou bloqueada.
- **Tratamento Seguro de Exceções (Zero Vazamento por HTTP 500):** Erros inesperados em camadas internas ou falhas de concorrência não devem vazar stack traces ou diferenciar o comportamento externo de forma que permita inferir a existência do registro. Blocos `try/catch` devem capturar falhas operacionais, registrar log seguro interno e manter a resposta padronizada sempre que aplicável ao requisito de anti-enumeração.

### 3.3. Idempotência e Auditoria

- **Idempotência (`withIdempotency`):** Operações mutáveis críticas (`POST`, `DELETE`) sujeitas a retentativas de rede ou duplo clique devem utilizar o wrapper/mecanismo de idempotência do projeto (`withIdempotency`), garantindo que requisições repetidas com a mesma chave (`Idempotency-Key`) retornem o resultado consolidado sem duplicar efeitos colaterais no banco.
- **Gravação Sanitizada em `eventos_auditoria`:** Toda operação crítica deve registrar trilha em `eventos_auditoria`. É **estritamente proibido** persistir nos metadados JSON de auditoria:
  - Senhas em texto puro (`senha`, `password`, `novaSenha`).
  - Tokens de recuperação ou sessão em formato bruto (não-hasheado).
  - Segredos de aplicação ou chaves privadas.

### 3.4. Testes de Rotas Next.js (App Router)

- **Proibição de `fetch` para Servidor Externo Local:** Suítes de teste automatizadas **não podem** depender de um servidor Next.js rodando externamente em `http://127.0.0.1:3000` ou `localhost:3000`. Testes acoplados a portas de rede geram falsos negativos em CI/CD e lentidão.
- **Invocação Direta de Route Handlers:** Os testes de rotas da API (`src/app/api/**/route.ts`) devem importar e invocar diretamente a função HTTP exportada (`POST(req)`, `GET(req)`, `DELETE(req)`), passando instâncias nativas ou mockadas de `Request`:
  ```javascript
  // CORRETO: Invocação direta do handler sem dependência de servidor HTTP na porta 3000
  const { POST } = await import('../src/app/api/auth/recuperar-senha/route.ts');

  const request = new Request('http://localhost/api/auth/recuperar-senha', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'usuario@exemplo.org' }),
  });

  const response = await POST(request);
  assert.strictEqual(response.status, 200);
  ```

---

## 4. Fluxo Operacional de Homologação (Passo a Passo do Revisor)

Todo revisor ou Tech Lead deve seguir este roteiro padronizado para auditar um Pull Request antes do merge na `develop`.

### 4.1. Checkout e Inspeção de Diff Isolado

```powershell
# 1. Atualizar referências remotas
git fetch origin --prune

# 2. Fazer checkout da branch do PR
git checkout <branch-do-pr>

# 3. Inspecionar lista de arquivos alterados em relação à develop
git diff --name-status origin/develop...HEAD

# 4. Auditar o diff completo isolado
git diff origin/develop...HEAD
```

**Critério de Bloqueio Imediato no Passo 3:** Se `git diff --name-status origin/develop...HEAD` exibir arquivos marcados como `D` (Deleted) ou `M` (Modified) que pertençam a outras entregas já homologadas na `develop`, interrompa a revisão e solicite correção imediata de escopo.

### 4.2. Resolução de Conflitos de Merge entre Branches

Caso seja necessário sincronizar a branch com `origin/develop` durante a homologação:

```powershell
# 1. Mesclar ou fazer rebase com origin/develop
git merge origin/develop

# 2. Caso haja conflito em schema.prisma ou arquivos compartilhados:
#    - Preserve INTEGRALMENTE os modelos, enums e relações já existentes na develop.
#    - Integre aditivamente apenas os novos campos/modelos da issue atual.

# 3. Após resolver os conflitos, revalidar toda a pipeline local:
npx prisma validate
npm run db:generate
npx tsc --noEmit
npm run build
npm test
```

### 4.3. Modelo Padrão de Parecer Técnico (GitHub PR Review)

Ao concluir a auditoria, publique o parecer técnico no Pull Request utilizando o template abaixo:

```markdown
## Parecer Técnico de Auditoria — PR #<numero_pr> (Issue #<numero_issue>)

### 1. Verificação de Escopo e Governança
- [x] Branch segue o padrão de nomenclatura (`feat/issue-...` ou `fix/issue-...`).
- [x] PR vinculado corretamente à Issue (`Closes #<numero_issue>`).
- [x] Diff isolado (`git diff origin/develop...HEAD`) sem deleções ou regressões de arquivos de outras issues.
- [x] Branch atualizada com `origin/develop` sem conflitos pendentes.

### 2. Checklist de Pipeline Local e Qualidade Estática
| Etapa | Comando Executado | Status |
| :--- | :--- | :---: |
| Validação Prisma Schema | `npx prisma validate` | ✅ PASS |
| Geração Prisma Client | `npm run db:generate` | ✅ PASS |
| Typecheck Estrito (0 erros) | `npx tsc --noEmit` | ✅ PASS |
| Build de Produção Next.js | `npm run build` | ✅ PASS |
| Suíte de Testes Automatizados | `npm test` | ✅ PASS |

### 3. Critérios de Arquitetura, Banco de Dados e Segurança
- [x] **Triggers e Imutabilidade PostgreSQL:** Filtros restritivos (`consumidoEm: null, invalidadoEm: null`) e `prisma.$transaction` aplicados onde pertinente (sem risco de erro `55000`).
- [x] **Anti-Enumeração e Proteção de Rota:** Respostas HTTP opacas/neutras e tratamento seguro de exceções (sem vazamento 500).
- [x] **Idempotência e Auditoria:** Uso de `withIdempotency` (se aplicável) e gravação sanitizada em `eventos_auditoria` sem dados sensíveis.
- [x] **Testes de Rotas Next.js:** Invocação direta do handler (`POST(req)`/`GET(req)`) com `Request` mockada, sem dependência de servidor externo em `127.0.0.1:3000`.

### 4. Observações Técnicas / Apontamentos
- <Descrever pontos relevantes observados na auditoria ou ajustes obrigatórios caso haja reprovação>

---
**Veredito Final:** `APROVADO` *(ou `CHANGES REQUESTED`)*
```
