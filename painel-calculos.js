/* Nora: cálculos puros do painel em centavos e pontos-base inteiros. */
var NORA_PAINEL_CALCULOS = (function () {
  var MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

  function comoCentavos(valor) {
    return Number.isSafeInteger(valor) ? BigInt(valor) : 0n;
  }

  function comoNumeroSeguro(valor) {
    if (valor > MAX_SAFE || valor < -MAX_SAFE) throw new RangeError('Resultado fora da faixa segura de inteiros.');
    return Number(valor);
  }

  function pontosBase(numerador, denominador) {
    if (denominador <= 0n) return 0;
    var sinal = numerador < 0n ? -1n : 1n;
    var absoluto = numerador < 0n ? -numerador : numerador;
    var escalado = absoluto * 10000n;
    var inteiro = escalado / denominador;
    var resto = escalado % denominador;
    if (resto * 2n >= denominador) inteiro++;
    return comoNumeroSeguro(inteiro * sinal);
  }

  function dataUTC(iso) {
    if (typeof iso !== 'string') return null;
    var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var ano = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
    var data = new Date(0);
    data.setUTCFullYear(ano, mes - 1, dia);
    data.setUTCHours(0, 0, 0, 0);
    if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
    return data;
  }

  function diasRestantes(ultimaDataISO, fimDoMesISO) {
    var ultima = dataUTC(ultimaDataISO), fim = dataUTC(fimDoMesISO);
    if (!ultima || !fim || fim < ultima) return 0;
    return Math.floor((fim.getTime() - ultima.getTime()) / 86400000);
  }

  function cotaDiaria(entrada) {
    entrada = entrada || {};
    var meta = comoCentavos(entrada.metaGastoCents);
    var gasto = comoCentavos(entrada.gastoCents);
    var fixas = comoCentavos(entrada.fixasACairCents);
    var comprometido = gasto + fixas;
    var livre = meta - comprometido;
    var dias = diasRestantes(entrada.ultimaDataISO, entrada.fimDoMesISO);
    var metaValida = meta > 0n;
    var estado = !metaValida ? 'sem-meta' : livre < 0n ? 'fora' : 'dentro';
    /* no último dia do mês (dias 0) a cota é o próprio livre, como define o D2 do roteiro */
    var divisor = BigInt(dias > 0 ? dias : 1);
    var cota = metaValida && livre >= 0n
      ? comoNumeroSeguro(livre / divisor)
      : null;

    return {
      estado: estado,
      livreCents: comoNumeroSeguro(livre),
      diasRestantes: dias,
      cotaCents: cota,
      comprometidoCents: comoNumeroSeguro(comprometido)
    };
  }

  function taxaPoupanca(entrada) {
    entrada = entrada || {};
    var entrou = comoCentavos(entrada.entrouCents);
    var aportes = comoCentavos(entrada.aportesCents);
    var resgates = comoCentavos(entrada.resgatesCents);
    var guardou = aportes - resgates;
    var retirada = guardou < 0n ? -guardou : 0n;

    if (entrou <= 0n) {
      return { tipo: 'sem-entrada', pontosBase: 0, retiradaCents: comoNumeroSeguro(retirada) };
    }
    if (guardou < 0n) {
      return { tipo: 'retirada', pontosBase: 0, retiradaCents: comoNumeroSeguro(retirada) };
    }
    return {
      tipo: 'taxa',
      pontosBase: pontosBase(guardou, entrou),
      retiradaCents: 0
    };
  }

  function alertaMeta(entrada) {
    entrada = entrada || {};
    var meta = comoCentavos(entrada.metaCents);
    var gasto = comoCentavos(entrada.gastoCents);
    if (meta <= 0n) return { nivel: 'sem-meta', pontosBase: 0, restaCents: 0, acimaCents: 0 };

    var resta = meta - gasto;
    var acima = gasto > meta ? gasto - meta : 0n;
    var nivel = gasto > meta ? 'estouro'
      : gasto === meta ? 'limite'
        : gasto * 5n >= meta * 4n ? 'atencao' : 'ok';

    return {
      nivel: nivel,
      pontosBase: pontosBase(gasto, meta),
      restaCents: comoNumeroSeguro(resta > 0n ? resta : 0n),
      acimaCents: comoNumeroSeguro(acima)
    };
  }

  function conferenciaSaldo(entrada) {
    entrada = entrada || {};
    if (!Number.isSafeInteger(entrada.saldoAppCents) || !Number.isSafeInteger(entrada.saldoBancoCents)) {
      return { estado: 'sem-dados', diferencaCents: null };
    }
    var app = BigInt(entrada.saldoAppCents);
    var banco = BigInt(entrada.saldoBancoCents);
    var diferenca = banco - app;
    var diferencaNumero = comoNumeroSeguro(diferenca);
    var tolerancia = Number.isSafeInteger(entrada.toleranciaCents) && entrada.toleranciaCents > 0
      ? BigInt(entrada.toleranciaCents)
      : 0n;
    var absoluto = diferenca < 0n ? -diferenca : diferenca;
    var estado = diferenca === 0n ? 'bateu'
      : absoluto <= tolerancia ? 'diferenca-pequena' : 'atencao';
    return { estado: estado, diferencaCents: diferencaNumero };
  }

  return {
    cotaDiaria: cotaDiaria,
    taxaPoupanca: taxaPoupanca,
    alertaMeta: alertaMeta,
    conferenciaSaldo: conferenciaSaldo
  };
})();
