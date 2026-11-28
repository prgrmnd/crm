# Homologação funcional de acesso — issue 61

## Objetivo

Validar pela interface o login, o bloqueio temporário, o logout, a expiração por inatividade e as telas e menus por perfil do CRM Luz da Esperança. Escopo acordado com Josué, Tech Lead, para atuação como usuário final. Os testes internos e de banco são realizados pela equipe, conforme orientação recebida em 28/11/2026.

## Issue relacionada

#61 — https://github.com/prgrmnd/crm/issues/61

## Alterações realizadas

- Organização local das evidências dos casos CT-01.01, CT-01.02 e CT-01.03, com arquivos identificados por caso, execução, conteúdo, data e horário.
- Registro das primeiras tentativas, repetições, resultados e condições que limitam a conclusão.
- Registro de sugestões de experiência observadas durante a execução.
- Relatório organizado conforme os cinco títulos do pop.md. Contribuição registrada no PR #132.

## Testes executados

### Ambiente e rastreabilidade

- Data — 28/11/2026. Horários em America/Sao_Paulo.
- Navegador — Google Chrome no Windows, conforme relato e capturas.
- Endereço confirmado pelo Tech Lead — https://crm-serejodev.vercel.app/
- Preparação informada às 11h31. Últimas capturas do reteste às 14h12.
- Versão ou commit do deploy — não identificado. Não presumir que o commit atual de develop corresponde ao deploy executado.
- Executor — usuário responsável pela issue #61, utilizando contas de homologação Admin, Operador QA e Operador inativo. Assistente revisou capturas e organizou registros.
- Os horários dos arquivos identificam o salvamento das capturas. Eles não comprovam o instante exato dos cliques. Relatos e estimativas estão identificados como tais.

### Ficha comum dos casos

Aplicável a CT-01.01, CT-01.02 e CT-01.03, com as particularidades descritas em cada execução abaixo.

- Data — 28/11/2026. Horários e partes executadas detalhados em cada caso.
- Endereço — https://crm-serejodev.vercel.app/
- Navegador — Google Chrome no Windows.
- Versão — não identificada nesta execução.
- Perfis — Operador QA no CT-01.01 e CT-01.02; Operador QA, Administrador e Operador inativo no CT-01.03. Credenciais omitidas.
- Evidências — capturas principais vinculadas na seção Evidências principais e histórico completo no registro local.
- Defeitos — nenhuma issue de defeito aberta nesta preparação. Observações de UX e limitações estão descritas abaixo.
- CT-01.02 — logout aprovado e inatividade aprovada no reteste com conexão estável. Preservar a ressalva da primeira execução no histórico.

### Resumo dos resultados

| Caso | Resultado | Evidência e limite |
| --- | --- | --- |
| CT-01.01 — bloqueio temporário | PASSOU no cenário funcional executado | Quinta falha relatada, recusa da senha correta durante bloqueio e acesso depois da espera. Sem medição do instante exato de liberação aos 60 segundos. |
| CT-01.02 — logout | PASSOU | Duas execuções com retorno ao login e permanência no login após navegação e atualização relatadas. |
| CT-01.02 — inatividade | PASSOU na repetição funcional | Reteste com rede estável conforme executor. Captura logada às 13h39min59s e login às 14h12min06s. Instante exato da expiração não observado. |
| CT-01.03 — perfis e conta inativa | PASSOU | Conta inativa recusada, Operador no Funil de Captação sem menus administrativos e Admin na Visão geral com esses menus. |

CT-01.02 completo — PASSOU no cenário funcional, reunindo logout aprovado e reteste de inatividade aprovado. A primeira espera com interrupção de rede permanece no histórico como execução inconclusiva. A aprovação formal da entrega cabe ao Tech Lead.

### CT-01.03 — conta inativa

**Passos executados.** Executor utilizou a conta 4, confirmou as credenciais do PDF e relatou duas tentativas. Capturou o formulário e a resposta.

**Esperado.** Recusa de acesso para conta inativa.

