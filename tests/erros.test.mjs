// Passo d, núcleo: cada erro com código é provocado de verdade (dados e backups inventados) e mostrado pela tela como
// textoErro(e): em pt-BR, exatamente a frase de sempre do núcleo (e.message); em en-GB, a frase do dicionário, nunca a chave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { carregarXLSX, xlsxAMao, comSenha, pdfAMao, carregarPdfjs } from './planilhas.mjs';

const ler = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const appJs = ler('app.js');
const scriptsAntes = [...ler('index.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(f => f !== 'app.js' && f !== 'prefs.js');
const core = scriptsAntes.map(ler).join('\n') + appJs.slice(appJs.indexOf('/*CORE-START*/'), appJs.indexOf('/*CORE-END*/'));
const N = new Function(core + '; return { lerSalvo, migrate, migrarAteV3, criarCategoria, novaCarteira, editarCarteira, decodificar, linhasDaAba, lerPlanilha, lerPdf };')();

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

function confereUm(codigo, e, frase) {
  assert.equal(e.codigo, codigo, frase);
  assert.equal(e.message, frase, `${codigo}: a frase do núcleo mudou`);
  assert.equal(PT.textoErro(e), e.message, `${codigo}: em pt-BR a tela tem de mostrar a frase de sempre`);
  const en = EN.textoErro(e);
  assert.ok(!en.startsWith('erro.') && en !== e.message, `${codigo}: em en-GB saiu "${en}"`);
}
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

// grupo A2 (carteiras e categorias): o que a pessoa faz em Configurações
const base = (carteira) => N.lerSalvo(v4(carteira), '');
const cheia = () => N.lerSalvo(JSON.stringify({ v: 4, carteiras: [1, 2, 3, 4, 5].map(i => ({ id: 'c' + i, nome: 'C' + i, moeda: 'EUR' })) }), '');
const comExtrato = () => base({ months: { '2026-09': [['2026-09-01', 'x', 'Others', -100, null]] } });
const A2 = [
  ['categoria.semNome', () => N.criarCategoria({ ocultas: ['mercado'] }, '   '), 'a categoria precisa de um nome'],
  ['categoria.semCor', () => N.criarCategoria({}, 'Pets'), 'as 8 cores estão em uso: esconda uma categoria para liberar a cor dela'],
  ['carteira.semNome', () => N.novaCarteira(base({}), { nome: ' ', moeda: 'EUR' }), 'a carteira precisa de um nome'],
  ['carteira.nomeRepetido', () => N.novaCarteira(base({}), { nome: 'conta <b> & "CIA"', moeda: 'EUR' }), 'já existe uma carteira chamada Conta <b> & "cia"'],
  ['carteira.moedaInvalida', () => N.novaCarteira(base({}), { nome: 'Nova', moeda: MOEDA_X }), 'moeda X<&>" inválida'],
  ['carteira.moedaInvalida', () => N.novaCarteira(base({}), { nome: 'Nova' }), 'moeda undefined inválida'],
  ['carteira.bancoDesconhecido', () => N.novaCarteira(base({}), { nome: 'Nova', moeda: 'EUR', banco: 'b<1>' }), 'tipo de extrato b<1> desconhecido'],
  ['carteira.limite', () => N.novaCarteira(cheia(), { nome: 'Nova', moeda: 'EUR' }), 'já há 5 carteiras: exclua uma para criar outra'],
  ['carteira.moedaTravada', () => N.editarCarteira(comExtrato(), 'c1', { moeda: 'GBP' }), 'a moeda não muda depois que há extratos salvos: crie outra carteira'],
  ['carteira.bancoTravado', () => N.editarCarteira(comExtrato(), 'c1', { banco: 'aib' }), 'o tipo de extrato não muda depois que há extratos salvos: crie outra carteira'],
  ['carteira.enviosDesconhecido', () => N.editarCarteira(base({}), 'c1', { envios: 'x<y>' }), 'opção de envios desconhecida: x<y>'],
];

test('grupo A2 (carteiras e categorias): cada erro provocado, pt-BR idêntico ao de antes, en-GB pelo dicionário', () => {
  confere(A2);
  const doFonte = new Set([...appJs.matchAll(/\berroCod\(\s*'((?:carteira|categoria)\.[^']+)'/g)].map(m => m[1]));
  assert.deepEqual([...doFonte].sort(), [...new Set(A2.map(c => c[0]))].sort());
});

test('grupo A2: o nome digitado entra como está; o número de cores e de carteiras sai pelo formato do idioma', () => {
  assert.equal(EN.textoErro(pega(A2[3][1])), 'there is already an account called Conta <b> & "cia"');
  assert.equal(EN.textoErro(pega(A2[1][1])), 'all 8 colours are in use: hide a category to free up its colour');
  assert.equal(EN.textoErro(pega(A2[7][1])), 'there are already 5 accounts: delete one to create another');
});

// grupo A3 (leitura de arquivo): planilhas e PDFs inventados, montados pelo próprio teste
const XL = carregarXLSX();
const A3 = [
  ['arquivo.naoUtf8', () => N.decodificar(new Uint8Array([0x41, 0xff, 0x42]), 'utf-8'), 'o arquivo não é UTF-8 válido'],
  ['arquivo.linhasDemais', () => N.linhasDaAba(XL, { '!ref': 'A1:B20001' }, false), 'a planilha passa de 20.000 linhas'],
  ['arquivo.planilhaGrande', () => N.lerPlanilha(XL, new Uint8Array(15 * 1024 * 1024 + 1), 'xlsx'), 'o arquivo passa de 15 MB'],
  ['arquivo.planilhaSenha', () => N.lerPlanilha(XL, comSenha(XL), 'xls'), 'a planilha está protegida por senha. Abra no Excel e salve sem senha, ou baixe o extrato em CSV'],
  ['arquivo.planilhaDanificada', () => N.lerPlanilha(XL, new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), 'xlsx'), 'a planilha está danificada ou incompleta'],
  ['arquivo.planilhaVazia', () => N.lerPlanilha(XL, xlsxAMao([{ nome: 'A', linhas: [] }]), 'xlsx'), 'a planilha não tem nenhuma tabela'],
];

test('grupo A3 (leitura de arquivo): cada erro provocado, pt-BR idêntico ao de antes, en-GB pelo dicionário', async () => {
  confere(A3);
  const pdfjs = await carregarPdfjs(), rej = async p => { try { await p; } catch (e) { return e; } assert.fail('devia ter dado erro'); };
  const grande = new Uint8Array(10 * 1024 * 1024 + 1); grande.set([0x25, 0x50, 0x44, 0x46]);
  const pdfs = [
    ['arquivo.pdfGrande', N.lerPdf(pdfjs, grande), 'o PDF passa de 10 MB'],
    ['arquivo.pdfPaginas', N.lerPdf(pdfjs, pdfAMao(Array.from({ length: 51 }, () => ({ textos: [] })))), 'o PDF passa de 50 páginas'],
    ['arquivo.pdfSenha', N.lerPdf(pdfjs, pdfAMao([{ textos: [{ s: 'x', x: 10, y: 10 }] }], { senha: true })), 'o PDF está protegido por senha. Abra e salve sem senha, ou baixe o extrato de novo pelo app do banco'],
    ['arquivo.pdfDanificado', N.lerPdf(pdfjs, new Uint8Array(Buffer.from('%PDF-1.7\n% inventado e cortado\n'))), 'o PDF está danificado ou incompleto'],
  ];
  for (const [codigo, p, frase] of pdfs) confereUm(codigo, await rej(p), frase);
  assert.deepEqual([...PT.I.faltando, ...EN.I.faltando], [], 'nenhuma chave faltou');
  const doFonte = new Set([...appJs.matchAll(/\berroCod\(\s*'(arquivo\.[^']+)'/g)].map(m => m[1]));
  assert.deepEqual([...doFonte].sort(), [...new Set([...A3, ...pdfs].map(c => c[0]))].sort());
});

test('grupo A3: limites saem pelo formato do idioma; o PDF longo continua passando pelo pdf.js sem virar "danificado"', () => {
  assert.equal(EN.textoErro(pega(A3[1][1])), 'the spreadsheet has more than 20,000 rows');
  assert.equal(PT.textoErro(pega(A3[1][1])), 'a planilha passa de 20.000 linhas');
  assert.ok(/e\.codigo === 'arquivo\.pdfPaginas'/.test(appJs) && !/\/\^o PDF passa de\//.test(appJs), 'a conferência do limite de páginas é pelo código');
});
