# Luz da Esperança · React / Next.js

Aplicação independente em React e Next.js para gestão da Luz da Esperança. Não é necessário executar o servidor nem carregar arquivos do protótipo original.

Requisito: Node.js 20.19 ou superior e PostgreSQL 13 ou superior para o Prisma.

```powershell
git clone --branch develop https://github.com/prgrmnd/crm.git
cd crm
npm.cmd ci
npm.cmd run dev
```

O frontend continua funcionando sem conexão com o banco. Para usar Prisma, copie `.env.example` para `.env` e informe a URL do PostgreSQL em `DATABASE_URL`.

## Banco de dados e Prisma

O projeto usa Prisma ORM 7 com PostgreSQL. O modelo fica em `prisma/schema.prisma`, a configuração da CLI em `prisma.config.ts` e as migrations versionadas em `prisma/migrations/`.

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd run db:migrate
```

`db:migrate` aplica a migration local e requer um servidor PostgreSQL acessível pela `DATABASE_URL`. Para aplicar migrations já geradas em ambientes de implantação, use `npm.cmd run db:deploy`. O identificador opcional da logo (`logo_arquivo_id`) será ligado por FK a `arquivos.id` quando a PB-061 criar essa tabela.

Abra `http://127.0.0.1:3000`. Para executar junto com o protótipo, use `npm.cmd run dev -- --port 3001`.

Produção:

```powershell
npm.cmd run build
npm.cmd start
```

A aplicação cria os seguintes acessos padrão quando não há usuários no armazenamento local:

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Administrador | `admin@luz.exemplo` | `Esperanca@2026` |
| Operador de Captação | `operador@luz.exemplo` | `Esperanca@2026` |

Recarregue a página para criar os acessos, inclusive em navegadores que já tenham o estado salvo sem usuários. Contas existentes e suas senhas são preservadas. O administrador entra no painel administrativo; o operador entra no funil de captação.

Os demais dados iniciam vazios. O armazenamento usa a chave `luz-crm-v1`, separada dos dados antigos. A autenticação é local, apenas para o protótipo, com senhas armazenadas por hash; não há cadastro público nem integração com servidor de autenticação. E-mails e recuperação de senha ainda usam os fluxos locais existentes, sem entrega real.

## Estrutura

```text
src/app/                 entrada App Router, documento e CSS global original
src/components/          componentes funcionais CRMApp e ViewNode
src/hooks/useCRM.js      estado React, inicialização e ciclo de vida dos efeitos
src/lib/crm-controller.js fluxos, modelos de apresentação e eventos migrados
src/lib/view-state.js    estado de apresentação e interface com APIs nativas
src/lib/domain.cjs       regras de domínio originais, sem alterações
public/favicon.png      logo e favicon originais
tests/                  domínio, estado, fluxos no Chrome e comparação visual
source-manifest.json    hashes SHA-256 dos arquivos de origem
INVENTARIO.md            checklist anterior à implementação
RELATORIO-PARIDADE.md    correspondência e resultados de validação
```

`ViewNode` converte o modelo de apresentação em elementos React, atributos JSX, objetos de estilo e eventos React. O controlador consulta e atualiza apenas essa árvore de estado; não altera o DOM montado. O React faz a renderização e reconciliação. Os templates preservam a estrutura, textos e seletores originais, incluindo fragmentos compartilhados por fichas, formulários, impressão e telas.

## Verificação

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run test:visual
```

Os testes de navegador usam o Chrome instalado em `C:\Program Files\Google\Chrome\Application\chrome.exe`. É possível definir `$env:CHROME_PATH` para outro executável Chromium. Eles iniciam e encerram servidores e navegadores de teste próprios; não usam seu perfil pessoal. `test:browser` é independente do protótipo.

`test:visual` compara com o protótipo na pasta superior, ou na pasta definida por `$env:PROTOTYPE_ROOT`; apenas essa comparação precisa dos originais. Os resultados e capturas são gerados em `test-results/`. As portas utilizadas são 3108–3110.

`scripts/import-source.cjs` registra a transformação inicial e sua procedência. Não faz parte do build, da instalação nem da execução; só deve ser usado para uma nova importação deliberada da fonte original.

Base da estrutura Next: [documentação oficial de instalação e App Router](https://nextjs.org/docs/app/getting-started/installation).
