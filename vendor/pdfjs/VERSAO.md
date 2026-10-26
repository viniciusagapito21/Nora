# pdf.js (Mozilla) — leitor de PDF do Nora

| | |
|---|---|
| Versão | **6.4.299** |
| Arquivos usados | `pdf.min.mjs` e `pdf.worker.min.mjs`, da pasta `legacy/build` do pacote (funcionam também em navegadores e no Node sem as funções mais novas do JavaScript, como `Uint8Array.prototype.toHex`, que a pasta `build` exige) |
| Licença | Apache-2.0 (`LICENSE`, copiada do pacote) |
| Origem | pacote `pdfjs-dist` do npm: https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.4.299.tgz |
| Integridade do pacote (npm) | `sha512-AVl138zALtfaAPvADulE0PZThbYzCBS79nL4pOSL/6Sm/4AH5A21BD9VHt97OlCuzJuCpmeZtAtkinisF4Vb1g==` |
| Baixado em | 26/10/2026 |
| SHA-256 de `pdf.min.mjs` | `bccc24ea711db8e44503629519904a5292d73b9daaa214bbe7cdcc282b0f4259` |
| SHA-256 de `pdf.worker.min.mjs` | `145d2dd3ab0c86151011dba95acfa2d5336e2accd59388ea43dbee0efddaaec6` |

Avisos de segurança conferidos na data acima (OSV e GitHub Advisory Database, pacote `pdfjs-dist`):
CVE-2018-5158 (corrigido na 2.0.550), CVE-2024-4367 (corrigido na 4.2.67) e CVE-2026-16633 (afetava da
5.6.83 até antes da 6.2.108). Nenhum afeta a 6.4.299; `npm audit` do pacote: 0 vulnerabilidades.

Como o Nora usa:
- carregado só quando a pessoa escolhe um PDF, e só com o painel servido (`npm start`): aberto do disco
  (`file://`), os navegadores não carregam módulos e o painel avisa;
- **sem worker**: o código do worker roda na própria página (`globalThis.pdfjsWorker`), então tudo fica sob a
  CSP da página (`connect-src 'none'`), sem `worker-src`;
- recebe só os bytes do arquivo (`data`), com `isEvalSupported: false` e sem buscar fontes nem mapas de
  caracteres; o texto é lido pelo stream à mão (`streamTextContent`), porque o atalho `getTextContent` falha
  no WebKit.
- O pacote tem `fetch` e `XMLHttpRequest` (para abrir PDF por endereço, que o Nora não usa) e um `new Function`
  no worker (fontes, desligado por `isEvalSupported: false` e bloqueado pela CSP de qualquer jeito).
- O teste estático de navegação acha 4 trechos que **não navegam**: 3 leituras de `window.location` em
  `pdf.min.mjs` (montar endereço e comparar origem) e o texto "window.open" numa expressão de
  `pdf.worker.min.mjs` (que reconhece ações de JavaScript dentro do PDF). O teste aceita exatamente esses 4.

Nunca edite estes arquivos à mão.

## Como atualizar

1. **Baixar** fora do projeto: `npm pack pdfjs-dist@X.Y.Z` numa pasta temporária (ou `npm install
   pdfjs-dist@X.Y.Z --ignore-scripts`) e conferir a integridade com `npm view pdfjs-dist@X.Y.Z dist.integrity`.
2. **Conferir os avisos de segurança** do pacote `pdfjs-dist` no OSV (https://osv.dev) e no GitHub Advisory
   Database, e o histórico de versões em https://github.com/mozilla/pdf.js/releases. Se algum aviso afetar a
   versão nova, não atualize.
3. **Copiar** só `legacy/build/pdf.min.mjs`, `legacy/build/pdf.worker.min.mjs` e `LICENSE` para esta pasta.
4. **Anotar** aqui versão, data, integridade e os dois SHA-256 novos (`shasum -a 256 vendor/pdfjs/*.mjs`), e
   trocar a versão esperada em `tests/core.test.mjs`.
5. **Rodar** `npm test` (confere os SHA-256, a versão e a varredura de navegação; se os trechos mudarem, leia
   cada um antes de aceitar) e `npm run telas` (prévia do PDF de exemplo e prova da isca).
6. Commit com a mensagem "pdf.js X.Y.Z" e o motivo.
