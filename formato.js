/* Nora: formatação localizada sem estado, DOM ou efeitos colaterais. */
var NORA_FORMATO = (function () {
  var NEUTRO = '—';
  var MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MESES_CURTOS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var NOMES_MOEDA_PT = { EUR: 'euro', BRL: 'real', GBP: 'libra', USD: 'dólar' };
  var NOMES_PAIS_PT_COMPAT = { VA: 'Vaticano' };

  function idiomaValido(idioma) {
    return String(idioma || '').toLowerCase() === 'en-gb' ? 'en-GB' : 'pt-BR';
  }

  function para(idioma) {
    var local = idiomaValido(idioma), numeros = Object.create(null), moedas = Object.create(null);
    var datas = Object.create(null), nomes = Object.create(null);

    function numeroValido(valor) {
      return (typeof valor === 'number' && Number.isFinite(valor)) || typeof valor === 'bigint';
    }

    function moedaValida(codigo) {
      return typeof codigo === 'string' && /^[A-Za-z]{3}$/.test(codigo);
    }

    function codigoMoeda(codigo) {
      if (codigo == null || codigo === '') return 'EUR';
      return typeof codigo === 'string' ? codigo.toUpperCase() : '';
    }

    function formatadorNumero(minimo, maximo) {
      var chave = minimo + ':' + maximo;
      if (!numeros[chave]) {
        try {
          numeros[chave] = new Intl.NumberFormat(local, {
            minimumFractionDigits: minimo,
            maximumFractionDigits: maximo
          });
        } catch (_) { numeros[chave] = null; }
      }
      return numeros[chave];
    }

    function formatadorMoeda(codigo, minimo, maximo, padrao) {
      codigo = codigoMoeda(codigo);
      if (!moedaValida(codigo)) return null;
      var chave = codigo + ':' + (padrao ? 'padrao' : minimo + ':' + maximo);
      if (!moedas[chave]) {
        try {
          var opcoes = { style: 'currency', currency: codigo };
          if (!padrao) {
            opcoes.minimumFractionDigits = minimo;
            opcoes.maximumFractionDigits = maximo;
          }
          moedas[chave] = new Intl.NumberFormat(local, opcoes);
        } catch (_) {
          try {
            moedas[chave] = padrao ? null : new Intl.NumberFormat(local, {
              minimumFractionDigits: minimo,
              maximumFractionDigits: maximo
            });
          } catch (_) { moedas[chave] = null; }
        }
      }
      return moedas[chave];
    }

    function formatar(formatador, valor) {
      if (!formatador || !numeroValido(valor)) return NEUTRO;
      try { return formatador.format(valor); } catch (_) { return NEUTRO; }
    }

    function formatarData(formatador, valor) {
      if (!formatador || !(valor instanceof Date) || !Number.isFinite(valor.getTime())) return NEUTRO;
      try { return formatador.format(valor); } catch (_) { return NEUTRO; }
    }

    function casasValidas(minimo, maximo) {
      return Number.isInteger(minimo) && Number.isInteger(maximo)
        && minimo >= 0 && maximo >= minimo && maximo <= 20;
    }

    function numero(valor, minimo, maximo) {
      minimo = minimo == null ? 0 : minimo;
      maximo = maximo == null ? minimo : maximo;
      if (!numeroValido(valor) || !casasValidas(minimo, maximo)) return NEUTRO;
      return formatar(formatadorNumero(minimo, maximo), valor);
    }

    function fmtDe(codigo, casas) {
      if (!Number.isInteger(casas) || casas < 0 || casas > 20) return null;
      return formatadorMoeda(codigo, casas, casas, false);
    }

    function moedaPadrao(codigo) {
      return formatadorMoeda(codigo, 0, 0, true);
    }

    function moeda(valor, codigo, casas) {
      casas = casas == null ? 2 : casas;
      if (!numeroValido(valor) || !Number.isInteger(casas) || casas < 0 || casas > 20) return NEUTRO;
      return formatar(fmtDe(codigoMoeda(codigo), casas), valor);
    }

    function dinheiroCentavosEmTexto(centavos) {
      var inteiro;
      if (typeof centavos === 'bigint') inteiro = centavos;
      else if (typeof centavos === 'number' && Number.isSafeInteger(centavos)) inteiro = BigInt(centavos);
      else return null;
      var negativo = inteiro < 0n;
      if (negativo) inteiro = -inteiro;
      var parteInteira = (inteiro / 100n).toString();
      var fracao = (inteiro % 100n).toString().padStart(2, '0');
      return (negativo ? '-' : '') + parteInteira + '.' + fracao;
    }

    function dinheiroCentavos(centavos, codigo) {
      var texto = dinheiroCentavosEmTexto(centavos), fmt = fmtDe(codigoMoeda(codigo), 2);
      if (texto === null || !fmt) return NEUTRO;
      try { return fmt.format(texto); } catch (_) { return NEUTRO; }
    }

    function dinheiroCentavosSemSimbolo(centavos) {
      var texto = dinheiroCentavosEmTexto(centavos), fmt = formatadorNumero(2, 2);
      if (texto === null || !fmt) return NEUTRO;
      try { return fmt.format(texto); } catch (_) { return NEUTRO; }
    }

    function dinheiroSemSimbolo(valor, casas) {
      casas = casas == null ? 2 : casas;
      return numero(valor, casas, casas);
    }

    function valorArredondavel(valor) {
      return typeof valor === 'number' && Number.isFinite(valor);
    }

    function f0(valor, codigo) {
      if (!valorArredondavel(valor)) return NEUTRO;
      var texto = formatar(fmtDe(codigoMoeda(codigo), 0), Math.round(valor));
      return texto === NEUTRO ? NEUTRO : texto.replace('-', '−');
    }

    function f2(valor, codigo) { return moeda(valor, codigo, 2); }

    function fMoeda(valor, codigo) {
      if (!valorArredondavel(valor)) return NEUTRO;
      codigo = codigoMoeda(codigo);
      if (!moedaValida(codigo)) return NEUTRO;
      var fmt = moedaPadrao(codigo);
      if (fmt) return formatar(fmt, valor);
      var simples = numero(valor, 2, 2);
      return simples === NEUTRO ? NEUTRO : codigo + ' ' + simples;
    }

    function simbolo(codigo) {
      codigo = codigoMoeda(codigo);
      if (!moedaValida(codigo)) return NEUTRO;
      var fmt = fmtDe(codigo, 0);
      if (!fmt) return codigo;
      try {
        var partes = fmt.formatToParts(1);
        for (var i = 0; i < partes.length; i++) if (partes[i].type === 'currency') return partes[i].value;
      } catch (_) { return codigo; }
      return codigo;
    }

    function sgn(valor, formatador) {
      if (!valorArredondavel(valor)) return NEUTRO;
      var texto = (formatador || f0)(Math.abs(valor));
      if (typeof texto !== 'string' || texto === NEUTRO || texto === 'NaN' || texto === 'undefined') return NEUTRO;
      return (valor < 0 ? '−' : '+') + texto;
    }

    function numeroMovimento(movimento, codigo) {
      if (!movimento || !valorArredondavel(movimento.a)) return NEUTRO;
      var fmt = fmtDe(codigoMoeda(codigo), 2), texto = formatar(fmt, Math.abs(movimento.a));
      if (!fmt || texto === NEUTRO) return NEUTRO;
      return (movimento.a < 0 ? '−' : '+') + texto;
    }

    function partesData(iso) {
      if (typeof iso !== 'string') return null;
      var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return null;
      var ano = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
      var data = new Date(0);
      data.setUTCFullYear(ano, mes - 1, dia);
      data.setUTCHours(0, 0, 0, 0);
      if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
      return { ano: ano, mes: mes, dia: dia, data: data };
    }

    function formatadorData(opcoes) {
      var chave = JSON.stringify(opcoes);
      if (!datas[chave]) {
        try { datas[chave] = new Intl.DateTimeFormat(local, Object.assign({ timeZone: 'UTC' }, opcoes)); }
        catch (_) { datas[chave] = null; }
      }
      return datas[chave];
    }

    function chaveMes(mes) {
      if (typeof mes !== 'string') return null;
      var m = mes.match(/^(\d{4})-(\d{2})$/);
      if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
      return { ano: Number(m[1]), mes: Number(m[2]), data: partesData(m[1] + '-' + m[2] + '-01').data };
    }

    function mShort(mes) {
      var p = chaveMes(mes);
      if (!p) return NEUTRO;
      if (local === 'pt-BR') return MESES_CURTOS_PT[p.mes - 1];
      return formatarData(formatadorData({ month: 'short' }), p.data);
    }

    function mLabel(mes) {
      var p = chaveMes(mes);
      if (!p) return NEUTRO;
      if (local === 'pt-BR') return MESES_PT[p.mes - 1] + ' de ' + String(p.ano).padStart(4, '0');
      return formatarData(formatadorData({ month: 'long', year: 'numeric' }), p.data);
    }

    /* só o nome do mês, por extenso ("outubro", "October"), para frases como "previsão de outubro" */
    function mNome(mes) {
      var p = chaveMes(mes);
      if (!p) return NEUTRO;
      if (local === 'pt-BR') return MESES_PT[p.mes - 1];
      return formatarData(formatadorData({ month: 'long' }), p.data);
    }

    function mesAno(mes) {
      var p = chaveMes(mes);
      if (!p) return NEUTRO;
      return mShort(mes) + ' ' + String(p.ano).padStart(4, '0');
    }

    function dFmt(iso) {
      var p = partesData(iso);
      if (!p) return NEUTRO;
      if (local === 'pt-BR') return p.dia + ' ' + MESES_CURTOS_PT[p.mes - 1];
      return formatarData(formatadorData({ day: 'numeric', month: 'short' }), p.data);
    }

    function dFull(iso) {
      var p = partesData(iso);
      if (!p) return NEUTRO;
      if (local === 'pt-BR') return dFmt(iso) + ' ' + String(p.ano).padStart(4, '0');
      return formatarData(formatadorData({ day: 'numeric', month: 'short', year: 'numeric' }), p.data);
    }

    function displayName(tipo, codigo) {
      if (typeof codigo !== 'string' || !codigo.trim()) return NEUTRO;
      codigo = codigo.trim().toUpperCase();
      var chave = tipo + ':' + codigo;
      if (nomes[chave] !== undefined) return nomes[chave];
      try {
        if (typeof Intl.DisplayNames !== 'function') return NEUTRO;
        var display = new Intl.DisplayNames([local], { type: tipo });
        var nome = display.of(codigo);
        nomes[chave] = typeof nome === 'string' && nome !== codigo ? nome : NEUTRO;
      } catch (_) { nomes[chave] = NEUTRO; }
      return nomes[chave];
    }

    function nomeMoeda(codigo) {
      codigo = codigoMoeda(codigo);
      if (!moedaValida(codigo)) return NEUTRO;
      if (local === 'pt-BR') return NOMES_MOEDA_PT[codigo] || codigo;
      return displayName('currency', codigo);
    }

    function nomePais(codigo) {
      if (typeof codigo !== 'string' || !/^[A-Za-z]{2}$/.test(codigo)) return NEUTRO;
      codigo = codigo.toUpperCase();
      if (codigo === 'XK') return 'Kosovo';
      if (local === 'pt-BR' && NOMES_PAIS_PT_COMPAT[codigo]) return NOMES_PAIS_PT_COMPAT[codigo];
      return displayName('region', codigo);
    }

    function porcentagem(valor) {
      var texto = numero(valor, 0, 0);
      return texto === NEUTRO ? NEUTRO : texto + '%';
    }

    function fP0(valor, codigo) { return f0(valor, codigo); }
    function fW(valor, codigo) { return f0(valor, codigo); }

    return {
      idioma: local,
      neutro: NEUTRO,
      dinheiroCentavos: dinheiroCentavos,
      dinheiroCentavosSemSimbolo: dinheiroCentavosSemSimbolo,
      dinheiro: moeda,
      dinheiroSemSimbolo: dinheiroSemSimbolo,
      f0: f0,
      f2: f2,
      fMoeda: fMoeda,
      fP0: fP0,
      fW: fW,
      sgn: sgn,
      valorMov: numeroMovimento,
      simbolo: simbolo,
      nomeMoeda: nomeMoeda,
      nomePais: nomePais,
      dFull: dFull,
      dFmt: dFmt,
      mLabel: mLabel,
      mShort: mShort,
      mNome: mNome,
      mesAno: mesAno,
      numero: numero,
      nn: function (valor) { return numero(valor, 0, 0); },
      n2: function (valor) { return numero(valor, 2, 2); },
      n1: function (valor) { return numero(valor, 0, 1); },
      nr: function (valor) { return numero(valor, 2, 4); },
      pct: porcentagem
    };
  }

  return { para: para };
})();
