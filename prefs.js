/* Preferências do Nora (idioma e tema), na chave nora.prefs: { idioma: null | 'pt-BR' | 'en-GB', tema: 'auto' | 'claro' | 'escuro' }.
   Separada dos dados: fica fora do backup e "Apagar meus dados" não a apaga (só apaga cortex-financas.*).
   Carregado no <head>, síncrono, antes do styles.css: põe data-tema no <html> antes da primeira pintura (o lang só
   a partir do passo f; veja APLICAR_LANG).
   idioma null = automático (primeiro idioma do navegador começando com "pt" → pt-BR, senão en-GB); tema 'auto' não
   define data-tema. localStorage sempre em try/catch (Safari em janela privada): se falhar, vale o automático.
   Script simples, só var; aqui nada grava (a gravação entra com os seletores, nos passos f e g da Fase 3). */
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
  /* o lang ainda não é aplicado: enquanto não existe dicionário inglês (passo f), a página é toda em português e
     lang="en-GB" faria leitores de tela lerem português com voz inglesa; o <html> fica com o lang="pt-BR" do index.html.
     O passo f liga APLICAR_LANG junto com o dicionário. */
  var APLICAR_LANG = false;
  function aplicar(p, html) {
    if (APLICAR_LANG) html.lang = idiomaEfetivo(p);
    if (p.tema === 'auto') html.removeAttribute('data-tema'); else html.setAttribute('data-tema', p.tema);
  }

  if (typeof document !== 'undefined' && document.documentElement) aplicar(ler(), document.documentElement);
  return { CHAVE: CHAVE, limpar: limpar, ler: ler, idiomaAuto: idiomaAuto, idiomaEfetivo: idiomaEfetivo, aplicar: aplicar };
})();
