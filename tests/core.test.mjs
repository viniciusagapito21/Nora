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
  return new Function(core + '; return { parseCSV, extractTx, moedasNoExtrato, cents, classify, buildModel, migrate, lerSalvo, resumoDados, sugerirMetas, detectarRecorrentes, sugerirAluguel, preverMes, CATS, PAISES_COM_REGRAS, moedaTravada, montarCats, slotsLivres, criarCategoria, listaMetasPoupanca };')();
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

// extrato consolidado inventado com duas contas (euro e libra), no formato que o leitor espera:
// as contas em sequência, cada uma com o título "(MOEDA)", e o bloco termina numa linha de ---
const consolidado = [
  'Current Accounts Summaries,,,,',
  'Current Accounts Transaction Statements,,,,',
  'Current Account (EUR),,,,',
  'Date,Description,Category,Amount,Balance',
  '1 Jul 2026,Payment from Example Cleaning Ltd,Others,"€1,200.00","€1,700.00"',
  '3 Jul 2026,Tesco,Merchant,-€38.40,"€1,661.60"',
  'Current Account (GBP),,,,',
  'Date,Description,Category,Amount,Balance',
  '2 Jul 2026,Example Books Ltd,Merchant,-£12.00,£188.00',
  '9 Jul 2026,Payment from Example Shop UK,Others,£50.00,£238.00',
  '---------,,,,'
].join('\n');

test('a moeda escolhe a conta lida no extrato consolidado', () => {
  const api = load(), rows = api.parseCSV(consolidado);
  assert.deepEqual(api.extractTx(rows).map(t => t[1]), ['Payment from Example Cleaning Ltd', 'Tesco']);
  assert.deepEqual(api.extractTx(rows, 'GBP'), [
    ['2026-07-02', 'Example Books Ltd', 'Merchant', -1200, 18800],
    ['2026-07-09', 'Payment from Example Shop UK', 'Others', 5000, 23800]
  ]);
  assert.deepEqual(api.extractTx(rows, 'USD'), []);
  assert.deepEqual(api.moedasNoExtrato(rows), ['EUR', 'GBP']);
});

test('no extrato comum, a coluna Currency escolhe as linhas da moeda', () => {
  const api = load();
  const rows = api.parseCSV([
    'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
    'CARD_PAYMENT,Current,2026-07-03 09:00:00,2026-07-03 09:05:00,Tesco,-38.40,0.00,EUR,COMPLETED,911.60',
    'CARD_PAYMENT,Current,2026-07-04 09:00:00,2026-07-04 09:05:00,Example Books Ltd,-12.00,0.50,GBP,COMPLETED,188.00'
  ].join('\n'));
  assert.deepEqual(api.extractTx(rows, 'GBP'), [['2026-07-04', 'Example Books Ltd', 'Merchant', -1250, 18800]]);
  assert.equal(api.extractTx(rows).length, 1);
  assert.deepEqual(api.moedasNoExtrato(rows), ['EUR', 'GBP']);
  assert.deepEqual(api.moedasNoExtrato(api.parseCSV(csv)), ['EUR']);
});

test('valores com símbolo de moeda e milhar viram centavos', () => {
  const api = load();
  assert.equal(api.cents('£1,234.50'), 123450);
  assert.equal(api.cents('−12.00'), -1200);
  assert.equal(api.cents('R$ 7.50'), 750);
  assert.equal(api.cents('-€38.40'), -3840);
  assert.equal(api.cents('abc'), null);
});

test('o país escolhe as regras de comerciantes; sem conjunto próprio, só marcas internacionais', () => {
  const api = load();
  const tesco = ['2026-07-03', 'Tesco', 'Merchant', -3840, 0], netflix = ['2026-07-07', 'Netflix', 'Merchant', -1299, 0];
  assert.deepEqual(api.PAISES_COM_REGRAS, ['IE']);
  assert.equal(api.classify(tesco, {}, '', 'IE').cat, 'mercado');
  assert.equal(api.classify(tesco, {}, '').cat, 'mercado', 'sem país vale a Irlanda, como nos dados antigos');
  assert.equal(api.classify(tesco, {}, '', 'BR').cat, 'compras', 'no Brasil não há regra para Tesco');
  assert.equal(api.classify(netflix, {}, '', 'BR').cat, 'assin');
  assert.equal(api.classify(tesco, { TESCO: 'mercado' }, '', 'BR').cat, 'mercado', 'a categoria escolhida à mão vale em qualquer país');
  const m = api.buildModel(months(api), {}, 'MARIA SILVA', 'BR');
  assert.equal(m.by['2026-09'].gasto, api.buildModel(months(api), {}, 'MARIA SILVA', 'IE').by['2026-09'].gasto, 'o total gasto não depende do país, só a divisão por categoria');
  assert.equal(m.by['2026-09'].spend.mercado || 0, 0, 'Tesco e Lidl não são reconhecidos no Brasil: vão para compras');
});

