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
  return new Function(core + '; return { parseCSV, extractTx, classify, buildModel, migrate, lerSalvo, resumoDados, sugerirMetas, detectarRecorrentes, sugerirAluguel, preverMes, CATS };')();
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

test('migração v1 → v3 guarda o titular antigo e mantém o resto', () => {
  const { migrate } = load();
  const v1 = { months: { '2026-09': [['2026-09-01', 'Tesco', 'Merchant', -1000, 0]] }, over: { TESCO: 'lazer' }, plan: { cats: { mercado: 200 }, poupar: 100 }, summary: null, div: { itens: [] } };
  const x = migrate(v1, ' MARIA SILVA ');
  assert.equal(x.v, 3);
  assert.deepEqual(x.months, v1.months);
  assert.deepEqual(x.over, v1.over);
  assert.deepEqual(x.div, v1.div);
  // quem já usava continua vendo "Contas no Brasil"; o padrão novo é neutro
  assert.deepEqual(x.plan, { cats: { mercado: 200 }, poupar: 100, titular: 'MARIA SILVA', moeda: 'EUR', pais: 'IE', nomes: { brasil: 'Contas no Brasil' } });
  assert.equal(v1.plan.titular, undefined); // não altera o objeto original
});

test('migração aceita v3 sem mudar nada e completa campos que faltam', () => {
  const { migrate } = load();
  const v3 = { v: 3, months: {}, over: {}, plan: { titular: 'Ana', moeda: 'EUR', pais: 'IE', nomes: { brasil: 'Conta em Portugal' } }, summary: null, div: { items: [{ id: 'd1', nome: 'Escola', status: 'aberta', valor: 200, moeda: 'USD' }], cambios: { USD: { rate: 1.08 } }, margem: 2 } };
  assert.deepEqual(migrate(v3, 'IGNORADO'), v3);
  assert.equal(migrate({ v: 2 }).plan.titular, '');
  assert.equal(migrate({}).plan.titular, ''); // v1 sem titular antigo
  assert.deepEqual(migrate({ v: 2 }).plan.nomes, {});
});

