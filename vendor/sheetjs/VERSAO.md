# SheetJS Community Edition — leitor de planilhas do Nora

| | |
|---|---|
| Versão | **0.20.3** |
| Arquivo usado | `xlsx.core.min.js` (lê .xlsx, .xls do Excel 97 em diante, HTML e XML do Excel; sem as tabelas de acentos do Excel 95) |
| Licença | Apache-2.0 (`LICENSE`, copiada do pacote) |
| Origem | https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz (site oficial; o pacote `xlsx` do npm parou na 0.18.5, que tem falhas conhecidas) |
| Baixado em | 25/10/2026 |
| SHA-256 do pacote `xlsx-0.20.3.tgz` | `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8` |
| SHA-256 de `xlsx.core.min.js` | `197255b0c278588117e45c14c1b25398562864cd9ffa9752c4b4d29f6d9bfd27` |

Avisos de segurança conferidos na data acima: CVE-2023-30533 (corrigido na 0.19.3) e CVE-2024-22363
(corrigido na 0.20.2). Nenhum aviso afeta a 0.20.3. O arquivo não usa `fetch`, `XMLHttpRequest`,
`importScripts`, `eval` nem `new Function`.

A página só carrega este arquivo quando a pessoa escolhe uma planilha (`carregarLeitorPlanilhas` em
`app.js`). Ele nunca é editado à mão.

## Como atualizar

1. **Baixar** o pacote novo do site oficial, fora do projeto (numa pasta temporária):
   `curl -sO https://cdn.sheetjs.com/xlsx-X.Y.Z/xlsx-X.Y.Z.tgz` e `tar -xzf xlsx-X.Y.Z.tgz`.
   A versão mais recente aparece em https://cdn.sheetjs.com/ (e em `xlsx-latest/package/package.json`).
   Não use o pacote `xlsx` do npm.
2. **Conferir os avisos de segurança**: https://cdn.sheetjs.com/advisories/ e a busca por `xlsx` no OSV
   (https://osv.dev, ecossistema npm) e no GitHub Advisory Database. Leia o `CHANGELOG.md` do pacote
   desde a versão atual. Se algum aviso afetar a versão nova, não atualize.
3. **Conferir que não acessa a rede**: `grep -cE "fetch\(|XMLHttpRequest|importScripts" package/dist/xlsx.core.min.js`
   tem que dar 0.
4. **Copiar** só `package/dist/xlsx.core.min.js` e `package/LICENSE` para esta pasta.
5. **Anotar** aqui a versão, a data, a origem e os dois SHA-256 novos
   (`shasum -a 256 xlsx-X.Y.Z.tgz vendor/sheetjs/xlsx.core.min.js`), e trocar a versão esperada em
   `tests/core.test.mjs` (`XL.version`).
6. **Rodar** `npm test` (o teste confere o SHA-256 anotado aqui contra o arquivo) e `npm run telas`.
7. Commit com a mensagem "SheetJS X.Y.Z" e o motivo da atualização.
