# Resultado da validação da entrega

Verificação em 20/10/2026 com Node.js 24.20.0, build de produção e Chrome instalado no Windows. Todos os comandos concluíram com código zero.

| Comando / comparação | Resultado |
| --- | --- |
| `npm run build` | Aprovado |
| `npm test` | 60 testes, 60 aprovados |
| `npm run test:browser` | Todos os fluxos aprovados, nenhum erro de página/console |
| Telas em 3 larguras e 2 temas | 66 PNGs idênticos; geometria/estilos/textos/atributos iguais |
| Login em 3 larguras e 2 temas | 6 PNGs idênticos |
| Modais em 2 larguras e 2 temas | 36 equivalentes em geometria/estilos/textos; 34 PNGs idênticos e 2 com diferença máxima de 1/255 nas bordas |
| Hashes dos arquivos originais | Inalterados |

Os JSONs ao lado guardam os resultados por caso. A metodologia e a decisão sobre os templates intermediários estão em [RELATORIO-PARIDADE.md](../RELATORIO-PARIDADE.md).