**Observado.** Mensagem “E-mail ou senha inválidos.” e permanência no login. A senha correta foi confirmada pelo executor. Capturas às 11h37min16s e 11h38min22s. As duas imagens não documentam individualmente as duas tentativas.

**Resultado.** PASSOU.

### CT-01.03 — Operador QA

**Passos executados.** Entrada com conta 2, conferência da tela inicial, do perfil no cabeçalho e do menu lateral até o fim.

**Esperado.** Funil de Captação como tela inicial e ausência de áreas administrativas exclusivas.

**Observado.** Funil de Captação e perfil Operador de Captação. Menu sem Relatórios, Usuários e acessos ou Histórico de auditoria. Capturas principais às 11h44min50s, 11h45min04s e 11h49min19s. Também foi observada a validação de campo de e-mail vazio com “Preencha este campo.”.

**Resultado.** PASSOU.

### CT-01.03 — Administrador

**Ocorrência preservada.** Na preparação, o executor entrou por engano com Operador, voltou ao Google e avançou para a sessão ainda ativa, sem logout. Capturas entre 12h03min46s e 12h04min44s. A ocorrência não valida Admin nem caracteriza defeito de logout.

**Passos executados.** Conferência da conta 1, entrada, inspeção da tela inicial e menus, seguida de Sair.

**Observado.** Visão geral, identificação Administrador e menus Relatórios, Usuários e acessos e Histórico de auditoria. Capturas às 12h06min48s e 12h07min02s. Após Sair, login vazio às 12h07min35s.

**Resultado.** PASSOU. Com a conta inativa e o Operador, conclui os critérios funcionais do CT-01.03.

### CT-01.02 — logout

**Passos executados.** Com Operador logado, executor clicou em Sair, usou Voltar e Avançar do Chrome e atualizou, conforme relato. Repetiu o percurso.

**Esperado.** Exigir novo login para acesso protegido após encerrar a sessão.

**Execução 1.** Antes de sair às 11h52min49s; login às 11h53min07s; Google às 11h53min33s; retorno ao login às 11h54min05s.

**Execução 2.** Operador logado às 11h56min53s; login às 11h57min13s; Google às 11h57min23s; retorno ao login às 11h57min33s. Campos vazios e mensagem “Preencha este campo.” na última imagem.

**Resultado.** PASSOU no escopo de interface. As capturas corroboram os estados e o executor confirmou as ações de navegação e atualização.

### CT-01.01 — bloqueio temporário

**Esperado.** Bloqueio após cinco falhas consecutivas, recusa mesmo com senha correta durante o prazo e liberação após um minuto.

**Execução inicial.** Executor relatou bloqueio após a quinta falha. Capturas locais de erro e bloqueio entre 12h13min28s e 12h14min01s. Senha correta posteriormente entrou, mas o executor não conseguiu confirmar se o minuto já havia terminado. Essa medição ficou inconclusiva e foi repetida. Uma imagem enviada pelo chat mostra relógio diferente; a sequência local foi priorizada para coerência temporal.

**Repetição.** Executor repetiu cinco falhas e usou cronômetro próprio. Captura de bloqueio às 12h17min04s, recusa com senha correta confirmada pelo executor e capturada às 12h17min21s, e acesso ao Funil de Captação às 12h18min19s após a espera.

**Resultado.** PASSOU no cenário executado. Entre os arquivos há 17 segundos até a captura da recusa com senha correta e 75 segundos até a captura do acesso. Isso sustenta recusa durante a janela e liberação após a espera, sem determinar o segundo exato da liberação.

### CT-01.02 — inatividade

**Passos executados.** Operador logado, captura inicial, Chrome minimizado e ausência de interação relatada durante a espera com cronômetro. Após o prazo, executor restaurou a janela e encontrou o login, antes de clicar em Contatos.

**Evidência temporal.** Captura autenticada às 12h23min22s e login às 12h54min54s, intervalo entre capturas de 31min32s. Segunda captura final às 12h55min09s.

**Intercorrência.** Durante a espera, conexão antiga foi encerrada, houve intervalo sem internet e reconexão automática a outro Wi-Fi. Duração sem medição precisa. O executor afirmou que manteve o CRM minimizado e sem interação.

