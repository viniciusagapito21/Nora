/* Nora, leitor do Itaú: o extrato de conta corrente em PDF, já virado em linhas por tabelaDoPdf (app.js), no
   formato [data, lançamentos, valor, saldo]. Contrato de parsers/ (veja parsers/revolut.js e parsers/btg.js), com
   saldosDia, saldoAtual, previa e sugestoes; ler recebe um terceiro parâmetro { titular }.
   - Reconhece o banco pelo cabeçalho "data · lançamentos · valor (R$) · saldo (R$)".
   - O saldo só aparece nas linhas "SALDO DO DIA", na coluna saldo. A do topo, com data depois do fim do período
     informado no arquivo, é o saldo atual: vai para saldoAtual e saldoAtualData, e não para os saldos do dia (pode
     ser diferente do último saldo do período, por movimentos depois dele).
   - O extrato vem do mais novo para o mais antigo; a interpretação (interpretarCSV) põe na ordem do acontecido.
   - O tipo vem do começo da descrição, só com nomes vistos no extrato real:
     REND PAGO, COR DIVIDENDOS e COR JSCP: Rendimento (Outras entradas);
     APLICACAO CDB: Invest (saída, guardado); RESGATE CDB e INT RESGATE: Invest (entrada, resgate);
     FATURA ou AZUL MC em qualquer parte (as palavras vêm coladas, como "FATURAAZUL"): Fatura;
     EST com um DA do mesmo dia, mesma empresa e mesmo valor: Estorno (devolução na categoria do débito).
     O resto (PIX, TED, DA, INT ITAU CLICK, nomes desconhecidos) fica Others: caminho genérico.
   - Pix para o titular: só SUGESTÃO, quando o nome cortado do Pix ("PIX TRANSF MARIA E07/08") tem 5 letras ou
     mais e é o começo do nome do titular configurado (sem acento, sem diferenciar maiúsculas, sem espaços). */
var LEITOR_ITAU = function (ajuda) {
  var CAB = 'DATA|LANCAMENTOS|VALOR (R$)|SALDO (R$)';
  function n(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
  function ehCabecalho(r) { return r.length === 4 && r.map(n).join('|') === CAB; }
  function reconhece(rows) { return rows.some(ehCabecalho); }
  function tipoDe(desc) {
    var d = n(desc);
    if (/^(REND PAGO|COR DIVIDENDOS|COR JSCP)\b/.test(d)) return 'Rendimento';
    if (/^(APLICACAO CDB|RESGATE CDB|INT RESGATE)\b/.test(d)) return 'Invest';
    if (/FATURA|AZUL MC/.test(d)) return 'Fatura';
    return 'Others';
  }
  function letras(s) { return n(s).replace(/[^A-Z]/g, ''); }
  function ler(rows, moeda, ctx) {
    var cab = -1, i;
    for (i = 0; i < rows.length; i++) if (ehCabecalho(rows[i])) { cab = i; break; }
    if (cab < 0 || (moeda && moeda !== 'BRL')) return { tx: [], moedas: cab < 0 ? [] : ['BRL'], saldos: null, periodo: null };
    /* fim do período, da linha "período de visualização: dd/mm/aaaa até dd/mm/aaaa" antes do cabeçalho */
    var fim = null;
    for (i = 0; i < cab; i++) { var p = n((rows[i] || []).join(' ')).match(/^PERIODO\b.*?(\d{2}\/\d{2}\/\d{4})\D+(\d{2}\/\d{2}\/\d{4})/); if (p) fim = ajuda.lerData(p[2], 'dmy'); }
    var limpas = rows.map(function (r) { return r.slice(); }), saldoAtual = null, saldoAtualData = null;
    for (i = cab + 1; i < rows.length; i++) {
      var r = rows[i];
      if (r.length === 4 && n(r[1]) === 'SALDO DO DIA' && fim && ajuda.lerData(r[0], 'dmy') > fim) {
        if (saldoAtual == null) { saldoAtual = ajuda.lerNumero(r[3], 'virgula'); saldoAtualData = ajuda.lerData(r[0], 'dmy'); }
        limpas[i] = [];
      }
    }
    /* o saldo vem da coluna saldo: linha só com saldo é o fim do dia, nunca movimento */
    var mapa = { cab: cab, sep: 'itau', data: 0, desc: 1, saldo: 3, valor: { modo: 'uma', col: 2, saidas: 'negativas' }, fmtData: 'dmy', fmtNum: 'virgula', saldoLinhas: null };
    var res = ajuda.interpretarCSV(limpas, mapa);
    var tx = res.tx.map(function (t) { return [t[0], t[1], tipoDe(t[1]), t[3], t[4]]; });
    /* estorno de débito automático: "EST X" com "DA X" no mesmo dia e mesmo valor */
    tx.forEach(function (t) {
      var d = n(t[1]);
      if (t[3] > 0 && /^EST /.test(d) && tx.some(function (u) { return u[0] === t[0] && u[3] === -t[3] && n(u[1]) === 'DA ' + d.slice(4); })) t[2] = 'Estorno';
    });
    var tit = letras(ctx && ctx.titular), sugestoes = [];
    if (tit.length >= 5) tx.forEach(function (t, k) {
      var m = n(t[1]).match(/^PIX TRANSF (.*?)(\d{2}\/\d{2})?$/), f = m ? letras(m[1]) : '';
      if (f.length >= 5 && tit.indexOf(f) === 0) sugestoes.push(k);
    });
    return { tx: tx, moedas: ['BRL'], saldos: null, periodo: res.periodo, saldosDia: res.saldos, saldoAtual: saldoAtual, saldoAtualData: saldoAtualData, sugestoes: sugestoes, previa: { rows: limpas, mapa: mapa } };
  }
  return { id: 'itau', nome: 'Itaú', previa: true, reconhece: reconhece, ler: ler };
};