test('migração recusa o que não é do painel', () => {
  const { migrate } = load();
  assert.throws(() => migrate(null));
  assert.throws(() => migrate([]));
  assert.throws(() => migrate({ v: 4 }), /versão 4/);
  assert.throws(() => migrate({ v: '3' }), /versão 3/); // versão em texto não vale
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

test('contas fixas detectadas no exemplo', () => {
  const api = load();
  const recs = api.detectarRecorrentes(api.buildModel(months(api), {}, 'Maria Silva'));
  const nomes = recs.map(o => o.last.desc);
  assert.ok(nomes.includes('To Example Lettings'));
  assert.ok(nomes.includes('Netflix'));
  assert.ok(!nomes.includes('Tesco')); // duas vezes por mês: não é conta fixa
  assert.ok(!nomes.includes('To MARIA SILVA')); // envio para conta própria fica fora
});

test('"Isso é aluguel?" aponta o maior pagamento recorrente do começo do mês', () => {
  const api = load();
  const recs = api.detectarRecorrentes(api.buildModel(months(api), {}, 'Maria Silva'));
  const o = api.sugerirAluguel(recs);
  assert.equal(o.last.desc, 'To Example Lettings');
  assert.equal(o.v, 650);
  assert.equal(o.dia, 1);
  assert.equal(api.sugerirAluguel(recs, [o.id]), null); // a pessoa disse que não é
  const M2 = api.buildModel(months(api), { 'TO EXAMPLE LETTINGS': 'aluguel' }, 'Maria Silva');
  assert.equal(api.sugerirAluguel(api.detectarRecorrentes(M2)), null); // já é aluguel
});

test('previsão de outubro do exemplo fica perto da meta (aluguel do dia 1 não é projetado)', () => {
  const api = load();
  const M = api.buildModel(months(api), {}, 'Maria Silva');
  const sug = api.sugerirMetas(M), meta = Object.values(sug.cats).reduce((a, b) => a + b, 0);
  const P = api.preverMes(M, id => sug.cats[id]);
  assert.equal(P.m, '2026-10');
  assert.equal(meta, 1005);
  // fixas 190 (assin 40 + envios 150) + recorrentes já pagos 701,75 + Boots e Deliveroo por cair 27,80
  // + Tesco 38,40 no ritmo de 15 de 31 dias (79,36)
  assert.equal(Math.round(P.proj), 999);
  assert.deepEqual(P.pend.map(o => o.last.desc), ['Boots', 'Deliveroo']);
  // depois de responder "sim, é aluguel": continua perto da meta
  const M2 = api.buildModel(months(api), { 'TO EXAMPLE LETTINGS': 'aluguel' }, 'Maria Silva');
  const s2 = api.sugerirMetas(M2), P2 = api.preverMes(M2, id => s2.cats[id]);
  assert.equal(s2.cats.aluguel, 650);
  assert.equal(Math.round(P2.proj), 999);
});

// monta meses a partir de [data, descrição, centavos]; todos como compra no cartão
function meses(lista) {
  const m = {};
  lista.forEach(([d, desc, c]) => { (m[d.slice(0, 7)] = m[d.slice(0, 7)] || []).push([d, desc, 'Merchant', c, 0]); });
  return m;
}

test('conta fixa precisa cair perto do mesmo dia do mês (3 dias de folga)', () => {
  const api = load();
  const M = api.buildModel(meses([
    ['2026-07-03', 'Lidl', -3000], ['2026-08-17', 'Lidl', -3100], ['2026-09-28', 'Lidl', -2900], // mercado uma vez por mês, dia variado
    ['2026-07-07', 'Netflix', -1299], ['2026-08-09', 'Netflix', -1299], ['2026-09-06', 'Netflix', -1299], // até 3 dias de diferença
    ['2026-07-30', 'Spotify', -1099], ['2026-09-01', 'Spotify', -1099] // virada do mês: 30 e 1 ficam perto
  ]), {}, '');
  const nomes = api.detectarRecorrentes(M).map(o => o.last.desc);
  assert.ok(!nomes.includes('Lidl'));
  assert.ok(nomes.includes('Netflix'));
  assert.ok(nomes.includes('Spotify'));
});

test('conta fixa atrasada continua na previsão e fica marcada', () => {
  const api = load();
  const M = api.buildModel(meses([
    ['2026-08-05', 'Acme Gym', -1500], ['2026-09-05', 'Acme Gym', -1500],
    ['2026-08-20', 'Book Club', -1000], ['2026-09-20', 'Book Club', -1000],
    ['2026-10-15', 'Tesco', -3100] // outubro até dia 15, sem Acme Gym (dia 5) nem Book Club (dia 20)
  ]), {}, '');
  const por = Object.fromEntries(api.detectarRecorrentes(M).map(o => [o.last.desc, o]));
  assert.equal(M.partial, '2026-10');
  assert.equal(por['Acme Gym'].atrasada, true); // 15 > 5 + 3
  assert.equal(por['Book Club'].atrasada, false); // ainda não chegou o dia
  const P = api.preverMes(M, () => 0);
  // as duas continuam como "por cair": 15 + 10, mais o Tesco no ritmo de 15 de 31 dias
  assert.deepEqual(P.pend.map(o => o.last.desc).sort(), ['Acme Gym', 'Book Club']);
  assert.equal(P.proj.toFixed(2), (25 + 31 / 15 * 31).toFixed(2));
});

test('backup: o que o painel exporta volta igual ao restaurar', () => {
  const api = load();
  const dados = { v: 3, months: months(api), over: { TESCO: 'lazer' }, plan: { titular: 'MARIA SILVA', moeda: 'EUR', pais: 'IE', nomes: {}, configurado: true }, summary: null, div: null };
  const texto = JSON.stringify({ ...dados, exportadoEm: '2026-10-22T10:00:00.000Z' }, null, 1);
  assert.deepEqual(api.lerSalvo(texto, ''), dados);
  assert.deepEqual(api.resumoDados(dados), { meses: 4, de: '2026-07', ate: '2026-10', mov: 56 });
  assert.deepEqual(api.resumoDados({ months: {} }), { meses: 0, de: null, ate: null, mov: 0 });
});

test('dados corrompidos ou de versão desconhecida dão erro com motivo (para não gravar por cima)', () => {
  const { lerSalvo } = load();
  assert.throws(() => lerSalvo('{"months": {"2026-09": [', ''), /não é JSON válido/);
  assert.throws(() => lerSalvo('{"v": 4, "months": {}}', ''), /versão 4 desconhecida/);
  assert.throws(() => lerSalvo('"texto qualquer"', ''), /não são dados do painel/);
  assert.equal(lerSalvo('{"months": {}}', 'ANA').plan.titular, 'ANA'); // v1 vazia ainda é válida
});

test('pagamentos em R$ e em euro da v2 viram valor + moeda na v3, sem perder nada', () => {
  const { migrate } = load();
  const v2 = {
    v: 2, months: {}, over: {}, plan: { titular: '', moeda: 'EUR', pais: 'IE', nomes: {} }, summary: null,
    div: {
      items: [
        { id: 'd1', nome: 'Banco', status: 'aberta', criada: '2026-09-01', brl: 3700, venc: '2026-11-10', desc: 'Parcela 4/5' },
        { id: 'd2', nome: 'Curso', status: 'paga', criada: '2026-08-01', eur: 120, pagaEm: '2026-09-02' }
      ],
      cambio: { rate: 5.61, data: '2026-10-01', fonte: 'informado por você' },
      margem: 3
    }
  };
  const antes = JSON.stringify(v2);
  const x = migrate(v2);
  assert.equal(x.v, 3);
  assert.deepEqual(x.div, {
    items: [
      { id: 'd1', nome: 'Banco', status: 'aberta', criada: '2026-09-01', valor: 3700, moeda: 'BRL', venc: '2026-11-10', desc: 'Parcela 4/5' },
      { id: 'd2', nome: 'Curso', status: 'paga', criada: '2026-08-01', valor: 120, moeda: 'EUR', pagaEm: '2026-09-02' }
    ],
    cambios: { BRL: { rate: 5.61, data: '2026-10-01', fonte: 'informado por você' } },
    margem: 3
  });
  assert.equal(JSON.stringify(v2), antes); // não altera o original
  assert.deepEqual(migrate(x), x); // rodar de novo não muda nada
  assert.equal(migrate({ v: 2, div: null }).div, null);
});

test('a página não carrega nada de servidor externo, e o nome Nora não trocou a chave salva', () => {
  const ler = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  for (const f of ['index.html', 'styles.css', 'logo.svg', 'icon.svg']) {
    assert.doesNotMatch(ler(f).replace(/xmlns(:\w+)?="http:\/\/www\.w3\.org\/[^"]*"/g, ''), /(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i, f + ' aponta para fora');
  }
  // as fontes declaradas no CSS existem no projeto
  for (const [, url] of ler('styles.css').matchAll(/url\(([^)]+)\)/g)) assert.ok(readFileSync(new URL('../' + url, import.meta.url)).length > 1000, url);
  assert.match(appJs, /var LS = 'cortex-financas\.v3'/);
});