test('com meses salvos a moeda fica travada (os valores não seriam convertidos)', () => {
  const api = load();
  assert.equal(api.moedaTravada({}), false);
  assert.equal(api.moedaTravada(undefined), false);
  assert.equal(api.moedaTravada({ '2026-07': [] }), false, 'mês vazio não trava');
  assert.equal(api.moedaTravada(months(api)), true);
});

test('categorias de fábrica: mesma ordem, e as fixas de sempre', () => {
  const api = load(), cs = api.montarCats(null);
  assert.deepEqual(cs.map(c => c.id), api.CATS.map(c => c.id));
  assert.deepEqual(cs.filter(c => c.fixa).map(c => c.id), ['aluguel', 'brasil', 'assin']);
  assert.ok(cs.every(c => !c.oculta && c.nome === c.padrao));
  assert.deepEqual(api.slotsLivres(null), [], 'as 8 cores estão em uso');
  assert.throws(() => api.criarCategoria({}, 'Educação'), /8 cores estão em uso/);
});

test('renomear não muda nada; esconder leva o gasto para Outros sem mudar o total', () => {
  const api = load(), ms = months(api), base = api.buildModel(ms, {}, 'MARIA SILVA', 'IE');
  const ren = api.montarCats({ nomes: { mercado: 'Supermercado' } });
  assert.equal(ren.find(c => c.id === 'mercado').nome, 'Supermercado');
  assert.deepEqual(api.buildModel(ms, {}, 'MARIA SILVA', 'IE', ren).by, base.by);
  const esc = api.buildModel(ms, {}, 'MARIA SILVA', 'IE', api.montarCats({ ocultas: ['mercado'] })), g = esc.by['2026-09'], g0 = base.by['2026-09'];
  assert.equal(g.spend.mercado, undefined);
  assert.equal(g.spend.outros, g0.spend.outros + g0.spend.mercado);
  assert.equal(g.gasto, g0.gasto);
  assert.equal(api.montarCats({ ocultas: ['outros'] }).find(c => c.id === 'outros').oculta, false, 'Outros não se esconde');
  // a escolha manual para uma categoria escondida também cai em Outros, e volta quando ela aparece de novo
  const t = ['2026-09-22', 'Boots', 'Merchant', -950, 0];
  assert.equal(api.classify(t, { BOOTS: 'mercado' }, '', 'IE', api.montarCats({ ocultas: ['mercado'] })).cat, 'outros');
  assert.equal(api.classify(t, { BOOTS: 'mercado' }, '', 'IE', api.montarCats({})).cat, 'mercado');
});

test('categoria criada usa a cor de uma escondida e recebe movimentos pela escolha manual', () => {
  const api = load();
  const p0 = { ocultas: ['saude'] };
  assert.deepEqual(api.slotsLivres(p0), [8]);
  const p1 = api.criarCategoria(p0, '  Educação  ');
  assert.deepEqual(p1.proprias, [{ id: 'u1', nome: 'Educação', slot: 8 }]);
  assert.deepEqual(p0, { ocultas: ['saude'] }, 'o plan original não muda');
  assert.throws(() => api.criarCategoria(p1, 'Pets'), /cores estão em uso/);
  assert.throws(() => api.criarCategoria(p0, '   '), /precisa de um nome/);
  const cs = api.montarCats(p1);
  assert.deepEqual(cs.slice(-2).map(c => c.id), ['u1', 'outros'], 'as criadas ficam antes de Outros');
  const m = api.buildModel(months(api), { BOOTS: 'u1' }, 'MARIA SILVA', 'IE', cs);
  assert.equal(m.by['2026-09'].spend.u1, 9.5);
  const sug = api.sugerirMetas(m, cs);
  assert.ok('u1' in sug.cats && !('saude' in sug.cats), 'sugestão inclui a criada e deixa de fora a escondida');
  // com Compras e Compras grandes escondidas, a cor 4 fica livre
  assert.deepEqual(api.slotsLivres({ ocultas: ['compras'] }), [], 'Compras grandes ainda usa a cor 4');
  assert.deepEqual(api.slotsLivres({ ocultas: ['compras', 'grandes'] }), [4]);
});

