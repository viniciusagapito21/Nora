/* Nora, leitor do BTG Pactual: o extrato de conta corrente em .xls (ou o mesmo convertido em CSV).
   Contrato de parsers/ (veja parsers/revolut.js), com campos a mais: saldosDia (data → centavos, das linhas
   "Saldo Diário"), saldoAtual (o "Saldo atual" do topo, em centavos, só para conferir) e previa ({ rows, mapa }
   para a mesma prévia do importador genérico, sem perguntas).
   - Reconhece o banco pela linha de cabeçalho com "Data e hora", "Categoria", "Transação", "Descrição" e "Valor".
   - Cada página repete o bloco do topo e o cabeçalho; o bloco é pulado inteiro, e só as células logo depois de
     "Período do extrato:" e "Saldo atual:" são lidas. Cliente, CPF, agência, conta e lançamentos nunca são lidos.
   - O tipo vem de "Transação", só com os nomes que existem no extrato real; a coluna "Categoria" só vale quando é
     "Investimentos" (qualquer transação: saída é aplicação, entrada é resgate). Nome desconhecido: tipo genérico.
   As linhas puladas viram linhas vazias na prévia, para o número de cada linha continuar o do arquivo. */
var LEITOR_BTG = function (ajuda) {
  var ROTULOS = 'DATA E HORA|CATEGORIA|TRANSACAO|DESCRICAO|VALOR';
  /* Others: passa pelas regras do país, pelo nome do titular e pela regra de salário, como no importador genérico */
  var TIPOS = {
    'PIX ENVIADO': 'Others', 'PIX RECEBIDO': 'Others', 'TRANSFERENCIA ENVIADA': 'Others', 'TRANSFERENCIA RECEBIDA': 'Others',
    'PAGAMENTO DE FATURA DO CARTAO': 'Fatura', 'CDB BANCO BTG PACTUAL': 'Invest', 'CDB BANCO BTG PACTUAL S A': 'Invest'
  };
  function n(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }
  function primeira(r) { for (var i = 0; i < r.length; i++) if (n(r[i])) return n(r[i]); return ''; }
  function ehCabecalho(r) { return r.map(n).filter(Boolean).join('|') === ROTULOS; }
  /* o texto da primeira célula preenchida depois da célula i */
  function depois(r, i) { for (var j = i + 1; j < r.length; j++) if (String(r[j] == null ? '' : r[j]).trim()) return String(r[j]).trim(); return ''; }
  function reconhece(rows) { return rows.some(ehCabecalho); }
  function ler(rows, moeda) {
    var cab = -1, i;
    for (i = 0; i < rows.length; i++) if (ehCabecalho(rows[i])) { cab = i; break; }
    if (cab < 0 || (moeda && moeda !== 'BRL')) return { tx: [], moedas: cab < 0 ? [] : ['BRL'], saldos: null, periodo: null };
    var h = rows[cab].map(n), col = { data: h.indexOf('DATA E HORA'), cat: h.indexOf('CATEGORIA'), trans: h.indexOf('TRANSACAO'), desc: h.indexOf('DESCRICAO'), valor: h.indexOf('VALOR') };
    /* tabela limpa, com o mesmo número de linhas: topo, cabeçalhos repetidos e rodapé viram linhas vazias */
    var limpas = [], topo = false, periodoTxt = null, saldoAtual = null, t;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      t = primeira(r);
      if (t === 'EXTRATO DE CONTA CORRENTE') { topo = true; limpas.push([]); continue; }
      if (ehCabecalho(r)) { topo = false; limpas.push(i === cab ? r.slice() : []); continue; }
      if (topo) {
        /* no topo, só duas linhas são abertas: o período e a de "Saldo atual"; as outras nem são olhadas */
        if (t === 'PERIODO DO EXTRATO:' && periodoTxt == null) { var ip = r.map(n).indexOf(t); periodoTxt = depois(r, ip); limpas.push([r[ip], periodoTxt]); continue; }
        if (t === 'LANCAMENTOS:') { var is = r.map(n).indexOf('SALDO ATUAL:'); if (is >= 0 && saldoAtual == null) saldoAtual = ajuda.cents(depois(r, is)); }
        limpas.push([]); continue;
      }
      if (/^(OUVIDORIA|©?\s*BTG PACTUAL)/.test(t)) { limpas.push([]); continue; }
      limpas.push(r.slice());
    }
    /* as linhas antes do primeiro cabeçalho só guardam o período (o resto do topo fica vazio) */
    var dado = null;
    for (i = cab + 1; i < limpas.length && dado == null; i++) if (limpas[i].length && String(limpas[i][col.data] || '').trim()) dado = String(limpas[i][col.data]).trim();
    var mapa = { cab: cab, sep: 'btg', data: col.data, desc: col.desc, saldo: -1, valor: { modo: 'uma', col: col.valor, saidas: 'negativas' },
      fmtData: /^\d{4}-/.test(dado || '') ? 'ymd' : 'dmy', fmtNum: 'ponto', saldoLinhas: 'Saldo Diário' };
    var res = ajuda.interpretarCSV(limpas, mapa);
    var tx = res.tx.map(function (x, k) {
      var lr = limpas[res.linhas[k] - 1];
      var tipo = n(lr[col.cat]) === 'INVESTIMENTOS' ? 'Invest' : (TIPOS[n(lr[col.trans])] || 'Others');
      return [x[0], x[1], tipo, x[3], x[4]];
    });
    return { tx: tx, moedas: ['BRL'], saldos: null, periodo: res.periodo, saldosDia: res.saldos, saldoAtual: saldoAtual, previa: { rows: limpas, mapa: mapa } };
  }
  return { id: 'btg', nome: 'BTG Pactual', previa: true, reconhece: reconhece, ler: ler };
};
