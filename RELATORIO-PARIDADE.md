# Relatório de migração e paridade

Entrega: `next-app/`, independente e isolada. Os cinco arquivos-fonte do aplicativo original foram conferidos por SHA-256 após a migração e permanecem inalterados. O inventário anterior à implementação está em [INVENTARIO.md](INVENTARIO.md).

## Correspondência do checklist

Cada linha abaixo confirma a preservação dos itens identificados; os números correspondem ao inventário.

| Item | Preservação e implementação React/Next.js |
| --- | --- |
| 01 | ✓ `src/app/layout.jsx`: pt-BR, título, viewport, PNG, theme-color e aplicação antecipada do tema. |
| 02 | ✓ `globals.css` e `public/favicon.png` idênticos byte a byte; mesmos SVGs, arte CSS, fontes e textos nos modelos de apresentação. |
| 03 | ✓ `CRMApp` e `ViewNode` conservam hierarquia, ordem e seletores; app, dialog e toasts continuam filhos diretos de body. |
| 04 | ✓ Mesmas chaves, tema inicial do dispositivo, alternância, acessibilidade e eventos de storage/media. |
| 05 | ✓ Todas as media queries e regras complementares copiadas integralmente, na mesma ordem. |
| 06 | ✓ Mesmos hover, foco, transições .15s/.2s e toast de 4800ms; timers com limpeza no desmontar. |
| 07 | ✓ Login, demonstração, hash, sal, tentativas, bloqueio e sessão mantidos no controlador e domínio. |
| 08 | ✓ Recuperação, token, hash de URL, expiração e confirmação preservados; fluxo verificado no Chrome. |
| 09 | ✓ `domain.cjs` é o arquivo original; seed, histórico, datas relativas e reparações mantidos. |
| 10 | ✓ As 11 telas continuam selecionadas por estado interno, com as mesmas ações e menus. |
| 11 | ✓ Dashboard mantém fórmulas, seis meses, proporções, cartões e tarefas; comparação visual exata. |
| 12 | ✓ Eventos React de drag/drop, quadro/lista, filtros e etapas móveis; teste real de arraste no Chrome. |
| 13 | ✓ Perdas e retomadas usam as mesmas regras; etapas, agenda, motivo e histórico testados pela interface. |
| 14 | ✓ Busca, abas, filtros, dez registros por página, exportação e ordem mantidos. |
| 15 | ✓ Seleção persistente, indisponibilidade, contadores, foco e indeterminate mantidos; seleção entre páginas testada. |
| 16 | ✓ Dois passos, máscaras, validações nativas, dígitos e duplicidade mantidos; valores controlados pelo React. |
| 17 | ✓ Site/Instagram bloqueiam Inbound; campos desabilitados não entram na serialização do formulário. |
| 18 | ✓ Ficha conserva todos os dados, ações condicionais, timeline, tarefas e resumos do pós-cadastro. |
| 19 | ✓ Interações, respostas e descadastro preservam validação, textos e auditoria. |
| 20 | ✓ Conversão preserva modalidades, valores, vencimento e adesão imprimível; fluxo executado no Chrome. |
| 21 | ✓ Cinco status e Sócio Inscrito calculados pelo domínio original; suspensão seguida de recebimento testada. |
| 22 | ✓ Recebimento em duas etapas, limites, Pix e arquivos mantidos; testes com referência e anexo. |
| 23 | ✓ Geração de competências, saldos e reativação mantidas no domínio original, cobertas pelos testes financeiros. |
| 24 | ✓ Recibo, impressão, download e envio com revisão preservados; PDF e arquivo baixado verificados. |
| 25 | ✓ Listas, filtros e seleção persistente mantidos; teste de seleção seguido de filtro sem resultados. |
| 26 | ✓ Parsers CSV/Excel e limites preservados; importações reais CSV e .xlsx comprimido verificadas. |
| 27 | ✓ Campanhas conservam revisão, elegibilidade, retorno com dados preenchidos e histórico. |
| 28 | ✓ Três abas, busca, filtros e destinatários mantidos; composição e ativação verificadas. |
| 29 | ✓ Calendário e versões idênticos; recorrência mensal configurada e pausada/retomada/cancelada pela interface. |
| 30 | ✓ Mesmos pontos de processamento e intervalo 15000ms; domínio cobre períodos perdidos e elegibilidade. |
| 31 | ✓ Modelos e eventos originais; criação, revisão, ativação e disparo por novo cadastro testados no Chrome. |
| 32 | ✓ Pós-cadastro conserva regra, responsável, lista, etapa e prazo; fluxo completo e tarefa verificados. |
| 33 | ✓ Dataset, métricas, CSV e estilos A4 originais; PDF de relatório gerado no Chrome. |
| 34 | ✓ Usuários e restrições mantidos; menus administrativos ausentes no teste de Operador. |
| 35 | ✓ Auditoria mantém filtro, ordem, limite de 100 entradas e dados de autoria/data. |
| 36 | ✓ Dialog nativo e APIs de foco via refs; título, wide, Escape, clique externo e retorno preservados. |
| 37 | ✓ Renderizador converte atributos/estilos e liga eventos React; arquivos e seleção/caret são sincronizados no estado. |
| 38 | ✓ Listeners externos e temporizadores pertencem ao ciclo de vida de `useCRM`; políticas e mensagens mantidas. |
| 39 | ✓ Exclusão mantém confirmação e proteção financeira; bloqueio verificado na interface após uma doação. |
| 40 | ✓ Sem biblioteca de UI, fonte externa ou serviço de envio; persistência e operações continuam locais. |

