// Nomes padrão gravados nos dados (Fase 3, passo c): as metas de poupança de fábrica e o antigo "Contas no Brasil".
// Padrão = id de fábrica com texto igual a um padrão conhecido (qualquer dicionário, ou um texto pt-BR antigo).
// Traduz só o padrão; o que a pessoa digitou nunca muda. Sem marcador e sem versão nova: o formato v4 continua igual.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarNucleo } from './planilhas.mjs';

const N = carregarNucleo(['NORA_DICIONARIOS', 'chavePadrao', 'nomeExibido', 'nomeParaGravar', 'listaMetasPoupanca', 'montarCats',
  'migrate', 'lerSalvo', 'juntarPlan', 'carteiraAtiva']);
const D = N.NORA_DICIONARIOS;
const tradutor = idioma => k => (typeof D[idioma][k] === 'string' ? D[idioma][k] : k);
const tPt = tradutor('pt-BR'), tEn = tradutor('en-GB');
const copia = x => JSON.parse(JSON.stringify(x));

// os textos de fábrica, como literais: se um deles mudar no i18n/pt-BR.js, o texto antigo tem que entrar em NOMES_ANTIGOS
const FABRICA = [
  ['meta', 'reserva', 'Reserva de emergência', 'Emergency fund'],
  ['meta', 'invest', 'Investimentos', 'Investments'],
  ['meta', 'viagens', 'Viagens pequenas', 'Short breaks'],
  ['meta', 'viagem', 'Viagem grande do ano', 'Main holiday of the year'],
  ['cat', 'brasil', 'Contas no Brasil', 'Bills in Brazil'],
];

test('travamento: os textos de fábrica continuam reconhecidos como padrão', () => {
  for (const [tipo, id, pt] of FABRICA)
    assert.ok(N.chavePadrao(tipo, id, pt),
      `"${pt}" (${tipo} ${id}) deixou de ser reconhecido como padrão. Se o texto mudou em i18n/pt-BR.js, acrescente o ` +
      `texto antigo em NOMES_ANTIGOS (app.js): quem tem o antigo gravado passaria a vê-lo como digitado, sem tradução.`);
  // e a lista de fábrica do app é a mesma do dicionário
  assert.deepEqual(N.listaMetasPoupanca(null).map(g => g.nome), FABRICA.filter(f => f[0] === 'meta').map(f => f[2]));
});

test('padrão: traduzido em en-GB, idêntico em pt-BR', () => {
  for (const [tipo, id, pt, en] of FABRICA) {
    assert.equal(N.nomeExibido(tipo, id, pt, tEn), en, `${tipo} ${id}`);
    assert.equal(N.nomeExibido(tipo, id, pt, tPt), pt, `${tipo} ${id}`);
  }
});

test('digitado: nunca muda, em nenhum idioma', () => {
  for (const t of [tEn, tPt]) {
    assert.equal(N.nomeExibido('meta', 'reserva', 'Reserva do carro', t), 'Reserva do carro');
    assert.equal(N.nomeExibido('meta', 'invest', 'investimentos', t), 'investimentos', 'maiúscula diferente é outro texto');
    assert.equal(N.nomeExibido('meta', 'invest', ' Investimentos', t), ' Investimentos');
    // "Contas no Brasil" só é padrão na categoria brasil
    assert.equal(N.nomeExibido('cat', 'mercado', 'Contas no Brasil', t), 'Contas no Brasil');
    // o padrão de outra meta não vale para esta
    assert.equal(N.nomeExibido('meta', 'viagem', 'Viagens pequenas', t), 'Viagens pequenas');
  }
});

test('digitado igual ao padrão é tratado como padrão (risco aceito); meta criada pela pessoa nunca é traduzida', () => {
  assert.equal(N.nomeExibido('meta', 'invest', 'Investimentos', tEn), 'Investments');
  for (const id of ['m1', 'm2', 'u1', 'reserva2']) for (const [, , pt, en] of FABRICA) {
    assert.equal(N.nomeExibido('meta', id, pt, tEn), pt, `${id}: "${pt}"`);
    assert.equal(N.nomeParaGravar('meta', id, en), en, `${id}: "${en}" é texto da pessoa`);
  }
});

test('texto da pessoa com {chaves} ou igual a uma chave do dicionário não é traduzido', () => {
  for (const s of ['metas.padrao.reserva', '{nome}', 'Reserva {n}', 'cats.brasil.antigo']) {
    assert.equal(N.nomeExibido('meta', 'reserva', s, tEn), s);
    assert.equal(N.nomeExibido('cat', 'brasil', s, tEn), s);
    assert.equal(N.nomeParaGravar('meta', 'reserva', s), s);
  }
});

test('gravação: campo com um padrão de qualquer dicionário grava o texto pt-BR; editado grava o digitado', () => {
  for (const [tipo, id, pt, en] of FABRICA) {
    assert.equal(N.nomeParaGravar(tipo, id, pt), pt, 'salvo em pt-BR sem mudar');
    assert.equal(N.nomeParaGravar(tipo, id, en), pt, 'salvo em en-GB sem mudar: não vira texto digitado');
  }
  assert.equal(N.nomeParaGravar('meta', 'reserva', 'Emergency fund for the car'), 'Emergency fund for the car');
  assert.equal(N.nomeParaGravar('meta', 'reserva', 'Reserva do carro'), 'Reserva do carro');
});

