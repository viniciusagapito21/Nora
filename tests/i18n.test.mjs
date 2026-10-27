// Traduções (i18n.js e i18n/*.js): t(chave, vars), plural, fallback e os dois dicionários iguais em chaves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ler = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const prefsJs = ler('prefs.js'), i18nJs = ler('i18n.js');
const DIC = ['i18n/pt-BR.js', 'i18n/en-GB.js'].map(ler);

// carrega dicionários + i18n.js num contexto próprio; idioma pelo prefs.js de verdade (navegador e nora.prefs falsos).
// aplicarLang: injeta APLICAR_LANG = true no prefs.js (o que o passo f vai fazer); sem ela, vale a do arquivo (false)
const LANG_DESLIGADA = 'var APLICAR_LANG = false;';
function abrir({ languages = ['pt-BR'], salvo, dicionarios, aplicarLang = false } = {}) {
  const mapa = new Map(salvo ? [['nora.prefs', JSON.stringify(salvo)]] : []);
  const ctx = { navigator: { languages }, localStorage: { getItem: k => (mapa.has(k) ? mapa.get(k) : null) }, Intl };
  vm.createContext(ctx);
  vm.runInContext(aplicarLang ? prefsJs.replace(LANG_DESLIGADA, 'var APLICAR_LANG = true;') : prefsJs, ctx);
  if (dicionarios) vm.runInContext('var NORA_DICIONARIOS = ' + JSON.stringify(dicionarios) + ';', ctx);
  else DIC.forEach(d => vm.runInContext(d, ctx));
  vm.runInContext(i18nJs + '\n;this.NORA_I18N = NORA_I18N; this.t = t; this.NORA_DICIONARIOS = NORA_DICIONARIOS;', ctx);
  return ctx;
}
const faltas = ctx => [...ctx.NORA_I18N.faltando].map(f => f.idioma + ':' + f.chave);

test('APLICAR_LANG desligada (até o passo f): t() fica em pt-BR, mas a preferência é lida e validada', () => {
  assert.ok(prefsJs.includes(LANG_DESLIGADA), 'o prefs.js ainda tem a constante desligada');
  for (const o of [{ languages: ['en-US'] }, { languages: ['pt-BR'], salvo: { idioma: 'en-GB', tema: 'auto' } }]) {
    const c = abrir(o);
    assert.equal(c.NORA_I18N.idioma(), 'pt-BR');
    assert.equal(c.NORA_I18N.idiomaPreferido(), 'en-GB');
    assert.equal(c.t('abas.resumo'), 'Resumo');
    assert.equal(c.t('importar.meses', { n: 2 }), '2 meses');
  }
  assert.equal(abrir({ salvo: { idioma: 'fr', tema: 'auto' } }).NORA_I18N.idiomaPreferido(), 'pt-BR', 'idioma inválido cai no automático');
});

test('t() devolve o texto do idioma efetivo e troca as variáveis (APLICAR_LANG ligada)', () => {
  const pt = abrir({ languages: ['pt-BR'], aplicarLang: true }), en = abrir({ languages: ['en-US'], aplicarLang: true });
  assert.equal(pt.NORA_I18N.idioma(), 'pt-BR'); assert.equal(en.NORA_I18N.idioma(), 'en-GB');
  assert.equal(pt.t('abas.resumo'), 'Resumo'); assert.equal(en.t('abas.resumo'), 'Overview');
  assert.equal(pt.t('comum.removerNome', { nome: 'Revolut' }), 'Remover Revolut');
  assert.equal(en.t('tema.escuro'), 'Dark');
  // nora.prefs vence o navegador
  assert.equal(abrir({ languages: ['pt-BR'], salvo: { idioma: 'en-GB', tema: 'auto' }, aplicarLang: true }).t('tema.claro'), 'Light');
  assert.equal(abrir({ languages: ['en-GB'], salvo: { idioma: 'pt-BR', tema: 'auto' }, aplicarLang: true }).t('tema.claro'), 'Claro');
  // variável que falta fica como {nome}; variável a mais é ignorada; números viram texto
  assert.equal(pt.t('comum.removerNome'), 'Remover {nome}');
  assert.equal(pt.t('comum.removerNome', { nome: 7, outra: 'x' }), 'Remover 7');
  assert.deepEqual(faltas(pt), []);
});

