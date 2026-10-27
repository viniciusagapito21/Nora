/* Nora: leitor SWIFT MT940 puro. Não conserva o identificador do campo :25:. */
var LEITOR_MT940 = function () {
  var LIMITE_TEXTO = 5 * 1024 * 1024;

  function fonteDe(texto) {
    if (typeof texto === 'string') return texto;
    if (!Array.isArray(texto)) return '';
    return texto.map(function (linha) {
      return Array.isArray(linha) ? linha.join(' ') : String(linha == null ? '' : linha);
    }).join('\n');
  }

  function avisoMovimentosIgnorados(quantidade) {
    if (!quantidade) return [];
    if (quantidade === 1) return ['1 movimento foi ignorado porque a data ou o valor não pôde ser lido.'];
    return [quantidade + ' movimentos foram ignorados porque a data ou o valor não pôde ser lido.'];
  }

  function erro(mensagem, quantidadeIgnorada) {
    return {
      tx: [], moedas: [], saldos: null, periodo: null,
      erro: mensagem, avisos: avisoMovimentosIgnorados(quantidadeIgnorada || 0)
    };
  }

  function anoDoisDigitos(valor) {
    var ano = Number(valor);
    return ano <= 69 ? 2000 + ano : 1900 + ano;
  }

  function iso(ano, mes, dia) {
    if (ano < 1000 || ano > 9999 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    var data = new Date(Date.UTC(ano, mes - 1, dia));
    if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
    return String(ano).padStart(4, '0') + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
  }

  function dataSwift(valor) {
    var m = String(valor || '').match(/^(\d{2})(\d{2})(\d{2})$/);
    return m ? iso(anoDoisDigitos(m[1]), Number(m[2]), Number(m[3])) : null;
  }

  function dataLancamento(valor, dataValor) {
    var m = String(valor || '').match(/^(\d{2})(\d{2})$/);
    if (!m || !dataValor) return null;
    var baseAno = Number(dataValor.slice(0, 4)), mes = Number(m[1]), dia = Number(m[2]);
    var candidatos = [iso(baseAno - 1, mes, dia), iso(baseAno, mes, dia), iso(baseAno + 1, mes, dia)].filter(Boolean);
    if (!candidatos.length) return null;
    var alvo = Date.parse(dataValor + 'T00:00:00Z');
    candidatos.sort(function (a, b) {
      return Math.abs(Date.parse(a + 'T00:00:00Z') - alvo) - Math.abs(Date.parse(b + 'T00:00:00Z') - alvo);
    });
    return candidatos[0];
  }

  function centavos(valor) {
    var texto = String(valor == null ? '' : valor).trim();
    if (texto.length > 64) return null;
    var m = texto.match(/^(\d+|\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/);
    if (!m) return null;
    var inteiroTexto = m[1].replace(/\./g, '');
    if (inteiroTexto.length > 15) return null;
    var inteiro = BigInt(inteiroTexto);
    var fracao = BigInt((m[2] || '').padEnd(2, '0') || '0');
    var total = inteiro * 100n + fracao;
    var numero = Number(total);
    return Number.isSafeInteger(numero) ? numero : null;
  }

  function campos(texto) {
    var linhas = texto.split(/\r\n|\n|\r/), saida = [], atual = null;
    linhas.forEach(function (linha) {
      var m = linha.match(/^:(\d{2}[A-Z]?):(.*)$/);
      if (m) {
        atual = { tag: m[1].toUpperCase(), valor: m[2] };
        saida.push(atual);
      } else if (atual && linha.trim() !== '-') {
        atual.valor += '\n' + linha;
      }
    });
    return saida;
  }

  function saldoCampo(valor) {
    var texto = String(valor || '').trim();
    if (texto.length > 96) return null;
    var m = texto.match(/^([CD])(\d{6})([A-Z]{3})(.+)$/);
    if (!m) return null;
    var data = dataSwift(m[2]), valorCentavos = centavos(m[4]);
    if (!data || valorCentavos === null) return null;
    return { data: data, moeda: m[3], centavos: m[1] === 'D' ? -valorCentavos : valorCentavos };
  }

  function descricao86(valor) {
    return String(valor || '').replace(/\?\d{2}/g, ' ').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function referencia(resto) {
    var aposTipo = String(resto || '').replace(/^[A-Z][A-Z0-9]{3}/, '');
    var m = aposTipo.match(/\/\/([^/\s]+)/);
    if (m) return m[1];
    aposTipo = aposTipo.replace(/^\/+/, '').trim();
    var ref = aposTipo.match(/^([A-Z0-9][A-Z0-9-]{0,15})/i);
    return ref ? ref[1] : '';
  }

  function transacao(valor) {
    var texto = String(valor || '');
    if (texto.length > 256) return null;
    var m = texto.replace(/\s+/g, '').match(/^(\d{6})(\d{4})?(RD|RC|D|C)([A-Z]{3})?((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)(.*)$/i);
    if (!m) return null;
    var dataValor = dataSwift(m[1]), data = m[2] ? dataLancamento(m[2], dataValor) : dataValor;
    var valorCentavos = centavos(m[5]);
    if (!data || valorCentavos === null) return null;
    var indicador = m[3].toUpperCase();
    var sinal = indicador === 'D' || indicador === 'RC' ? -1 : 1;
    return {
      data: data,
      tipo: 'Others',
      centavos: sinal * valorCentavos,
      moeda: (m[4] || '').toUpperCase(),
      referencia: referencia(m[6]),
      descricao: ''
    };
  }

  function reconhece(texto) {
    var conteudo = fonteDe(texto);
    return conteudo.length <= LIMITE_TEXTO && /:61:/i.test(conteudo) && /:60[FM]:|:62[FM]:/i.test(conteudo);
  }

  function ler(texto) {
    var conteudo = fonteDe(texto);
    if (!conteudo.trim()) return erro('Arquivo MT940 vazio.');
    if (conteudo.length > LIMITE_TEXTO) return erro('Arquivo MT940 excede o tamanho máximo permitido.');
    var linhas = conteudo.replace(/-\s*$/, '').replace(/^\uFEFF/, '');
    var listaCampos = campos(linhas), tx = [], moedas = new Set(), saldos = {}, atual = null, reconhecido = false;
    var movimentosDeclarados = 0, movimentosIgnorados = 0;

    function guardarAtual() {
      if (!atual) return;
      if (atual.invalido) {
        movimentosIgnorados++;
        atual = null;
        return;
      }
      atual.descricao = descricao86(atual.descricao) || atual.referencia || '';
      if (atual.data && atual.descricao) tx.push([atual.data, atual.descricao, atual.tipo, atual.centavos, 0]);
      else movimentosIgnorados++;
      atual = null;
    }

    listaCampos.forEach(function (campo) {
      if (campo.tag === '20' || campo.tag === '60F' || campo.tag === '60M' || campo.tag === '62F' || campo.tag === '62M') {
        if (campo.tag !== '60F' && campo.tag !== '60M') guardarAtual();
      }
      if (campo.tag === '60F' || campo.tag === '60M' || campo.tag === '62F' || campo.tag === '62M') {
        var parsedSaldo = saldoCampo(campo.valor);
        if (parsedSaldo) {
          reconhecido = true;
          moedas.add(parsedSaldo.moeda);
          if (campo.tag === '62F' || campo.tag === '62M') saldos[parsedSaldo.data] = parsedSaldo.centavos;
        }
      } else if (campo.tag === '61') {
        guardarAtual();
        movimentosDeclarados++;
        atual = transacao(campo.valor) || { invalido: true };
        if (atual) {
          if (!atual.invalido) {
            reconhecido = true;
            if (atual.moeda) moedas.add(atual.moeda);
          }
        }
      } else if (campo.tag === '86' && atual) {
        atual.descricao += (atual.descricao ? ' ' : '') + campo.valor;
      }
    });
    guardarAtual();

    if (movimentosDeclarados > 0 && tx.length === 0) {
      return erro('Arquivo MT940 não contém movimentos válidos.', movimentosIgnorados);
    }
    if (!reconhecido) return erro('Arquivo MT940 incompleto ou sem saldos e movimentos válidos.');
    return {
      tx: tx,
      moedas: Array.from(moedas).sort(),
      saldos: Object.keys(saldos).length ? saldos : null,
      periodo: null,
      avisos: avisoMovimentosIgnorados(movimentosIgnorados)
    };
  }

  return { id: 'mt940', nome: 'MT940', reconhece: reconhece, ler: ler };
};
