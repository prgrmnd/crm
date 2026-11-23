# Issues de QA e UX — Milestone Sprint 2

> **Milestone no GitHub:** `Sprint 2 - Funis, Ciclo do Doador e Outbox Pattern`  
> **Recorte:** Todos os fluxos da Sprint 1 já integrados ao PostgreSQL na branch atual (`/api/auth/login`, `/api/auth/session`, `/api/auth/logout`, `/api/auth/recuperar-senha`, `/api/auth/redefinir-senha`, `/api/users`, `/api/contacts`, `/api/contacts/[id]`, `/api/contacts/[id]/interacoes` e `/api/contacts/[id]/respostas`), além dos artefatos habilitadores da Sprint 2 (massa de dados e template visual do Comprovante de Adesão para `#46`).  
> **Fora deste lote por enquanto:** Envio SMTP real (Sprint 3) e aba Doadores / trava financeira real (`PB-060`/`PB-061`).  
> **Documentos relacionados:** [README](../README.md) · [Documentação Técnica](./documentacao-tecnica.md) · [Caderno de Homologação QA](./homologacao-qa.md) · [Caderno de Homologação UX](./homologacao-ux.md)

---

## QA — Sprint 2

### 1. `[QA-01.1] Homologação Funcional: Login, Sessão e Perfis de Acesso`

**Título:**
```text
[QA-01.1] Homologação Funcional: Login, Sessão e Perfis de Acesso
```

**Descrição:**
```markdown
### Objetivo
Validar ponta a ponta o fluxo de autenticação, contenção de força bruta, controle de sessão e roteamento por perfil na interface e no banco PostgreSQL (`WBS 1.1`).

### Dependências
- PB-001 (#11)

### Critérios de Aceite
- [ ] Validado bloqueio temporário de 1 minuto após 5 tentativas consecutivas com senha incorreta e liberação após o prazo (`CT-01.01`).
- [ ] Validadas a expiração compulsória da sessão após 30 minutos de inatividade e a revogação correta ao realizar logout (`CT-01.02`).
- [ ] Validadas a tela inicial e visibilidade de menus por perfil (Administrador vs. Operador de Captação) e a recusa de acesso para conta inativa (`CT-01.03`).
- [ ] Resultados registrados no `docs/homologacao-qa.md` com abertura de issue para qualquer defeito encontrado.
```

---

### 2. `[QA-01.2] Homologação Funcional: Solicitação de Recuperação de Senha`

**Título:**
```text
[QA-01.2] Homologação Funcional: Solicitação de Recuperação de Senha
```

**Descrição:**
```markdown
### Objetivo
Validar o fluxo de solicitação de recuperação de senha (`POST /api/auth/recuperar-senha`), prevenção de enumeração de contas, geração do token com hash no PostgreSQL e rate limiting (`WBS 1.2`).

### Dependências
- PB-002 (#12)

### Critérios de Aceite
- [ ] Validadas mensagem visual e resposta `HTTP 200` idênticas e neutras para e-mail inexistente, conta ativa e conta inativa (`CT-01.04`).
- [ ] Confirmada a gravação do hash SHA-256 na tabela `tokens_recuperacao` (com TTL de 15 minutos e invalidação de token anterior pendente) apenas para conta ativa, sem envio SMTP real (validado via log `[DEV E-MAIL]` em desenvolvimento).
- [ ] Validada a contenção via `HTTP 429` em disparos excessivos (rate limit por IP/e-mail) e resultado registrado no `docs/homologacao-qa.md`.
```

---

### 3. `[QA-01.3] Homologação Funcional: Listagem, Filtros, Seleção em Lote e Exportação CSV`

**Título:**
```text
[QA-01.3] Homologação Funcional: Listagem, Filtros, Seleção em Lote e Exportação CSV
```

**Descrição:**
```markdown
### Objetivo
Validar a tela de listagem de contatos conectada a `GET /api/contacts`, cobrindo abas, filtros, paginação, seleção entre páginas e exportação CSV (`WBS 3.1`).

### Dependências
- PB-007 (#14)

### Critérios de Aceite
- [ ] Validadas a alternância entre abas (*Todos*, *Potenciais Doadores*, *Doadores*), os filtros combinados e a paginação mantendo os filtros ativos (`CT-03.01`).
- [ ] Validada a preservação da seleção em lote ao navegar entre páginas diferentes.
- [ ] Validada a exportação CSV em UTF-8 com BOM e separador `;` (exportando apenas os marcados quando houver seleção ou o resultado filtrado completo sem seleção) e resultado registrado no `docs/homologacao-qa.md`.
```

