/* Traduções: t(chave, vars) devolve o texto da chave no idioma efetivo (NORA_PREFS.idiomaEfetivo, só com
   NORA_PREFS.APLICAR_LANG ligada; desligada, sempre pt-BR), trocando {nome}
   pelo valor de vars.nome. Falta no idioma → pt-BR → a própria chave; cada falta fica em NORA_I18N.faltando (os testes
   consultam; nada vai para o console). Os valores de vars entram como estão: texto da pessoa (nome de carteira,
   descrição) nunca passa pelo dicionário nem é lido de novo atrás de {chaves}. Um valor { one, other } é plural,
   escolhido por Intl.PluralRules com vars.n. Script simples, só var, sem DOM; carregado depois dos dicionários
   (i18n/*.js) e antes do app.js. */
var NORA_I18N = (function () {
  var BASE = 'pt-BR';
  var dics = typeof NORA_DICIONARIOS !== 'undefined' ? NORA_DICIONARIOS : {};
  var faltando = [];
  /* a preferência é sempre lida e validada, mas só vale com NORA_PREFS.APLICAR_LANG (passo f): antes disso a página é
     toda em português e o t() devolve pt-BR, junto com o lang do <html> */
  var preferido = BASE, idioma = BASE;
  try {
    if (typeof NORA_PREFS !== 'undefined') {
      preferido = NORA_PREFS.idiomaEfetivo(NORA_PREFS.ler());
      if (NORA_PREFS.APLICAR_LANG === true) idioma = preferido;
    }
  } catch (e) { }
  var tem = Object.prototype.hasOwnProperty;

  function buscar(idi, chave) { var d = dics[idi]; return d && tem.call(d, chave) ? d[chave] : undefined; }
  function anotar(idi, chave) {
    for (var i = 0; i < faltando.length; i++) if (faltando[i].idioma === idi && faltando[i].chave === chave) return;
    faltando.push({ idioma: idi, chave: chave });
  }
  function forma(v, vars, idi) {
    if (typeof v === 'string') return v;
    var n = vars && vars.n, cat = typeof n === 'number' ? new Intl.PluralRules(idi).select(n) : 'other';
    return typeof v[cat] === 'string' ? v[cat] : v.other;
  }
  /* uma passada só: o que entra por vars não é lido de novo */
  function preencher(s, vars) {
    return s.replace(/\{(\w+)\}/g, function (m, k) { return vars && tem.call(vars, k) ? String(vars[k]) : m; });
  }
  function t(chave, vars) {
    var idi = idioma, v = buscar(idi, chave);
    if (v === undefined) {
      anotar(idi, chave);
      if (idi !== BASE) { idi = BASE; v = buscar(BASE, chave); if (v === undefined) anotar(BASE, chave); }
    }
    return v === undefined ? chave : preencher(forma(v, vars, idi), vars);
  }
  return { t: t, faltando: faltando, idioma: function () { return idioma; }, idiomaPreferido: function () { return preferido; }, BASE: BASE };
})();
function t(chave, vars) { return NORA_I18N.t(chave, vars); }
