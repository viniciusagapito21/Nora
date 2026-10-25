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
  return new Function(core + '; return { parseCSV, extractTx, moedasNoExtrato, cents, classify, buildModel, migrate, lerSalvo, resumoDados, sugerirMetas, detectarRecorrentes, sugerirAluguel, preverMes, CATS, PAISES_COM_REGRAS, moedaTravada, montarCats, slotsLivres, criarCategoria, listaMetasPoupanca, migrarAteV3, paraV3, compor, decompor, novaCarteira, editarCarteira, excluirCarteira, escolherCarteira, temLeitor, BANCOS, tamanhoSalvo, ESPACO_AVISO, decodificar, detectarSeparador, detectarCabecalho, sugerirColunas, perguntasImportacao, interpretarCSV, prepararImportacao, lembrarMapa, assinatura, txKey, fechamentos, conferirSaldos, trocarMoedaPrincipal, paraPrincipal, moedasSemPrincipal, diasDesde, juntarPeriodos, cobreMes, resumir, mesResumo, previsaoResumo, passaMesmo, resumoBackup, sugerirTransferencias, transferenciasConfirmadas, confirmarTransferencia, desfazerTransferencia, dispensarSugestao, contarTransferencias, juntarMovimentos };')();
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
  const { migrarAteV3: migrate } = load();
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
  const { migrarAteV3: migrate } = load();
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
  assert.throws(() => migrate({ v: 5 }), /versão 5/);
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
  const v4 = api.lerSalvo(texto, '');
  const { v, ...semVersao } = dados;
  assert.deepEqual(api.compor(v4), semVersao, 'backup v3 restaurado mostra exatamente os mesmos dados');
  assert.deepEqual(api.lerSalvo(JSON.stringify({ ...v4, exportadoEm: '2026-10-22T10:00:00.000Z' })), v4, 'backup v4 volta igual');
  assert.deepEqual(api.resumoDados(dados), { meses: 4, de: '2026-07', ate: '2026-10', mov: 56 });
  assert.deepEqual(api.resumoDados(v4), { meses: 4, de: '2026-07', ate: '2026-10', mov: 56 });
  assert.deepEqual(api.resumoDados({ months: {} }), { meses: 0, de: null, ate: null, mov: 0 });
});

test('dados corrompidos ou de versão desconhecida dão erro com motivo (para não gravar por cima)', () => {
  const { lerSalvo } = load();
  assert.throws(() => lerSalvo('{"months": {"2026-09": [', ''), /não é JSON válido/);
  assert.throws(() => lerSalvo('{"v": 5, "carteiras": []}', ''), /versão 5 desconhecida/);
  assert.throws(() => lerSalvo('"texto qualquer"', ''), /não são dados do painel/);
  assert.equal(lerSalvo('{"months": {}}', 'ANA').config.titular, 'ANA'); // v1 vazia ainda é válida
});