---

### 4. `[QA-01.4] Preparação de Massa de Dados para Testes (Usuários e Contatos)`

**Título:**
```text
[QA-01.4] Preparação de Massa de Dados para Testes (Usuários e Contatos)
```

**Descrição:**
```markdown
### Objetivo
Provisionar contas de teste e massa padronizada de contatos PF/PJ nas 6 origens oficiais para viabilizar os testes reais no banco PostgreSQL durante a Sprint 2.

### Dependências
- PB-052 (#4)
- PB-055 (#6)
- PB-057 (#7)

### Critérios de Aceite
- [ ] Provisionadas contas de teste nos perfis necessários: Administrador ativo, Operador de Captação ativo e usuário inativo.
- [ ] Preparada massa de contatos PF e PJ com documentos válidos distribuídos nas 6 origens oficiais (`instagram`, `site`, `indicacao`, `email`, `evento`, `whatsapp`), cobrindo casos de borda (só e-mail, só telefone, textos extensos).
- [ ] Massa validada e disponibilizada para QA, UX e DEVs com status atualizado no `docs/homologacao-qa.md`.
```

---

## UX — Sprint 2

### 5. `[UX-01.1] Teste de Usabilidade e UI: Login, Recuperação de Senha e Navegação Inicial`

**Título:**
```text
[UX-01.1] Teste de Usabilidade e UI: Login, Recuperação de Senha e Navegação Inicial
```

**Descrição:**
```markdown
### Objetivo
Avaliar com operadores reais a experiência de acesso, clareza das mensagens de erro/recuperação de senha e navegação inicial por perfil (`WBS 1.1 e 1.2`).

### Dependências
- PB-001 (#11)
- PB-002 (#12)

### Critérios de Aceite
- [ ] Sessão moderada realizada com ao menos 2 operadores avaliando login, mensagens de erro/bloqueio temporário, resposta neutra de recuperação de senha e diferenciação de menus por perfil (`UX-01.01`).
- [ ] Verificadas responsividade (`375px`, `768px`, `1280px`), contraste e navegação por teclado (`Tab`, `Enter`, `Esc`) na tela de acesso e navegação principal.
- [ ] Achados e severidades consolidados em `docs/ux/relatorio-usabilidade-s1.md`, com issues abertas para atritos Críticos/Altos e status atualizado em `docs/homologacao-ux.md`.
```

---

### 6. `[UX-01.2] Auditoria de Usabilidade e Responsividade: Listagem de Contatos`

**Título:**
```text
[UX-01.2] Auditoria de Usabilidade e Responsividade: Listagem de Contatos
```

**Descrição:**
```markdown
### Objetivo
Auditar layout responsivo, estados vazios e usabilidade dos controles de filtros, seleção em lote e exportação CSV na tela de listagem de contatos (`WBS 3.1`).

### Dependências
- PB-007 (#14)

### Critérios de Aceite
- [ ] Tela de listagem (abas, filtros, paginação, barra de seleção em lote e botão Exportar CSV) inspecionada em Mobile (`375px`), Tablet (`768px`) e Desktop (`1280px`/`1440px`) sem quebras de layout (`UX-01.04`).
- [ ] Validados estados vazios (*empty states* em buscas sem resultado), quebra de nomes/e-mails longos e clareza das ações em lote.
- [ ] Eventuais ajustes Críticos/Altos registrados em issues vinculadas e resultado atualizado em `docs/homologacao-ux.md`.
```

---

### 7. `[UX-01.3] Template Visual do Comprovante Institucional de Adesão (A4/PDF)`

**Título:**
```text
[UX-01.3] Template Visual do Comprovante Institucional de Adesão (A4/PDF)
```

**Descrição:**
```markdown
### Objetivo
Elaborar e entregar o template visual HTML/CSS do Comprovante Institucional de Adesão em formato A4 para destravar a implementação de `PB-020` (#46) na Sprint 2.

### Dependências
- Nenhuma (artefato habilitador para PB-020 / #46)

### Critérios de Aceite
- [ ] Template contemplando dados institucionais da Luz da Esperança (logo, nome, CNPJ, cidade/UF), dados do doador, modalidade (Pontual/Recorrente), valor pactuado, dia de vencimento (`1–28`) e data da adesão (`UX-01.05`).
- [ ] Aviso legal obrigatório de que **a adesão NÃO comprova pagamento** exibido com destaque tipográfico e visual inequívoco.
- [ ] Layout validado em folha A4 (PDF/impressão, inclusive em preto e branco) e disponibilizado com referência na issue #46 e atualização em `docs/homologacao-ux.md`.
```
