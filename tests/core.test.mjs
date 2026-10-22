// Testes da parte pura do painel (o bloco entre /*CORE-START*/ e /*CORE-END*/ em app.js).
// Rodar com: npm test   (Node 18+; sem dependências)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appJs = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const core = appJs.slice(appJs.indexOf('/*CORE-START*/'), appJs.indexOf('/*CORE-END*/'));
const csv = readFileSync(new URL('../exemplo/extrato-exemplo.csv', import.meta.url), 'utf8');

// carrega o núcleo sozinho; o titular entra como parâmetro de classify/buildModel
function load() {
  return new Function(core + '; return { parseCSV, extractTx, classify, buildModel, migrate, sugerirMetas, CATS };')();
}
function months(api) {
  const m = {};
  api.extractTx(api.parseCSV(csv)).forEach(t => { (m[t[0].slice(0, 7)] = m[t[0].slice(0, 7)] || []).push(t); });
  return m;
}

test('lê o extrato padrão do Revolut', () => {
  const api = load();
  const tx = api.extractTx(api.parseCSV(csv));
  assert.equal(tx.length, 56);
  assert.deepEqual(tx[0].slice(0, 4), ['2026-07-01', 'Payment from Example Cleaning Ltd', 'Others', 120000]);
});

test('categoriza comerciantes conhecidos', () => {
  const { classify } = load();
  const cat = (desc, a = -1000, rc = 'Merchant') => { const r = classify(['2026-09-01', desc, rc, a, 0], {}); return r.kind === 'gasto' ? r.cat : r.kind; };
  assert.equal(cat('Tesco'), 'mercado');
  assert.equal(cat('Netflix'), 'assin');
  assert.equal(cat('Leap Card Top-up'), 'transporte');
  assert.equal(cat('Costa Coffee'), 'lazer');
  assert.equal(cat('Boots'), 'saude');
  assert.equal(cat('Payment from Example Cleaning Ltd', 120000, 'Others'), 'renda');
  assert.equal(cat('To Flexible Cash', -10000, 'Others'), 'flex');
  assert.equal(cat('Exchanged to BTC', -5000, 'Exchange'), 'invest');
});

test('sem titular configurado, nada vira "conta própria" por engano', () => {
  const { classify } = load();
  const r = classify(['2026-09-05', 'To MARIA SILVA', 'Others', -15000, 0], {}, '');
  assert.equal(r.kind, 'gasto');
  assert.notEqual(r.cat, 'brasil');
  const renda = classify(['2026-09-01', 'Payment from Example Cleaning Ltd', 'Others', 120000, 0], {});
  assert.equal(renda.kind, 'renda');
});

test('com titular, transferência para si mesmo vai para a categoria de envios', () => {
  const { classify } = load();
  const r = classify(['2026-09-05', 'To MARIA SILVA', 'Others', -15000, 0], {}, 'Maria  Silva ');
  assert.equal(r.kind, 'gasto');
  assert.equal(r.cat, 'brasil');
});

test('totais do mês batem com a conta feita à mão', () => {
  const api = load();
  const M = api.buildModel(months(api), {}, 'Maria Silva');
  const set = M.by['2026-09'];
  assert.equal(set.entrou, 1200);
  assert.equal(Math.round(set.saved * 100) / 100, 150); // 100 Flexible Cash + 50 cripto
  assert.equal(Math.round(set.spend.brasil * 100) / 100, 150);
  assert.equal(Math.round(set.spend.mercado * 100) / 100, 107.65); // 38,40 + 27,15 + 42,10
  assert.equal(M.partial, '2026-10'); // outubro só vai até o dia 15
  assert.deepEqual(M.complete, ['2026-07', '2026-08', '2026-09']);
});

test('o núcleo não usa nada do navegador', () => {
  assert.doesNotMatch(core, /\b(window|document|localStorage)\b/);
});

test('migração v1 → v2 guarda o titular antigo e mantém o resto', () => {
  const { migrate } = load();
  const v1 = { months: { '2026-09': [['2026-09-01', 'Tesco', 'Merchant', -1000, 0]] }, over: { TESCO: 'lazer' }, plan: { cats: { mercado: 200 }, poupar: 100 }, summary: null, div: { itens: [] } };
  const x = migrate(v1, ' MARIA SILVA ');
  assert.equal(x.v, 2);
  assert.deepEqual(x.months, v1.months);
  assert.deepEqual(x.over, v1.over);
  assert.deepEqual(x.div, v1.div);
  // quem já usava continua vendo "Contas no Brasil"; o padrão novo é neutro
  assert.deepEqual(x.plan, { cats: { mercado: 200 }, poupar: 100, titular: 'MARIA SILVA', moeda: 'EUR', pais: 'IE', nomes: { brasil: 'Contas no Brasil' } });
  assert.equal(v1.plan.titular, undefined); // não altera o objeto original
});

test('migração aceita v2 sem mudar nada e completa campos que faltam', () => {
  const { migrate } = load();
  const v2 = { v: 2, months: {}, over: {}, plan: { titular: 'Ana', moeda: 'EUR', pais: 'IE', nomes: { brasil: 'Conta em Portugal' } }, summary: null, div: null };
  assert.deepEqual(migrate(v2, 'IGNORADO'), v2);
  assert.equal(migrate({ v: 2 }).plan.titular, '');
  assert.equal(migrate({}).plan.titular, ''); // v1 sem titular antigo
  assert.deepEqual(migrate({ v: 2 }).plan.nomes, {});
});

test('migração recusa o que não é do painel', () => {
  const { migrate } = load();
  assert.throws(() => migrate(null));
  assert.throws(() => migrate([]));
  assert.throws(() => migrate({ v: 3 }), /versão 3/);
  assert.throws(() => migrate({ months: [] }));
  assert.throws(() => migrate({ months: { 'setembro': [] } }));
  assert.throws(() => migrate({ months: { '2026-09': 'x' } }));
});

test('sem metas fixas de ninguém: categorias só têm nome neutro', () => {
  const { CATS } = load();
  assert.ok(CATS.every(c => c.meta === undefined));
  assert.equal(CATS.find(c => c.id === 'brasil').nome, 'Envios para outra conta sua');
});

test('metas sugeridas pela média dos 3 primeiros meses completos', () => {
  const api = load();
  const s = api.sugerirMetas(api.buildModel(months(api), {}, 'Maria Silva'));
  // jul, ago e set são iguais no exemplo; mercado = 38,40 + 27,15 + 42,10 = 107,65 → 110
  assert.equal(s.cats.mercado, 110);
  assert.equal(s.cats.brasil, 150);
  assert.equal(s.cats.outros, 650); // o aluguel ainda cai em "outros" (passo seguinte)
  assert.equal(s.poupar, 150);
  assert.equal(api.sugerirMetas(api.buildModel({}, {}, '')), null);
});
