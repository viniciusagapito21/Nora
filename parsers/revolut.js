/* Nora, leitor do Revolut: o extrato consolidado (várias contas, com resumo de saldos) e o extrato comum.
   Contrato de todo leitor em parsers/ (veja LEITORES em app.js): uma fábrica pura que recebe os auxiliares do
   núcleo e devolve { id, nome, reconhece(linhas), ler(linhas, moeda) }. ler devolve { tx, moedas, saldos, periodo }:
   tx = [data ISO, descrição, tipo, centavos, saldo em centavos], só da conta na moeda pedida; tipo no vocabulário
   da classificação (Merchant, Refund, Exchange, Top up, Others); moedas = contas que o arquivo traz; saldos = os
   de fechamento que o arquivo informa, ou null; periodo = { de, ate, fonte: 'arquivo' } se o arquivo disser, ou
   null (o importador usa a primeira e a última data). Sem DOM: os testes carregam este arquivo junto do núcleo. */
var LEITOR_REVOLUT = function (ajuda) {
  var cents = ajuda.cents, isoDate = ajuda.isoDate;
    /* devolve [data, descrição, categoria do Revolut, centavos, saldo em centavos], só da conta na moeda pedida */
    function extractTx(rows, moeda) {
      moeda = moeda || 'EUR';
      var out = [], i, r, c0, inSec = false, mode = null, title = '', d, a, b;
      for (i = 0; i < rows.length; i++) {
        r = rows[i]; c0 = String(r[0] || '').trim();
        if (c0 === 'Current Accounts Transaction Statements') { inSec = true; continue; }
        if (inSec) {
          if (c0.indexOf('---') === 0) { inSec = false; mode = null; continue; }
          if (/\(\w{3}\)\s*$/.test(c0) && !r[1]) title = c0;
          if (c0 === 'Date' && r[1] === 'Description') { mode = (!title || title.indexOf('(' + moeda + ')') >= 0) ? 'read' : 'skip'; continue; }
          if (mode === 'read') {
            d = isoDate(c0); a = cents(r[3]); b = cents(r[4]);
            if (d && a !== null) out.push([d, String(r[1] || '').trim(), String(r[2] || '').trim(), a, b === null ? 0 : b]);
          }
        }
      }
      if (out.length) return out;
      /* extrato comum do Revolut: Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance */
      for (i = 0; i < rows.length; i++) {
        r = rows[i];
        if (r.indexOf('Completed Date') >= 0 && r.indexOf('Amount') >= 0 && r.indexOf('Description') >= 0) {
          var ix = { t: r.indexOf('Type'), d: r.indexOf('Completed Date'), s: r.indexOf('Description'), a: r.indexOf('Amount'), f: r.indexOf('Fee'), cu: r.indexOf('Currency'), st: r.indexOf('State'), b: r.indexOf('Balance') };
          for (var j = i + 1; j < rows.length; j++) {
            var x = rows[j];
            if (ix.st >= 0 && x[ix.st] && x[ix.st] !== 'COMPLETED') continue;
            if (ix.cu >= 0 && x[ix.cu] && x[ix.cu] !== moeda) continue;
            d = isoDate(x[ix.d]); a = cents(x[ix.a]);
            if (!d || a === null) continue;
            var fee = ix.f >= 0 ? (cents(x[ix.f]) || 0) : 0;
            var ty = ix.t >= 0 ? x[ix.t] : '';
            var rc = ty === 'TOPUP' ? 'Top up' : ty === 'CARD_PAYMENT' ? 'Merchant' : ty === 'EXCHANGE' ? 'Exchange' : ty === 'REFUND' ? 'Refund' : 'Others';
            b = ix.b >= 0 ? cents(x[ix.b]) : 0;
            out.push([d, String(x[ix.s] || '').trim(), rc, a - fee, b === null ? 0 : b]);
          }
          break;
        }
      }
      return out;
    }
    /* as moedas das contas que o extrato traz (para dizer o que existe quando falta a moeda pedida) */
    function moedasNoExtrato(rows) {
      var o = {}, i, r, c0, inSec = false, m, ic = -1;
      for (i = 0; i < rows.length; i++) {
        r = rows[i]; c0 = String(r[0] || '').trim();
        if (c0 === 'Current Accounts Transaction Statements') { inSec = true; continue; }
        if (inSec && c0.indexOf('---') === 0) inSec = false;
        if (inSec && !r[1] && (m = c0.match(/\((\w{3})\)\s*$/))) o[m[1].toUpperCase()] = 1;
        if (ic < 0 && r.indexOf('Completed Date') >= 0 && r.indexOf('Currency') >= 0) { ic = r.indexOf('Currency'); continue; }
        if (ic >= 0 && /^[A-Z]{3}$/.test(String(r[ic] || '').trim())) o[String(r[ic]).trim()] = 1;
      }
      return Object.keys(o).sort();
    }
    /* saldos de fechamento de cada conta, do resumo no começo do extrato consolidado */
    function extractSummary(rows) {
      var sec = '', o = {}, i, j, r, c0, v, n = 0;
      for (i = 0; i < rows.length; i++) {
        r = rows[i]; c0 = String(r[0] || '').trim();
        if (c0 === 'Current Accounts Transaction Statements') break;
        if (c0 === 'Current Accounts Summaries') sec = 'conta';
        else if (c0 === 'Flexible Cash Funds Summaries') sec = 'flex';
        else if (c0 === 'Investment Services Summaries') sec = 'invest';
        else if (c0 === 'Crypto Summaries') sec = 'cripto';
        if (!sec || o[sec] !== undefined) continue;
        for (j = 0; j < r.length - 1; j++) {
          if (String(r[j]).trim() === 'Closing balance') { v = cents(r[j + 1]); if (v !== null) { o[sec] = v; n++; } break; }
        }
      }
      return n ? o : null;
    }
  function reconhece(rows) {
    return rows.some(function (r) {
      return String(r[0] || '').trim() === 'Current Accounts Transaction Statements' ||
        (r.indexOf('Completed Date') >= 0 && r.indexOf('Amount') >= 0 && r.indexOf('Description') >= 0);
    });
  }
  return {
    id: 'revolut', nome: 'Revolut', reconhece: reconhece,
    ler: function (rows, moeda) { return { tx: extractTx(rows, moeda), moedas: moedasNoExtrato(rows), saldos: extractSummary(rows), periodo: null }; },
    extractTx: extractTx, moedasNoExtrato: moedasNoExtrato, extractSummary: extractSummary
  };
};