**Conclusão.** Comportamento compatível com encerramento da sessão após a espera. A causa exclusiva e o instante exato de expiração não foram observados. A primeira execução ficou inconclusiva e motivou a repetição em rede estável descrita a seguir.

### CT-01.02 — repetição da inatividade em rede estável

- Perfil utilizado — conta 2, Operador QA ativo, sem credenciais no relatório.
- Captura inicial autenticada — 13h39min59s. Início anunciado e conferido na conversa às 13h40min20s.
- Captura final no login — 14h12min06s. Confirmação adicional às 14h12min28s. Intervalo entre primeira e segunda capturas de 32min07s.
- Executor confirmou conexão estável durante toda a repetição e ausência de interação com o CRM. Relatou restaurar a janela uma vez, sem clicar, rolar, digitar ou atualizar no sistema.
- Ao retomar, o CRM já exibia o login, antes de qualquer tentativa de navegação interna.
- Resultado — PASSOU no cenário funcional de expiração após período de inatividade. O momento exato de expiração aos 30min00s não foi observado porque a janela estava minimizada. As capturas demonstram os estados inicial e final; o relato complementa as condições da espera.
- CT-01.02 consolidado — PASSOU, com logout e reteste de inatividade concluídos. A ocorrência de rede da primeira execução foi preservada.

### Evidências principais

