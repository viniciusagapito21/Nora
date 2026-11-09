// Preferências (prefs.js): idioma e tema aplicados no <html> antes da primeira pintura, lidos de nora.prefs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { carregarNucleo } from './planilhas.mjs';

const prefsJs = readFileSync(new URL('../prefs.js', import.meta.url), 'utf8');

// roda o prefs.js num contexto com navegador falso; devolve o <html> falso e o NORA_PREFS
function abrir({ languages, language, salvo, storage, attrs = {} } = {}) {
  const html = { lang: 'pt-BR', attrs: { ...attrs },
    setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } };
  const mapa = new Map(salvo === undefined ? [] : [['nora.prefs', typeof salvo === 'string' ? salvo : JSON.stringify(salvo)]]);
  const ls = storage || { getItem: k => (mapa.has(k) ? mapa.get(k) : null) };
  const ctx = { navigator: { languages, language }, document: { documentElement: html } };
  if (storage === 'lança') Object.defineProperty(ctx, 'localStorage', { get() { throw new Error('SecurityError'); } });
  else ctx.localStorage = ls;
  vm.createContext(ctx);
  vm.runInContext(prefsJs + '\n;this.NORA_PREFS = NORA_PREFS;', ctx);
  return { html, P: ctx.NORA_PREFS };
}
const tema = html => html.getAttribute('data-tema');
// o idioma que vale (lido e validado), o mesmo do lang do <html>
const idioma = ({ P }) => P.idiomaEfetivo(P.ler());

test('idioma automático: o primeiro idioma do navegador decide', () => {
  assert.equal(idioma(abrir({ languages: ['pt-BR', 'en'] })), 'pt-BR');
  assert.equal(idioma(abrir({ languages: ['pt-PT'] })), 'pt-BR');
  assert.equal(idioma(abrir({ languages: ['pt'] })), 'pt-BR');
  assert.equal(idioma(abrir({ languages: ['PT-br'] })), 'pt-BR');
  assert.equal(idioma(abrir({ languages: ['en-US', 'pt-BR'] })), 'en-GB');
  assert.equal(idioma(abrir({ languages: ['fr-FR'] })), 'en-GB');
  // sem navigator.languages, vale navigator.language; sem nada, inglês
  assert.equal(idioma(abrir({ language: 'pt-BR' })), 'pt-BR');
  assert.equal(idioma(abrir({ languages: [], language: 'pt-BR' })), 'pt-BR');
  assert.equal(idioma(abrir({})), 'en-GB');
  assert.equal(idioma(abrir({ languages: ['pt_BR'] })), 'pt-BR');
  assert.equal(idioma(abrir({ languages: ['ptx'] })), 'en-GB');
});

test('idioma salvo vence o navegador; tema claro e escuro definem data-tema, auto não', () => {
  assert.equal(idioma(abrir({ languages: ['pt-BR'], salvo: { idioma: 'en-GB', tema: 'auto' } })), 'en-GB');
  assert.equal(idioma(abrir({ languages: ['en-GB'], salvo: { idioma: 'pt-BR', tema: 'auto' } })), 'pt-BR');
  assert.equal(idioma(abrir({ languages: ['en-GB'], salvo: { idioma: null, tema: 'auto' } })), 'en-GB');
  assert.equal(tema(abrir({ salvo: { idioma: null, tema: 'escuro' } }).html), 'escuro');
  assert.equal(tema(abrir({ salvo: { idioma: null, tema: 'claro' } }).html), 'claro');
  assert.equal(tema(abrir({ salvo: { idioma: null, tema: 'auto' } }).html), null);
  assert.equal(tema(abrir({}).html), null);
  // auto tira um data-tema que já estivesse lá
  assert.equal(tema(abrir({ salvo: { tema: 'auto' }, attrs: { 'data-tema': 'escuro' } }).html), null);
});

test('lang do <html> segue o idioma efetivo (passo f: APLICAR_LANG ligada); o tema também é aplicado', () => {
  for (const r of [abrir({ languages: ['en-US'] }), abrir({ languages: ['pt-BR'], salvo: { idioma: 'en-GB', tema: 'escuro' } }), abrir({})]) {
    assert.equal(idioma(r), 'en-GB');
    assert.equal(r.html.lang, 'en-GB');
  }
  assert.equal(abrir({ languages: ['pt-PT'] }).html.lang, 'pt-BR');
  assert.equal(abrir({ languages: ['en-GB'], salvo: { idioma: 'pt-BR', tema: 'auto' } }).html.lang, 'pt-BR');
  assert.equal(tema(abrir({ languages: ['en-US'], salvo: { idioma: 'en-GB', tema: 'escuro' } }).html), 'escuro');
  assert.match(prefsJs, /var APLICAR_LANG = true;/);
});

