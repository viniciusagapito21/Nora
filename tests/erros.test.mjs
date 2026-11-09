// Passo d, núcleo: cada erro com código é provocado de verdade (dados e backups inventados) e mostrado pela tela como
// textoErro(e): em pt-BR, exatamente a frase de sempre do núcleo (e.message); em en-GB, a frase do dicionário, nunca a chave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ler = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const appJs = ler('app.js');
const scriptsAntes = [...ler('index.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(f => f !== 'app.js' && f !== 'prefs.js');
const core = scriptsAntes.map(ler).join('\n') + appJs.slice(appJs.indexOf('/*CORE-START*/'), appJs.indexOf('/*CORE-END*/'));
const N = new Function(core + '; return { lerSalvo, migrate, migrarAteV3 };')();

// a tela em pt-BR e em en-GB (o prefs.js de mentira diz o idioma; APLICAR_LANG ligada só aqui, para ver o inglês)
function tela(idioma) {
  const ctx = { Intl, NORA_PREFS: { APLICAR_LANG: true, ler: () => ({}), idiomaEfetivo: () => idioma } };
  vm.createContext(ctx);
  for (const f of ['i18n/pt-BR.js', 'i18n/en-GB.js', 'i18n.js']) vm.runInContext(ler(f), ctx);
  const I = vm.runInContext('NORA_I18N', ctx), nn = new Intl.NumberFormat(idioma, { maximumFractionDigits: 0 });
  return { I, textoErro: e => I.textoErro(e, v => nn.format(v)) };
}
const PT = tela('pt-BR'), EN = tela('en-GB');

function pega(fn) { try { fn(); } catch (e) { return e; } assert.fail('devia ter dado erro'); }
const v4 = (carteira, resto) => JSON.stringify({ v: 4, config: {}, carteiras: [{ id: 'c1', nome: 'Conta <b> & "cia"', moeda: 'EUR', months: {}, ...carteira }], ativa: 'c1', ...resto });
const salvo = s => () => N.lerSalvo(s, '');
const MOEDA_X = 'X<&>"', ID_X = 'c<1>&"';

// grupo A1 (dados salvos e backup): [código, como provocar, a frase pt-BR exata de antes]
const A1 = [
  ['dados.naoSaoDados', salvo('"texto qualquer"'), 'não são dados do painel'],
  ['dados.naoSaoDados', () => N.migrarAteV3('texto', ''), 'não são dados do painel'],
  ['dados.versaoDesconhecida', salvo('{"v":9}'), 'versão 9 desconhecida'],
  ['dados.versaoDesconhecida', salvo('{"v":1.5}'), 'versão 1.5 desconhecida'],
  ['dados.jsonInvalido', salvo('{"v":4, "carteiras": ['), 'o conteúdo não é JSON válido'],
  ['dados.mesesFormato', salvo('{"v":3,"months":[]}'), 'meses em formato errado'],
  ['dados.mesFormato', salvo('{"v":3,"months":{"setembro":[]}}'), 'mês setembro em formato errado'],
  ['dados.nenhumaCarteira', salvo('{"v":4,"carteiras":[]}'), 'nenhuma carteira'],
  ['dados.carteirasDemais', salvo(JSON.stringify({ v: 4, carteiras: [1, 2, 3, 4, 5, 6].map(i => ({ id: 'c' + i, moeda: 'EUR' })) })), 'mais de 5 carteiras'],
  ['dados.carteiraFormato', salvo('{"v":4,"carteiras":[null]}'), 'carteira em formato errado'],
  ['dados.carteiraSemId', salvo('{"v":4,"carteiras":[{"moeda":"EUR"}]}'), 'carteira sem id'],
  ['dados.carteiraRepetida', salvo(JSON.stringify({ v: 4, carteiras: [{ id: ID_X, moeda: 'EUR' }, { id: ID_X, moeda: 'EUR' }] })), 'carteira c<1>&" repetida'],
  ['dados.moedaInvalida', salvo(v4({ moeda: MOEDA_X })), 'moeda X<&>" inválida na carteira c1'],
  ['dados.moedaInvalida', salvo(v4({ moeda: 12 })), 'moeda 12 inválida na carteira c1'],
  ['dados.moedaInvalida', salvo(v4({ moeda: undefined })), 'moeda undefined inválida na carteira c1'],
  ['dados.periodosFormato', salvo(v4({ periodos: [{ de: '1/9/2026', ate: '2026-09-30' }] })), 'períodos em formato errado na carteira c1'],
  ['dados.transfFormato', salvo(v4({ transf: [] })), 'transferências em formato errado na carteira c1'],
  ['dados.transfItemFormato', salvo(v4({ transf: { a: { c: 'c2' } } })), 'transferências em formato errado na carteira c1'],
  ['dados.dispensadasFormato', salvo(v4({ sugDispensadas: ['x'] })), 'sugestões dispensadas em formato errado na carteira c1'],
  ['dados.pixTitularFormato', salvo(v4({ pixTitular: 'x' })), 'Pix marcados como seus em formato errado na carteira c1'],
  ['dados.colunasFormato', salvo(v4({ importacao: [] })), 'colunas do importador em formato errado na carteira c1'],
  ['dados.colunasItemFormato', salvo(v4({ importacao: { h: {} } })), 'colunas do importador em formato errado na carteira c1'],
  ['dados.enviosFormato', salvo(v4({ envios: 'talvez' })), 'opção de envios em formato errado na carteira c1'],
  ['dados.avisoEnviosFormato', salvo(v4({ enviosDecidido: 'sim' })), 'resposta do aviso de envios em formato errado na carteira c1'],
  ['dados.cambioFormato', salvo(v4({}, { cambios: [] })), 'câmbio em formato errado'],
  ['dados.cambioMoedaFormato', salvo(v4({}, { cambios: { 'G<B>': { rate: 1 } } })), 'câmbio de G<B> em formato errado'],
];

function confere(casos) {
  for (const [codigo, provoca, frase] of casos) {
    const e = pega(provoca);
    assert.equal(e.codigo, codigo, frase);
    assert.equal(e.message, frase, `${codigo}: a frase do núcleo mudou`);
    assert.equal(PT.textoErro(e), e.message, `${codigo}: em pt-BR a tela tem de mostrar a frase de sempre`);
    const en = EN.textoErro(e);
    assert.ok(!en.startsWith('erro.') && en !== e.message, `${codigo}: em en-GB saiu "${en}"`);
  }
  assert.deepEqual([...PT.I.faltando, ...EN.I.faltando], [], 'nenhuma chave faltou');
}

test('grupo A1 (dados salvos e backup): cada erro provocado, pt-BR idêntico ao de antes, en-GB pelo dicionário', () => {
  confere(A1);
  // todo código dados.* do app.js foi provocado aqui
  const doFonte = new Set([...appJs.matchAll(/\berroCod\(\s*'(dados\.[^']+)'/g)].map(m => m[1]));
  assert.deepEqual([...doFonte].sort(), [...new Set(A1.map(c => c[0]))].sort());
});

test('grupo A1: id e moeda vindos do backup entram como estão (no HTML, a tela escapa)', () => {
  const e = pega(salvo(v4({ moeda: MOEDA_X })));
  assert.equal(EN.textoErro(e), 'invalid currency X<&>" in account c1');
  assert.equal(PT.I.th('bloqueio.aviso', { motivo: PT.textoErro(e) }).includes('(moeda X&lt;&amp;&gt;&quot; inválida na carteira c1)'), true);
});
