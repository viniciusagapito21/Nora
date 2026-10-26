/* Leitor genérico de CSV/planilha já convertido em linhas. Sem DOM, rede ou armazenamento. */
var LEITOR_GENERICO = function () {
  function celula(valor) { return String(valor == null ? '' : valor).trim(); }

  function lerCsv(texto, separador) {
    var linhas = [], linha = [], campo = '', aspas = false;
    for (var i = 0; i < texto.length; i++) {
      var c = texto[i];
      if (aspas) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') aspas = false;
        else campo += c;
      } else if (c === '"' && campo.trim() === '') aspas = true;
      else if (c === separador) { linha.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        linha.push(campo); linhas.push(linha); linha = []; campo = '';
      } else campo += c;
    }
    if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas;
  }

  function detectarSeparador(texto) {
    var opcoes = [',', ';', '\t'], escolhido = ',', notaEscolhida = -1;
    opcoes.forEach(function (separador) {
      var linhas = lerCsv(texto, separador).slice(0, 30), frequencias = {}, larguraMaior = 1;
      linhas.forEach(function (linha) {
        if (linha.length > 1) {
          frequencias[linha.length] = (frequencias[linha.length] || 0) + 1;
          larguraMaior = Math.max(larguraMaior, linha.length);
        }
      });
      var repeticoes = Object.keys(frequencias).reduce(function (maior, largura) {
        return Math.max(maior, frequencias[largura]);
      }, 0);
      var nota = repeticoes * 100 + larguraMaior;
      if (repeticoes && nota > notaEscolhida) { escolhido = separador; notaEscolhida = nota; }
    });
    return escolhido;
  }

  function linhasDe(entrada) {
    if (typeof entrada === 'string') {
      var separador = detectarSeparador(entrada);
      return lerCsv(entrada.replace(/^\uFEFF/, ''), separador);
    }
    if (!Array.isArray(entrada)) return [];
    if (entrada.every(function (linha) { return Array.isArray(linha); })) {
      return entrada.map(function (linha) { return linha.slice(); });
    }
    if (entrada.every(function (linha) { return typeof linha === 'string'; })) {
      var texto = entrada.join('\n'), sep = detectarSeparador(texto);
      return lerCsv(texto.replace(/^\uFEFF/, ''), sep);
    }
    return [];
  }

  function infoData(valor) {
    var texto = celula(valor), m, limpo;
    if (!texto) return null;
    m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (m) return { ano: +m[1], mes: +m[2], dia: +m[3], formato: 'fixo' };
    m = texto.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:[T\s].*)?$/);
    if (m) return { a: +m[1], b: +m[2], ano: +m[3], formato: texto.indexOf('/') >= 0 ? 'barra' : 'dmy' };
    limpo = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    m = limpo.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})(?:[t\s].*)?$/);
    if (!m) return null;
    var meses = {
      jan: 1, january: 1, janeiro: 1, enero: 1,
      feb: 2, february: 2, fevereiro: 2, febrero: 2,
      mar: 3, march: 3, marco: 3, marzo: 3,
      apr: 4, april: 4, abr: 4, abril: 4,
      may: 5, maio: 5, mayo: 5,
      jun: 6, june: 6, junho: 6, junio: 6,
      jul: 7, july: 7, julho: 7, julio: 7,
      aug: 8, august: 8, ago: 8, agosto: 8,
      sep: 9, sept: 9, september: 9, set: 9, setembro: 9, septiembre: 9,
      oct: 10, october: 10, out: 10, outubro: 10,
      nov: 11, november: 11, novembro: 11,
      dec: 12, december: 12, dez: 12, dezembro: 12, diciembre: 12
    };
    var mes = meses[m[2]];
    return mes ? { ano: +m[3], mes: mes, dia: +m[1], formato: 'fixo' } : null;
  }

  function iso(ano, mes, dia) {
    if (ano < 1000 || ano > 9999 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    var data = new Date(0);
    data.setUTCHours(0, 0, 0, 0);
    data.setUTCFullYear(ano, mes - 1, dia);
    if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
    return String(ano).padStart(4, '0') + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
  }

  function ordemForcada(opcoes) {
    var ordem = String(opcoes && opcoes.ordemData || '').toLowerCase().replace(/\s/g, '');
    if (['dmy', 'dd/mm', 'dd/mm/aaaa', 'dia/mes'].indexOf(ordem) >= 0) return 'dmy';
    if (['mdy', 'mm/dd', 'mm/dd/yyyy', 'mes/dia'].indexOf(ordem) >= 0) return 'mdy';
    return null;
  }

  function escolherOrdem(linhas, coluna, opcoes, avisos) {
    var forcada = ordemForcada(opcoes);
    if (forcada) return forcada;
    var evidenciasDmy = 0, evidenciasMdy = 0, ambiguas = 0, outrasDatas = 0;
    linhas.forEach(function (linha) {
      var d = infoData(linha[coluna]);
      if (!d) return;
      if (d.formato !== 'barra') { outrasDatas++; return; }
      if (d.a > 12 && d.b <= 12) evidenciasDmy++;
      else if (d.b > 12 && d.a <= 12) evidenciasMdy++;
      else if (d.a <= 12 && d.b <= 12 && d.a !== d.b) ambiguas++;
    });
    if (evidenciasDmy && evidenciasMdy) {
      avisos.push('As datas indicam ordens inconsistentes; considerei dd/mm/aaaa nas datas ambíguas.');
      return 'dmy';
    }
    if (evidenciasMdy) return 'mdy';
    if (evidenciasDmy) return 'dmy';
    if (ambiguas && !outrasDatas) avisos.push('A ordem das datas é ambígua; considerei dd/mm/aaaa. Use ordemData para forçar mm/dd/aaaa.');
    return 'dmy';
  }

  function lerData(valor, ordem) {
    var d = infoData(valor);
    if (!d) return null;
    if (d.formato === 'fixo') return iso(d.ano, d.mes, d.dia);
    if (d.formato === 'dmy') return iso(d.ano, d.b, d.a);
    return ordem === 'mdy' ? iso(d.ano, d.a, d.b) : iso(d.ano, d.b, d.a);
  }

  function lerValor(valor) {
    var texto = celula(valor), sufixo = texto.match(/(CR|DB|D|C)\s*$/i), cents;
    var prefixoSufixo = sufixo ? texto.slice(0, sufixo.index) : '';
    if (sufixo && /(?:\s|\d|\))$/.test(prefixoSufixo)) {
      cents = NORA_COLUNAS.paraCentavos(prefixoSufixo.trim());
      if (cents === null) return null;
      cents = Math.abs(cents);
      return /^(DB|D)$/i.test(sufixo[1]) ? -cents : cents;
    }
    return NORA_COLUNAS.paraCentavos(texto);
  }

  function textoSemAcento(valor) {
    return celula(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function linhaVazia(linha) {
    return linha.every(function (valor) { return !celula(valor); });
  }

  function linhaCabecalho(linha) {
    return NORA_COLUNAS.detectarColunas(linha, []) !== null;
  }

  function linhaResumo(linha, colunas) {
    var descricao = textoSemAcento(linha[colunas.descricao]);
    if (/^(saldo inicial|saldo final|saldo anterior|saldo de abertura|saldo de cierre|opening balance|closing balance|beginning balance|ending balance|balance brought forward|balance carried forward)$/.test(descricao)) return true;
    if (/^(total|totals|subtotal|suma|total general|total de movimientos|total transactions)(?:\b|$)/.test(descricao)) {
      return !infoData(linha[colunas.data]);
    }
    return false;
  }

  function acharCabecalho(linhas) {
    for (var i = 0; i < linhas.length; i++) {
      var amostra = linhas.slice(i + 1, i + 21);
      var colunas = NORA_COLUNAS.detectarColunas(linhas[i], amostra);
      if (colunas) return { indice: i, colunas: colunas };
    }
    return null;
  }

  function nomeCabecalho(linha, indice) {
    return indice === null || indice === undefined ? null : celula(linha[indice]) || 'Coluna ' + (indice + 1);
  }

  function somarSeparadas(linha, colunas) {
    var debitoTexto = celula(linha[colunas.debito]), creditoTexto = celula(linha[colunas.credito]);
    var debito = debitoTexto ? lerValor(debitoTexto) : 0, credito = creditoTexto ? lerValor(creditoTexto) : 0;
    if (debito === null || credito === null || (!debitoTexto && !creditoTexto)) return null;
    var total = BigInt(-Math.abs(debito)) + BigInt(Math.abs(credito));
    var numero = Number(total);
    return Number.isSafeInteger(numero) ? numero : null;
  }

  function ler(linhasEntrada, opcoes) {
    var linhas = linhasDe(linhasEntrada), avisos = [], tx = [], achado = acharCabecalho(linhas);
    if (!achado) {
      return {
        tx: [], moedas: [], saldos: null, periodo: null,
        relatorio: { colunasUsadas: {}, linhasIgnoradas: linhas.length, avisos: ['Não encontrei colunas reconhecíveis de data, descrição e valor.'] }
      };
    }

    var cabecalho = linhas[achado.indice], c = achado.colunas;
    var dados = linhas.slice(achado.indice + 1);
    var ordem = escolherOrdem(dados, c.data, opcoes, avisos);
    var ignoradas = achado.indice, invalidas = false;

    dados.forEach(function (linha) {
      if (linhaVazia(linha) || linhaCabecalho(linha) || linhaResumo(linha, c)) { ignoradas++; return; }
      var data = lerData(linha[c.data], ordem), descricao = celula(linha[c.descricao]);
      var valor = c.valor !== undefined ? lerValor(linha[c.valor]) : somarSeparadas(linha, c);
      if (!data || !descricao || valor === null) { ignoradas++; invalidas = true; return; }
      var saldo = c.saldo === null ? null : lerValor(linha[c.saldo]);
      tx.push([data, descricao, 'Others', valor, saldo]);
    });

    if (invalidas) avisos.push('Uma ou mais linhas foram ignoradas porque a data ou o valor não pôde ser interpretado.');
    if (!tx.length) avisos.push('Não encontrei movimentos válidos no arquivo.');

    var colunasUsadas = {
      data: nomeCabecalho(cabecalho, c.data),
      descricao: nomeCabecalho(cabecalho, c.descricao),
      saldo: nomeCabecalho(cabecalho, c.saldo)
    };
    if (c.valor !== undefined) colunasUsadas.valor = nomeCabecalho(cabecalho, c.valor);
    else {
      colunasUsadas.debito = nomeCabecalho(cabecalho, c.debito);
      colunasUsadas.credito = nomeCabecalho(cabecalho, c.credito);
    }

    return {
      tx: tx,
      moedas: [],
      saldos: null,
      periodo: null,
      relatorio: { colunasUsadas: colunasUsadas, linhasIgnoradas: ignoradas, avisos: avisos }
    };
  }

  function reconhece(linhas) {
    return acharCabecalho(linhasDe(linhas)) !== null;
  }

  return { id: 'generico', nome: 'Genérico', reconhece: reconhece, ler: ler };
};