test('gravar: só preferências válidas, na chave nora.prefs; localStorage que falha não quebra', () => {
  const mapa = new Map();
  const storage = { getItem: k => (mapa.has(k) ? mapa.get(k) : null), setItem: (k, v) => mapa.set(k, String(v)) };
  const { P } = abrir({ storage });
  assert.deepEqual({ ...P.gravar({ idioma: 'en-GB', tema: 'escuro' }) }, { idioma: 'en-GB', tema: 'escuro' });
  assert.deepEqual(JSON.parse(mapa.get('nora.prefs')), { idioma: 'en-GB', tema: 'escuro' });
  assert.deepEqual({ ...P.gravar({ idioma: 'fr', tema: 'claro', outro: 1 }) }, { idioma: null, tema: 'claro' });
  assert.deepEqual(JSON.parse(mapa.get('nora.prefs')), { idioma: null, tema: 'claro' });
  assert.deepEqual({ ...P.ler() }, { idioma: null, tema: 'claro' });
  // localStorage que lança (Safari em janela privada): devolve o que valeria, sem erro
  assert.deepEqual({ ...abrir({ storage: 'lança' }).P.gravar({ idioma: 'pt-BR', tema: 'auto' }) }, { idioma: 'pt-BR', tema: 'auto' });
  const cheio = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.deepEqual({ ...abrir({ storage: cheio }).P.gravar({ idioma: 'en-GB', tema: 'auto' }) }, { idioma: 'en-GB', tema: 'auto' });
});

test('valores inválidos são ignorados, campo por campo', () => {
  const auto = { idioma: null, tema: 'auto' };
  const { P } = abrir();
  for (const v of [null, undefined, 1, 'texto', [], ['pt-BR'], { idioma: 'fr' }, { idioma: 'pt' }, { idioma: 'en' },
    { idioma: 'PT-BR' }, { tema: 'dark' }, { tema: 'Escuro' }, { tema: true }, { idioma: 1, tema: null }])
    assert.deepEqual({ ...P.limpar(v) }, auto, JSON.stringify(v));
  assert.deepEqual({ ...P.limpar({ idioma: 'en-GB', tema: 'dark' }) }, { idioma: 'en-GB', tema: 'auto' });
  assert.deepEqual({ ...P.limpar({ idioma: 'fr', tema: 'escuro', outro: 1 }) }, { idioma: null, tema: 'escuro' });
  // gravado inválido: cai no automático
  for (const salvo of ['{quebrado', '[]', 'null', '"escuro"', JSON.stringify({ idioma: 'de-DE', tema: 'sepia' })]) {
    const r = abrir({ languages: ['pt-BR'], salvo });
    assert.equal(idioma(r), 'pt-BR', salvo); assert.equal(tema(r.html), null, salvo);
  }
});

test('localStorage que falha (Safari em janela privada): cai no automático, sem erro', () => {
  const falha = { getItem() { throw new Error('QuotaExceededError'); } };
  for (const storage of [falha, 'lança', null]) {
    const { html, P } = abrir({ languages: ['pt-BR'], storage: storage === null ? undefined : storage });
    assert.equal(P.idiomaEfetivo(P.ler()), 'pt-BR'); assert.equal(tema(html), null);
    assert.deepEqual({ ...P.ler() }, { idioma: null, tema: 'auto' });
  }
  // sem document (núcleo, testes): só define NORA_PREFS
  const ctx = { navigator: { languages: ['pt-BR'] } };
  vm.createContext(ctx);
  assert.doesNotThrow(() => vm.runInContext(prefsJs, ctx));
});

test('"Apagar meus dados" não apaga as preferências nem as leva para o backup', () => {
  const { chavesParaApagar } = carregarNucleo(['chavesParaApagar']);
  assert.deepEqual(chavesParaApagar(['cortex-financas.v4', 'nora.prefs', 'cortex-financas.mov', 'outra', 'cortex-financas.v3']),
    ['cortex-financas.v4', 'cortex-financas.mov', 'cortex-financas.v3']);
  assert.deepEqual(chavesParaApagar(['nora.prefs']), []);
  // o apagarTudo do painel usa essa lista; e o backup é só dadosAtuais() (nada do localStorage inteiro)
  const appJs = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const apagar = appJs.slice(appJs.indexOf('function apagarTudo()'), appJs.indexOf('var chain = Promise.resolve();'));
  assert.match(apagar, /chavesParaApagar\(/);
  assert.doesNotMatch(appJs, /['"]nora\.prefs['"]/, 'o painel não lê nem grava nora.prefs');
});

test('index.html: prefs.js síncrono no <head>, logo depois da CSP e antes do styles.css', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  const csp = head.indexOf('http-equiv="Content-Security-Policy"'), tag = head.indexOf('<script src="prefs.js"></script>'), css = head.indexOf('href="styles.css"');
  assert.ok(csp > 0 && tag > csp && css > tag, 'ordem: CSP, prefs.js, styles.css');
  assert.doesNotMatch(head.slice(csp, tag).replace(/^[^\n]*\n/, ''), /<script|<link/, 'nada entre a CSP e o prefs.js');
  assert.equal((html.match(/prefs\.js/g) || []).length, 1);
});
