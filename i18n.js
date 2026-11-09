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
  /* plural: em pt-BR só 1 é singular ("0 movimentações", "0 meses", como o painel sempre fez; o Intl diria
     "0 movimentação"); nos outros idiomas, Intl.PluralRules */
  var PLURAL = { 'pt-BR': function (n) { return n === 1 ? 'one' : 'other'; } };
  function forma(v, vars, idi) {
    if (typeof v === 'string') return v;
    var n = vars && vars.n, cat = typeof n !== 'number' ? 'other' : PLURAL[idi] ? PLURAL[idi](n) : new Intl.PluralRules(idi).select(n);
    return typeof v[cat] === 'string' ? v[cat] : v.other;
  }
  /* uma passada só: o que entra por vars não é lido de novo */
  function preencher(s, vars, comoVar) {
    return s.replace(/\{(\w+)\}/g, function (m, k) { return vars && tem.call(vars, k) ? comoVar(vars[k]) : m; });
  }
  /* o texto da chave, já com a forma do plural (antes de trocar as variáveis) */
  function molde(chave, vars) {
    var idi = idioma, v = buscar(idi, chave);
    if (v === undefined) {
      anotar(idi, chave);
      if (idi !== BASE) { idi = BASE; v = buscar(BASE, chave); if (v === undefined) anotar(BASE, chave); }
    }
    return v === undefined ? chave : forma(v, vars, idi);
  }
  function t(chave, vars) { return preencher(molde(chave, vars), vars, String); }
  /* a chave existe no idioma efetivo ou no pt-BR (o que t() acharia), sem anotar falta */
  function existe(chave) { return buscar(idioma, chave) !== undefined || buscar(BASE, chave) !== undefined; }
  /* erro para mostrar: com um código do núcleo (e.codigo, e.vars, de erroCod) que tenha a chave 'erro.' + codigo, a frase
     do dicionário; sem código, ou sem a chave, a própria mensagem do erro (a frase pt-BR do núcleo): nunca a chave crua.
     Número em vars é quantidade e sai por numero(v), se vier, menos n (o plural); texto entra como está */
  function textoErro(e, numero) {
    if (e && typeof e.codigo === 'string' && existe('erro.' + e.codigo)) {
      var vs = {}, ks = e.vars || {};
      for (var k in ks) if (tem.call(ks, k)) vs[k] = typeof ks[k] === 'number' && k !== 'n' && numero ? numero(ks[k]) : ks[k];
      return t('erro.' + e.codigo, vs);
    }
    return (e && e.message) || String(e);
  }

  /* texto para dentro de HTML: o do dicionário escapado (o mesmo esc do app.js) e cada variável escapada também;
     só não escapa a variável embrulhada em cru('<b>' + esc(x) + '</b>'), a marcação montada pelo próprio código */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var CRU = {};
  function cru(s) { return { marca: CRU, html: String(s) }; }
  function th(chave, vars) {
    return preencher(esc(molde(chave, vars)), vars, function (v) { return v && v.marca === CRU ? v.html : esc(v); });
  }
  /* textos fixos do index.html: data-i18n="chave" troca o texto, data-i18n-aria-label="chave" o aria-label.
     O português fica no HTML (sem JS, ou antes de carregar, nada muda); raiz = a página inteira */
  function aplicarTextosFixos(raiz) {
    var l = raiz.querySelectorAll('[data-i18n], [data-i18n-aria-label]');
    for (var i = 0; i < l.length; i++) {
      var el = l[i], k = el.getAttribute('data-i18n'), a = el.getAttribute('data-i18n-aria-label');
      if (k) el.textContent = t(k);
      if (a) el.setAttribute('aria-label', t(a));
    }
  }
  /* troca o idioma na hora (seletor de Configurações); idioma sem dicionário não muda nada. Devolve o que vale */
  function usar(idi) { if (tem.call(dics, idi)) { idioma = idi; preferido = idi; } return idioma; }
  return { t: t, th: th, cru: cru, esc: esc, existe: existe, textoErro: textoErro, aplicarTextosFixos: aplicarTextosFixos, faltando: faltando, usar: usar,
    idioma: function () { return idioma; }, idiomaPreferido: function () { return preferido; }, BASE: BASE };
})();
function t(chave, vars) { return NORA_I18N.t(chave, vars); }