test('pagamentos em R$ e em euro da v2 viram valor + moeda na v3, sem perder nada', () => {
  const { migrarAteV3: migrate } = load();
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
  assert.match(appJs, /var LS = 'cortex-financas\.v4', LS_V3 = 'cortex-financas\.v3'/, 'a v4 grava numa chave nova e a v3 continua sendo lida');
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
  const x = api.migrarAteV3({ v: 3, months: {}, over: { BOOTS: 'u1' }, plan, summary: null, div: null });
  assert.deepEqual(x.plan, plan);
  const v4 = api.lerSalvo(JSON.stringify(x));
  assert.deepEqual(api.compor(v4).plan, plan);
  assert.deepEqual(api.lerSalvo(JSON.stringify(v4)), v4);
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

// ---------- passo 9.1: formato v4 (carteiras) ----------
// v3 completo e inventado: meses, regras manuais, resumo de saldos, categorias e metas editadas, pagamentos em
// observação com câmbio, pergunta do aluguel respondida e um campo que o painel não conhece (não pode sumir)
function v3Completo(api) {
  return {
    v: 3, months: months(api), over: { TESCO: 'lazer', 'COSTA COFFEE': 'u1' },
    plan: { titular: 'MARIA SILVA', moeda: 'EUR', pais: 'IE', configurado: true, cats: { mercado: 120, brasil: 150 }, poupar: 200,
      nomes: { mercado: 'Supermercado' }, ocultas: ['saude'], fixas: ['aluguel', 'assin'], proprias: [{ id: 'u1', nome: 'Cafés', slot: 8 }],
      metasPoupanca: [{ id: 'reserva', nome: 'Reserva', src: 'flex' }, { id: 'm1', nome: 'Carro', src: null }],
      goals: { reserva: { alvo: 3000 }, m1: { alvo: 5000, tem: 1200, prazo: '2027-12' } }, naoAluguel: ['TO EXAMPLE LETTINGS'], campoFuturo: { x: 1 } },
    summary: { conta: 82400, flex: 40000, asOf: '2026-10-15' },
    div: { items: [{ id: 'd1', nome: 'Banco', status: 'aberta', criada: '2026-09-01', valor: 3700, moeda: 'BRL', venc: '2026-10-25' }],
      cambios: { BRL: { rate: 5.61, data: '2026-10-01', fonte: 'informado por você' } }, margem: 2 }
  };
}

test('ida e volta: v1, v2 e v3 → v4 → v3 devolvem exatamente o que a v3 tinha', () => {
  const api = load();
  const v1 = { months: { '2026-09': [['2026-09-01', 'Tesco', 'Merchant', -1000, 0]] }, over: { TESCO: 'lazer' }, plan: { cats: { mercado: 200 }, poupar: 100 }, summary: null };
  const v2 = { v: 2, months: {}, over: {}, plan: { titular: 'ANA', moeda: 'EUR', pais: 'IE', nomes: {} }, summary: null,
    div: { items: [{ id: 'd1', nome: 'Banco', status: 'aberta', brl: 3700 }], cambio: { rate: 5.61, data: '2026-10-01' }, margem: 3 } };
  for (const [nome, x, tit] of [['v1', v1, 'MARIA SILVA'], ['v2', v2, ''], ['v3', v3Completo(api), ''], ['v3 mínima', { v: 3, months: {}, over: {}, plan: {}, summary: null, div: null }, '']]) {
    const antes = JSON.stringify(x);
    const v4 = api.migrate(x, tit);
    assert.equal(v4.v, 4, nome);
    assert.deepEqual(api.paraV3(v4), api.migrarAteV3(x, tit), nome + ': nada se perde na ida e volta');
    assert.deepEqual(api.paraV3(api.lerSalvo(JSON.stringify(v4))), api.migrarAteV3(x, tit), nome + ': nem passando pelo JSON salvo');
    assert.equal(JSON.stringify(x), antes, nome + ': o objeto original não muda');
  }
});

test('v3 vira uma carteira única "Revolut" na moeda e no país da configuração', () => {
  const api = load(), v3 = v3Completo(api), x = api.migrate(v3);
  assert.deepEqual(Object.keys(x).sort(), ['ativa', 'cambios', 'carteiras', 'config', 'div', 'v']);
  assert.equal(x.carteiras.length, 1);
  const c = x.carteiras[0];
  assert.deepEqual({ id: c.id, nome: c.nome, moeda: c.moeda, pais: c.pais, banco: c.banco }, { id: 'c1', nome: 'Revolut', moeda: 'EUR', pais: 'IE', banco: 'revolut' });
  assert.equal(x.ativa, 'c1');
  assert.deepEqual(c.months, v3.months);
  assert.deepEqual(c.over, v3.over);
  assert.deepEqual(c.summary, v3.summary);
  assert.deepEqual(c.metas, { cats: { mercado: 120, brasil: 150 }, poupar: 200 });
  assert.deepEqual(c.naoAluguel, ['TO EXAMPLE LETTINGS']);
  assert.deepEqual(c.transf, {});
  assert.deepEqual(c.sugDispensadas, []);
  assert.equal(x.config.moedaPrincipal, 'EUR');
  assert.equal(x.config.titular, 'MARIA SILVA');
  assert.deepEqual(x.config.campoFuturo, { x: 1 }, 'campo desconhecido continua guardado');
  assert.ok(!('moeda' in x.config) && !('pais' in x.config) && !('cats' in x.config), 'o que é da carteira sai da configuração');
  assert.deepEqual(x.cambios, v3.div.cambios, 'o câmbio sai de Em observação e vale para tudo');
  assert.deepEqual(x.div, { items: v3.div.items, margem: 2 });
  assert.deepEqual(api.migrate(x), x, 'v4 lida de novo não muda');
});

test('o painel recebe da v4 exatamente o que recebia da v3 (compor) e grava de volta sem perda (decompor)', () => {
  const api = load(), v3 = v3Completo(api), x = api.migrate(v3), vis = api.compor(x);
  assert.deepEqual(vis, { months: v3.months, over: v3.over, plan: v3.plan, summary: v3.summary, div: v3.div });
  assert.deepEqual(api.decompor(x, vis), x);
  // mudar algo pela tela vai para o lugar certo da v4
  const novo = api.decompor(x, { ...vis, plan: { ...vis.plan, cats: { mercado: 90 }, titular: 'ANA' }, over: { LIDL: 'lazer' } });
  assert.deepEqual(novo.carteiras[0].metas.cats, { mercado: 90 });
  assert.equal(novo.config.titular, 'ANA');
  assert.deepEqual(novo.carteiras[0].over, { LIDL: 'lazer' });
  assert.deepEqual(x.carteiras[0].over, v3.over, 'decompor não altera a v4 de entrada');
  // com uma carteira só, trocar a moeda (sem extrato) leva a moeda principal junto
  const vazia = api.migrate({ v: 3, months: {}, over: {}, plan: { moeda: 'EUR' }, summary: null, div: null });
  const gbp = api.decompor(vazia, { ...api.compor(vazia), plan: { ...api.compor(vazia).plan, moeda: 'GBP' } });
  assert.equal(gbp.carteiras[0].moeda, 'GBP');
  assert.equal(gbp.config.moedaPrincipal, 'GBP');
});

test('v4 inválida é recusada com motivo', () => {
  const api = load(), ok = api.migrate(v3Completo(api));
  assert.throws(() => api.migrate({ ...ok, carteiras: [] }), /carteira/);
  assert.throws(() => api.migrate({ ...ok, carteiras: Array.from({ length: 6 }, (_, i) => ({ ...ok.carteiras[0], id: 'c' + i })) }), /5 carteiras/);
  assert.throws(() => api.migrate({ ...ok, carteiras: [{ ...ok.carteiras[0], months: { setembro: [] } }] }), /mês setembro/);
  assert.throws(() => api.migrate({ ...ok, carteiras: [{ ...ok.carteiras[0], moeda: 'euro' }] }), /moeda/);
  assert.throws(() => api.migrate({ ...ok, carteiras: [ok.carteiras[0], ok.carteiras[0]] }), /repetid/);
  assert.equal(api.migrate({ ...ok, ativa: 'nao-existe' }).ativa, 'c1', 'ativa inválida volta para a primeira');
  assert.throws(() => api.paraV3({ ...ok, carteiras: [ok.carteiras[0], { ...ok.carteiras[0], id: 'c2' }] }), /mais de uma carteira/);
});

// ---------- 9.2: criar, renomear e excluir carteiras ----------
function comUmaCarteira(api) { return api.migrate({ v: 3, months: months(api), over: { TESCO: 'lazer' }, plan: { titular: 'MARIA SILVA', moeda: 'EUR', pais: 'IE', configurado: true }, summary: null, div: { items: [], cambios: { BRL: { rate: 5.61 } } } }); }

test('criar carteira: nome, moeda, país e banco; vira a ativa; até 5', () => {
  const api = load(), x = comUmaCarteira(api), copia = JSON.stringify(x);
  const y = api.novaCarteira(x, { nome: '  Wise libras ', moeda: 'GBP', pais: 'GB', banco: 'wise' });
  assert.equal(JSON.stringify(x), copia, 'não altera o original');
  assert.equal(y.carteiras.length, 2);
  const w = y.carteiras[1];
  assert.deepEqual({ id: w.id, nome: w.nome, moeda: w.moeda, pais: w.pais, banco: w.banco }, { id: 'c2', nome: 'Wise libras', moeda: 'GBP', pais: 'GB', banco: 'wise' });
  assert.deepEqual([w.months, w.over, w.summary, w.metas], [{}, {}, null, {}]);
  assert.equal(y.ativa, 'c2');
  assert.equal(y.config.moedaPrincipal, 'EUR', 'a principal continua a primeira');
  assert.deepEqual(y.cambios, x.cambios);
  // a mesma moeda pode repetir (decisão 9); o nome não
  const z = api.novaCarteira(y, { nome: 'Revolut 2', moeda: 'EUR', pais: 'IE', banco: 'revolut' });
  assert.equal(z.carteiras[2].id, 'c3');
  assert.throws(() => api.novaCarteira(z, { nome: 'revolut', moeda: 'EUR', banco: 'revolut' }), /já existe uma carteira chamada/);
  assert.throws(() => api.novaCarteira(z, { nome: ' ', moeda: 'EUR' }), /precisa de um nome/);
  assert.throws(() => api.novaCarteira(z, { nome: 'X', moeda: 'euro' }), /moeda/);
  assert.throws(() => api.novaCarteira(z, { nome: 'X', moeda: 'EUR', banco: 'banco-inventado' }), /tipo de extrato/);
  let cinco = api.novaCarteira(api.novaCarteira(z, { nome: 'N4', moeda: 'BRL', pais: 'BR', banco: 'nubank' }), { nome: 'N5', moeda: 'BRL', pais: 'BR', banco: 'btg' });
  assert.equal(cinco.carteiras.length, 5);
  assert.throws(() => api.novaCarteira(cinco, { nome: 'N6', moeda: 'EUR' }), /já há 5 carteiras/);
  // o id novo vem depois do maior que existe (não reaproveita o de uma excluída no meio)
  const quatro = api.excluirCarteira(cinco, 'c2');
  assert.equal(api.novaCarteira(quatro, { nome: 'N6', moeda: 'EUR', banco: 'revolut' }).carteiras[4].id, 'c6');
});

test('só o Revolut tem leitor por enquanto', () => {
  const api = load();
  assert.equal(api.temLeitor('revolut'), true);
  ['aib', 'boi', 'wise', 'nubank', 'btg', 'outro'].forEach(b => assert.equal(api.temLeitor(b), false, b));
  assert.deepEqual(api.BANCOS.map(b => b[0]), ['revolut', 'aib', 'boi', 'wise', 'nubank', 'btg', 'outro']);
});

test('editar carteira: nome e país sempre; moeda e banco só sem movimentos', () => {
  const api = load(), x = api.novaCarteira(comUmaCarteira(api), { nome: 'Nubank', moeda: 'BRL', pais: 'BR', banco: 'nubank' });
  // c1 tem extrato: moeda e banco travados
  const y = api.editarCarteira(x, 'c1', { nome: 'Revolut euro', pais: 'PT', moeda: 'EUR', banco: 'revolut' });
  assert.deepEqual([y.carteiras[0].nome, y.carteiras[0].pais], ['Revolut euro', 'PT']);
  assert.equal(y.carteiras[0].months, x.carteiras[0].months, 'movimentos intactos');
  assert.throws(() => api.editarCarteira(x, 'c1', { moeda: 'GBP' }), /moeda não muda/);
  assert.throws(() => api.editarCarteira(x, 'c1', { banco: 'aib' }), /tipo de extrato não muda/);
  assert.throws(() => api.editarCarteira(x, 'c1', { nome: 'nubank' }), /já existe uma carteira chamada/);
  assert.throws(() => api.editarCarteira(x, 'c9', { nome: 'X' }), /não existe/);
  // c2 vazia: troca moeda e banco à vontade; não mexe na moeda principal
  const z = api.editarCarteira(x, 'c2', { moeda: 'USD', banco: 'wise' });
  assert.deepEqual([z.carteiras[1].moeda, z.carteiras[1].banco, z.config.moedaPrincipal], ['USD', 'wise', 'EUR']);
  // a principal (a primeira) vazia trocando de moeda: a principal acompanha e o câmbio é pedido de novo (decisão 8)
  const vazia = api.migrate({ v: 3, months: {}, over: {}, plan: { moeda: 'EUR' }, summary: null, div: { items: [], cambios: { BRL: { rate: 5.61 } } } });
  const g = api.editarCarteira(vazia, 'c1', { moeda: 'GBP' });
  assert.deepEqual([g.config.moedaPrincipal, g.cambios], ['GBP', {}]);
  assert.deepEqual(api.editarCarteira(vazia, 'c1', { moeda: 'EUR' }).cambios, { BRL: { rate: 5.61 } }, 'mesma moeda: câmbio fica');
});

test('excluir carteira: some com os meses dela, as outras ficam; a única não se exclui', () => {
  const api = load(), um = comUmaCarteira(api);
  assert.throws(() => api.excluirCarteira(um, 'c1'), /única carteira/);
  const x = api.novaCarteira(um, { nome: 'Wise', moeda: 'GBP', pais: 'GB', banco: 'wise' });
  const y = api.excluirCarteira(x, 'c2');
  assert.deepEqual(y.carteiras.map(c => c.id), ['c1']);
  assert.equal(y.ativa, 'c1', 'a ativa excluída passa para a primeira');
  assert.deepEqual(y.carteiras[0], x.carteiras[0]);
  assert.deepEqual([y.config.moedaPrincipal, y.cambios], ['EUR', x.cambios]);
  assert.deepEqual(api.paraV3(y), api.paraV3(um), 'volta a ser exatamente a v3 de antes');
  // excluir a principal: a próxima vira principal; outra moeda pede o câmbio de novo
  const z = api.excluirCarteira(api.escolherCarteira(x, 'c1'), 'c1');
  assert.deepEqual([z.ativa, z.config.moedaPrincipal, z.cambios], ['c2', 'GBP', {}]);
  assert.throws(() => api.excluirCarteira(x, 'c9'), /não existe/);
});

test('escolher a carteira ativa', () => {
  const api = load(), x = api.novaCarteira(comUmaCarteira(api), { nome: 'Wise', moeda: 'GBP', pais: 'GB', banco: 'wise' });
  const y = api.escolherCarteira(x, 'c1');
  assert.equal(y.ativa, 'c1');
  assert.equal(api.compor(y).plan.moeda, 'EUR');
  assert.equal(api.compor(x).plan.moeda, 'GBP');
  assert.deepEqual(api.compor(x).months, {});
  assert.throws(() => api.escolherCarteira(x, 'c9'), /não existe/);
});

test('aviso de espaço soma a v3 e a v4 (as duas ficam salvas)', () => {
  const { tamanhoSalvo, ESPACO_AVISO } = load();
  const mb = n => 'x'.repeat(Math.round(n * 1024 * 1024));
  assert.equal(ESPACO_AVISO, 4 * 1024 * 1024);
  const v3 = ['cortex-financas.v3', mb(2.1)], v4 = ['cortex-financas.v4', mb(2.1)];
  assert.ok(tamanhoSalvo([v4]) < ESPACO_AVISO);
  assert.ok(tamanhoSalvo([v3, v4]) > ESPACO_AVISO, 'a v3 conta junto');
  assert.equal(tamanhoSalvo([['outra-coisa', mb(5)], ['cortex-financas.mov', '1']]), 'cortex-financas.mov'.length + 1, 'só as chaves do painel');
});

// ---------- importador genérico: só CSVs inventados ----------
// A: banco brasileiro inventado. Ponto e vírgula, Latin-1, 1.234,56, sinal de menos nas saídas, sem saldo,
//    três linhas antes do cabeçalho e duas de rodapé
const CSV_A = [
  'Extrato de conta corrente',
  'Cliente: MARIA SILVA;Agência 0001',
  '',
  'Data;Histórico;Documento;Valor (R$)',
  '01/09/2026;Salário Empresa Exemplo;000123;5.200,00',
  '02/09/2026;Pão de Açúcar;;-312,45',
  '15/09/2026;Farmácia São João;;-48,90',
  '15/09/2026;Café Exemplo;;-7,50',
  '15/09/2026;Café Exemplo;;-7,50',
  '28/09/2026;Aluguel Imóveis Exemplo;;-1.850,00',
  '',
  'Total do período;;;2.973,65',
  'Saldo final em 30/09/2026;;;4.120,10'
].join('\r\n');
// B: banco irlandês inventado. Vírgula, aspas, 1,234.56, débito e crédito em colunas separadas (positivos),
//    datas mês/dia/ano, com saldo, do mais novo para o mais antigo
const CSV_B = [
  '"Posted Account","Posted Transactions Date","Description","Debit Amount","Credit Amount","Balance"',
  '"123-456","09/25/2026","SUPERMARKET EXAMPLE","1,234.56","","2,000.00"',
  '"123-456","09/14/2026","SALARY EXAMPLE LTD","","3,000.00","3,234.56"',
  '"123-456","09/01/2026","OPENING CAFE","15.44","","234.56"'
].join('\n');
// C: cartão inventado. Ambíguo de propósito: datas que servem para dia/mês e mês/dia, valores como 1.234 e
//    débito positivo (as compras vêm sem sinal)
const CSV_C = ['Data,Lançamento,Valor', '03/04/2026,LOJA EXEMPLO,1.234', '05/04/2026,MERCADO EXEMPLO,50', '07/04/2026,POSTO EXEMPLO,120'].join('\n');
const latin1 = t => new Uint8Array(Buffer.from(t, 'latin1'));
const utf8 = t => new Uint8Array(Buffer.from(t, 'utf8'));

test('importador: Latin-1 e UTF-8 detectados; separador ; e , detectados', () => {
  const api = load();
  const a = api.decodificar(latin1(CSV_A));
  assert.equal(a.cod, 'latin1');
  assert.ok(a.texto.includes('Histórico') && a.texto.includes('Pão de Açúcar'));
  const u = api.decodificar(utf8('﻿' + CSV_A));
  assert.equal(u.cod, 'utf-8');
  assert.ok(u.texto.startsWith('Extrato'), 'tira o BOM');
  assert.equal(api.detectarSeparador(a.texto), ';');
  assert.equal(api.detectarSeparador(CSV_B), ',');
  assert.equal(api.detectarSeparador(CSV_A.replace(/;/g, '\t')), '\t');
});

test('importador A: pula o que vem antes do cabeçalho e lista o rodapé como ignorado; só pergunta o sinal', () => {
  const api = load(), p = api.prepararImportacao(latin1(CSV_A));
  assert.equal(p.mapa.cab, 3);
  assert.deepEqual([p.mapa.data, p.mapa.desc, p.mapa.valor.col, p.mapa.saldo], [0, 1, 3, -1]);
  const q = api.perguntasImportacao(p.rows, p.mapa);
  assert.deepEqual(q.map(x => x.id), ['sinal'], 'data e número são claros; o sinal sempre se pergunta');
  assert.deepEqual([q[0].pos, q[0].neg], [1, 5]);
  assert.equal(p.mapa.fmtNum, 'virgula');
  p.mapa.fmtData = 'dmy'; p.mapa.valor.saidas = 'negativas';
  assert.deepEqual(api.perguntasImportacao(p.rows, p.mapa), []);
  const r = api.interpretarCSV(p.rows, p.mapa);
  assert.equal(r.tx.length, 6);
  assert.deepEqual(r.tx[1], ['2026-09-02', 'Pão de Açúcar', 'Others', -31245, null]);
  assert.deepEqual([r.de, r.ate, r.entradas, r.saidas], ['2026-09-01', '2026-09-28', 520000, -222635]);
  assert.deepEqual(r.ignoradas.map(x => [x.n, x.motivo]), [[12, 'sem data válida'], [13, 'sem data válida']]);
});

test('importador B: débito e crédito em colunas, 1,234.56, mês/dia/ano, saldo; do mais novo para o mais antigo', () => {
  const api = load(), p = api.prepararImportacao(utf8(CSV_B));
  assert.equal(p.sep, ',');
  assert.deepEqual(p.mapa.valor, { modo: 'duas', saida: 3, entrada: 4 });
  assert.equal(p.mapa.saldo, 5);
  assert.equal(p.mapa.desc, 2);
  assert.deepEqual(api.perguntasImportacao(p.rows, p.mapa), [], 'mês/dia (25) e 1,234.56 são claros; duas colunas não têm dúvida de sinal');
  const r = api.interpretarCSV(p.rows, p.mapa);
  assert.deepEqual(r.tx, [
    ['2026-09-01', 'OPENING CAFE', 'Others', -1544, null],
    ['2026-09-14', 'SALARY EXAMPLE LTD', 'Others', 300000, null],
    ['2026-09-25', 'SUPERMARKET EXAMPLE', 'Others', -123456, null]], 'o saldo nunca fica no movimento');
  assert.deepEqual(r.saldos, { '2026-09-01': 23456, '2026-09-14': 323456, '2026-09-25': 200000 }, 'saldo por data');
});

test('importador C: data, número e sinal ambíguos ficam como pergunta; cada resposta muda o resultado', () => {
  const api = load(), p = api.prepararImportacao(utf8(CSV_C));
  const q = api.perguntasImportacao(p.rows, p.mapa), por = Object.fromEntries(q.map(x => [x.id, x]));
  assert.deepEqual(q.map(x => x.id), ['fmtData', 'fmtNum', 'sinal']);
  assert.deepEqual(por.fmtData.opcoes, ['dmy', 'mdy']);
  assert.equal(por.fmtData.exemplo, '03/04/2026');
  assert.deepEqual(por.fmtNum.opcoes, ['virgula', 'ponto']);
  assert.equal(por.fmtNum.exemplo, '1.234');
  const com = (fmtData, fmtNum, saidas) => api.interpretarCSV(p.rows, { ...p.mapa, fmtData, fmtNum, valor: { ...p.mapa.valor, saidas } }).tx[0];
  assert.deepEqual(com('dmy', 'virgula', 'positivas'), ['2026-04-03', 'LOJA EXEMPLO', 'Others', -123400, null]);
  assert.deepEqual(com('mdy', 'ponto', 'positivas'), ['2026-03-04', 'LOJA EXEMPLO', 'Others', -123, null]);
  assert.equal(com('dmy', 'virgula', 'negativas')[3], 123400, 'débito positivo só vira saída se a pessoa disser');
});

test('importador: coluna com datas incompatíveis entre si é erro, não palpite', () => {
  const api = load(), p = api.prepararImportacao(utf8('Data,Descrição,Valor\n25/09/2026,A,-1\n09/26/2026,B,-2\n'));
  const q = api.perguntasImportacao(p.rows, p.mapa);
  assert.ok(q.some(x => x.id === 'fmtData' && x.erro));
});

test('importador: mapeamento lembrado pelo código do cabeçalho, sem guardar texto do arquivo', () => {
  const api = load(), p = api.prepararImportacao(latin1(CSV_A));
  Object.assign(p.mapa, { fmtData: 'dmy' }); p.mapa.valor.saidas = 'negativas';
  const lem = api.lembrarMapa({}, p.rows, p.mapa), k = Object.keys(lem)[0];
  const json = JSON.stringify(lem);
  ['Histórico', 'Valor', 'MARIA', 'Café', 'Extrato', '5.200'].forEach(t => assert.ok(!json.includes(t), 'não guarda ' + t));
  assert.equal(k, api.assinatura(p.rows[3]));
  // outro mês do mesmo banco, com uma linha a mais antes do cabeçalho: reconhece e não pergunta nada
  const outro = latin1(CSV_A.replace('Extrato de conta corrente', 'Extrato de conta corrente\r\nEmitido em 01/10/2026'));
  const p2 = api.prepararImportacao(outro, lem);
  assert.equal(p2.lembrado, true);
  assert.equal(p2.mapa.cab, 4);
  assert.deepEqual(api.perguntasImportacao(p2.rows, p2.mapa), []);
  assert.equal(api.interpretarCSV(p2.rows, p2.mapa).tx.length, 6);
  // cabeçalho diferente: não usa o lembrado
  assert.equal(api.prepararImportacao(utf8(CSV_B), lem).lembrado, false);
});

test('reimportar não duplica: o igual a um já salvo é ignorado, e repetições legítimas continuam', () => {
  const api = load(), p = api.prepararImportacao(latin1(CSV_A));
  p.mapa.fmtData = 'dmy'; p.mapa.valor.saidas = 'negativas';
  const tx = api.interpretarCSV(p.rows, p.mapa).tx;
  const um = api.juntarMovimentos([], tx);
  assert.deepEqual([um.novos, um.repetidos, um.lista.length], [6, 0, 6], 'os dois cafés iguais do dia 15 ficam');
  const dois = api.juntarMovimentos(um.lista, tx);
  assert.deepEqual([dois.novos, dois.repetidos, dois.lista.length], [0, 6, 6]);
  // período que se sobrepõe: só o que é novo entra
  const extra = ['2026-09-29', 'Padaria Exemplo', 'Others', -900, null];
  const tres = api.juntarMovimentos(um.lista, tx.slice(3).concat([extra]));
  assert.deepEqual([tres.novos, tres.repetidos], [1, 3]);
  assert.deepEqual(tres.lista.at(-1), extra);
});

test('sem coluna de saldo o modelo marca semSaldo e não inventa saldo', () => {
  const api = load(), p = api.prepararImportacao(latin1(CSV_A));
  p.mapa.fmtData = 'dmy'; p.mapa.valor.saidas = 'negativas';
  const m = {}; api.interpretarCSV(p.rows, p.mapa).tx.forEach(t => (m[t[0].slice(0, 7)] = m[t[0].slice(0, 7)] || []).push(t));
  const M = api.buildModel(m, {}, 'MARIA SILVA', 'BR');
  assert.equal(M.semSaldo, true);
  assert.ok(M.rows.every(r => r.bal === null));
  assert.equal(M.by['2026-09'].gasto, 2226.35);
  assert.ok(Object.is(M.by['2026-09'].saved, 0), 'nada guardado é 0, e não −0 (a tabela mostrava "−0")');
  assert.equal(api.buildModel(months(api), {}).semSaldo, false, 'o Revolut continua com saldo');
});

test('fontes sem preload com crossorigin (dá erro de CORS ao abrir o index.html do disco)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!/rel="preload"[^>]*crossorigin/.test(html));
});

// ---------- saldo do fim do dia (estrutura do extrato do BTG convertido para CSV; tudo inventado) ----------
// Primeira coluna vazia, cabeçalho de página antes da tabela (repetido a cada página), colunas vazias no meio,
// "Data e hora", número 1,234.56 com menos nas saídas, e o saldo do dia como LINHA própria ("Saldo Diário",
// 23:59, valor na coluna Valor), depois dos movimentos do dia. No dia 16 o saldo tem 0,42 a mais (rendimento
// que o extrato não lista).
const pagina = () => [
  ',Extrato de conta corrente,,,,,,,,22/10/2026,',
  ',,,,,,,,,,',
  ',Cliente:,MARIA SILVA,,,,,,,,',
  ',CPF:,000.000.000-00,,,,,,,,',
  ',Período do extrato:,14/09/2026 a 18/09/2026,,,,,,,,',
  ',Lançamentos:,,,,,,Saldo atual:,,1517.42,',
  ',,,,,,,,,,',
  ',Data e hora,Categoria,Transação,,,Descrição,,,,Valor'];
const CSV_BTG = [
  ...pagina(),
  ',14/09/2026 09:12,Transferência,Pix recebido,,,EMPRESA EXEMPLO LTDA,,,,"1,000.00"',
  ',14/09/2026 18:40,Cartão,Compra no débito,,,MERCADO EXEMPLO,,,,-82.50',
  ',14/09/2026 23:59,,,,,Saldo Diário,,,,"1,417.50"',
  ',15/09/2026 10:05,Transferência,Pix enviado,,,JOAO EXEMPLO,,,,-50.00',
  ',15/09/2026 23:59,,,,,Saldo Diário,,,,"1,367.50"',
  ',,,,,,,,,,',
  ',,,,,,SAC: 0000-000-0000 ou atendimento@exemplo.com,,,,',
  ...pagina(),
  ',16/09/2026 08:00,Cartão,Compra no débito,,,PADARIA EXEMPLO,,,,-12.00',
  ',16/09/2026 23:59,,,,,Saldo Diário,,,,"1,355.92"',
  ',18/09/2026 14:30,Transferência,Pix recebido,,,CLIENTE EXEMPLO,,,,161.50',
  ',18/09/2026 23:59,,,,,Saldo Diário,,,,"1,517.42"',
  ',,,,,,,,,,',
  ',,,,,,©2026 Banco Exemplo - CNPJ 00.000.000/0000-00,,,,'
].join('\n');

test('saldo diário em linha própria: nunca vira movimento, vale para a data, e é conferido', () => {
  const api = load(), p = api.prepararImportacao(utf8(CSV_BTG));
  assert.equal(p.mapa.cab, 7);
  assert.deepEqual([p.mapa.data, p.mapa.desc, p.mapa.valor.col, p.mapa.saldo, p.mapa.saldoLinhas], [1, 6, 10, -1, 'Saldo Diário']);
  p.mapa.valor.saidas = 'negativas';
  assert.deepEqual(api.perguntasImportacao(p.rows, p.mapa), []);
  const r = api.interpretarCSV(p.rows, p.mapa);
  assert.equal(r.tx.length, 5, 'só os 5 movimentos; as 4 linhas de saldo não entram');
  assert.ok(r.tx.every(t => t[4] === null && !/saldo/i.test(t[1])));
  assert.deepEqual([r.entradas, r.saidas], [116150, -14450], 'os totais não somam saldo');
  assert.equal(r.nSaldo, 4);
  assert.deepEqual(r.saldos, { '2026-09-14': 141750, '2026-09-15': 136750, '2026-09-16': 135592, '2026-09-18': 151742 });
  // o cabeçalho repetido da página 2, o CPF e o rodapé são ignorados
  assert.ok(r.ignoradas.every(x => x.motivo === 'sem data válida'));
  // o saldo de 16/09 não bate com 15/09 menos 12,00: diferença de +0,42
  const c = api.conferirSaldos(r.tx, r.saldos);
  assert.deepEqual(c.divergencias, [{ de: '2026-09-15', ate: '2026-09-16', dif: 42, tipo: 'rendimento' }], 'pequena e positiva: rendimento, não alerta');
  // grande ou negativa: pode faltar linha; o limite do rendimento é por dia corrido entre os dois saldos
  const tx1 = [['2026-09-15', 'X', 'Others', -1000, null]];
  assert.equal(api.conferirSaldos(tx1, { '2026-09-14': 10000, '2026-09-15': 8500 }).divergencias[0].tipo, 'falta', 'negativa');
  assert.equal(api.conferirSaldos(tx1, { '2026-09-14': 10000, '2026-09-15': 9600 }).divergencias[0].tipo, 'falta', 'R$ 6 em 1 dia');
  assert.equal(api.conferirSaldos([], { '2026-09-11': 10000, '2026-09-14': 11200 }).divergencias[0].tipo, 'rendimento', 'R$ 12 em 3 dias (fim de semana)');
  assert.equal(r.tx.length, 5, 'nenhum movimento criado para cobrir a diferença');
  // saldo informado pela pessoa contra o do extrato
  assert.equal(api.conferirSaldos(r.tx, r.saldos, { data: '2026-09-18', valor: 151742 }).ancora.dif, 0);
  assert.equal(api.conferirSaldos(r.tx, r.saldos, { data: '2026-09-18', valor: 152000 }).ancora.dif, 258);
});

test('reimportar não depende do saldo: o mesmo movimento com outro saldo do dia não duplica', () => {
  const api = load(), p = api.prepararImportacao(utf8(CSV_BTG));
  p.mapa.valor.saidas = 'negativas';
  const a = api.interpretarCSV(p.rows, p.mapa).tx;
  const outro = api.prepararImportacao(utf8(CSV_BTG.replace('"1,417.50"', '"1,999.99"')));
  outro.mapa.valor.saidas = 'negativas';
  const b = api.interpretarCSV(outro.rows, outro.mapa).tx;
  assert.equal(api.juntarMovimentos(a, b).novos, 0);
});

test('coluna de saldo: nunca é valor; linha só com saldo não é movimento', () => {
  const api = load();
  const csv = 'Data;Descrição;Valor;Saldo\n21/09/2026;Café;-3,50;96,50\n21/09/2026;;;96,50\n22/09/2026;Mercado;-20,00;76,50\n';
  const p = api.prepararImportacao(utf8(csv));
  assert.equal(p.mapa.saldo, 3);
  p.mapa.valor.saidas = 'negativas';
  const r = api.interpretarCSV(p.rows, p.mapa);
  assert.equal(r.tx.length, 2);
  assert.deepEqual(r.ignoradas, []);
  assert.deepEqual(r.saldos, { '2026-09-21': 9650, '2026-09-22': 7650 });
  assert.ok(api.perguntasImportacao(p.rows, { ...p.mapa, saldo: 2 }).some(q => q.id === 'saldoValor' && q.erro), 'a mesma coluna como valor e saldo é erro');
});

test('sem saldo no extrato: com o saldo informado, reconstrói o fim de cada dia para trás e para a frente', () => {
  const api = load();
  const tx = [['2026-09-01', 'A', 'Others', 100000, null], ['2026-09-01', 'B', 'Others', -2000, null], ['2026-09-03', 'C', 'Others', -5000, null], ['2026-09-07', 'D', 'Others', 1000, null]];
  assert.deepEqual(api.fechamentos(tx, {}, null), { fecha: {}, fonte: null });
  const f = api.fechamentos(tx, {}, { data: '2026-09-03', valor: 50000 });
  assert.equal(f.fonte, 'estimado');
  assert.deepEqual(f.fecha, { '2026-09-01': 55000, '2026-09-03': 50000, '2026-09-07': 51000 });
  // no modelo: o saldo depois de cada movimento, e o de abertura do primeiro dia
  const M = api.buildModel({ '2026-09': tx }, {}, '', 'BR', null, { dia: {}, ancora: { data: '2026-09-03', valor: 50000 } });
  assert.equal(M.semSaldo, false);
  assert.equal(M.fonteSaldo, 'estimado');
  assert.deepEqual(M.rows.map(r => r.bal), [570, 550, 500, 510]);
  assert.equal(M.rows[0].bal - M.rows[0].a, -430, 'saldo de abertura = fim do dia menos os movimentos do dia');
  // com saldo do extrato, ele manda (o informado só é conferido)
  const E = api.buildModel({ '2026-09': tx }, {}, '', 'BR', null, { dia: { '2026-09-03': 40000 }, ancora: { data: '2026-09-03', valor: 50000 } });
  assert.equal(E.fonteSaldo, 'extrato');
  assert.equal(E.rows[2].bal, 400);
});

test('entradas: renda, outras, entre contas suas ou resgate, valendo para a mesma descrição', () => {
  const { classify, buildModel } = load();
  const pix = ['2026-09-20', 'Pix recebido Joao Exemplo', 'Others', 8000, null], kind = (t, over) => classify(t, over, 'MARIA SILVA', 'BR').kind;
  assert.equal(kind(pix, {}), 'outras');
  assert.equal(kind(pix, { '+PIX RECEBIDO JOAO EXEMPLO': '_renda' }), 'renda');
  assert.equal(kind(pix, { '+PIX RECEBIDO JOAO EXEMPLO': '_ignore' }), 'interno');
  assert.equal(kind(pix, { '+PIX RECEBIDO JOAO EXEMPLO': '_invest' }), 'invest');
  // a escolha da saída de mesmo nome não muda a entrada, e vice-versa
  const saida = ['2026-09-21', 'Pix recebido Joao Exemplo', 'Others', -3000, null];
  assert.equal(kind(pix, { 'PIX RECEBIDO JOAO EXEMPLO': 'mercado' }), 'outras');
  assert.equal(kind(saida, { '+PIX RECEBIDO JOAO EXEMPLO': '_renda' }), 'gasto');
  // vale para os próximos movimentos com a mesma descrição, e "entre contas suas" sai do Entrou
  const ov = { '+PIX RECEBIDO JOAO EXEMPLO': '_ignore' };
  const M = buildModel({ '2026-09': [pix, ['2026-09-25', 'Pix recebido Joao Exemplo', 'Others', 5000, null]] }, ov, 'MARIA SILVA', 'BR');
  assert.equal(M.by['2026-09'].entrou, 0);
  assert.equal(M.by['2026-09'].interno, 130);
  // saída marcada "entre contas suas" (_ignore) não entra no Gastou
  const G = buildModel({ '2026-09': [['2026-09-02', 'To BTG MARIA', 'Others', -50000, null], ['2026-09-03', 'Tesco', 'Merchant', -2000, null]] }, { 'TO BTG MARIA': '_ignore' }, 'MARIA SILVA', 'IE');
  assert.equal(G.by['2026-09'].gasto, 20);
});

// ---------- 9.3b: moeda principal e câmbio ----------
test('moeda principal: escolha à parte com 2+ carteiras; trocar apaga o câmbio; com uma carteira acompanha a dela', () => {
  const api = load(), um = comUmaCarteira(api);
  const x = api.novaCarteira(um, { nome: 'Wise', moeda: 'GBP', pais: 'GB', banco: 'wise' });
  assert.equal(x.config.moedaPrincipal, 'EUR');
  const y = api.trocarMoedaPrincipal(x, 'GBP');
  assert.deepEqual([y.config.moedaPrincipal, y.cambios], ['GBP', {}], 'trocar apaga as taxas (decisão 8)');
  assert.equal(api.trocarMoedaPrincipal(x, 'EUR'), x, 'a mesma moeda não muda nada');
  assert.throws(() => api.trocarMoedaPrincipal(x, 'euro'), /moeda/);
  // pode ser uma moeda que nenhuma carteira usa
  assert.equal(api.trocarMoedaPrincipal(x, 'USD').config.moedaPrincipal, 'USD');
  // com 3 carteiras, excluir a primeira não muda a moeda principal
  const tres = api.novaCarteira(api.trocarMoedaPrincipal(x, 'BRL'), { nome: 'Nubank', moeda: 'BRL', pais: 'BR', banco: 'nubank' });
  const t2 = api.excluirCarteira(tres, 'c1');
  assert.equal(t2.config.moedaPrincipal, 'BRL');
  // ficando uma só, a principal passa a ser a dela, e o câmbio é pedido de novo se mudou
  const so = api.excluirCarteira(t2, 'c3');
  assert.deepEqual([so.config.moedaPrincipal, so.cambios], ['GBP', {}]);
});

test('câmbio: 1 da principal = X da outra; converte, avisa o que falta, e conta a idade da taxa', () => {
  const api = load();
  let x = api.novaCarteira(comUmaCarteira(api), { nome: 'Wise', moeda: 'GBP', pais: 'GB', banco: 'wise' });
  x = { ...x, cambios: { GBP: { rate: 0.86, data: '2026-09-10' } }, div: { items: [{ id: 'd1', valor: 100, moeda: 'USD', status: 'aberta' }, { id: 'd2', valor: 5, moeda: 'CHF', status: 'paga' }] } };
  assert.equal(api.paraPrincipal(86, 'GBP', x), 100);
  assert.equal(api.paraPrincipal(50, 'EUR', x), 50);
  assert.equal(api.paraPrincipal(10, 'BRL', x), null, 'sem taxa: null, nunca um palpite');
  assert.deepEqual(api.moedasSemPrincipal(x), ['GBP', 'USD'], 'carteiras e pagamentos em aberto; o pago não conta');
  assert.equal(api.diasDesde('2026-09-10', '2026-10-22'), 42);
});

// ---------- 9.3c: períodos importados, cobertura e Resumo ----------
test('períodos: campo opcional da carteira, sem nova versão; carteira antiga ganha um período da primeira à última data', () => {
  const api = load(), v3 = v3Completo(api), x = api.migrate(v3);
  assert.equal(x.v, 4);
  assert.deepEqual(x.carteiras[0].periodos, [{ de: '2026-07-01', ate: '2026-10-15' }], 'da v3: das datas dos movimentos');
  // v4 salva antes do campo: a migração acontece ao ler, com movimentos, saldos do dia e saldo informado
  const semCampo = JSON.parse(JSON.stringify(x));
  delete semCampo.carteiras[0].periodos;
  semCampo.carteiras[0].saldosDia = { '2026-06-30': 50000 };
  semCampo.carteiras[0].ancora = { data: '2026-10-20', valor: 1 };
  assert.deepEqual(api.migrate(semCampo).carteiras[0].periodos, [{ de: '2026-06-30', ate: '2026-10-20' }]);
  // carteira sem nada: lista vazia; com o campo, ele vale como está (só ordenado e unido)
  const nova = api.novaCarteira(x, { nome: 'Wise', moeda: 'GBP', pais: 'GB', banco: 'wise' });
  assert.deepEqual(nova.carteiras[1].periodos, []);
  const comCampo = { ...x, carteiras: [{ ...x.carteiras[0], periodos: [{ de: '2026-09-01', ate: '2026-09-30' }, { de: '2026-08-01', ate: '2026-08-31' }] }] };
  assert.deepEqual(api.migrate(comCampo).carteiras[0].periodos, [{ de: '2026-08-01', ate: '2026-09-30' }]);
  assert.throws(() => api.migrate({ ...x, carteiras: [{ ...x.carteiras[0], periodos: [{ de: '1/9/2026', ate: '2026-09-30' }] }] }), /períodos em formato errado/);
  // a ida e volta continua exata: a v3 não tem o campo e nada mais muda
  assert.deepEqual(api.paraV3(api.lerSalvo(JSON.stringify(x))), api.migrarAteV3(v3, ''));
  assert.deepEqual(api.paraV3(api.migrate(semCampo)).months, api.migrarAteV3(v3, '').months);
});

test('períodos: une os que se sobrepõem ou encostam, e mantém os buracos', () => {
  const { juntarPeriodos } = load();
  assert.deepEqual(juntarPeriodos([{ de: '2026-08-01', ate: '2026-08-31' }], { de: '2026-09-01', ate: '2026-09-15' }), [{ de: '2026-08-01', ate: '2026-09-15' }], 'encostados');
  assert.deepEqual(juntarPeriodos([{ de: '2026-08-01', ate: '2026-08-20' }], { de: '2026-08-10', ate: '2026-08-15' }), [{ de: '2026-08-01', ate: '2026-08-20' }], 'dentro de outro');
  assert.deepEqual(juntarPeriodos([{ de: '2026-08-01', ate: '2026-08-10' }], { de: '2026-08-20', ate: '2026-08-31' }), [{ de: '2026-08-01', ate: '2026-08-10' }, { de: '2026-08-20', ate: '2026-08-31' }], 'buraco');
});

test('período do arquivo: o que o cabeçalho informa; sem ele, primeira e última data entre movimentos e saldos do dia', () => {
  const api = load();
  const a = api.prepararImportacao(latin1(CSV_A.replace('Cliente: MARIA SILVA;Agência 0001', 'Período: 01/09/2026 a 30/09/2026')));
  a.mapa.valor.saidas = 'negativas';
  assert.deepEqual(api.interpretarCSV(a.rows, a.mapa).periodo, { de: '2026-09-01', ate: '2026-09-30', fonte: 'arquivo' }, 'vai além do último movimento (28/09)');
  const sem = api.prepararImportacao(latin1(CSV_A)); sem.mapa.valor.saidas = 'negativas';
  assert.deepEqual(api.interpretarCSV(sem.rows, sem.mapa).periodo, { de: '2026-09-01', ate: '2026-09-28', fonte: 'datas' });
  const b = api.prepararImportacao(utf8(CSV_BTG)); b.mapa.valor.saidas = 'negativas';
  assert.deepEqual(api.interpretarCSV(b.rows, b.mapa).periodo, { de: '2026-09-14', ate: '2026-09-18', fonte: 'arquivo' }, '"Período do extrato" do BTG');
  // sem período no arquivo, a linha "Saldo Diário" do último dia conta, mesmo sem movimento nele
  const c = api.prepararImportacao(utf8(CSV_BTG.replace(/,Período do extrato:[^\n]*/g, ',,,,') + '\n,19/09/2026 23:59,,,,,Saldo Diário,,,,"1,517.42"'));
  c.mapa.valor.saidas = 'negativas';
  assert.deepEqual(api.interpretarCSV(c.rows, c.mapa).periodo, { de: '2026-09-14', ate: '2026-09-19', fonte: 'datas' });
});

test('cobertura: pela união dos períodos, não pelo último movimento', () => {
  const { cobreMes } = load();
  const set = [{ de: '2026-08-15', ate: '2026-09-30' }];
  assert.deepEqual(cobreMes(set, '2026-09', '2026-10-15'), { ok: true, faltas: [], nada: false }, 'dias sem movimento dentro do período contam');
  assert.deepEqual(cobreMes(set, '2026-08', '2026-10-15').faltas, [{ de: '2026-08-01', ate: '2026-08-14' }]);
  assert.equal(cobreMes(set, '2026-07', '2026-10-15').nada, true);
  // mês em andamento: até o último dia importado (somando todas as carteiras), não até o fim do mês
  assert.equal(cobreMes([{ de: '2026-10-01', ate: '2026-10-15' }], '2026-10', '2026-10-15').ok, true);
  assert.deepEqual(cobreMes([{ de: '2026-10-01', ate: '2026-10-10' }], '2026-10', '2026-10-15').faltas, [{ de: '2026-10-11', ate: '2026-10-15' }]);
  // buraco no meio, entre dois extratos
  assert.deepEqual(cobreMes([{ de: '2026-09-01', ate: '2026-09-10' }, { de: '2026-09-21', ate: '2026-09-30' }], '2026-09', null).faltas, [{ de: '2026-09-11', ate: '2026-09-20' }]);
});

// duas carteiras inventadas: euro (Revolut, com saldo) e libra (sem saldo no extrato)
function duasCarteiras(api, cambios) {
  let x = api.migrate({ v: 3, months: { '2026-09': [['2026-09-01', 'Payment from Example Ltd', 'Others', 200000, 250000], ['2026-09-03', 'Tesco', 'Merchant', -5000, 245000],
    ['2026-09-05', 'To MARIA SILVA', 'Others', -30000, 215000], ['2026-09-06', 'To Flexible Cash', 'Others', -10000, 205000]],
    '2026-10': [['2026-10-02', 'Tesco', 'Merchant', -4000, 201000]] }, over: { 'TO MARIA SILVA': '_ignore' },
    plan: { titular: 'MARIA SILVA', moeda: 'EUR', pais: 'IE', configurado: true, cats: { mercado: 100 } }, summary: null, div: null });
  x = api.novaCarteira(x, { nome: 'Wise libras', moeda: 'GBP', pais: 'GB', banco: 'wise' });
  x.carteiras[1].months = { '2026-09': [['2026-09-10', 'Salary', 'Others', 86000, null], ['2026-09-12', 'Tesco', 'Others', -4300, null], ['2026-09-15', 'From MARIA SILVA', 'Others', 25800, null]] };
  x.carteiras[1].periodos = [{ de: '2026-09-10', ate: '2026-09-30' }];
  x.carteiras[0].periodos = [{ de: '2026-09-01', ate: '2026-10-15' }];
  return { ...api.escolherCarteira(x, 'c1'), cambios: cambios || {} };
}

test('Resumo: soma na moeda principal pelo câmbio informado, avisa o mês que alguma carteira não cobre', () => {
  const api = load(), x = duasCarteiras(api, { GBP: { rate: 0.86, data: '2026-10-01' } }), R = api.resumir(x);
  assert.deepEqual([R.mp, R.ref, R.partial, R.meses, R.completos], ['EUR', '2026-10-15', '2026-10', ['2026-09', '2026-10'], ['2026-09']]);
  assert.deepEqual(R.ws.map(w => w.ate), ['2026-10-15', '2026-09-30'], 'dados até: o fim do período importado');
  assert.deepEqual(R.ws[0].saldo, { v: 2010, d: '2026-10-02', fonte: 'extrato' });
  assert.equal(R.ws[1].saldo, null, 'sem saldo no extrato: fora do total');
  const Q = api.mesResumo(R, x, '2026-09');
  // euro: entrou 2000, gastou 50, guardou 100; libra: entrou 860 (= 1000 €), gastou 43 (= 50 €)
  assert.equal(Q.total.entrou, 3000);
  assert.equal(Q.total.gasto, 100);
  assert.equal(Q.total.saved, 100);
  assert.deepEqual([Q.total.spend.mercado, Q.total.spend.outros], [50, 50], 'o Tesco da libra cai em Outros (sem regras do Reino Unido)');
  assert.deepEqual(Q.semCobertura.map(p => [p.w.nome, p.cob.faltas]), [['Wise libras', [{ de: '2026-09-01', ate: '2026-09-09' }]]]);
  // "Entre contas suas" fica fora das somas, contado por carteira e na moeda dela
  assert.deepEqual(Q.por.map(p => p.interno), [{ n: 1, entrou: 0, saiu: 300 }, { n: 1, entrou: 258, saiu: 0 }]);
  const O = api.mesResumo(R, x, '2026-10');
  assert.deepEqual(O.semCobertura.map(p => p.cob.nada), [true], 'a libra não tem nada de outubro');
});

test('Resumo: sem o câmbio de uma carteira com extrato, nenhum total; carteira vazia não bloqueia', () => {
  const api = load(), x = duasCarteiras(api), R = api.resumir(x);
  assert.deepEqual(R.faltaCambio, [{ moeda: 'GBP', nomes: ['Wise libras'] }]);
  assert.equal(api.mesResumo(R, x, '2026-09').total, null);
  assert.equal(api.previsaoResumo(R, x), null);
  assert.ok(api.mesResumo(R, x, '2026-09').por.every(p => p.g), 'cada carteira continua na moeda dela');
  const vazia = api.novaCarteira(duasCarteiras(api, { GBP: { rate: 0.86 } }), { nome: 'Nubank', moeda: 'BRL', pais: 'BR', banco: 'nubank' });
  assert.deepEqual(api.resumir(vazia).faltaCambio, [], 'sem extrato, nada a converter');
  const Rv = api.resumir(vazia);
  assert.deepEqual(api.mesResumo(Rv, vazia, '2026-10').semCobertura.map(p => p.w.nome), ['Wise libras'], 'a carteira sem nenhum extrato não entra no aviso de cobertura');
});

test('Resumo: previsão do mês em andamento soma as das carteiras com dados nele', () => {
  const api = load(), x = duasCarteiras(api, { GBP: { rate: 0.86, data: '2026-10-01' } }), R = api.resumir(x), P = api.previsaoResumo(R, x);
  assert.deepEqual([P.m, P.dia, P.dim], ['2026-10', 15, 31]);
  assert.deepEqual(P.por.map(q => q.w.nome), ['Revolut']);
  assert.deepEqual(P.fora.map(w => w.nome), ['Wise libras'], 'sem movimentos de outubro: fora da previsão');
  assert.equal(P.por[0].dia, 15, 'o ritmo vai até o fim do período importado (15 out), não até o último movimento (2 out)');
  assert.equal(P.gasto, 40);
});

// ---------- transferências entre carteiras (9.4): só movimentos inventados ----------
// duas carteiras a partir dos movimentos de cada uma; a e b: { moeda, tx: [[data, descrição, tipo, centavos, saldo]], over }
function parDeCarteiras(api, a, b, cambios) {
  const mes = tx => { const m = {}; tx.forEach(t => { (m[t[0].slice(0, 7)] = m[t[0].slice(0, 7)] || []).push(t); }); return m; };
  let x = api.migrate({ v: 3, months: mes(a.tx), over: a.over || {}, plan: { titular: 'MARIA SILVA', moeda: a.moeda || 'EUR', pais: 'IE', configurado: true }, summary: null, div: null });
  x = api.novaCarteira(x, { nome: 'Outra conta', moeda: b.moeda || 'EUR', pais: 'BR', banco: 'outro' });
  x.carteiras[1].months = mes(b.tx); x.carteiras[1].over = b.over || {};
  return { ...api.escolherCarteira(x, 'c1'), cambios: cambios || {} };
}
const sugeridas = (api, x) => api.sugerirTransferencias(api.resumir(x), x);
const parDe = p => ({ s: { c: p.s.w.id, id: p.s.r.id }, e: { c: p.e.w.id, id: p.e.r.id }, ja: p.ja });
const saida = (d, v, desc = 'To Fulano Exemplo') => [d, desc, 'Others', -v, null];
const entrada = (d, v, desc = 'TED recebida Exemplo') => [d, desc, 'Others', v, null];

test('transferências, mesma moeda: valores até 1% e datas até 3 dias; um pouco acima de cada um, nada', () => {
  const api = load();
  const n = (e, s = saida('2026-09-10', 10000)) => sugeridas(api, parDeCarteiras(api, { tx: [s] }, { tx: [e] })).pares.length;
  assert.equal(n(entrada('2026-09-13', 9900)), 1, '1% e 3 dias');
  assert.equal(n(entrada('2026-09-07', 10100)), 1, 'a entrada pode vir antes, e a mais');
  assert.equal(n(entrada('2026-09-13', 9890)), 0, '1,1%');
  assert.equal(n(entrada('2026-09-14', 10000)), 0, '4 dias');
  const p = sugeridas(api, parDeCarteiras(api, { tx: [saida('2026-09-10', 10000)] }, { tx: [entrada('2026-09-11', 9950)] })).pares[0];
  assert.equal(p.dias, 1); assert.ok(Math.abs(p.dif - 0.005) < 1e-9); assert.deepEqual(p.moedas, []); assert.equal(p.ja, null);
  assert.equal(p.s.w.id, 'c1'); assert.equal(p.e.w.id, 'c2');
});

test('transferências, moedas diferentes: pela taxa informada, até 6% e 5 dias; sem a taxa, nenhuma sugestão', () => {
  const api = load(), BRL = { BRL: { rate: 6.2, data: '2026-09-10' } };
  const x = (e, c = BRL) => parDeCarteiras(api, { tx: [saida('2026-09-05', 15000)] }, { moeda: 'BRL', tx: [e] }, c);
  // € 150 = R$ 930 pela taxa; R$ 874,20 é 6% a menos
  assert.equal(sugeridas(api, x(entrada('2026-09-10', 87420))).pares.length, 1, '6% e 5 dias');
  assert.equal(sugeridas(api, x(entrada('2026-09-10', 87400))).pares.length, 0, 'um pouco acima de 6%');
  assert.equal(sugeridas(api, x(entrada('2026-09-11', 93000))).pares.length, 0, '6 dias');
  const p = sugeridas(api, x(entrada('2026-09-06', 92500))).pares[0];
  assert.deepEqual(p.moedas, ['BRL']); assert.ok(Math.abs(p.dif - (1 - 925 / 930)) < 1e-9);
  const sem = sugeridas(api, x(entrada('2026-09-06', 93000), {}));
  assert.equal(sem.pares.length, 0, 'sem câmbio do real, nada');
  assert.deepEqual(sem.semCambio.map(w => w.nome), ['Outra conta']);
});

test('transferências: só "Envios para outra conta sua", "Pessoas, taxas e outros" ou sem categoria formam par; compra reconhecida não', () => {
  const api = load();
  const n = s => sugeridas(api, parDeCarteiras(api, { tx: [s] }, { tx: [entrada('2026-09-11', 5000)] })).pares.length;
  assert.equal(n(['2026-09-10', 'Tesco', 'Merchant', -5000, 0]), 0, 'mercado');
  assert.equal(n(['2026-09-10', 'Netflix', 'Merchant', -5000, 0]), 0, 'assinatura');
  assert.equal(n(['2026-09-10', 'Uber', 'Merchant', -5000, 0]), 0, 'transporte');
  assert.equal(n(['2026-09-10', 'To MARIA SILVA', 'Others', -5000, 0]), 1, 'envio ao titular (Envios para outra conta sua)');
  assert.equal(n(['2026-09-10', 'To Fulano Exemplo', 'Others', -5000, 0]), 1, 'pessoas, taxas e outros');
  assert.equal(n(['2026-09-10', 'To Flexible Cash', 'Others', -5000, 0]), 0, 'reserva');
  assert.equal(n(['2026-09-10', 'Exchanged to BTC', 'Exchange', -5000, 0]), 0, 'investimento');
  // escolha da pessoa: tirar a saída de "outros" tira a sugestão
  assert.equal(sugeridas(api, parDeCarteiras(api, { tx: [saida('2026-09-10', 5000)], over: { 'TO FULANO EXEMPLO': 'compras' } }, { tx: [entrada('2026-09-11', 5000)] })).pares.length, 0);
});

test('transferências: confirmar marca as duas pontas como "Entre contas suas"; desfazer devolve as duas', () => {
  const api = load();
  const x = parDeCarteiras(api, { tx: [saida('2026-09-10', 20000), ['2026-09-12', 'Tesco', 'Merchant', -3000, 0]] }, { tx: [entrada('2026-09-11', 20000), entrada('2026-09-20', 7000, 'Pix recebido Cliente')] });
  const antes = api.resumir(x), p = sugeridas(api, x).pares[0];
  const y = api.confirmarTransferencia(x, parDe(p)), R = api.resumir(y);
  const r = (R, i, id) => R.ws[i].M.rows.filter(q => q.id === id)[0];
  assert.equal(r(R, 0, p.s.r.id).kind, 'interno'); assert.equal(r(R, 1, p.e.r.id).kind, 'interno');
  assert.equal(R.ws[0].M.by['2026-09'].gasto, 30, 'sai do Gastou'); assert.equal(R.ws[1].M.by['2026-09'].entrou, 70, 'sai do Entrou');
  assert.equal(api.sugerirTransferencias(R, y).pares.length, 0, 'a confirmada não é sugerida de novo');
  assert.equal(api.transferenciasConfirmadas(R).length, 1);
  assert.equal(api.contarTransferencias(y.carteiras[0]), 1); assert.deepEqual(x.carteiras.map(w => w.transf), [{}, {}], 'os dados de antes não mudam');
  // desfazer a partir de qualquer ponta
  for (const [c, id] of [['c1', p.s.r.id], ['c2', p.e.r.id]]) {
    const z = api.desfazerTransferencia(y, c, id), Z = api.resumir(z);
    assert.deepEqual(z.carteiras.map(w => w.transf), [{}, {}]);
    assert.equal(r(Z, 0, p.s.r.id).kind, r(antes, 0, p.s.r.id).kind); assert.equal(r(Z, 1, p.e.r.id).kind, r(antes, 1, p.e.r.id).kind);
    assert.deepEqual(Z.ws.map(w => w.M.by), antes.ws.map(w => w.M.by));
  }
  // o que foi confirmado passa pelo JSON salvo
  assert.deepEqual(api.lerSalvo(JSON.stringify(y)).carteiras.map(w => w.transf), y.carteiras.map(w => w.transf));
});

test('transferências: um lado já "Entre contas suas" (pelo titular ou por descrição) marca só o outro; os dois já marcados, nada', () => {
  const api = load();
  // a entrada com o nome do titular já é "Entre contas suas" sozinha; a saída ainda conta como envio
  let x = parDeCarteiras(api, { tx: [saida('2026-09-05', 15000, 'To MARIA SILVA')] }, { tx: [entrada('2026-09-07', 15000, 'Pix recebido MARIA SILVA')] });
  let p = sugeridas(api, x).pares[0];
  assert.equal(p.ja, 'e'); assert.equal(p.e.r.kind, 'interno'); assert.equal(p.s.r.cat, 'brasil');
  let y = api.confirmarTransferencia(x, parDe(p));
  assert.equal(y.carteiras[0].transf[p.s.r.id].marca, true); assert.equal(y.carteiras[1].transf[p.e.r.id].marca, false, 'a entrada fica como estava');
  assert.equal(api.resumir(y).ws[0].M.rows[0].kind, 'interno');
  // a saída marcada por descrição; a entrada (sem o nome) ainda conta como entrada
  x = parDeCarteiras(api, { tx: [saida('2026-09-05', 15000, 'To MARIA SILVA')], over: { 'TO MARIA SILVA': '_ignore' } }, { tx: [entrada('2026-09-06', 15000)] });
  p = sugeridas(api, x).pares[0];
  assert.equal(p.ja, 's');
  y = api.confirmarTransferencia(x, parDe(p));
  assert.equal(y.carteiras[0].transf[p.s.r.id].marca, false); assert.equal(api.resumir(y).ws[1].M.rows[0].kind, 'interno');
  // desfazer: a saída continua marcada pela descrição (era assim antes)
  assert.equal(api.resumir(api.desfazerTransferencia(y, 'c1', p.s.r.id)).ws[0].M.rows[0].kind, 'interno');
  // as duas já marcadas: sem sugestão
  x = parDeCarteiras(api, { tx: [saida('2026-09-05', 15000, 'To MARIA SILVA')], over: { 'TO MARIA SILVA': '_ignore' } }, { tx: [entrada('2026-09-07', 15000, 'Pix recebido MARIA SILVA')] });
  assert.equal(sugeridas(api, x).pares.length, 0);
});

test('transferências: "Não são" não volta; cada movimento entra em um par só, o de datas mais próximas', () => {
  const api = load();
  const x = parDeCarteiras(api, { tx: [saida('2026-09-10', 10000)] }, { tx: [entrada('2026-09-12', 10000), entrada('2026-09-11', 10050)] });
  const S = sugeridas(api, x);
  assert.equal(S.pares.length, 1); assert.equal(S.pares[0].e.r.date, '2026-09-11', 'datas antes do valor');
  const y = api.dispensarSugestao(x, parDe(S.pares[0]));
  assert.equal(y.carteiras[0].sugDispensadas.length, 1); assert.deepEqual(y.carteiras[0].sugDispensadas, y.carteiras[1].sugDispensadas);
  const S2 = sugeridas(api, api.lerSalvo(JSON.stringify(y)));
  assert.equal(S2.pares.length, 1, 'a saída fica livre para a outra entrada'); assert.equal(S2.pares[0].e.r.date, '2026-09-12');
  assert.equal(sugeridas(api, api.dispensarSugestao(y, parDe(S2.pares[0]))).pares.length, 0, 'e nenhuma dispensada volta');
});

test('transferências: movimentos idênticos não se confundem, e reimportar o mesmo extrato não muda nada', () => {
  const api = load(), d = saida('2026-09-10', 5000), e = entrada('2026-09-10', 5000);
  const x = parDeCarteiras(api, { tx: [d, d.slice()] }, { tx: [e, e.slice()] });
  const S = sugeridas(api, x);
  assert.equal(S.pares.length, 2);
  assert.deepEqual(S.pares.map(p => p.s.r.id.slice(-2)).sort(), ['#1', '#2']);
  const y = api.confirmarTransferencia(x, parDe(S.pares[0])), S2 = sugeridas(api, y);
  assert.equal(S2.pares.length, 1, 'o outro par continua sugerido');
  assert.notEqual(S2.pares[0].s.r.id, S.pares[0].s.r.id);
  // reimportar os mesmos movimentos (em outra ordem): a carteira não muda, e a confirmada continua
  const c = y.carteiras[0], m = c.months['2026-09'], j = api.juntarMovimentos(m, m.slice().reverse());
  assert.equal(j.novos, 0);
  const z = { ...y, carteiras: [{ ...c, months: { '2026-09': j.lista } }, y.carteiras[1]] };
  assert.equal(api.resumir(z).ws[0].M.rows.filter(r => r.kind === 'interno').length, 1);
  assert.equal(sugeridas(api, z).pares.length, 1);
});

test('transferências: excluir uma carteira desfaz os pares dela; formato errado é erro; carteira que sumiu sai', () => {
  const api = load();
  let x = parDeCarteiras(api, { tx: [saida('2026-09-10', 10000), saida('2026-09-20', 4000)] }, { tx: [entrada('2026-09-11', 10000)] });
  x = api.novaCarteira(x, { nome: 'Terceira', moeda: 'EUR', pais: 'IE', banco: 'outro' });
  x.carteiras[2].months = { '2026-09': [entrada('2026-09-21', 4000)] };
  const S = sugeridas(api, x), p2 = S.pares.filter(p => p.e.w.id === 'c2')[0], p3 = S.pares.filter(p => p.e.w.id === 'c3')[0];
  let y = api.dispensarSugestao(api.confirmarTransferencia(x, parDe(p2)), parDe(p3));
  const z = api.excluirCarteira(y, 'c2');
  assert.deepEqual(z.carteiras[0].transf, {}); assert.equal(api.resumir(z).ws[0].M.rows[0].kind, 'gasto', 'a saída volta a ser gasto');
  assert.equal(z.carteiras[0].sugDispensadas.length, 1, 'a dispensada com a terceira fica');
  assert.equal(api.excluirCarteira(y, 'c3').carteiras[0].sugDispensadas.length, 0);
  // backup com transferência para uma carteira que não existe: a marca sai
  const orfa = { ...y, carteiras: [y.carteiras[0], y.carteiras[2]] };
  assert.deepEqual(api.migrate(JSON.parse(JSON.stringify(orfa))).carteiras[0].transf, {});
  const ruim = (c) => ({ ...y, carteiras: [{ ...y.carteiras[0], ...c }, y.carteiras[1]] });
  assert.throws(() => api.migrate(ruim({ transf: { a: { c: 'c2' } } })), /transferências em formato errado/);
  assert.throws(() => api.migrate(ruim({ transf: [] })), /transferências em formato errado/);
  assert.throws(() => api.migrate(ruim({ sugDispensadas: ['x'] })), /dispensadas em formato errado/);
  // uma carteira só de novo: a ida e volta para a v3 continua exata
  const um = api.excluirCarteira(api.excluirCarteira(y, 'c3'), 'c2');
  assert.deepEqual(um.carteiras[0].transf, {});
  assert.deepEqual(api.migrate(api.paraV3(um)).carteiras[0].months, um.carteiras[0].months);
});

test('transferências no extrato de exemplo: a diferença de valor, a de 2 dias, a entrada já marcada pelo titular e a fora da folga', () => {
  const api = load(), bytes = new Uint8Array(readFileSync(new URL('../exemplo/extrato-transferencia-exemplo.csv', import.meta.url)));
  const monta = over => {
    let x = api.migrate({ v: 3, months: months(api), over, plan: { titular: 'MARIA SILVA', moeda: 'EUR', pais: 'IE', configurado: true }, summary: null, div: null });
    x = api.novaCarteira(x, { nome: 'Banco Exemplo', moeda: 'BRL', pais: 'BR', banco: 'outro' });
    const p = api.prepararImportacao(bytes); p.mapa.valor.saidas = 'negativas';
    api.interpretarCSV(p.rows, p.mapa).tx.forEach(t => { (x.carteiras[1].months[t[0].slice(0, 7)] = x.carteiras[1].months[t[0].slice(0, 7)] || []).push(t); });
    return { ...x, cambios: { BRL: { rate: 6.2, data: '2026-09-10' } } };
  };
  const linha = p => [p.s.r.date, p.e.r.date, p.dias, Math.round(p.dif * 1000) / 10, p.ja];
  assert.deepEqual(sugeridas(api, monta({})).pares.map(linha), [
    ['2026-10-05', '2026-10-07', 2, 4.8, null],
    ['2026-08-05', '2026-08-07', 2, 0, 'e'],
    ['2026-07-05', '2026-07-06', 1, 0.5, null]
  ], 'setembro: a entrada chega 11 dias depois, fora da folga');
  // a saída já marcada por descrição: julho e outubro marcam só a entrada; agosto (as duas marcadas) some
  assert.deepEqual(sugeridas(api, monta({ 'TO MARIA SILVA': '_ignore' })).pares.map(linha), [
    ['2026-10-05', '2026-10-07', 2, 4.8, 's'],
    ['2026-07-05', '2026-07-06', 1, 0.5, 's']
  ]);
});

test('previsão com transferência sugerida ainda não confirmada: diz quanto vem dela, e o estouro até esse valor não conta', () => {
  const api = load();
  const fixo = [['2026-09-03', 'Tesco', 'Groceries', -30000, null], ['2026-09-30', 'Tesco', 'Groceries', -100, null], ['2026-10-02', 'Tesco', 'Groceries', -10000, null], ['2026-10-20', 'Tesco', 'Groceries', -100, null]];
  const x = parDeCarteiras(api, { tx: [...fixo, saida('2026-10-05', 15000)] }, { tx: [entrada('2026-10-06', 15000)] });
  const R = api.resumir(x), sug = api.sugerirTransferencias(R, x);
  assert.equal(sug.pares.length, 1);
  const sem = api.previsaoResumo(R, x), P = api.previsaoResumo(R, x, sug);
  assert.equal(sem.pend, 0, 'sem as sugestões, nada a confirmar');
  assert.equal(P.nPend, 1); assert.ok(P.pend >= 150, 'pelo menos o valor que saiu');
  const depois = api.previsaoResumo(api.resumir(api.confirmarTransferencia(x, parDe(sug.pares[0]))), x);
  assert.ok(Math.abs(P.proj - P.pend - depois.proj) < 1e-6, 'é o quanto a previsão cai ao confirmar');
  const dif = P.proj - P.meta;
  assert.ok(dif > 0 && dif <= P.pend, 'o caso do teste passa da meta só por causa da transferência');
  assert.equal(api.passaMesmo(dif, P.pend), false, 'não fica em vermelho');
  assert.equal(api.passaMesmo(dif, 0), true);
  assert.equal(api.passaMesmo(P.pend + 1, P.pend), true, 'acima do valor a confirmar, passa mesmo');
  // a saída já marcada como Entre contas suas não está no gasto: nada a confirmar na previsão
  const y = parDeCarteiras(api, { tx: [...fixo, saida('2026-10-05', 15000)], over: { 'TO FULANO EXEMPLO': '_ignore' } }, { tx: [entrada('2026-10-06', 15000)] });
  const Ry = api.resumir(y), Sy = api.sugerirTransferencias(Ry, y);
  assert.equal(Sy.pares[0].ja, 's'); assert.equal(api.previsaoResumo(Ry, y, Sy).nPend, 0);
});

// backup com várias carteiras (9.5): o Revolut inventado, o banco do exemplo de transferências (real) com as colunas
// lembradas, câmbio com data, uma transferência confirmada e uma sugestão dispensada
function backupCompleto(api) {
  const bytes = new Uint8Array(readFileSync(new URL('../exemplo/extrato-transferencia-exemplo.csv', import.meta.url)));
  const p = api.prepararImportacao(bytes); p.mapa.valor.saidas = 'negativas';
  const r = api.interpretarCSV(p.rows, p.mapa);
  const sai = [saida('2026-07-05', 15000, 'To MARIA SILVA'), saida('2026-10-05', 15000, 'To MARIA SILVA'), ['2026-10-12', 'Tesco', 'Groceries', -4210, null]];
  let x = parDeCarteiras(api, { tx: sai }, { moeda: 'BRL', tx: r.tx }, { BRL: { rate: 6.2, data: '2026-09-10' }, USD: { rate: 1.08, data: '2026-10-15' } });
  x.carteiras[1] = { ...x.carteiras[1], nome: 'Banco Exemplo', periodos: api.juntarPeriodos([], r.periodo), importacao: api.lembrarMapa({}, p.rows, p.mapa) };
  const ps = sugeridas(api, x).pares;
  assert.equal(ps.length, 2, 'julho e outubro');
  x = api.confirmarTransferencia(x, parDe(ps[1]));
  x = api.dispensarSugestao(x, parDe(ps[0]));
  return x;
}
const painel = (api, x) => {
  const R = api.resumir(x), S = api.sugerirTransferencias(R, x);
  return { R, S, C: api.transferenciasConfirmadas(R), P: api.previsaoResumo(R, x, S), meses: R.meses.map(m => api.mesResumo(R, x, m)) };
};

test('backup com várias carteiras: baixar, apagar tudo e restaurar deixa o painel idêntico', () => {
  const api = load(), x = backupCompleto(api);
  const texto = JSON.stringify({ ...x, exportadoEm: '2026-10-22T10:00:00.000Z' }, null, 1);
  // apagar tudo: nada sobra do lado de cá; o que volta vem só do texto do arquivo
  const volta = api.lerSalvo(texto, '');
  assert.deepEqual(volta, api.migrate(JSON.parse(JSON.stringify(x))), 'os dados voltam iguais');
  for (const k of ['cambios', 'config', 'ativa', 'div']) assert.deepEqual(volta[k], x[k], k);
  volta.carteiras.forEach((c, i) => {
    for (const k of ['nome', 'moeda', 'months', 'over', 'periodos', 'transf', 'sugDispensadas', 'importacao', 'metas']) assert.deepEqual(c[k], x.carteiras[i][k], c.id + ' ' + k);
  });
  assert.equal(Object.keys(volta.carteiras[0].transf).length, 1); assert.equal(volta.carteiras[0].sugDispensadas.length, 1);
  assert.deepEqual(painel(api, volta), painel(api, x), 'o painel fica idêntico');
  assert.deepEqual(api.lerSalvo(JSON.stringify(volta)), volta, 'um segundo backup do restaurado é o mesmo');
});

test('restaurar mostra um resumo por carteira antes de substituir', () => {
  const api = load(), B = api.resumoBackup(api.lerSalvo(JSON.stringify(backupCompleto(api))));
  assert.deepEqual(B.carteiras.map(c => [c.nome, c.moeda, c.meses, c.de, c.ate, c.mov, c.colunas]), [
    ['Revolut', 'EUR', 2, '2026-07-05', '2026-10-12', 3, 0],
    ['Banco Exemplo', 'BRL', 4, '2026-07-01', '2026-10-20', B.carteiras[1].mov, 1]]);
  assert.ok(B.carteiras[1].mov > 5);
  assert.deepEqual(B.cambios, [{ moeda: 'BRL', rate: 6.2, data: '2026-09-10' }, { moeda: 'USD', rate: 1.08, data: '2026-10-15' }]);
  assert.equal(B.transf, 1, 'o par conta uma vez, não uma por carteira');
  assert.equal(B.dispensadas, 1);
  assert.equal(B.moedaPrincipal, 'EUR'); assert.equal(B.titular, 'MARIA SILVA');
});

test('backups antigos continuam aceitos: v1, v2, v3 e a v4 de antes dos períodos e das transferências', () => {
  const api = load();
  const tx = [['2026-09-01', 'Tesco', 'Merchant', -1000, 0], ['2026-09-20', 'Lidl', 'Merchant', -500, 0]];
  const v1 = { months: { '2026-09': tx }, over: {}, plan: { cats: { mercado: 200 } }, summary: null };
  const v2 = { v: 2, months: { '2026-09': tx }, over: {}, plan: { titular: 'ANA', moeda: 'EUR', pais: 'IE', nomes: {} }, summary: null, div: { items: [{ id: 'd1', nome: 'X', brl: 100 }], cambio: { rate: 6 } } };
  const v3 = { v: 3, months: { '2026-09': tx }, over: {}, plan: { titular: 'ANA', moeda: 'EUR', pais: 'IE' }, summary: null, div: null };
  // v4 como era antes do 9.3/9.4: sem periodos, transf, sugDispensadas e importacao
  const v4 = { v: 4, config: { titular: 'ANA', moedaPrincipal: 'EUR' }, ativa: 'c1', cambios: { BRL: { rate: 6.1 } }, div: null,
    carteiras: [{ id: 'c1', nome: 'Revolut', moeda: 'EUR', pais: 'IE', banco: 'revolut', months: { '2026-09': tx }, over: {}, summary: null, metas: {} },
      { id: 'c2', nome: 'Nubank', moeda: 'BRL', pais: 'BR', banco: 'outro', months: {}, over: {}, summary: null, metas: {} }] };
  for (const [nome, x, n] of [['v1', v1, 1], ['v2', v2, 1], ['v3', v3, 1], ['v4 anterior', v4, 2]]) {
    const y = api.lerSalvo(JSON.stringify(x), 'MARIA SILVA'), B = api.resumoBackup(y);
    assert.equal(B.carteiras.length, n, nome);
    assert.deepEqual([B.carteiras[0].meses, B.carteiras[0].mov, B.carteiras[0].de, B.carteiras[0].ate], [1, 2, '2026-09-01', '2026-09-20'], nome + ': período vem das datas');
    assert.deepEqual(y.carteiras[0].transf, {}, nome); assert.deepEqual(y.carteiras[0].sugDispensadas, [], nome);
  }
  assert.deepEqual(api.resumoBackup(api.lerSalvo(JSON.stringify(v2))).cambios, [{ moeda: 'BRL', rate: 6, data: null }], 'o câmbio da v2 migra');
});

test('backup corrompido: lerSalvo recusa com o motivo, antes de qualquer coisa ser gravada', () => {
  const api = load(), x = JSON.parse(JSON.stringify(backupCompleto(api))), texto = JSON.stringify(x);
  const estraga = fn => { const y = JSON.parse(texto); fn(y); return JSON.stringify(y); };
  const casos = [
    [texto.slice(0, texto.length / 2), /não é JSON válido/],
    [estraga(y => { y.carteiras = {}; }), /nenhuma carteira/],
    [estraga(y => { y.carteiras[1].months['2026-07'] = 'x'; }), /mês 2026-07 em formato errado/],
    [estraga(y => { y.carteiras[1].periodos = [{ de: '01/07/2026', ate: '2026-10-20' }]; }), /períodos em formato errado na carteira c2/],
    [estraga(y => { y.carteiras[0].transf[Object.keys(y.carteiras[0].transf)[0]].lado = 'x'; }), /transferências em formato errado na carteira c1/],
    [estraga(y => { y.carteiras[0].sugDispensadas = ['[1,2]']; }), /sugestões dispensadas em formato errado/],
    [estraga(y => { y.cambios.BRL.rate = 'abc'; }), /câmbio de BRL em formato errado/],
    [estraga(y => { y.cambios.BRL.data = '10/09/2026'; }), /câmbio de BRL em formato errado/],
    [estraga(y => { y.cambios = [6.2]; }), /câmbio em formato errado/],
    [estraga(y => { y.carteiras[1].importacao = { k: { sep: ';' } }; }), /colunas do importador em formato errado na carteira c2/],
    [estraga(y => { y.carteiras[1].moeda = 'real'; }), /moeda real inválida/],
  ];
  casos.forEach(([t, erro]) => assert.throws(() => api.lerSalvo(t, ''), erro));
  assert.doesNotThrow(() => api.lerSalvo(texto, ''), 'o original continua bom');
});