test('"conta fixa" decide como a categoria entra na previsão', () => {
  const api = load(), ms = months(api), meta = id => ({ mercado: 110 })[id] || 0;
  const m = api.buildModel(ms, {}, 'MARIA SILVA', 'IE');
  const p0 = api.preverMes(m, meta, api.montarCats({}));
  const p1 = api.preverMes(m, meta, api.montarCats({ fixas: ['aluguel', 'assin', 'brasil', 'mercado'] }));
  const gm = m.by[m.partial].spend.mercado;
  assert.ok(gm < 110);
  assert.equal(Math.round((p1.falFix - p0.falFix) * 100), Math.round((110 - gm) * 100), 'como fixa, falta o que resta da meta de mercado');
  assert.notEqual(Math.round(p1.proj), Math.round(p0.proj));
});

test('metas de poupança: as quatro de fábrica, ou a lista da pessoa (até 6, origem conferida)', () => {
  const api = load();
  assert.deepEqual(api.listaMetasPoupanca(null).map(g => [g.id, g.src]), [['reserva', 'flex'], ['invest', 'invest'], ['viagens', null], ['viagem', null]]);
  const l = Array.from({ length: 8 }, (_, i) => ({ id: 'm' + i, nome: 'Meta ' + i, src: i === 0 ? 'flex' : 'qualquer' }));
  const r = api.listaMetasPoupanca({ metasPoupanca: l });
  assert.equal(r.length, 6);
  assert.equal(r[0].src, 'flex');
  assert.equal(r[1].src, null, 'origem desconhecida vira "digitado por você"');
});

test('os campos novos de categorias e metas passam pela migração e pelo backup sem perda', () => {
  const api = load();
  const plan = { titular: 'MARIA SILVA', moeda: 'EUR', pais: 'IE', nomes: { mercado: 'Supermercado' }, ocultas: ['saude'], fixas: ['aluguel'],
    proprias: [{ id: 'u1', nome: 'Educação', slot: 8 }], metasPoupanca: [{ id: 'm1', nome: 'Carro', src: null }], goals: { m1: { alvo: 5000, tem: 200 } } };
  const x = api.migrate({ v: 3, months: {}, over: { BOOTS: 'u1' }, plan, summary: null, div: null });
  assert.deepEqual(x.plan, plan);
  assert.deepEqual(api.lerSalvo(JSON.stringify(x)), x);
});

test('conta fixa com meta vazia ou zero entra pelo valor recorrente; sem recorrente, avisa', () => {
  const api = load(), m = api.buildModel(months(api), {}, 'MARIA SILVA', 'IE'), cur = m.partial;
  // metas como no painel sem metas definidas: a sugestão do extrato, com Saúde zerada (é o caso testado)
  const sug = api.sugerirMetas(m).cats, meta = id => (id === 'saude' ? 0 : sug[id] || 0);
  // Saúde: Boots cai todo dia 22 (recorrente de € 9,50) e em outubro ainda não caiu
  assert.equal(m.by[cur].spend.saude || 0, 0);
  const comoFixa = api.montarCats({ fixas: ['aluguel', 'assin', 'brasil', 'saude'] });
  const p0 = api.preverMes(m, meta, api.montarCats({}));
  const p1 = api.preverMes(m, meta, comoFixa);
  assert.equal(Math.round(p1.proj * 100), Math.round(p0.proj * 100), 'a previsão não cai para zero: o Boots continua contado');
  assert.ok(p1.falFix >= 9.5, 'os € 9,50 ainda por cair entram no que falta das contas fixas');
  assert.ok(p1.pend.every(o => o.last.cat !== 'saude'), 'e não contam duas vezes como conta detectada');
  assert.deepEqual(p1.semBase, []);
  // com meta, a meta manda
  const p2 = api.preverMes(m, id => (id === 'saude' ? 30 : meta(id)), comoFixa);
  assert.equal(Math.round((p2.proj - p1.proj) * 100), 2050);
  // Mercado como fixa com meta zero: o Lidl (recorrente) é a base; Comer fora como fixa sem meta: Costa e Deliveroo
  // Compras grandes nunca teve gasto: nada a avisar. Mercado sem recorrente e com gasto: avisa
  const semLidl = api.buildModel(months(api), { LIDL: 'compras' }, 'MARIA SILVA', 'IE');
  const p3 = api.preverMes(semLidl, () => 0, api.montarCats({ fixas: ['mercado', 'grandes'] }));
  // Envios com meta zero também avisa: tem gasto todo mês e a detecção de recorrentes não olha essa categoria
  assert.deepEqual(api.preverMes(m, () => 0, api.montarCats({})).semBase, ['brasil']);
  assert.deepEqual(p3.semBase, ['mercado']);
  // de fábrica, nenhuma categoria fixa fica sem base no extrato de exemplo (nada de aviso à toa)
  assert.deepEqual(api.preverMes(m, id => sug[id] || 0, api.montarCats({})).semBase, []);
});
