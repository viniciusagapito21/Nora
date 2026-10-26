/* Nora: leitor OFX 1.x (SGML) e 2.x (XML).
   Contrato de parsers/ (veja revolut.js): fábrica pura LEITOR_OFX(ajuda), que devolve
   { id, nome, reconhece(linhas), ler(linhas, moeda) }. ler devolve { tx, moedas, saldos, periodo }.
   Cada tx tem [data ISO, descrição, TRNTYPE, centavos, saldo da linha]; OFX não traz saldo por movimento,
   então esse último campo é zero. O saldo de LEDGERBAL vai em saldos na data DTASOF. Só são lidas tags
   necessárias à transação, à moeda, ao período e ao saldo. Identificadores da conta, do banco e do titular
   nunca são consultados. Não depende de DOM nem de biblioteca. */
var LEITOR_OFX = function (ajuda) {
  var isoDate = ajuda.isoDate;

  function texto(linhas) {
    if (typeof linhas === 'string') return linhas;
    if (!Array.isArray(linhas)) return '';
    return linhas.map(function (linha) {
      return Array.isArray(linha) ? linha.join(' ') : String(linha == null ? '' : linha);
    }).join('\n');
  }

  function valorTag(bloco, tag) {
    var re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)(?:<\\/' + tag + '\\s*>|(?=<)|$)', 'i');
    var m = re.exec(bloco);
    if (!m) return '';
    return m[1].replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").trim();
  }

  function secao(fonte, tag, proximas) {
    var re = new RegExp('<' + tag + '(?:\\s[^>]*)?>', 'i'), inicio = re.exec(fonte);
    if (!inicio) return '';
    var corpoInicio = inicio.index + inicio[0].length;
    var resto = fonte.slice(corpoInicio);
    var fimTag = new RegExp('</' + tag + '\\s*>', 'i').exec(resto);
    var limite = fimTag ? fimTag.index : resto.length;
    proximas.forEach(function (outra) {
      var fimOutro = new RegExp('</' + outra + '\\s*>', 'i').exec(resto);
      if (fimOutro && fimOutro.index < limite) limite = fimOutro.index;
    });
    return resto.slice(0, limite);
  }

  function blocosTransacao(fonte) {
    var abertura = /<STMTTRN(?:\s[^>]*)?>/ig, fechamentos = /<\/STMTTRN\s*>/ig;
    var blocos = [], inicio;
    while ((inicio = abertura.exec(fonte))) {
      var proxima = abertura.lastIndex;
      var fimFechamento;
      fechamentos.lastIndex = abertura.lastIndex;
      fimFechamento = fechamentos.exec(fonte);
      var fim = fimFechamento && (!proxima || fimFechamento.index < proxima) ? fimFechamento.index : fonte.length;
      var proximaAbertura = /<STMTTRN(?:\s[^>]*)?>/ig;
      proximaAbertura.lastIndex = abertura.lastIndex;
      var outra = proximaAbertura.exec(fonte);
      if (outra && outra.index < fim) fim = outra.index;
      blocos.push(fonte.slice(abertura.lastIndex, fim));
      abertura.lastIndex = fimFechamento && fim === fimFechamento.index ? fechamentos.lastIndex : fim;
      if (outra && fim === outra.index) abertura.lastIndex = outra.index;
    }
    return blocos;
  }

  function dataIso(valor) {
    var m = String(valor || '').trim().match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    var y = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
    var dt = new Date(Date.UTC(y, mes - 1, dia));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== dia) return null;
    return isoDate ? isoDate(m[1] + '-' + m[2] + '-' + m[3]) : m[1] + '-' + m[2] + '-' + m[3];
  }

  function centavos(valor) {
    var m = String(valor == null ? '' : valor).trim().replace(/−/g, '-').match(/^([+-]?)(\d+)(?:[.,](\d{1,2}))?$/);
    if (!m) return null;
    var inteiro = Number(m[2]), fracao = Number((m[3] || '').padEnd(2, '0') || '0');
    var total = inteiro * 100 + fracao;
    if (!Number.isSafeInteger(total)) return null;
    return m[1] === '-' ? -total : total;
  }

  function reconhece(linhas) {
    var fonte = texto(linhas);
    return /<OFX(?:\s[^>]*)?>/i.test(fonte) && /<STMTTRN(?:\s[^>]*)?>/i.test(fonte);
  }

  function ler(linhas, moeda) {
    var fonte = texto(linhas), bank = secao(fonte, 'BANKTRANLIST', ['STMTRS', 'CCSTMTRS']);
    var contexto = bank || fonte;
    var stmt = secao(fonte, 'STMTRS', ['OFX']);
    if (!stmt) stmt = secao(fonte, 'CCSTMTRS', ['OFX']);
    var moedaArquivo = valorTag(stmt || fonte, 'CURDEF').toUpperCase();
    var moedas = /^[A-Z]{3}$/.test(moedaArquivo) ? [moedaArquivo] : [];
    var solicitada = String(moeda || '').trim().toUpperCase();
    var tx = [];
    if (!solicitada || !moedaArquivo || solicitada === moedaArquivo) {
      blocosTransacao(contexto).forEach(function (bloco) {
        var data = dataIso(valorTag(bloco, 'DTPOSTED'));
        var valor = centavos(valorTag(bloco, 'TRNAMT'));
        if (!data || valor === null) return;
        var nome = valorTag(bloco, 'NAME'), memo = valorTag(bloco, 'MEMO');
        var descricao = nome && memo && nome !== memo ? nome + ' · ' + memo : (nome || memo);
        tx.push([data, descricao, valorTag(bloco, 'TRNTYPE'), valor, 0]);
      });
    }
    var inicio = dataIso(valorTag(contexto, 'DTSTART'));
    var fim = dataIso(valorTag(contexto, 'DTEND'));
    var ledger = secao(stmt || fonte, 'LEDGERBAL', ['STMTRS', 'CCSTMTRS']);
    var valorSaldo = centavos(valorTag(ledger, 'BALAMT'));
    var dataSaldo = dataIso(valorTag(ledger, 'DTASOF'));
    var saldos = valorSaldo !== null && dataSaldo ? { [dataSaldo]: valorSaldo } : null;
    return {
      tx: tx,
      moedas: moedas,
      saldos: saldos,
      periodo: inicio && fim ? { de: inicio, ate: fim, fonte: 'arquivo' } : null
    };
  }

  return { id: 'ofx', nome: 'OFX', reconhece: reconhece, ler: ler };
};
