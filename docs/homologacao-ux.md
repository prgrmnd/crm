# Caderno Mestre de Homologação de UX e Usabilidade — CRM Luz da Esperança

> **Versão:** 1.0 (Alinhado ao Sprint Planning Oficial — Sprints 1 a 6)  
> **Público-alvo:** Especialista de UX (`UX-01`), Equipe de QA (`QA-01`), Engenharia e Liderança Técnica (`LT-01`)  
> **Caráter:** Caderno oficial de validação de usabilidade, auditoria de UI/responsividade, acessibilidade e entrega de artefatos visuais exigidos pela **WBS (53 telas / 57 tabelas)**  
> **Documentos relacionados:** [README](../README.md) · [Documentação Técnica](./documentacao-tecnica.md) · [Caderno de Homologação QA](./homologacao-qa.md) · [Guia de Auditoria Técnica e Code Review](./guia-auditoria-code-review.md)

---

## Sumário

1. [Instruções de Uso, Severidade e Critérios de Aprovação](#1-instruções-de-uso-severidade-e-critérios-de-aprovação)
2. [Painel de Acompanhamento Geral](#2-painel-de-acompanhamento-geral)
3. [Pré-requisitos de Ambiente, Participantes e Dispositivos](#3-pré-requisitos-de-ambiente-participantes-e-dispositivos)
4. [Ciclo 1: Homologação UX da Sprint 1 e Artefatos da S2 (UX-01.1 e UX-01.2)](#4-ciclo-1-homologação-ux-da-sprint-1-e-artefatos-da-s2-ux-011-e-ux-012)
5. [Ciclo 2: Homologação UX da Sprint 2 (UX-02.1)](#5-ciclo-2-homologação-ux-da-sprint-2-ux-021)
6. [Ciclo 3: Homologação UX da Sprint 3 e Templates S4/S5 (UX-03.1)](#6-ciclo-3-homologação-ux-da-sprint-3-e-templates-s4s5-ux-031)
7. [Ciclo 4: Homologação UX da Sprint 4 e Artefatos S5/S6 (UX-04.1)](#7-ciclo-4-homologação-ux-da-sprint-4-e-artefatos-s5s6-ux-041)
8. [Ciclo 5: Rodada Final de Usabilidade e Homologação Integrada (UX-05.1 e HO-01)](#8-ciclo-5-rodada-final-de-usabilidade-e-homologação-integrada-ux-051-e-ho-01)
9. [Modelo Padrão de Relatório de Sessão de Usabilidade](#9-modelo-padrão-de-relatório-de-sessão-de-usabilidade)

---

## 1. Instruções de Uso, Severidade e Critérios de Aprovação

1. Este arquivo centraliza toda a trilha transversal de **UX Aplicada (`UX-01`)** do planejamento oficial (Sprints 2 a 6, incluindo a homologação integrada `HO-01`), operando em ciclo contínuo com `QA-01`: enquanto o time de desenvolvimento constrói o módulo da sprint corrente, `UX-01` valida a usabilidade da sprint anterior e antecipa templates visuais/impressão da sprint seguinte.
2. **Como registrar execuções no GitHub:**
   - Em arquivos `.md` do repositório, os checkboxes são exibidos como somente leitura. A cada ciclo, `UX-01` deve marcar `[x]` editando este arquivo via **Pull Request** (ou copiar o checklist do ciclo para uma **Issue de Homologação UX** no GitHub para marcação interativa e consolidar o resultado final aqui no fechamento do ciclo).
   - Relatórios de sessões moderadas e evidências visuais devem ser armazenados em `docs/ux/` (criar a pasta ao anexar o primeiro relatório, ex.: `docs/ux/relatorio-usabilidade-s1.md`).
3. **Regra de Registro por Caso de Verificação:**
   - **`PASSOU`:** critério de usabilidade, layout, responsividade ou entrega de artefato atendido sem atritos impeditivos.
   - **`FALHOU`:** encontrado atrito crítico/alto, quebra visual ou divergência de fluxo. Preencha **Observação / Issue**, classifique a severidade e abra uma Issue vinculada antes de aprovar o ciclo.
   - **`BLOQUEADO`:** impossibilidade de execução por dependência técnica ou funcionalidade ainda não entregue na branch atual. Registre o motivo e o rastreio da pendência.
4. **Classificação de Severidade de Atritos de UX:**
   - **Crítico (Bloqueante):** impede o usuário de concluir a tarefa, oculta ação essencial, causa perda de dados ou gera interpretação financeira incorreta (ex.: comprovante de adesão parecendo recibo de pagamento).
   - **Alto (Impeditivo do Ciclo):** exige ajuda do moderador para concluir a tarefa, quebra layout em mobile/tablet (`375px`/`768px`) ou inviabiliza navegação por teclado.
   - **Médio:** causa hesitação, cliques extras ou inconsistência de microcopy, mas o usuário conclui a tarefa sem bloqueio.
   - **Cosmético:** ajuste fino de espaçamento, alinhamento ou contraste secundário (pode ser priorizado para a Sprint 6 conforme plano de contingência `R-02`).
5. **Critério de Fechamento do Ciclo:**
   - Um ciclo só pode ser marcado como `APROVADO` quando houver **0 atritos Críticos ou Altos em aberto**, todos os artefatos visuais/templates previstos para a sprint estiverem entregues ao time de desenvolvimento e todos os itens `BLOQUEADO` estiverem justificados com rastreio.

---

## 2. Painel de Acompanhamento Geral

| Ciclo de UX | Sprint de Execução | Itens do Planning | Escopo Validado e Entregáveis (WBS) | Status Geral | Responsável | Data de Fechamento |
| :--- | :---: | :--- | :--- | :---: | :---: | :---: |
| **Ciclo 1** | Sprint 2 (`16/11` a `23/11`) | `UX-01.1`, `UX-01.2` | Usabilidade S1 (WBS 1, 3), responsividade/empty states S1 e template visual do Comprovante de Adesão (`PB-020` / WBS 5.3) | `EM EXECUÇÃO` | `UX-01` | `23/11/2026` |
| **Ciclo 2** | Sprint 3 (`24/11` a `30/11`) | `UX-02.1` | Usabilidade dos Funis Kanban mobile/teclado (WBS 4.1), fluxo de adesão/suspensões (WBS 5) e legibilidade do Comprovante PDF | `AGUARDANDO S2` | `UX-01` | `30/11/2026` |
| **Ciclo 3** | Sprint 4 (`01/12` a `07/12`) | `UX-03.1` | Redação de templates iniciais de e-mail (WBS 8.1), design HTML/CSS do Recibo `LUZ-00001` (`PB-045` / WBS 10.4) e revisão UX da S3 (WBS 6, 7) | `AGUARDANDO S3` | `UX-01` | `07/12/2026` |
| **Ciclo 4** | Sprint 5 (`08/12` a `14/12`) | `UX-04.1` | Teste guiado de baixa em 2 etapas (WBS 10), central do sino (WBS 2.2) e CSS de impressão multipáginas (`PB-050` / WBS 11.2) | `AGUARDANDO S4` | `UX-01` | `14/12/2026` |
| **Ciclo 5** | Sprint 6 (`15/12` a `18/12`) | `UX-05.1`, `HO-01` | Rodada final ponta a ponta com usuários reais (WBS 1–12), revisão visual e homologação integrada até `18/12/2026` | `AGUARDANDO S5` | `UX-01` / `QA-01` / `LT-01` | `18/12/2026` |

---

## 3. Pré-requisitos de Ambiente, Participantes e Dispositivos

Antes de executar cada ciclo de UX, prepare o ambiente conforme o [README](../README.md) e valide os itens abaixo:

1. **Ambiente funcional e massa de dados:**
   - Aplicação em execução com PostgreSQL ativo e migrations aplicadas (ou ambiente de homologação equivalente).
   - Contas prontas para os perfis **Administrador** e **Operador de Captação** (para validar visibilidade condicional de menus e ações por perfil).
   - Massa de dados realista preparada em conjunto com `QA-01` (`QA-01.2` / `QA-02.2`), incluindo contatos PF/PJ, estados vazios (*empty states*) e registros com nomes/textos longos.
2. **Matriz mínima de resoluções e mídia:**
   - **Mobile:** `375 × 812 px` (validação de tabelas, formulários, Ficha 360° e Kanban).
   - **Tablet:** `768 × 1024 px` (validação de grade, painéis laterais e filtros).
   - **Desktop:** `1280 × 800 px` e `1440 × 900 px` (validação de densidade informacional e leitura rápida).
   - **Impressão / PDF (A4):** pré-visualização de impressão do navegador (`Ctrl+P` / PDF) para Comprovante de Adesão (`PB-020`), Recibo `LUZ-00001` (`PB-045`) e Relatórios Multipáginas (`PB-050`).
3. **Critérios transversais de acessibilidade e interface:**
   - Navegação por teclado (`Tab`, `Shift+Tab`, `Enter`, `Esc`, setas) com foco visível em controles interativos.
   - Contraste legível de textos, etiquetas de status (*badges*), mensagens de erro e avisos críticos.
   - Mensagens de validação em português claro, indicando **o que aconteceu** e **como corrigir** (sem jargões técnicos ou códigos de erro crus).
4. **Protocolo para sessões moderadas com usuários reais:**
   - Conduzir com **ao menos 2 operadores reais** da *Luz da Esperança* por rodada (15–30 min por participante).
   - Apresentar cenários práticos sem induzir cliques; registrar taxa de conclusão, pontos de hesitação, erros de interpretação e sugestões literais no [Modelo de Relatório](#9-modelo-padrão-de-relatório-de-sessão-de-usabilidade).

---

## 4. Ciclo 1: Homologação UX da Sprint 1 e Artefatos da S2 (`UX-01.1` e `UX-01.2`)

*Base: `UX-01.1` (MUST | WBS 1, 3), `UX-01.2` (SHOULD | WBS 3, 5.3) | Executar durante a Sprint 2 (`16/11` a `23/11/2026`)*

### Bloco A — Teste de Usabilidade com Usuários Reais (`UX-01.1` / `WBS 1, 3`)

#### `UX-01.01` — Sessão Moderada: Acesso, Recuperação de Senha e Navegação Inicial (`PB-001`, `PB-002` / `WBS 1.1, 1.2`)
* **O que fazer (Passo a Passo):**
  1. Solicitar a 2 operadores da *Luz da Esperança* que façam login com suas credenciais e identifiquem sua tela inicial e menus principais.
  2. Pedir que simulem o fluxo de **Esqueci minha senha** e interpretem o feedback exibido na tela.
  3. Observar a compreensão da mensagem exibida após erro de senha e no bloqueio temporário por tentativas excessivas.
* **Resultado Esperado:** O usuário realiza login e entende a mensagem neutra de recuperação sem confusão; a diferenciação visual de menus entre **Operador de Captação** e **Administrador** é clara e sem opções mortas/confusas.
* **Nota técnica (versão atual `develop`):** O envio de e-mail em `PB-002` é simulado em desenvolvimento (`[DEV E-MAIL]` no console) e a tela/rota de redefinição de senha (`PB-003`) ainda não foi entregue na `develop` — avaliar `PB-003` assim que integrado.
* **Resultado da Validação:**
  - [ ] **PASSOU** *(Relatório consolidado em `docs/ux/`)*
  - [ ] **FALHOU**
  - [ ] **BLOQUEADO**
  - **Observação / Issue:** `—`

---

#### `UX-01.02` — Sessão Moderada: Cadastro em Duas Etapas e Regra Inbound (`PB-008` / `WBS 3.2`)
* **O que fazer (Passo a Passo):**
  1. Pedir aos participantes que cadastrem um novo contato **PF** (com e-mail ou telefone) percorrendo as duas etapas do formulário.
  2. Observar se compreendem a obrigatoriedade de ao menos um meio de contato (e-mail ou telefone) ao tentar avançar sem preencher ambos.
  3. Pedir que selecionem a origem **Site** ou **Instagram** na Etapa 2 e observar se a trava automática para **Inbound** está visualmente evidente e explicada.
  4. Avaliar a clareza do feedback quando há tentativa de duplicidade de e-mail ou CPF/CNPJ.
* **Resultado Esperado:** Fluxo em 2 etapas concluído sem intervenção do moderador; campos obrigatórios, bloqueio *Inbound* e mensagens de validação são compreendidos na primeira leitura.
* **Nota técnica (versão atual `develop`):** O cadastro e a edição em 2 etapas persistem diretamente no PostgreSQL via `POST /api/contacts` e `PATCH /api/contacts/[id]`, validando duplicidade (`HTTP 409`) e regra Inbound no servidor.
* **Resultado da Validação:**
  - [ ] **PASSOU** *(Relatório consolidado em `docs/ux/`)*
  - [ ] **FALHOU**
  - [ ] **BLOQUEADO**
  - **Observação / Issue:** `—`

---

#### `UX-01.03` — Sessão Moderada: Ficha 360°, Interações Imutáveis, Exclusão e Opt-out (`PB-009`, `PB-010`, `PB-011` / `WBS 3.3–3.5`)
* **O que fazer (Passo a Passo):**
  1. Pedir aos participantes que localizem um contato, abram a **Ficha 360°** e identifiquem dados principais, etapa atual e histórico cronológico.
  2. Solicitar o registro de uma nova interação (escolhendo canal, data/hora e resumo) e observar se compreendem que a anotação é **imutável** após salva.
  3. Solicitar o registro manual de **Pedido de Descadastro (Opt-out)** e verificar se o indicador de inelegibilidade para e-mails fica imediatamente visível na ficha.
  4. (Com perfil Administrador) Avaliar a clareza da orientação exibida quando a exclusão é bloqueada por vínculo financeiro (orientando cancelar o plano em vez de excluir).
* **Resultado Esperado:** Usuário encontra a ficha, registra interação e entende o estado de opt-out sem hesitação; mensagens de imutabilidade e bloqueio de exclusão financeira são autoexplicativas.
* **Nota técnica (versão atual `develop`):** A Ficha 360° (`GET /api/contacts/[id]`), as interações (`POST /api/contacts/[id]/interacoes`), respostas/opt-out (`POST /api/contacts/[id]/respostas`) e exclusão lógica (`DELETE /api/contacts/[id]`) operam diretamente no PostgreSQL (a checagem real de vínculo financeiro entra com `PB-060`/`PB-061`).
* **Resultado da Validação:**
  - [ ] **PASSOU** *(Relatório consolidado em `docs/ux/`)*
  - [ ] **FALHOU**
  - [ ] **BLOQUEADO**
  - **Observação / Issue:** `—`

---

### Bloco B — Auditoria de UI/Responsividade S1 e Artefato Visual de Adesão (`UX-01.2` / `WBS 3, 5.3`)

#### `UX-01.04` — Auditoria de Responsividade e Estados Vazios da Sprint 1 (`PB-007` a `PB-011` / `WBS 3.1–3.5`)
* **O que fazer (Passo a Passo):**
  1. Inspecionar a tela de Login, Listagem de Contatos (abas, filtros, paginação, barra de seleção em lote e botão Exportar CSV) e a Ficha 360° em **`375px` (mobile)**, **`768px` (tablet)** e **desktop**.
  2. Validar **estados vazios (*empty states*)**: listagem sem contatos, busca/filtro sem resultados e ficha sem interações registradas.
  3. Testar nomes extensos, e-mails longos e resumos próximos a 3.000 caracteres verificando quebras de linha, rolagem horizontal indesejada e sobreposição de botões.
* **Resultado Esperado:** Nenhuma quebra de layout, texto cortado ou ação inacessível em mobile/tablet; todos os estados vazios apresentam orientação clara para o próximo passo do operador.
* **Nota técnica (versão atual `develop`):** Quando `DATABASE_URL` está configurada, a listagem de contatos exibe o *empty state* real quando a tabela `contatos` está vazia (apenas a aba **Doadores** mantém fallback de demonstração até `PB-060`/`PB-061`).
* **Resultado da Validação:**
  - [ ] **PASSOU**
  - [ ] **FALHOU**
  - [ ] **BLOQUEADO**
  - **Observação / Issue:** `—`

---

#### `UX-01.05` — Entrega do Template Visual do Comprovante Institucional de Adesão (`PB-020` / `WBS 5.3`)
* **O que fazer (Passo a Passo):**
  1. Elaborar o template visual/HTML-CSS do **Comprovante Institucional de Adesão** para uso do `DEV 3` na implementação de `PB-020`.
  2. Conferir presença dos dados institucionais da *Luz da Esperança* (logo, nome, CNPJ, cidade/UF), dados do doador, modalidade (Pontual/Recorrente), valor pactuado, dia de vencimento (`1–28`) e data da adesão.
  3. Garantir destaque tipográfico e visual inequívoco para o **aviso obrigatório de que a adesão NÃO comprova pagamento**.
  4. Validar enquadramento em folha **A4 (PDF/impressão)** sem quebra órfã e com boa legibilidade em impressão preto e branco.
* **Resultado Esperado:** Template revisado, aprovado e disponibilizado para o time de desenvolvimento (com referência em `docs/ux/` ou na Issue de `PB-020`), eliminando qualquer ambiguidade entre comprovante de adesão e recibo financeiro.
* **Resultado da Validação:**
  - [ ] **PASSOU**
  - [ ] **FALHOU**
  - [ ] **BLOQUEADO**
  - **Observação / Issue:** `—`

---

## 5. Ciclo 2: Homologação UX da Sprint 2 (`UX-02.1`)

*Base: `UX-02.1` (MUST | WBS 4.1, 5) — `PB-012` a `PB-021` | Executar durante a Sprint 3 (`24/11` a `30/11/2026`)*

#### `UX-02.01` — Usabilidade e Acessibilidade do Funil de Captação Kanban e Lista (`PB-012`, `PB-013` / `WBS 4.1, 4.2`)
Validar com operadores reais a movimentação nas 4 etapas oficiais (`Aprendizado e descoberta`, `Reconhecimento do problema`, `Consideração da solução`, `Decisão de doação`), alternância Kanban/Lista, navegação por **teclado** e **mobile (`375px`)**, clareza do modal de anotação na movimentação e feedback visual em conflito de concorrência (*optimistic locking*).
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `UX-02.02` — Fluxo do Funil de Perdas, Saída e Retomada da Cadência (`PB-014` a `PB-017` / `WBS 4.3–4.6`)
Avaliar compreensão das 5 etapas de perda, obrigatoriedade condicional de observação ao selecionar *Outros*, exibição clara da última etapa de captação preservada, agendamento de data futura em *Retomada agendada* (com aviso claro de que não há disparo automático) e retorno à cadência sem confundir o operador sobre e-mails cancelados.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `UX-02.03` — Fluxo de Conversão, Tag Sócio Inscrito, Suspensões e Comprovante PDF (`PB-018` a `PB-021` / `WBS 5.1–5.4`)
Validar entendimento da tag dinâmica **Sócio Inscrito** (doador sem pagamento prévio, inclusive se suspenso), clareza do formulário de adesão (vencimento `1–28` sem prometer receita imediata), cadastro/leitura de períodos de suspensão (com feedback claro ao bloquear datas sobrepostas) e legibilidade final do **Comprovante Institucional de Adesão PDF (`PB-020`)** com aviso expresso de não quitação.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

---

## 6. Ciclo 3: Homologação UX da Sprint 3 e Templates S4/S5 (`UX-03.1`)

*Base: `UX-03.1` (SHOULD | WBS 8.1, 10.4) e revisão UX da S3 (`PB-022` a `PB-033`) | Executar durante a Sprint 4 (`01/12` a `07/12/2026`)*

#### `UX-03.01` — Redação e Validação dos Templates Iniciais de E-mail (`PB-034`, `PB-035` / `WBS 8.1`)
Elaborar os modelos iniciais de comunicação institucional por evento (Cadastro, Entrada em Etapa e Contribuição) com tom acolhedor alinhado à *Luz da Esperança*, garantindo uso estrito das variáveis permitidas por contexto (`{{nome}}`, `{{etapa}}` em geral; `{{valor}}` e `{{recibo}}` exclusivamente em eventos de contribuição) e inclusão clara da instrução de descadastro (*opt-out*).
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `UX-03.02` — Design HTML/CSS do Recibo Institucional `LUZ-00001` (`PB-045` / `WBS 10.4`)
Entregar o layout HTML/CSS oficial do **Recibo Institucional** antecipando a Sprint 5 (`DEV 1`), destacando numeração sequencial `LUZ-00001`, dados da instituição, identificação do doador, valor efetivamente recebido, forma/data de pagamento, destinação institucional e visual claramente distinto do Comprovante de Adesão (`PB-020`), pronto para geração em PDF A4 e leitura em dispositivos móveis.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `UX-03.03` — Revisão de Usabilidade: Listas, Importação CSV/XLSX e Motor de Mensageria (`PB-022` a `PB-033` / `WBS 6, 7`)
Revisar a clareza da desvinculação segura de contatos (deixando explícito que o contato não é apagado do CRM), seleção em lote entre páginas ("Selecionar todos"), legibilidade do relatório linha a linha de erros da importação de até 10.000 contatos, distinção visual entre elegíveis vs bloqueados (*opt-out*), congelamento de público e estados de rascunho/ativo/pausado no calendário recorrente.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

---

## 7. Ciclo 4: Homologação UX da Sprint 4 e Artefatos S5/S6 (`UX-04.1`)

*Base: `UX-04.1` (SHOULD | WBS 10, 11.2) e revisão UX da S4 (`PB-034` a `PB-040`) | Executar durante a Sprint 5 (`08/12` a `14/12/2026`)*

#### `UX-04.01` — Teste Guiado de Usabilidade: Baixa Financeira em 2 Etapas, Competências e Recibo (`PB-042` a `PB-046` / `WBS 10.1–10.5`)
Conduzir teste guiado com operadores/administradores na leitura do **Mapa de Competências**, execução da **Baixa em 2 Etapas** (anexo de comprovante/referência Pix obrigatória, baixa parcial reduzindo saldo), visualização do recibo emitido e revisão/envio de recibo por e-mail (confirmando que a edição temporária do e-mail de destino não confunde sobre o cadastro principal).
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `UX-04.02` — Usabilidade da Central de Ações (Sino), Painel Executivo e Automações (`PB-034` a `PB-041`, `PB-048` / `WBS 2.1, 2.2, 8, 9`)
Avaliar a compreensão da **Central de Ações do Sino** (pendências de pós-cadastro e reengajamento de inadimplência, feedback visual ao concluir uma ação), legibilidade da separação entre **receita efetivamente recebida vs previsão** no Painel Executivo e clareza das mensagens de erro de variáveis proibidas/ativação não retroativa nas telas de automação e pós-cadastro.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `UX-04.03` — Entrega da Folha de Estilo CSS de Impressão Multipáginas (`PB-050` / `WBS 11.2`)
Preparar e entregar o CSS `@media print` para os relatórios analíticos da Sprint 6 (`DEV 4`), garantindo cabeçalhos de tabela repetidos em cada página (`thead { display: table-header-group; }`), prevenção de corte no meio de linhas/cards (`break-inside: avoid`), margens A4 adequadas, numeração/metadados de filtro impresso e tratamento elegante para períodos sem dados (*empty state* imprimível).
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

---

## 8. Ciclo 5: Rodada Final de Usabilidade e Homologação Integrada (`UX-05.1` e `HO-01`)

*Base: `UX-05.1` (MUST | WBS 1–12), `HO-01` (MUST | Todos os Módulos) | Executar entre `15/12` e `18/12/2026` (congelamento e entrega final em `18/12/2026`)*

#### `UX-05.01` — Rodada Final de Usabilidade Ponta a Ponta com Usuários da Instituição (`UX-05.1` / `WBS 1–12`)
Conduzir sessão final integrada com usuários reais da *Luz da Esperança* percorrendo o ciclo completo: **cadastro/captação -> movimentação no Kanban -> conversão/adesão com comprovante -> baixa de doação -> emissão e envio de recibo `LUZ-00001` -> consulta e impressão de relatórios analíticos/coorte (`PB-049`, `PB-050`)**, validando ausência de atritos críticos antes do marco de `17/12/2026`.
- [ ] **PASSOU** *(Relatório final consolidado em `docs/ux/`)*
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `UX-05.02` — Revisão Visual Final: Administração, Permissões A/O e Preferência de Tema (`PB-004` a `PB-006`, `PB-054` / `WBS 12`)
Validar coerência visual das telas administrativas (gestão de usuários, alerta claro de quórum mínimo ao tentar inativar/rebaixar o último Administrador e legibilidade da trilha de auditoria), confirmar que o perfil Operador não vê atalhos quebrados de áreas restritas e verificar contraste/consistência do tema visual (`claro/escuro/sistema`, caso `PB-054` esteja habilitado).
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

#### `UX-05.03` — Homologação Integrada e Regressão Visual Geral (`HO-01` / Todos os Módulos)
Executar junto com `LT-01`, `QA-01` e `DEVs` a regressão visual e funcional dos 12 módulos (incluindo verificação da suíte visual `npm run test:visual` quando aplicável), confirmar encerramento de defeitos impeditivos até `17/12/2026` e assinar o parecer de UX para o congelamento e entrega formal em `18/12/2026`.
- [ ] **PASSOU**
- [ ] **FALHOU**
- [ ] **BLOQUEADO**
- **Observação / Issue:** `—`

---

## 9. Modelo Padrão de Relatório de Sessão de Usabilidade

Ao concluir cada rodada moderada (`UX-01.1`, `UX-02.1`, `UX-04.1`, `UX-05.1`), salve um arquivo em `docs/ux/relatorio-usabilidade-s<numero>.md` seguindo o modelo abaixo:

```markdown
# Relatório de Usabilidade — Ciclo <N> (Sprint <X>)

- **Data:** DD/MM/2026
- **Responsável:** UX-01
- **Participantes:** <Quantidade e perfis, ex.: 2 Operadores de Captação + 1 Administrador>
- **Versão / Branch testada:** `<branch ou commit>`
- **Dispositivos / Resoluções:** Desktop (`1280px`), Tablet (`768px`), Mobile (`375px`)

## 1. Resumo das Tarefas Avaliadas

| Código | Tarefa / Fluxo (WBS) | Conclusão sem Ajuda | Tempo Médio | Maior Severidade | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `UX-01.01` | Login e recuperação de senha | `2/2` | `1 min` | `Nenhuma` | ✅ PASSOU |
| `UX-01.02` | Cadastro em 2 etapas + Inbound | `2/2` | `2 min` | `Médio` | ✅ PASSOU |

## 2. Atritos Identificados e Ações

| ID | Tela / WBS | Descrição do Atrito | Severidade | Recomendação de UX | Issue |
| :--- | :--- | :--- | :---: | :--- | :---: |
| `AT-01` | `WBS 3.2` | <Descrever comportamento observado> | `Médio` | <Ajuste sugerido> | `#<num>` |

## 3. Destaques Positivos e Observações dos Participantes
- <Registrar falas literais relevantes e pontos que funcionaram bem>

---
**Parecer Final de UX do Ciclo:** `APROVADO` *(ou `APROVADO COM RESSALVAS` / `REPROVADO`)*
```