As 22 capturas foram anexadas em comentário na [issue #61](https://github.com/prgrmnd/crm/issues/61). Os links abaixo apontam para os anexos hospedados pelo GitHub.

#### CT-01.01 — Bloqueio e liberação

- [CT-01.01_exec2_02_bloqueio-quinta-falha_2026-11-28_121704.png](https://github.com/user-attachments/assets/d7b69362-684c-4a89-9ef0-cb6100e4aa51)
- [CT-01.01_exec2_03_senha-correta-bloqueada_2026-11-28_121721.png](https://github.com/user-attachments/assets/094fbfa1-1a7b-46cf-8ebd-66d9595c35fc)
- [CT-01.01_exec2_04_acesso-liberado_2026-11-28_121819.png](https://github.com/user-attachments/assets/49ffa151-a14f-400f-a28d-f555555fe870)

#### CT-01.02 — Logout e inatividade

- [CT-01.02_inatividade_01_inicio-logado_2026-11-28_122322.png](https://github.com/user-attachments/assets/591fa3cf-ea80-4132-9697-50317a22f82d)
- [CT-01.02_inatividade_02_retomada-login_2026-11-28_125454.png](https://github.com/user-attachments/assets/69d80d13-bdc9-4aeb-973a-c0fad2a297f0)
- [CT-01.02_inatividade_03_login-final_2026-11-28_125509.png](https://github.com/user-attachments/assets/6273085f-187b-417f-b0a0-2a1aea82b60c)
- [CT-01.02_inatividade_reteste_01_inicio-logado_2026-11-28_133959.png](https://github.com/user-attachments/assets/15610366-ae19-4c3f-aae6-17bf22134b4a)
- [CT-01.02_inatividade_reteste_02_retomada-login_2026-11-28_141206.png](https://github.com/user-attachments/assets/999f1a6e-ec20-4019-a5d4-6fc0c43e7696)
- [CT-01.02_inatividade_reteste_03_confirmacao-login_2026-11-28_141228.png](https://github.com/user-attachments/assets/39d863d2-f8ec-4340-bd4b-f219ce27c7bb)
- [CT-01.02_logout_exec1_02_login-apos-sair_2026-11-28_115307.png](https://github.com/user-attachments/assets/14f6f314-708f-4153-a5e0-02396a8eb48d)
- [CT-01.02_logout_exec1_04_login-apos-retorno_2026-11-28_115405.png](https://github.com/user-attachments/assets/818446d5-f793-453b-b16e-f51c42ca19ed)
- [CT-01.02_logout_exec2_03_login-apos-sair_2026-11-28_115713.png](https://github.com/user-attachments/assets/ded0000f-a76a-48a2-a4e1-42030a5932ba)
- [CT-01.02_logout_exec2_05_login-apos-avancar-atualizar_2026-11-28_115733.png](https://github.com/user-attachments/assets/c47cbafe-a14b-4481-9fd3-35aab1f51c06)

#### CT-01.03 — Conta inativa e perfis

- [CT-01.03_admin_03_visao-geral-perfil_2026-11-28_120648.png](https://github.com/user-attachments/assets/9c422a3d-bba5-4edf-8d52-f773fd505009)
- [CT-01.03_admin_04_menus-administrativos_2026-11-28_120702.png](https://github.com/user-attachments/assets/a394367c-3ce1-4e6e-befe-5400d6a135ac)
- [CT-01.03_admin_05_antes-sair_2026-11-28_120728.png](https://github.com/user-attachments/assets/118cebe9-be0a-4639-a000-19ff71f0d6f4)
- [CT-01.03_admin_06_login-apos-sair_2026-11-28_120735.png](https://github.com/user-attachments/assets/314f7808-43cf-48cd-9cf3-fdf4c1ff0e6f)
- [CT-01.03_conta-inativa_01_antes_2026-11-28_113716.png](https://github.com/user-attachments/assets/8ae80590-a464-482a-bd5e-11c5f5ace026)
- [CT-01.03_conta-inativa_02_recusa_2026-11-28_113822.png](https://github.com/user-attachments/assets/fe254a26-1393-4c4f-83e4-c9108508d58d)
- [CT-01.03_operador_04_funil-rolagem-inicial_2026-11-28_114450.png](https://github.com/user-attachments/assets/b2d1d4a9-3aa1-443c-9b65-b5322ac9d0d3)
- [CT-01.03_operador_05_perfil-operador-topo_2026-11-28_114504.png](https://github.com/user-attachments/assets/b0bd0e92-2bf9-4591-95eb-de96c4295558)
- [CT-01.03_operador_06_menu-operador-final_2026-11-28_114919.png](https://github.com/user-attachments/assets/10ffb835-45db-4075-81a3-bac436eddd5b)


## Observações

### Sugestões de experiência do executor

- **Posição inicial da rolagem.** Na primeira entrada de Operador, a tela apareceu rolada para baixo, ocultando o cabeçalho com o perfil. O executor precisou subir para se identificar. Capturas antes e depois corroboram o relato. Sugestão de avaliar abertura no topo. Reprodução adicional pendente.
- **Identificação do perfil.** O executor inicialmente não percebeu que estava como Operador porque a identificação estava fora da área visível.
- **Animação de entrada.** Sugestão de fundo verde com símbolo institucional e transição de aproximadamente 1 a 1,5 segundo. Proposta subjetiva para avaliação de UX; o carregamento rápido foi relatado e sua duração não foi medida.
- **Botão Sair.** Ícone de porta/seta com traço verde fino percebido como pouco intuitivo. Executor sugeriu botão circular vermelho com símbolo branco e mudança ao passar o mouse. Avaliar com UX o desenho final. A sugestão não altera o resultado funcional aprovado do logout.

### Cuidados de consolidação

- Preservar a execução inicial de bloqueio e a ocorrência de uso da conta errada como histórico, sem classificar esses eventos como defeitos do sistema.
- Algumas imagens de apoio exibem o diálogo de salvar senha do Chrome e informação pessoal da conta do navegador. Priorizar as capturas limpas relacionadas acima para entrega pública.
- Credenciais do PDF e o próprio PDF de acessos ficam fora do repositório.
- Resultados publicados no PR #132 e evidências anexadas à issue #61. A primeira execução inconclusiva e a aprovação do reteste estão preservadas neste relatório.
- Contribuição destinada a develop, com referência à issue #61 conforme pop.md. Revisão, merge e fechamento sob responsabilidade do Tech Lead.

### Fontes e histórico

- pop.md fornecido pelo usuário como referência de governança.
- Caderno de QA — https://github.com/prgrmnd/crm/blob/develop/docs/homologacao-qa.md
- Histórico detalhado local — Registro detalhado preservado localmente pelo executor.
- Orientações do Josué e relatos do executor enviados nesta conversa em 28/11/2026.