## Decisões técnicas para preservar a equivalência

- **CSS global integral:** evita mudar especificidade, ordem, breakpoints, estilos de impressão ou nomes de classes. Nenhum reset de Next, Tailwind ou biblioteca visual foi acrescentado.
- **Árvore de estado de apresentação:** os templates originais foram mantidos como representação intermediária para conservar textos, espaços, SVGs e estrutura. `htmlparser2`, `css-select`, `domutils` e `entities` tratam dados dessa árvore, sem renderização própria. `ViewNode` produz elementos React com `createElement`/JSX, converte `class`/`for`/atributos SVG e estilos inline, e registra eventos pelas props React. O controlador migrado não contém `document.*`, `innerHTML` nem `addEventListener` sobre elementos montados. Esta organização preserva os templates; não é uma reescrita manual de cada tela em um arquivo JSX separado.
- **Estado e efeitos:** `useCRM` usa `useState`, `useRef`, `useEffect` e `useLayoutEffect` para manter o modelo, publicar mudanças e executar efeitos. As regras de negócio permanecem funções JavaScript puras em relação à interface; seu arquivo é idêntico ao original. Eventos de janela/media, intervalos e timeouts são registrados no ciclo de vida do hook e removidos ao desmontar.
- **APIs nativas por refs:** `showModal`/`close`, foco, seleção de texto, indeterminate e leitura de arquivos precisam do navegador real. A renderização fica com o React. O script antecipado no head é restrito ao tema, como no original, para evitar um flash de tema incorreto. A decodificação de entidades em textarea reproduz a interpretação do HTML pelo navegador.
- **Mesma navegação:** App Router fornece a entrada `/`; as telas internas continuam em estado, sem criar URLs que não existiam. `#redefinir=` permanece funcional. Imagens usam `img`, preservando dimensões e carregamento do original.
- **Armazenamento:** nomes, esquema e chaves originais foram mantidos. Como antes, trocar origem (host/porta) cria outro armazenamento; a aplicação não transfere nem apaga dados do protótipo.
- **Projeto independente:** dependências fixadas e lockfile incluído; build e execução não consultam a pasta superior. Só o teste comparativo opcional lê o protótipo.

## Verificação realizada

- `npm run build`: build de produção aprovado.
- `npm test`: **60 testes aprovados**. Incluem a suíte de domínio original e seus testes de referência em VM, mais testes da nova árvore de apresentação, propagação de eventos, limpeza de timers e integridade dos arquivos. Os testes em VM usam uma cópia da referência, não são apresentados como prova dos eventos React; estes são exercitados pelo teste de navegador.
- `npm run test:browser`: fluxos reais da aplicação Next aprovados no Chrome, incluindo 11 telas, perfis, arraste, celular, seleção entre páginas, cadastro, interação, conversão, Pix/anexo, recibo/PDF/download/envio, proteção de exclusão, CSV, Excel, listas, automação, pós-cadastro, perdas/retomada, suspensão, recorrência, relatório, recarga e recuperação de senha. Sem erros de página ou console.
- `npm run test:visual`: **66/66 capturas PNG exatamente iguais** ao original nas 11 telas, nos temas claro/escuro e larguras 1440/1000/390 px. Geometria, estilos computados, textos de elementos folha, labels, títulos e placeholders também coincidiram. A comparação usa o mesmo estado, relógio e navegador.
- Na mesma execução, as **6 capturas de login ficaram exatamente iguais**. Os **36 modais comparados** (nove operações, desktop/celular, claro/escuro) tiveram geometria, estilos e textos iguais; 34 PNGs foram idênticos. Nas duas capturas desktop da ficha, houve variação de rasterização de no máximo **1 nível em 255** por canal nas bordas superiores: 2009 pixels no claro e 168 no escuro, de 1512000 pixels. O CSS dessas bordas é o original, sem ajustes para compensar essa diferença de captura.

Os resultados descrevem os estados e ambientes efetivamente testados. A cópia integral do CSS e do domínio preserva regras adicionais; as capturas não constituem uma verificação de toda combinação possível de dados, navegador e tamanho de janela. Os resultados da entrega estão em `validation/`; novas execuções geram evidências em `test-results/`.
