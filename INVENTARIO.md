# Inventário anterior à conversão

Fonte de verdade: `index.html`, `styles.css`, `app.js`, `domain.js` e `favicon.png` da raiz. O servidor original apenas entrega esses arquivos; documentos de backlog não fazem parte da interface do CRM. Inventário preparado após leitura do código, antes da implementação.

## Checklist de paridade

| ID | Característica identificada no original | Implementação a preservar |
| --- | --- | --- |
| 01 | Documento pt-BR, título, viewport, favicon PNG e theme-color | Metadados Next; mesmo PNG; tema antes da primeira pintura |
| 02 | Paleta verde/dourado/osso; Georgia/Segoe UI locais; logo, SVGs e paisagem CSS | CSS global integral, mesmos elementos, seletores, textos e atributos |
| 03 | Login em duas colunas; sidebar fixa; workspace, topbar, breadcrumbs, rodapé, tabelas, cards e gráficos CSS | Mesma ordem e hierarquia, sem wrappers visuais adicionais |
| 04 | Temas claro/escuro, preferência local e do dispositivo, sincronização entre abas | Mesma chave luz-crm-theme; labels/title/aria-pressed e meta atualizados |
| 05 | Breakpoints 1500, 1200, 1100, 900 e 650 px; menu móvel; grids e tabelas com rolagem | CSS original, incluindo regras adicionais e sua ordem |
| 06 | Hover/foco e transições .15s; menu móvel .2s; toast 4800ms | Mesmos estilos e temporizadores; nenhuma animação adicional |
| 07 | Login manual/demo; PBKDF2 SHA-256, 100000 iterações e sal; cinco falhas/60s; sessão 30min | Mesmas credenciais iniciais, mensagens, limites e sessionStorage |
| 08 | Recuperação simulada; hash #redefinir=; token de 15min/uso único; confirmação e mínimo 8 caracteres | Mesmo fluxo, URL e validações |
| 09 | 24 contatos fictícios, dois perfis, duas listas, pagamentos relativos ao mês, histórico e migrações legadas | Mesmo seed e regras de domínio; mesmas chaves de armazenamento |
| 10 | 11 telas: dashboard, funnel, losses, contacts, donors, lists, emails, finance, reports, users, audit | Mesmas ações internas sem introduzir URLs por tela |
| 11 | Visão geral: saudação, banner, quatro métricas, gráfico de seis meses, etapas, recebimentos e tarefas | Mesmos cálculos, rótulos, alturas e larguras proporcionais |
| 12 | Funil: quatro etapas, quadro compacto/lista, arraste, seta/modal, estágio móvel, rolagem por coluna | Mesmos filtros, conteúdo e histórico imediato de movimentação |
| 13 | Perdas: cinco etapas, motivos, data, Outros obrigatório, retomada, episódios e status financeiro independente | Mesmas regras, filtros, cards e formulários |
| 14 | Contatos/doadores: busca, origem, responsável, status, abas, dez por página, exportação | Mesma ordenação, badges e seleção entre páginas/filtros |
| 15 | Seleção de destinatários: todos do filtro, limpar, indisponíveis por opt-out/e-mail, contador e indeterminate | Mesmo comportamento e foco após seleção |
| 16 | Cadastro PF/PJ em duas etapas; telefone/CPF/CNPJ mascarados; dígitos verificadores; duplicidade | Mesmos campos, limites, validações nativas e domínio |
| 17 | Site/Instagram exclusivamente Inbound; responsável administrativo; demais origens manuais | Mesmo preenchimento/bloqueio, sem mudar semântica de campos desabilitados |
| 18 | Ficha: dados, badges, tarefas, pós-cadastro, ações, pagamentos e timeline imutável | Mesmos textos, ações, disponibilidade por perfil e histórico |
| 19 | Interações (quatro canais), resposta positiva/negativa/descadastro, datas não futuras | Mesmos registros, responsável e bloqueio de novos envios |
| 20 | Conversão pontual/recorrente, valor positivo, vencimento 1–28, adesão imprimível | Mesmos cálculos e campos condicionais |
| 21 | Status Ativo/Inadimplente/Pausado/Suspenso/Cancelado e Sócio Inscrito | Suspensão por vencimento, débitos anteriores, primeiro recebimento e reconciliação idênticos |
| 22 | Doações: cinco campos na primeira etapa; Pix/anexo PNG/JPG/PDF 2MB na segunda | Mesmas validações, baixas parciais/totais, Pix duplicado, recibo e indicadores |
| 23 | Pendências por competência/vencimento, filtros e baixa previamente preenchida | Mesma geração, saldos, ordenação e reativação quando elegível |
| 24 | Recibos: impressão/PDF, download do anexo, envio de recibo com revisão e histórico | Mesmos dados, apresentação, opt-out e simulação |
| 25 | Listas: criar/editar, categoria, remover, adicionar com dez filtros, seleção persistente | Mesma deduplicação e relatórios |
| 26 | CSV/Excel .xlsx: primeira planilha, valores/shared strings, 5MB, 10000 contatos, 20MB descompactados | Mesmos parsers, mensagens, modelo CSV, descartes e limites |
| 27 | Campanhas: assunto/mensagem, elegibilidade, revisão, voltar preservando dados, confirmação | Mesma simulação, contadores e histórico por contato |
| 28 | E-mails: Envios e recorrências/Automações/Histórico; busca, filtros e destinatários fixos | Mesma composição em duas etapas, programação e revisão explícita |
| 29 | Único imediato/agendado; recorrente diário/semanal/mensal; dia/ocorrência; término opcional | Mesma hora local, calendário legado, pausa/retomada/edição/cancelamento e versões |
| 30 | Execuções sem rajada após períodos perdidos; elegibilidade reavaliada; simular próximo | Mesmo domínio e processamento ao salvar, abrir e a cada 15000ms |
| 31 | Três automações iniciais pausadas; eventos cadastro/etapa/pagamento; variáveis e intervalos | Mesma revisão, condições, versões, cancelamento, falhas, repetir e simular agora |
| 32 | Pós-cadastro por origem/classificação: etapa, dono, lista, tarefa e prazo | Mesma ativação, ausência de retroatividade, auditoria e recuperação de falhas |
| 33 | Relatórios administrativos: período/modalidade/etapa, destinos/coorte, CSV e PDF multipágina | Mesmos datasets e impressão A4, margens 12mm e modo claro |
| 34 | Usuários: criar/editar/inativar, hash, perfil, proteger próprio acesso e último administrador | Mesmos menus e restrições verificadas nas ações |
| 35 | Auditoria: busca, 100 entradas, horário, responsável, ação e detalhes | Mesma ordem e dados |
| 36 | Dialog nativo: título acessível, wide, foco/retorno, Escape e clique fora dos limites | React mantém o dialog real usando ref para APIs nativas |
| 37 | Eventos input/change/click/submit/drag/drop; validade HTML, foco/caret, arquivos e downloads | Eventos React e estado de apresentação; refs apenas para APIs do navegador |
| 38 | Storage entre abas, acesso inativado, inatividade, erros/quota, timers | Efeitos com limpeza no desmontar; mesmas mensagens e políticas |
| 39 | Exclusão confirmada; bloqueio quando há financeiro; manutenção de listas/tarefas | Mesmas regras e textos |
| 40 | Tudo local: sem envio real, banco, provedor Pix, fonte externa ou biblioteca de UI | Projeto independente; regras locais preservadas |

Os resultados da implementação e os limites da verificação serão registrados em `RELATORIO-PARIDADE.md`.