test('plural com vars.n: "{n} mês/meses" em 0, 1 e 2 (pt-BR: só 1 é singular)', () => {
  const pt = abrir({ languages: ['pt-BR'], aplicarLang: true }), en = abrir({ languages: ['en-GB'], aplicarLang: true });
  const meses = (c, n) => c.t('importar.meses', { n });
  // pt-BR: só 1 é singular, como o painel sempre fez ("0 meses"; o Intl diria "0 mês"); en-GB pelo Intl
  assert.deepEqual([0, 1, 2].map(n => meses(pt, n)), ['0 meses', '1 mês', '2 meses']);
  assert.deepEqual([0, 1, 2, 1.5, -1].map(n => meses(pt, n)), ['0 meses', '1 mês', '2 meses', '1.5 meses', '-1 meses']);
  assert.deepEqual([0, 1, 2].map(n => meses(en, n)), ['0 months', '1 month', '2 months']);
  assert.equal(pt.t('importar.adicionou', { n: 56, meses: meses(pt, 4) }), 'Adicionei 56 movimentações em 4 meses');
  assert.equal(en.t('importar.adicionou', { n: 1, meses: meses(en, 1) }), 'Added 1 transaction in 1 month');
  // sem n, vale "other"
  assert.equal(pt.t('importar.meses'), '{n} meses');
});

test('fallback: idioma efetivo → pt-BR → a própria chave, e cada falta fica anotada uma vez', () => {
  const dicionarios = { 'pt-BR': { 'so.pt': 'só em português', 'as.duas': 'pt' }, 'en-GB': { 'as.duas': 'en' } };
  const en = abrir({ languages: ['en-GB'], dicionarios, aplicarLang: true });
  assert.equal(en.t('as.duas'), 'en');
  assert.equal(en.t('so.pt'), 'só em português');
  assert.equal(en.t('nao.existe'), 'nao.existe');
  en.t('so.pt'); en.t('nao.existe');
  assert.deepEqual(faltas(en), ['en-GB:so.pt', 'en-GB:nao.existe', 'pt-BR:nao.existe']);
  const pt = abrir({ languages: ['pt-BR'], dicionarios });
  assert.equal(pt.t('nao.existe', { x: 1 }), 'nao.existe');
  assert.deepEqual(faltas(pt), ['pt-BR:nao.existe']);
  // sem dicionário nenhum e sem prefs.js: devolve a chave, em pt-BR
  const ctx = { Intl }; vm.createContext(ctx);
  vm.runInContext(i18nJs + '\n;this.NORA_I18N = NORA_I18N;', ctx);
  assert.equal(ctx.NORA_I18N.idioma(), 'pt-BR'); assert.equal(ctx.NORA_I18N.t('abas.resumo'), 'abas.resumo');
});

test('texto da pessoa nunca passa pelo dicionário: o valor de vars entra como está', () => {
  const en = abrir({ languages: ['en-GB'], aplicarLang: true });
  // um nome de carteira igual a uma chave, ou com {chaves} dentro, não é traduzido nem preenchido de novo
  assert.equal(en.t('comum.removerNome', { nome: 'abas.resumo' }), 'Remove abas.resumo');
  assert.equal(en.t('comum.removerNome', { nome: '{nome} {n}' }), 'Remove {nome} {n}');
  assert.equal(en.t('comum.removerNome', { nome: 'Resumo' }), 'Remove Resumo');
  assert.equal(en.t('comum.removerNome', { nome: '$& $1 $$' }), 'Remove $& $1 $$');
  assert.deepEqual(faltas(en), []);
});

test('os dois dicionários: mesmas chaves, mesmas formas de plural, mesmos {placeholders}, nada vazio', () => {
  const { NORA_DICIONARIOS: D } = abrir();
  const pt = D['pt-BR'], en = D['en-GB'];
  assert.deepEqual(Object.keys(en).sort(), Object.keys(pt).sort());
  const formas = v => (typeof v === 'string' ? { _: v } : v);
  const marcas = s => [...new Set(s.match(/\{\w+\}/g) || [])].sort();
  for (const k of Object.keys(pt)) {
    assert.match(k, /^[a-z0-9]+(\.[a-zA-Z0-9-]+)+$/, `chave plana "area.item": ${k}`);
    const fp = formas(pt[k]), fe = formas(en[k]);
    assert.equal(typeof pt[k], typeof en[k], `${k}: texto num, plural no outro`);
    if (typeof pt[k] !== 'string') {
      assert.ok('other' in fp && 'other' in fe, `${k}: plural precisa de "other"`);
      for (const f of Object.keys({ ...fp, ...fe })) assert.ok(['zero', 'one', 'two', 'few', 'many', 'other'].includes(f), `${k}: forma ${f}`);
    }
    const todas = [...Object.values(fp), ...Object.values(fe)];
    for (const s of todas) { assert.equal(typeof s, 'string', k); assert.ok(s.trim() !== '', `${k}: valor vazio`); }
    const ref = marcas(Object.values(fp).join(' '));
    // num plural, a forma pode escrever o número por extenso ("uma transferência") e omitir {n}; o "other" sempre tem {n}
    const semN = l => l.filter(m => m !== '{n}');
    if (typeof pt[k] !== 'string' && ref.includes('{n}')) for (const o of [fp.other, fe.other]) assert.ok(marcas(o).includes('{n}'), `${k}: o "other" precisa de {n}`);
    for (const s of todas) assert.deepEqual(typeof pt[k] === 'string' ? marcas(s) : semN(marcas(s)), typeof pt[k] === 'string' ? ref : semN(ref), `${k}: placeholders diferentes em "${s}"`);
  }
});

