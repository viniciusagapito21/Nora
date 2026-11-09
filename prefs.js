/* Preferências do Nora (idioma e tema), na chave nora.prefs: { idioma: null | 'pt-BR' | 'en-GB', tema: 'auto' | 'claro' | 'escuro' }.
   Separada dos dados: fica fora do backup e "Apagar meus dados" não a apaga (só apaga cortex-financas.*).
   Carregado no <head>, síncrono, antes do styles.css: põe lang e data-tema no <html> antes da primeira pintura.
   idioma null = automático (primeiro idioma do navegador começando com "pt" → pt-BR, senão en-GB); tema 'auto' segue o
   sistema (prefers-color-scheme): escuro põe data-tema="escuro", claro não define data-tema. localStorage sempre em try/catch (Safari em janela privada): se falhar, vale o automático.
   Script simples, só var; gravar(p) é chamado pelos seletores de Configurações (passos f e g da Fase 3). */
var NORA_PREFS = (function () {
  var CHAVE = 'nora.prefs';
  var IDIOMAS = ['pt-BR', 'en-GB'], TEMAS = ['auto', 'claro', 'escuro'];

  /* qualquer coisa → preferências válidas; campo inválido vira o automático, campo por campo */
  function limpar(x) {
    var o = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
    return { idioma: IDIOMAS.indexOf(o.idioma) >= 0 ? o.idioma : null, tema: TEMAS.indexOf(o.tema) >= 0 ? o.tema : 'auto' };
  }
  function ler() {
    try { return limpar(JSON.parse(localStorage.getItem(CHAVE))); } catch (e) { return limpar(null); }
  }
  function idiomaAuto() {
    var nav = typeof navigator !== 'undefined' ? navigator : {};
    var l = (nav.languages && nav.languages.length ? nav.languages[0] : nav.language) || '';
    return /^pt(?:$|[-_])/i.test(String(l)) ? 'pt-BR' : 'en-GB';
  }
  function idiomaEfetivo(p) { return p.idioma || idiomaAuto(); }
  /* ligada no passo f, junto com o dicionário inglês: o lang do <html> e o t() do i18n.js seguem o idioma efetivo
     (desligada, os dois ficariam em pt-BR) */
  var APLICAR_LANG = true;
  /* o tema que vale: o escolhido, ou no automático o do sistema (sem matchMedia, ou se falhar: claro) */
  function sistemaEscuro() {
    try { return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
  }
  function temaEfetivo(p) { return p.tema !== 'auto' ? p.tema : sistemaEscuro() ? 'escuro' : 'claro'; }
  function aplicar(p, html) {
    if (APLICAR_LANG) html.lang = idiomaEfetivo(p);
    if (p.tema === 'auto' && !sistemaEscuro()) html.removeAttribute('data-tema'); else html.setAttribute('data-tema', temaEfetivo(p));
  }

  /* grava só o que é válido (limpar) e devolve o que passou a valer; se o localStorage falhar, vale só nesta página */
  function gravar(p) {
    var l = limpar(p);
    try { localStorage.setItem(CHAVE, JSON.stringify(l)); } catch (e) { }
    return l;
  }

  if (typeof document !== 'undefined' && document.documentElement) aplicar(ler(), document.documentElement);
  return { CHAVE: CHAVE, limpar: limpar, ler: ler, gravar: gravar, idiomaAuto: idiomaAuto, idiomaEfetivo: idiomaEfetivo, temaEfetivo: temaEfetivo, aplicar: aplicar, APLICAR_LANG: APLICAR_LANG };
})();