test('troca de idioma com o formulário aberto: o texto do outro idioma ainda grava o padrão pt-BR', () => {
  // formulário aberto em en-GB (campo "Short breaks"), idioma trocado para pt-BR antes de salvar, e o contrário
  const aberto = N.nomeExibido('meta', 'viagens', 'Viagens pequenas', tEn);
  assert.equal(aberto, 'Short breaks');
  assert.equal(N.nomeParaGravar('meta', 'viagens', aberto), 'Viagens pequenas');
  const abertoPt = N.nomeExibido('cat', 'brasil', 'Contas no Brasil', tPt);
  assert.equal(N.nomeParaGravar('cat', 'brasil', abertoPt), 'Contas no Brasil');
  assert.equal(N.nomeExibido('cat', 'brasil', N.nomeParaGravar('cat', 'brasil', 'Bills in Brazil'), tEn), 'Bills in Brazil');
});

// ---------- backups e dados salvos (inventados) ----------
const META_MISTA = [
  { id: 'reserva', nome: 'Reserva de emergência', src: 'flex' },  // padrão
  { id: 'invest', nome: 'Ações e fundos', src: 'invest' },        // renomeada
  { id: 'viagens', nome: 'Viagens pequenas', src: null },         // padrão
  { id: 'm1', nome: 'Viagem grande do ano', src: null },          // criada pela pessoa, com texto de fábrica
];
const BACKUPS = {
  v1: [{ months: {}, over: {}, plan: { cats: { mercado: 200 } } }, 'MARIA SILVA'],
  v2: [{ v: 2, months: {}, over: {}, plan: { titular: 'MARIA SILVA', moeda: 'EUR', pais: 'IE', nomes: { brasil: 'Contas no Brasil' }, metasPoupanca: META_MISTA } }],
  v3: [{ v: 3, months: {}, over: {}, plan: { titular: 'MARIA SILVA', moeda: 'EUR', pais: 'IE', nomes: { brasil: 'Envios à família' }, metasPoupanca: META_MISTA }, summary: null, div: null }],
};
BACKUPS.v4 = [N.migrate(copia(BACKUPS.v2[0]))];
const exibir = (x, t) => {
  const plan = N.juntarPlan(x.config, N.carteiraAtiva(x));
  return { brasil: N.montarCats(plan, t).find(c => c.id === 'brasil').nome, metas: N.listaMetasPoupanca(plan).map(g => N.nomeExibido('meta', g.id, g.nome, t)) };
};

test('backups v1 a v4 importados e exibidos nos dois idiomas', () => {
  const esperado = {
    v1: { pt: ['Contas no Brasil', ['Reserva de emergência', 'Investimentos', 'Viagens pequenas', 'Viagem grande do ano']],
          en: ['Bills in Brazil', ['Emergency fund', 'Investments', 'Short breaks', 'Main holiday of the year']] },
    v2: { pt: ['Contas no Brasil', ['Reserva de emergência', 'Ações e fundos', 'Viagens pequenas', 'Viagem grande do ano']],
          en: ['Bills in Brazil', ['Emergency fund', 'Ações e fundos', 'Short breaks', 'Viagem grande do ano']] },
    v3: { pt: ['Envios à família', ['Reserva de emergência', 'Ações e fundos', 'Viagens pequenas', 'Viagem grande do ano']],
          en: ['Envios à família', ['Emergency fund', 'Ações e fundos', 'Short breaks', 'Viagem grande do ano']] },
  };
  esperado.v4 = esperado.v2;
  for (const [v, args] of Object.entries(BACKUPS)) {
    const x = N.lerSalvo(JSON.stringify(args[0]), args[1]);
    assert.equal(x.v, 4, v);
    const pt = exibir(x, tPt), en = exibir(x, tEn);
    assert.deepEqual([pt.brasil, pt.metas], esperado[v].pt, `${v} em pt-BR`);
    assert.deepEqual([en.brasil, en.metas], esperado[v].en, `${v} em en-GB`);
  }
});

test('duas vezes, byte a byte: abrir não muda o que está gravado; exportar e importar dá o mesmo arquivo', () => {
  for (const [v, args] of Object.entries(BACKUPS)) {
    const uma = JSON.stringify(N.lerSalvo(JSON.stringify(args[0]), args[1]));
    const duas = JSON.stringify(N.lerSalvo(uma));
    assert.equal(duas, uma, `${v}: carregar de novo muda o JSON`);
    assert.equal(JSON.stringify(N.lerSalvo(duas)), uma, `${v}: terceira carga`);
  }
  // os nomes gravados continuam em pt-BR (nada de texto traduzido nos dados)
  const gravado = JSON.stringify(BACKUPS.v4[0]);
  for (const [, , , en] of FABRICA) assert.ok(!gravado.includes(en), en);
  // gravar com o formulário em inglês, sem mudar nada, dá os mesmos dados
  const plan = N.juntarPlan(BACKUPS.v4[0].config, N.carteiraAtiva(BACKUPS.v4[0]));
  const lm = N.listaMetasPoupanca(plan).map(g => ({ id: g.id, nome: N.nomeParaGravar('meta', g.id, N.nomeExibido('meta', g.id, g.nome, tEn)), src: g.src }));
  assert.equal(JSON.stringify(lm), JSON.stringify(META_MISTA));
});