test('index.html: dicionários e i18n.js depois do prefs.js e antes do app.js, sem inline', () => {
  const html = ler('index.html');
  const ordem = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  const i = f => ordem.indexOf(f);
  assert.ok(i('prefs.js') < i('i18n/pt-BR.js') && i('i18n/pt-BR.js') < i('i18n/en-GB.js') && i('i18n/en-GB.js') < i('i18n.js') && i('i18n.js') < i('app.js'));
  assert.equal((html.match(/<script\b/g) || []).length, ordem.length, 'todo <script> tem src');
  assert.doesNotMatch(html, /<script src="[^"]+">[^<]/);
});

test('th(): texto do dicionário e variáveis escapados; só cru() passa a marcação montada pelo código', () => {
  const dicionarios = { 'pt-BR': { 'x.frase': 'Falta o câmbio de {moeda} para {nome}', 'x.aspas': "d'água \"x\"" }, 'en-GB': {} };
  const { NORA_I18N: I } = abrir({ dicionarios });
  assert.equal(I.th('x.frase', { moeda: 'BRL', nome: 'Conta <b>' }), 'Falta o câmbio de BRL para Conta &lt;b&gt;');
  assert.equal(I.th('x.frase', { moeda: I.cru('<b>BRL</b>'), nome: '{moeda} & "x"' }), 'Falta o câmbio de <b>BRL</b> para {moeda} &amp; &quot;x&quot;');
  assert.equal(I.th('x.aspas'), 'd&#39;água &quot;x&quot;');
  assert.equal(I.th('nao.existe'), 'nao.existe');
  // um objeto qualquer não passa cru: só o que cru() devolve
  assert.equal(I.th('x.frase', { moeda: { marca: {}, html: '<i>' }, nome: 'a' }), 'Falta o câmbio de [object Object] para a');
  // mesmo esc do app.js
  const appJs = ler('app.js');
  const escApp = appJs.match(/function esc\(s\) \{[^\n]*\}/)[0], escI18n = ler('i18n.js').match(/function esc\(s\) \{[^\n]*\}/)[0];
  assert.equal(escI18n, escApp);
});

test('aplicarTextosFixos: troca o texto e o aria-label marcados, e só eles', () => {
  const dicionarios = { 'pt-BR': { 'casca.carregando': 'Carregando…', 'casca.financas': 'Finanças' }, 'en-GB': { 'casca.carregando': 'Loading…', 'casca.financas': 'Finances' } };
  const el = (atrs, texto) => ({ textContent: texto, atrs: { ...atrs }, getAttribute(k) { return k in this.atrs ? this.atrs[k] : null; }, setAttribute(k, v) { this.atrs[k] = v; } });
  for (const [aplicarLang, txt, aria] of [[false, 'Carregando…', 'Finanças'], [true, 'Loading…', 'Finances']]) {
    const { NORA_I18N: I } = abrir({ languages: ['en-GB'], dicionarios, aplicarLang });
    const p = el({ 'data-i18n': 'casca.carregando' }, 'Carregando…'), sec = el({ 'data-i18n-aria-label': 'casca.financas', 'aria-label': 'Finanças' }, 'conteúdo');
    I.aplicarTextosFixos({ querySelectorAll: sel => (assert.equal(sel, '[data-i18n], [data-i18n-aria-label]'), [p, sec]) });
    assert.equal(p.textContent, txt); assert.equal(sec.atrs['aria-label'], aria); assert.equal(sec.textContent, 'conteúdo');
  }
});
