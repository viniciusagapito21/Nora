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
  assert.equal(pt.t('abas.resumo'), 'Resumo'); assert.equal(en.t('abas.resumo'), 'Summary');
  assert.equal(pt.t('abas.abrir', { nome: 'Revolut' }), 'Abrir Revolut');
  assert.equal(en.t('tema.escuro'), 'Dark');
  // nora.prefs vence o navegador
  assert.equal(abrir({ languages: ['pt-BR'], salvo: { idioma: 'en-GB', tema: 'auto' }, aplicarLang: true }).t('tema.claro'), 'Light');
  assert.equal(abrir({ languages: ['en-GB'], salvo: { idioma: 'pt-BR', tema: 'auto' }, aplicarLang: true }).t('tema.claro'), 'Claro');
  // variável que falta fica como {nome}; variável a mais é ignorada; números viram texto
  assert.equal(pt.t('abas.abrir'), 'Abrir {nome}');
  assert.equal(pt.t('abas.abrir', { nome: 7, outra: 'x' }), 'Abrir 7');
  assert.deepEqual(faltas(pt), []);
});

test('plural por Intl.PluralRules com vars.n: "{n} mês/meses" em 0, 1 e 2', () => {
  const pt = abrir({ languages: ['pt-BR'], aplicarLang: true }), en = abrir({ languages: ['en-GB'], aplicarLang: true });
  const meses = (c, n) => c.t('importar.meses', { n });
  // resultado conferido (regras do CLDR no Intl do Node): em pt-BR o 0 fica no singular, em en-GB no plural
  assert.deepEqual([0, 1, 2].map(n => meses(pt, n)), ['0 mês', '1 mês', '2 meses']);
  assert.deepEqual([0, 1, 2].map(n => meses(en, n)), ['0 months', '1 month', '2 months']);
  assert.equal(pt.t('importar.adicionou', { n: 56, meses: meses(pt, 4) }), 'Adicionei 56 movimentações em 4 meses');
  assert.equal(en.t('importar.adicionou', { n: 1, meses: meses(en, 1) }), 'Added 1 transaction across 1 month');
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
  assert.equal(en.t('abas.abrir', { nome: 'abas.resumo' }), 'Open abas.resumo');
  assert.equal(en.t('abas.abrir', { nome: '{nome} {n}' }), 'Open {nome} {n}');
  assert.equal(en.t('abas.abrir', { nome: 'Resumo' }), 'Open Resumo');
  assert.equal(en.t('abas.abrir', { nome: '$& $1 $$' }), 'Open $& $1 $$');
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
    for (const s of todas) assert.deepEqual(marcas(s), ref, `${k}: placeholders diferentes em "${s}"`);
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
