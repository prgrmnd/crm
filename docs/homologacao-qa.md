# Caderno Mestre de Homologação Funcional (QA) — CRM Luz da Esperança

> **Versão:** 1.2 (Alinhado ao Sprint Planning Oficial — Sprints 1 a 6)  
> **Público-alvo:** Equipe de QA (`QA-01`), UX (`UX-01`), Engenharia e Liderança Técnica (`LT-01`)  
> **Caráter:** Caderno oficial de validação funcional e de regras de negócio exigidas pela **WBS (53 telas / 57 tabelas)**  
> **Documentos relacionados:** [README](../README.md) · [Documentação Técnica](./documentacao-tecnica.md) · [Caderno de Homologação UX](./homologacao-ux.md) · [Guia de Auditoria Técnica e Code Review](./guia-auditoria-code-review.md)

---

## Sumário

1. [Instruções de Uso e Critérios de Aprovação](#1-instruções-de-uso-e-critérios-de-aprovação)
2. [Painel de Acompanhamento Geral](#2-painel-de-acompanhamento-geral)
3. [Pré-requisitos de Ambiente e Massa de Dados](#3-pré-requisitos-de-ambiente-e-massa-de-dados)
4. [Ciclo 1: Homologação da Sprint 1 (Acesso, Sessão e Contatos 360°)](#4-ciclo-1-homologação-da-sprint-1-acesso-sessão-e-contatos-360)
5. [Ciclo 2: Homologação da Sprint 2 (Funis de Captação, Perdas e Adesões)](#5-ciclo-2-homologação-da-sprint-2-funis-de-captação-perdas-e-adesões)
6. [Ciclo 3: Homologação da Sprint 3 (Listas, Importação e Mensageria)](#6-ciclo-3-homologação-da-sprint-3-listas-importação-e-mensageria)
7. [Ciclo 4: Homologação da Sprint 4 e Auditoria Financeira da Sprint 5 (Automações, Triagem e Financeiro)](#7-ciclo-4-homologação-da-sprint-4-e-auditoria-financeira-da-sprint-5-automações-triagem-e-financeiro)
8. [Ciclo 5: Homologação da Sprint 6 e Entrega Final (Relatórios, Admin, Guia Operacional e HO-01)](#8-ciclo-5-homologação-da-sprint-6-e-entrega-final-relatórios-admin-guia-operacional-e-ho-01)

---

## 1. Instruções de Uso e Critérios de Aprovação

1. Este arquivo centraliza todos os testes funcionais e de regra de negócio exigidos pela **WBS (53 telas / 57 tabelas)**.
2. **Como registrar execuções no GitHub:**
   - Em arquivos `.md` do repositório, os checkboxes são exibidos como somente leitura. A cada sprint, a equipe de QA (`QA-01` e `UX-01`) deve marcar `[x]` editando este arquivo via **Pull Request** (ou copiar o checklist do ciclo para uma **Issue de Homologação** no GitHub para marcação interativa e consolidar o resultado final aqui no fechamento do ciclo).
3. **Regra de Registro por Caso de Teste:**
   - **`PASSOU`:** comportamento validado integralmente conforme o resultado esperado.
   - **`FALHOU`:** divergência funcional ou de regra de negócio. Preencha **Observação / Issue** e abra uma Issue vinculada antes de aprovar a entrega.
   - **`BLOQUEADO`:** impossibilidade de execução por dependência técnica ou funcionalidade ainda não entregue na branch atual. Preencha **Observação / Issue** com o motivo e o rastreio da pendência.
4. **Critério de Fechamento do Ciclo:**
   - Um ciclo só pode ser marcado como `APROVADO` quando não houver nenhum caso em `FALHOU` de severidade crítica ou bloqueante em aberto e todos os casos `BLOQUEADO` estiverem justificados e vinculados às respectivas Issues/PBIs.

---

## 2. Painel de Acompanhamento Geral

| Ciclo de QA | Sprint de Execução | Itens do Planning | Escopo Validado e Entregáveis (WBS) | Status Geral | Responsável | Data de Fechamento |
| :--- | :---: | :--- | :--- | :---: | :---: | :---: |
| **Ciclo 1** | Sprint 2 (`16/11` a `23/11`) | `QA-01.1`, `QA-01.2` | Módulo 1 (Acesso), Módulo 3 (Contatos/Ficha 360°) e massa padronizada de contatos PF/PJ | `EM EXECUÇÃO` | `QA-01` | `23/11/2026` |
| **Ciclo 2** | Sprint 3 (`24/11` a `30/11`) | `QA-02.1`, `QA-02.2` | Módulo 4 (Captação/Perdas), Módulo 5 (Doadores/Adesões), planilha modelo CSV/XLSX e massa de 10k linhas | `AGUARDANDO S2` | `QA-01` | `30/11/2026` |
| **Ciclo 3** | Sprint 4 (`01/12` a `07/12`) | `QA-03.1` | Módulo 6 (Listas/Importação) e Módulo 7 (E-mails/Recorrências) | `AGUARDANDO S3` | `QA-01` | `07/12/2026` |
| **Ciclo 4** | Sprint 5 (`08/12` a `14/12`) | `QA-04.1`, `QA-04.2` | Módulo 8 (Automações), Módulo 9 (Pós-Cadastro), Módulo 10 (Doações/Recibos) e Módulo 2 (Painel/Sino) | `AGUARDANDO S4` | `QA-01` | `14/12/2026` |
| **Ciclo 5** | Sprint 6 (`15/12` a `18/12`) | `QA-05.1`, `HO-01` | Módulo 11 (Relatórios), Módulo 12 (Admin), Guia Rápido de Operação, Evidências (53 submódulos) e Regressão Geral | `AGUARDANDO S5` | `QA-01` / `UX-01` / `LT-01` | `18/12/2026` |

> **Trilha de UX (`UX-01`):** os testes moderados com usuários reais, auditorias de responsividade/UI e entregas de templates visuais/impressão (`UX-01.1` a `UX-05.1`) são acompanhados no **[Caderno de Homologação UX](./homologacao-ux.md)**.

---

## 3. Pré-requisitos de Ambiente e Massa de Dados

Antes de iniciar a homologação funcional, certifique-se de que o ambiente local ou de homologação esteja configurado conforme o [README](../README.md) e a [Documentação Técnica](./documentacao-tecnica.md):

1. **Banco de dados e aplicação ativos:**
   - PostgreSQL 13+ acessível via `DATABASE_URL` no arquivo `.env`.
   - Migrations aplicadas (`npm run db:migrate` ou `npm run db:deploy`) e Prisma Client gerado (`npm run db:generate`).
   - Aplicação em execução (`npm run dev` ou `npm run build && npm start`).
2. **Contas de teste necessárias (tabela `usuarios`):**
   - **Administrador ativo** (criado via `npm run db:bootstrap-admin` quando a tabela `usuarios` estiver vazia).
   - **Operador de Captação ativo** (`perfil = 'operador_captacao'`, `ativo = true`).
   - **Usuário inativo** (`ativo = false`) para validação de bloqueio no `CT-01.03`.
3. **Massa de contatos:**
   - Para testar dados persistidos em `GET /api/contacts` (`CT-03.01`), cadastre registros na tabela `contatos` do PostgreSQL (com `DATABASE_URL` configurada, as abas **Todos** e **Potenciais** exibem *empty state* real quando vazias; apenas a aba **Doadores** mantém fallback de demonstração até `PB-060`/`PB-061`).
   - Para o `CT-03.03`, tenha ao menos 1 contato **sem histórico financeiro** e 1 contato **com vínculo/histórico financeiro**.
4. **Inspeção de evidências técnicas:**
   - Em `NODE_ENV=development`, e-mails de recuperação são simulados no terminal do servidor com o prefixo `[DEV E-MAIL]`.
   - Para auditar tabelas do banco (`usuarios`, `sessoes`, `tentativas_login`, `tokens_recuperacao`, `eventos_auditoria`), utilize `npm run db:studio` ou cliente SQL (`psql`).
   - Para validar triggers e constraints reais do PostgreSQL que ainda não possuem tela ligada, execute a suíte automatizada (`npm test`) descrita na [Documentação Técnica](./documentacao-tecnica.md#5-verificação-e-testes).

---

## 4. Ciclo 1: Homologação da Sprint 1 (Acesso, Sessão e Contatos 360°)

*Base: `PB-001` a `PB-003` e `PB-007` a `PB-011` | Executar durante a Sprint 2 (`16/11` a `23/11/2026`)*

### Módulo 1 — Acesso e Sessão (`WBS 1.1` a `1.3`)

#### `CT-01.01` — Bloqueio Temporário por Força Bruta no Login (`PB-001` / `WBS 1.1`)
* **O que fazer (Passo a Passo):**
  1. Acesse a tela de Login com um e-mail válido cadastrado.
  2. Digite uma senha incorreta e clique em **Entrar** por **5 vezes consecutivas**.
  3. Na 6ª tentativa, digite a **senha correta** imediatamente.
  4. Aguarde **1 minuto** e tente entrar novamente com a senha correta.
* **Resultado Esperado:** Na 5ª/6ª tentativa o sistema bloqueia o acesso informando o bloqueio temporário (mesmo digitando a senha correta). Após 1 minuto, o login volta a funcionar normalmente.
* **Resultado do Teste:**
  - [ ] **PASSOU**
  - [ ] **FALHOU**
  - [ ] **BLOQUEADO**
  - **Observação / Issue:** `—`

---

#### `CT-01.02` — Expiração de Sessão por Inatividade (`PB-001` / `WBS 1.1`)
* **O que fazer (Passo a Passo):**
  1. Faça login com um usuário válido (Administrador ou Operador).
  2. Deixe a aba aberta sem clicar em nada, sem navegar e sem disparar requisições por **30 minutos**.
  3. Após os 30 minutos, clique em qualquer menu (ex.: *Contatos*) ou tente salvar um registro.
* **Resultado Esperado:** O servidor recusa a requisição por sessão expirada e redireciona o usuário de volta para a tela de Login.
* **Resultado do Teste:**
  - [ ] **PASSOU**
  - [ ] **FALHOU**
  - [ ] **BLOQUEADO**
  - **Observação / Issue:** `—`

---

#### `CT-01.03` — Direcionamento por Perfil e Recusa de Conta Inativa (`PB-001` / `WBS 1.1`)
* **O que fazer (Passo a Passo):**
  1. Entre com uma conta de **Operador de Captação** e observe a tela inicial e menus exibidos.
  2. Saia e entre com uma conta de **Administrador**.
  3. Tente fazer login com um usuário marcado como **Inativo** no banco.
* **Resultado Esperado:** Operador acessa apenas áreas permitidas (direcionado ao funil de captação, sem menus administrativos/relatórios exclusivos de Admin); Administrador é direcionado à visão geral; conta inativa tem acesso recusado pelo servidor.
* **Resultado do Teste:**
  - [ ] **PASSOU**
  - [ ] **FALHOU**
  - [ ] **BLOQUEADO**
  - **Observação / Issue:** `—`

---

#### `CT-01.04` — Resposta Neutra e Rate Limit na Recuperação de Senha (`PB-002` / `WBS 1.2`)
* **O que fazer (Passo a Passo):**
  1. Acesse *Esqueci minha senha*.
  2. Informe um **e-mail inexistente** no sistema e envie. Anote a mensagem exibida na tela.
  3. Repita o processo informando um **e-mail válido cadastrado e ativo**.
  4. Repita o envio para um **e-mail de conta inativa**.
  5. Dispare múltiplas requisições seguidas para testar o limite de taxa (*rate limit*) da rota `POST /api/auth/recuperar-senha`.
* **Resultado Esperado:** A mensagem exibida na tela e o status HTTP (`200`) são **idênticos e neutros** para e-mail inexistente, ativo ou inativo (não revela se a conta existe). O token de recuperação é gerado apenas para a conta ativa. Requisições excessivas são barradas com `HTTP 429`.
* **Nota técnica (versão atual `develop`):** O envio de e-mail ainda é **simulado em desenvolvimento**. Valide a geração do token no log `[DEV E-MAIL]` do console do servidor e o hash SHA-256 gravado na tabela `tokens_recuperacao` (a validação de entrega SMTP real ficará condicionada à integração do provedor de e-mail).
* **Resultado do Teste:**
  - [ ] **PASSOU**
  - [ ] **FALHOU**
  - [ ] **BLOQUEADO**
  - **Observação / Issue:** `—`

---

#### `CT-01.05` — Redefinição de Senha com Token Único e Invalidação de Sessões (`PB-003` / `WBS 1.3`)
* **O que fazer (Passo a Passo):**
  1. Mantenha o usuário logado no **Navegador A** (ou aba anônima).
  2. Solicite recuperação de senha e abra o link recebido no **Navegador B**.
  3. Cadastre a nova senha e salve.
  4. Tente abrir o **mesmo link** de recuperação novamente.
  5. Volte ao **Navegador A** (que estava logado antes) e tente navegar no sistema.
* **Resultado Esperado:** A senha é alterada; a reutilização do link é recusada; a sessão antiga no Navegador A é invalidada imediatamente. *(Teste complementar: validar link expirado após 15 minutos).*
* **Nota técnica (versão atual `develop`):** A rota `GET/POST /api/auth/redefinir-senha` e a tela `#redefinir=<token>` (`PB-003`) já estão integradas na `develop` (incluindo bloqueio do formulário até validação do token, limpeza do token na URL e erro opaco para conta inativa). Utilize o link impresso em `[DEV E-MAIL]` no console do servidor em desenvolvimento.
* **Resultado do Teste:**
  - [ ] **PASSOU**
  - [ ] **FALHOU**
  - [ ] **BLOQUEADO**
  - **Observação / Issue:** `—`

---

### Módulo 3 — Contatos e Relacionamento (`WBS 3.1` a `3.5`)

#### `CT-03.01` — Consulta, Filtros, Seleção entre Páginas e Exportação CSV (`PB-007` / `WBS 3.1`)
* **O que fazer (Passo a Passo):**
  1. Acesse a listagem de Contatos e alterne entre as abas **Todos**, **Potenciais Doadores** e **Doadores**.
  2. Selecione 2 contatos na **Página 1**, avance para a **Página 2**, selecione mais 1 contato e volte para a **Página 1**.
  3. Clique em **Exportar CSV** e abra o arquivo gerado (teste com seleção ativa e sem seleção).
* **Resultado Esperado:** A seleção feita na Página 1 permanece preservada ao navegar entre páginas; o arquivo CSV usa UTF-8 com BOM e separador `;`, exportando somente os selecionados quando há seleção ou o resultado filtrado completo quando não há seleção.
* **Nota técnica (versão atual `develop`):** A listagem e exportação CSV de **Todos** e **Potenciais** consultam diretamente o PostgreSQL (exibindo *empty state* real quando a tabela `contatos` está vazia). Apenas a aba **Doadores** mantém fallback de demonstração até a entrega de planos/pagamentos (`PB-060`/`PB-061`).
* **Resultado do Teste:**
  - [ ] **PASSOU**
  - [ ] **FALHOU**
  - [ ] **BLOQUEADO**
  - **Observação / Issue:** `—`

---

#### `CT-03.02` — Cadastro em Duas Etapas, Regra Inbound e Bloqueio de Duplicidade (`PB-008` / `WBS 3.2`)
* **O que fazer (Passo a Passo):**
  1. Inicie um novo cadastro informando apenas o **Nome** (sem e-mail e sem telefone) e tente avançar.
  2. Preencha e-mail ou telefone, avance para a Etapa 2 e selecione Origem **Site** ou **Instagram**.
  3. Conclua o cadastro. Em seguida, tente cadastrar um **novo contato usando o mesmo e-mail ou mesmo CPF/CNPJ**.
* **Resultado Esperado:** O sistema exige ao menos e-mail ou telefone; para *Site* e *Instagram*, a classificação é travada como **Inbound**; a tentativa de cadastrar e-mail ou documento duplicado é bloqueada.
* **Nota técnica (versão atual `develop`):** O cadastro e a edição em duas etapas persistem diretamente na tabela `contatos` via `POST /api/contacts` e `PATCH /api/contacts/[id]`, com controle otimista (`versao`), regra Inbound, bloqueio de duplicidade (`HTTP 409`) e auditoria em `eventos_auditoria`.
* **Resultado do Teste:**
  - [ ] **PASSOU**
  - [ ] **FALHOU**
  - [ ] **BLOQUEADO**
  - **Observação / Issue:** `—`

---

#### `CT-03.03` — Ficha 360° e Trava de Exclusão com Vínculo Financeiro (`PB-009` / `WBS 3.3`)
* **O que fazer (Passo a Passo):**
  1. Logado como **Operador**, abra a Ficha 360° de qualquer contato e verifique se existe botão de excluir (e valide `HTTP 403` em chamada direta a `DELETE /api/contacts/[id]`).
  2. Logado como **Administrador**, exclua um contato **sem histórico financeiro**.
  3. Logado como **Administrador**, tente excluir um contato que possua **vínculo/histórico financeiro** (na interface e via requisição direta a `DELETE /api/contacts/[id]`).
* **Resultado Esperado:** Operador não possui permissão de exclusão; Administrador consegue excluir contato sem histórico financeiro (com registro em `eventos_auditoria`), mas a interface e o servidor (`HTTP 409`) recusam a exclusão quando há histórico financeiro.
* **Nota técnica (versão atual `develop`):** A Ficha 360° (`GET /api/contacts/[id]`) e a exclusão lógica (`DELETE /api/contacts/[id]`) operam diretamente no PostgreSQL com trava `403` para Operador, idempotência e auditoria. A checagem de vínculo financeiro (`hasFinancialHistoryInDatabase`) está estruturada para receber a consulta às tabelas de planos/pagamentos na entrega de `PB-060`/`PB-061`.
* **Resultado do Teste:**
  - [ ] **PASSOU**
  - [ ] **FALHOU**
  - [ ] **BLOQUEADO**
  - **Observação / Issue:** `—`

---

#### `CT-03.04` — Registro Imutável de Interações na Linha do Tempo (`PB-010` / `WBS 3.4`)
* **O que fazer (Passo a Passo):**
  1. Na Ficha 360° de um contato, registre uma interação escolhendo o canal (Telefone, WhatsApp, Reunião ou E-mail).
  2. Tente informar uma **data/hora futura** (ex.: amanhã) ou deixar o **resumo em branco** (ou acima de 3.000 caracteres).
  3. Salve uma interação válida e procure opções para **editar ou apagar** essa anotação na tela.
* **Resultado Esperado:** O sistema bloqueia data futura, resumo vazio e texto acima do limite; após salva, a interação aparece na linha do tempo com autor e data/hora, **sem opção de edição ou exclusão**.
* **Nota técnica (versão atual `develop`):** O formulário rápido persiste diretamente na tabela `interacoes` via `POST /api/contacts/[id]/interacoes` (com idempotência e auditoria), protegido por triggers de imutabilidade física no PostgreSQL.
* **Resultado do Teste:**
  - [ ] **PASSOU**
  - [ ] **FALHOU**
  - [ ] **BLOQUEADO**
  - **Observação / Issue:** `—`

---

#### `CT-03.05` — Registro Manual de Resposta e Bloqueio Compulsório por Opt-out (`PB-011` / `WBS 3.5`)
* **O que fazer (Passo a Passo):**
  1. Na Ficha 360° de um contato, registre manualmente uma resposta classificando-a como **Pedido de Descadastro (Opt-out)**.
  2. Verifique a linha do tempo e o status de elegibilidade de comunicação do contato.
* **Resultado Esperado:** O descadastro fica registrado na linha do tempo com autor/data e marca o contato como inelegível/bloqueado para futuros envios de e-mail.
* **Nota técnica (versão atual `develop`):** Os fluxos de resposta e opt-out na Ficha 360° persistem diretamente em `respostas_contato` via `POST /api/contacts/[id]/respostas`, acionando a trigger transacional `respostas_registrar_descadastro` que atualiza `preferencias_comunicacao` (`descadastrado`) e registra `comunicacao.descadastro` em `eventos_auditoria`.
* **Resultado do Teste:**
  - [ ] **PASSOU**
  - [ ] **FALHOU**
  - [ ] **BLOQUEADO**
  - **Observação / Issue:** `—`

---

### Entregável de Massa de Dados (`QA-01.2` — Sprint 2)

#### `QA-01.2` — Massa de Dados Padronizada de Contatos (`WBS 3.1–3.2` / MUST)
* **O que fazer:** Preparar carga estruturada de contatos **PF e PJ** distribuídos nas **6 origens oficiais** (`instagram`, `site`, `indicacao`, `email`, `evento`, `whatsapp`), cobrindo casos de borda (com/sem e-mail, com/sem telefone, documentos válidos) para suportar a homologação das Sprints 2 e 3.
* **Resultado Esperado:** Massa padronizada validada e disponível para uso de `QA-01`, `UX-01` e `DEVs` nos ciclos de Funis, Adesões e Listas.
* **Resultado da Entrega:**
  - [ ] **PASSOU**
  - [ ] **FALHOU**
  - [ ] **BLOQUEADO**
  - **Observação / Issue:** `—`

> **Usabilidade e UI da Sprint 1 (`UX-01.1` e `UX-01.2`):** consulte e registre no [Caderno de Homologação UX — Ciclo 1](./homologacao-ux.md#4-ciclo-1-homologação-ux-da-sprint-1-e-artefatos-da-s2-ux-011-e-ux-012).

---

## 5. Ciclo 2: Homologação da Sprint 2 (Funis de Captação, Perdas e Adesões)

*Base: `PB-012` a `PB-021` | Será detalhado e executado durante a Sprint 3 (`24/11` a `30/11/2026`)*

#### `CT-04.01` — Funil de Captação Kanban, Lista e Concorrência (`PB-012`)
Validar movimentação nas 4 etapas oficiais, navegação mobile/teclado e conflito de edição simultânea por dois operadores.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `CT-04.02` — Movimentação Atômica e Evento Único via Outbox (`PB-013`)
Confirmar gravação de histórico e ausência de duplicidade de evento ao confirmar duas vezes.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `CT-04.03` — Funil de Perdas, Saída da Cadência e Cancelamento de Envios (`PB-014`, `PB-015`)
Validar preservação da última etapa de captação, obrigatoriedade de texto em *Outros* e cancelamento de mensagens agendadas.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `CT-04.04` — Retomada Agendada e Retorno à Cadência (`PB-016`, `PB-017`)
Exigir data futura em *Retomada agendada* (sem envio automático) e confirmar retorno sem reativar e-mails cancelados.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `CT-05.01` — Consulta de Doadores e Tag Dinâmica Sócio Inscrito (`PB-018`)
Verificar que contato convertido sem pagamento aparece como *Sócio Inscrito* (inclusive se Suspenso) e antigo doador não aparece.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `CT-05.02` — Conversão/Adesão sem Receita Fictícia e Comprovante PDF (`PB-019`, `PB-020`)
Validar vencimento `1-28`, ausência de lançamento no caixa e aviso expresso no PDF de que *adesão não comprova pagamento*.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `CT-05.03` — Ciclo de Status e Intervalos de Suspensão sem Sobreposição (`PB-021`)
Tentar cadastrar duas suspensões com datas sobrepostas (deve bloquear via constraint GiST) e validar preservação de débitos anteriores.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `QA-02.2` — Planilha Modelo Oficial e Massa de Estresse de 10.000 Linhas (`PB-025` / `WBS 6.5` / MUST)
Criar o arquivo modelo oficial CSV/XLSX para download na tela de importação e preparar planilhas de estresse (até 10.000 linhas misturando registros válidos, inválidos e duplicados) para homologação da Sprint 3.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

---

## 6. Ciclo 3: Homologação da Sprint 3 (Listas, Importação e Mensageria)

*Base: `PB-022` a `PB-033` | Será detalhado e executado durante a Sprint 4 (`01/12` a `07/12/2026`)*

#### `CT-06.01` — Catálogo de Listas e Desvinculação Segura (`PB-022`, `PB-023`)
Remover contato da lista e confirmar que o cadastro permanece intacto no CRM.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `CT-06.02` — Inclusão Segmentada em Lote (`PB-024`)
Validar *Selecionar todos* incluindo páginas não carregadas e bloqueio de duplicidade de vínculo.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `CT-06.03` — Importação Assíncrona CSV/XLSX até 10.000 linhas (`PB-025`)
Submeter planilha mista (válidos, inválidos e duplicados) e validar importação parcial sem derrubar o lote.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `CT-07.01` — Campanhas, Congelamento de Público e Ativação Explícita (`PB-026`, `PB-028`, `PB-030`)
Incluir novo contato na lista após aprovação da mensagem e confirmar que ele não entra no disparo congelado.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `CT-07.02` — Calendário IANA, Atrasos sem Rajada e Bloqueio Opt-out (`PB-027`, `PB-029`, `PB-031`)
Validar disparo com navegador fechado, cálculo de meses curtos (`America/Sao_Paulo`), processamento de no máximo 1 atrasada e bloqueio de descadastrados.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `CT-07.03` — Histórico Consolidado e Auditoria por Destinatário (`PB-032`, `PB-033`)
Confirmar ausência de e-mails de recuperação de senha no histórico operacional e detalhamento de estados individuais.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

---

## 7. Ciclo 4: Homologação da Sprint 4 e Auditoria Financeira da Sprint 5 (Automações, Triagem e Financeiro)

*Base: `QA-04.1` (`PB-034` a `PB-040`) e `QA-04.2` (`PB-041` a `PB-048`) | Executar durante a Sprint 5 (`08/12` a `14/12/2026`)*

### Bloco A — Automações e Triagem Pós-Cadastro (`QA-04.1` / `WBS 8, 9`)

#### `CT-08.01` — Regras por Evento e Validação Estrita de Variáveis (`PB-034`, `PB-035`)
Tentar salvar régua de cadastro usando `{{valor}}` ou `{{recibo}}` (deve recusar).
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `CT-08.02` — Ativação sem Efeito Retroativo e Envio Individual (`PB-036`, `PB-037`)
Ativar régua e verificar que contatos antigos não recebem disparo; testar envio individual respeitando opt-out.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `CT-09.01` — Unicidade e Execução Idempotente do Pós-Cadastro (`PB-038`, `PB-039`, `PB-040`)
Criar contato elegível, editar o mesmo contato depois e confirmar que a tarefa operacional não é duplicada; validar unicidade de 1 regra ativa por par `[Origem + Classificação]`.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

### Bloco B — Bateria de Auditoria Financeira e Conciliação (`QA-04.2` / `WBS 2.1, 2.2, 10`)

#### `CT-10.01` — Baixa Atômica, Recibo `LUZ-00001` e Pix Único (`PB-044`, `PB-045`)
Confirmar baixa parcial/total (reduzindo saldo na competência), rejeição de referência Pix duplicada e emissão sequencial de recibo sem duplicidade na mesma transação.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `CT-10.02` — Reenvio de Recibo e Conciliação do Painel Executivo (`PB-046`, `PB-048`, `PB-042`)
Reenviar recibo sem duplicar receita e conferir conciliação centavo por centavo entre Dashboard (`2.1`) e Recebimentos (`10.1`), validando separação entre receita recebida e previsão.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `CT-10.03` — Doador Suspenso vs Inadimplência Automática e Central do Sino (`PB-047`, `PB-041`, `PB-043`)
Validar diferença entre doador suspenso (competência desativada sem cobrança) e inadimplente (transição automática após 2 meses sem pagamento gerando tarefa de reengajamento), e confirmar persistência da conclusão da tarefa no sino.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

---

## 8. Ciclo 5: Homologação da Sprint 6 e Entrega Final (Relatórios, Admin, Guia Operacional e `HO-01`)

*Base: `PB-049`, `PB-050`, `PB-004` a `PB-006`, `QA-05.1` e `HO-01` | Executar durante a Sprint 6 (`15/12` a `18/12/2026` — congelamento e entrega formal em `18/12/2026`)*

#### `CT-11.01` — Relatórios Analíticos, Coorte e Impressão Multipáginas (`PB-049`, `PB-050`)
Validar bloqueio de acesso para Operador, totais por destinação/coorte e layout imprimível multipáginas com cabeçalhos repetidos e tratamento de período vazio.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `CT-12.01` — Gestão de Usuários, Quórum Mínimo e Auditoria Append-Only (`PB-004`, `PB-005`, `PB-006`)
Validar acesso restrito ao Administrador, tentar inativar ou rebaixar o último Administrador ativo (deve bloquear via trava serializada) e conferir trilha consolidada de auditoria append-only.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `QA-05.1` — Guia Rápido de Operação e Caderno de Evidências de Aceite (`WBS 1–12` / MUST)
Elaborar e entregar o manual operacional separado por perfil (**Administrador** e **Operador de Captação**) e o caderno consolidado de evidências dos **53 submódulos** antes do congelamento em `18/12/2026`.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `HO-01` — Homologação Integrada, Regressão Geral e Auditoria de Constraints (Todos os Módulos / MUST)
Executar junto com `LT-01`, `UX-01` e `DEVs` a regressão ponta a ponta dos 12 módulos, verificação integral de permissões Administrador/Operador e auditoria de constraints/triggers do PostgreSQL (correções impeditivas até `17/12/2026`; assinatura formal em `18/12/2026`).
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`
