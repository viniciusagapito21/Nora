// Testes da parte pura do painel (o bloco entre /*CORE-START*/ e /*CORE-END*/ em app.js).
// Rodar com: npm test   (Node 18+; sem dependências)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { carregarNucleo, carregarXLSX, xlsxAMao, zip, gravarComBiblioteca, paraCelulas, comSenha, extratoBtgExemplo, pdfAMao, carregarPdfjs, extratoItauExemplo, itauExemploLinhas } from './planilhas.mjs';

const appJs = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
// regras (rules/) e leitores (parsers/) vêm antes do app.js, na ordem do index.html: a lista sai da própria página
const scriptsAntes = [...readFileSync(new URL('../index.html', import.meta.url), 'utf8').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(f => f !== 'app.js');
const regras = scriptsAntes.map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
const core = regras + appJs.slice(appJs.indexOf('/*CORE-START*/'), appJs.indexOf('/*CORE-END*/'));
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
  for (const f of ['index.html', 'styles.css', 'logo.svg', 'icon.svg', ...scriptsAntes]) {
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
  assert.deepEqual(api.PAISES_COM_REGRAS, ['IE', 'BR']);
  assert.equal(api.classify(tesco, {}, '', 'IE').cat, 'mercado');
  assert.equal(api.classify(tesco, {}, '').cat, 'mercado', 'sem país vale a Irlanda, como nos dados antigos');
  assert.equal(api.classify(tesco, {}, '', 'PT').cat, 'compras', 'em Portugal não há regra para Tesco');
  assert.equal(api.classify(tesco, {}, '', 'BR').cat, 'compras', 'nem no Brasil');
  assert.equal(api.classify(netflix, {}, '', 'PT').cat, 'assin');
  assert.equal(api.classify(netflix, {}, '', 'BR').cat, 'assin', 'as marcas internacionais valem também no Brasil');
  assert.equal(api.classify(tesco, { TESCO: 'mercado' }, '', 'PT').cat, 'mercado', 'a categoria escolhida à mão vale em qualquer país');
  const m = api.buildModel(months(api), {}, 'MARIA SILVA', 'PT');
  assert.equal(m.by['2026-09'].gasto, api.buildModel(months(api), {}, 'MARIA SILVA', 'IE').by['2026-09'].gasto, 'o total gasto não depende do país, só a divisão por categoria');
  assert.equal(m.by['2026-09'].spend.mercado || 0, 0, 'Tesco e Lidl não são reconhecidos em Portugal: vão para compras');
});

// ---------- regras do Brasil (rules/br.js); todas as descrições são inventadas ----------
// como vêm do importador genérico: tipo 'Others', país BR
const br = (api, desc, cents = -5000, titular = 'MARIA SILVA') => api.classify(['2026-10-05', desc, 'Others', cents, null], {}, titular, 'BR');

test('Brasil: cada palavra-chave cai na categoria certa, com ou sem acento', () => {
  const api = load();
  const casos = {
    aluguel: ['Aluguel outubro', 'IMOBILIÁRIA EXEMPLO LTDA', 'Condomínio Edifício Exemplo', 'IPTU 2026 parcela 3', 'Conta de luz Enel Exemplo', 'CEMIG DISTRIBUICAO', 'Copel', 'CPFL Paulista', 'Light Energia S.A.', 'Equatorial Pará', 'Neoenergia', 'SABESP', 'Cedae', 'Copasa', 'Sanepar', 'Embasa', 'Conta de água', 'Comgás', 'Naturgy'],
    mercado: ['Supermercado Exemplo', 'Compra cartão SUPERMERCADOS BOM PRECO', 'Mercado do Bairro', 'Atacadão', 'ASSAÍ ATACADISTA', 'Carrefour Hiper', 'Pão de Açúcar', 'Extra Hiper', 'Hortifruti Exemplo', 'Sacolão Central', 'Zaffari', 'Padaria Pão Quente', 'Panificadora Exemplo', 'Mercearia da Esquina', 'Açougue Boi Gordo'],
    transporte: ['Posto Exemplo', 'Auto Posto Avenida', 'Shell Box', 'Petrobras', 'Uber Trip', '99 Pop', '99app', 'Cabify', 'Metrô SP', 'CPTM', 'Bilhete Único recarga', 'Riocard', 'Sem Parar', 'ConectCar', 'Veloe', 'Estacionamento Shopping', 'Estapar', 'Pedágio Rodovia'],
    saude: ['Farmácia Exemplo', 'Drogaria São Bento', 'Droga Raia', 'Drogasil', 'Pague Menos', 'Panvel', 'Laboratório Exemplo', 'Clínica Sorriso', 'Odontoclinica', 'Unimed', 'Amil', 'Hapvida', 'Hospital Exemplo', 'Ótica Visão', 'Salão Beleza Pura', 'Barbearia do Zé'],
    lazer: ['Restaurante Exemplo', 'Lanchonete da Praça', 'Bar do Zé', 'Pizzaria Exemplo', 'iFood', 'IFD*IFOOD', 'Rappi', 'Zé Delivery', '99Food', 'Uber Eats', 'Café Exemplo', 'Sorveteria Gelato', 'Cinemark', 'Sympla', 'Eventim'],
    assin: ['Vivo', 'Claro S.A.', 'Claro Celular', 'TIM Celular', 'Oi Fibra', 'Globoplay', 'Deezer', 'Smart Fit', 'SmartFit', 'TotalPass', 'Wellhub'],
    compras: ['Mercado Livre', 'MERCADOLIVRE*LOJA', 'Mercado Pago', 'Magalu', 'Shopee', 'Shein', 'AliExpress', 'Americanas', 'Casas Bahia', 'Renner', 'Riachuelo', 'C&A'],
    outros: ['Tarifa pacote de serviços', 'IOF compra internacional', 'Anuidade cartão', 'Juros cheque especial', 'Multa de trânsito', 'DARF IRPF', 'DAS MEI', 'IPVA 2026']
  };
  for (const [cat, l] of Object.entries(casos)) for (const d of l) assert.equal(br(api, d).cat, cat, d);
});

test('Brasil: palavras curtas casam só como palavra inteira, e nomes comuns só com contexto', () => {
  const api = load();
  const casos = [
    ['Barbearia Corte Fino', 'saude', 'barbearia não é "bar"'],
    ['Pix enviado JOAO BARRA', 'outros', '"Barra" não é "bar"'],
    ['Adubo composto', 'outros', '"composto" não é "posto"'],
    ['Mercado Pago', 'compras', 'Mercado Pago antes de "mercado"'],
    ['Mercado Livre', 'compras', 'Mercado Livre antes de "mercado"'],
    ['Pix enviado LUZ CLARA LIGHTFOOT', 'outros', '"Light" sozinho não é a Light'],
    ['Pix enviado ANA CLARO', 'outros', '"Claro" sozinho não é a Claro'],
    ['Pix enviado TIMOTEO ZORVA', 'outros', '"TIM" sozinho não é a TIM'],
    ['Pix enviado OI MARIA', 'outros', '"Oi" sozinho não é a Oi'],
    ['Pix enviado 99 EVENTOS LTDA', 'outros', '"99" sozinho não é a 99'],
    ['Pix enviado EXTRA MOVEIS', 'outros', '"Extra" sozinho não é o mercado'],
    ['Ingresso show ao vivo', 'outros', '"ao vivo" não é a Vivo'],
    ['Padaria das Flores', 'mercado', '"das" não é o DAS do MEI'],
    ['Tarifa extrato', 'outros', 'tarifa fica em outros']
  ];
  for (const [d, cat, msg] of casos) assert.equal(br(api, d).cat, cat, msg);
});

test('Brasil: Pix, TED e DOC para empresa passam pelas regras; para pessoa ficam em outros; para você, entre contas', () => {
  const api = load();
  assert.equal(br(api, 'Pix enviado SUPERMERCADO BOM PRECO').cat, 'mercado');
  assert.equal(br(api, 'TED enviada IMOBILIARIA EXEMPLO').cat, 'aluguel');
  assert.equal(br(api, 'DOC FARMACIA EXEMPLO').cat, 'saude');
  assert.equal(br(api, 'Pix enviado MARIA OLIVEIRA').cat, 'outros', 'pessoa: sem regra');
  assert.equal(br(api, 'Pagamento de boleto').cat, 'outros', 'boleto sem nome de empresa: sem regra');
  assert.equal(br(api, 'Pagamento fatura cartão').cat, 'outros', 'fatura do cartão: sem regra (pode formar par de transferência)');
  const meu = br(api, 'Pix enviado MARIA SILVA');
  assert.equal(meu.kind, 'gasto'); assert.equal(meu.cat, 'brasil', 'para o seu nome: envio para outra conta sua');
});

test('Brasil: compra no cartão ou maquininha sem comerciante conhecido vai para Compras, sem "Compras grandes" por valor', () => {
  const api = load();
  for (const d of ['Compra cartão LOJA XYZ', 'Compra débito COMERCIAL ABC', 'Compra no crédito LOJA', 'PAG*JoseDaSilva', 'MP*LOJINHA', 'SUMUP *FEIRA', 'PICPAY*COMERCIO'])
    assert.equal(br(api, d).cat, 'compras', d);
  assert.equal(br(api, 'Compra cartão LOJA XYZ', -250000).cat, 'compras', 'R$ 2.500 continua Compras: o limite de 100 não vale em real');
  assert.equal(br(api, 'Magalu', -350000).cat, 'compras');
  assert.equal(br(api, 'Netflix', -15000).cat, 'assin');
  assert.equal(br(api, 'Compra cartão NETFLIX').cat, 'assin', 'marca conhecida vence a regra de compra genérica');
  assert.equal(br(api, 'Compra cartão FARMACIA EXEMPLO').cat, 'saude');
  assert.equal(api.classify(['2026-10-05', 'Amazon', 'Merchant', -25000, 0], {}, '', 'IE').cat, 'grandes', 'na Irlanda o limite de 100 continua');
});

test('Brasil: salário é Renda; aplicação é Investimento (guardado); resgate é Resgate de investimento; rendimento é Outras entradas', () => {
  const api = load();
  for (const d of ['Salário', 'PAGTO SALARIO EMPRESA EXEMPLO', 'Proventos', 'Folha de pagamento']) {
    const r = br(api, d, 500000); assert.equal(r.kind, 'renda', d); assert.equal(r.autoE, '_renda', d);
  }
  const ap = br(api, 'Aplicação CDB Banco Exemplo', -100000);
  assert.equal(ap.kind, 'invest'); assert.equal(ap.auto, '_invest');
  for (const d of ['Aplicação Tesouro Direto', 'Aplic. poupança']) assert.equal(br(api, d, -20000).kind, 'invest', d);
  const rs = br(api, 'Resgate CDB', 100000);
  assert.equal(rs.kind, 'invest', 'resgate não vira Renda (não infla o Entrou)'); assert.equal(rs.autoE, '_invest');
  for (const d of ['Rendimento poupança', 'Rendimentos CDB']) assert.equal(br(api, d, 4200).kind, 'outras', d);
  assert.equal(br(api, 'Pix recebido JOAO PEREIRA', 10000).kind, 'outras');
  assert.equal(br(api, 'Pix recebido MARIA SILVA', 10000).kind, 'interno', 'do seu nome: entre contas suas');
  // salário no extrato e aplicação somam como antes no mês
  const M = api.buildModel({ '2026-10': [['2026-10-01', 'Salário', 'Others', 500000, null], ['2026-10-02', 'Aplicação CDB', 'Others', -100000, null], ['2026-10-03', 'Resgate CDB', 'Others', 30000, null]] }, {}, 'MARIA SILVA', 'BR');
  assert.equal(M.by['2026-10'].renda, 5000, 'o resgate não entra na renda');
});

test('Brasil: as regras não valem para a Irlanda nem para outros países', () => {
  const api = load();
  const ie = d => api.classify(['2026-10-05', d, 'Others', -5000, null], {}, '', 'IE');
  assert.equal(ie('Supermercado Exemplo').cat, 'outros', 'a Irlanda continua com a lista dela');
  assert.equal(ie('Salário').kind, 'gasto');
  assert.equal(api.classify(['2026-10-05', 'Salário', 'Others', 500000, null], {}, '', 'IE').kind, 'outras');
  assert.equal(api.classify(['2026-10-05', 'Resgate CDB', 'Others', 500000, null], {}, '', 'PT').kind, 'outras');
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

test('Revolut, BTG e Itaú têm leitor próprio; os outros bancos usam o importador genérico', () => {
  const api = load();
  ['revolut', 'btg', 'itau'].forEach(b => assert.equal(api.temLeitor(b), true, b));
  ['aib', 'boi', 'wise', 'nubank', 'outro'].forEach(b => assert.equal(api.temLeitor(b), false, b));
  assert.deepEqual(api.BANCOS.map(b => b[0]), ['revolut', 'aib', 'boi', 'wise', 'nubank', 'btg', 'itau', 'outro']);
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
  '28/09/2026;Aluguel Zomeltu Exemplo;;-1.850,00',
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

test('a página carrega as regras de cada país e os leitores de banco antes do app.js, do próprio projeto', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const ordem = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ordem, ['rules/ie.js', 'rules/br.js', 'parsers/revolut.js', 'parsers/btg.js', 'parsers/itau.js', 'app.js']);
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

test('conferência de saldos: até R$ 0,05 de diferença é arredondamento, sem alerta e sem nota de rendimento', () => {
  const api = load(), tx = [['2026-09-15', 'Padaria Exemplo', 'Others', -1000, null]];
  const div = fim => api.conferirSaldos(tx, { '2026-09-14': 10000, '2026-09-15': fim }).divergencias;
  for (const d of [-5, -1, 1, 5]) assert.deepEqual(div(9000 + d), [], (d / 100).toFixed(2) + ': arredondamento');
  assert.equal(div(9000 - 6)[0].tipo, 'falta', '−0,06 já é diferença (falta)');
  assert.deepEqual(div(9000 + 6)[0], { de: '2026-09-14', ate: '2026-09-15', dif: 6, tipo: 'rendimento' }, '+0,06 já conta como rendimento');
  assert.deepEqual(div(9000), []);
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

// ---------- planilhas (.xls, .xlsx, HTML e XML do Excel); todas geradas aqui, com dados inventados ----------
const P = carregarNucleo(['tipoArquivo', 'prepararPlanilha', 'lerPlanilha', 'prepararImportacao', 'interpretarCSV', 'lembrarMapa', 'serialParaData', 'checarImportacao', 'perguntasImportacao']);
const XL = carregarXLSX();
const exemplo = f => new Uint8Array(readFileSync(new URL('../exemplo/' + f, import.meta.url)));
const interpretar = p => P.interpretarCSV(p.rows, p.mapa);
const htmlXls = (linhas, cod = 'utf-8') => {
  const t = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=' + cod + '"><style>td{mso-number-format:"\\@"}</style></head><body><table>' +
    linhas.map(l => '<tr>' + l.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</table></body></html>';
  return cod === 'utf-8' ? new Uint8Array(Buffer.from(t)) : new Uint8Array(Buffer.from(t, 'latin1'));
};

test('planilha: o tipo vem do conteúdo, não da extensão', () => {
  const xlsx = xlsxAMao([{ nome: 'A', linhas: [['Data', 'Descrição', 'Valor']] }]);
  assert.equal(P.tipoArquivo(xlsx), 'xlsx');
  assert.equal(P.tipoArquivo(gravarComBiblioteca(XL, [['Data', 'Valor']], 'xls')), 'xls', 'xls binário (Excel 97 em diante)');
  assert.equal(P.tipoArquivo(htmlXls([['Data', 'Descrição', 'Valor']])), 'html', 'HTML disfarçado de .xls');
  assert.equal(P.tipoArquivo(new Uint8Array(Buffer.from('\uFEFF  \n<HTML><BODY><TABLE><TR><TD>x</TD></TR></TABLE>'))), 'html', 'com BOM, espaços e maiúsculas');
  assert.equal(P.tipoArquivo(new Uint8Array(Buffer.from('<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="A"></Worksheet></Workbook>'))), 'xml');
  assert.equal(P.tipoArquivo(new Uint8Array(Buffer.from('Data\tDescrição\tValor\n01/10/2026\tPadaria\t-12,50\n'))), 'texto', 'texto com tabulação segue o caminho do CSV');
  assert.equal(P.tipoArquivo(exemplo('extrato-generico-exemplo.csv')), 'texto');
  assert.equal(P.tipoArquivo(new Uint8Array(Buffer.from('%PDF-1.7\n...'))), 'pdf');
  assert.equal(P.tipoArquivo(zip({ 'word/document.xml': '<w:document/>' })), 'zip', 'zip que não é planilha (um .docx, por exemplo)');
  assert.equal(P.tipoArquivo(new Uint8Array(0)), 'vazio');
  assert.equal(P.tipoArquivo(new Uint8Array(Buffer.from('<p>sem tabela</p>'))), 'texto');
});

test('planilha: .xlsx montado à mão, com datas de verdade, números e acentos', () => {
  const linhas = [['Banco Exemplo - Extrato'], [], ['Data', 'Histórico', 'Valor (R$)', 'Saldo'],
    [{ data: '2026-10-01' }, 'Padaria Pão Quente', -18.9, 981.1], [{ data: '2026-10-02' }, 'Salário Empresa Exemplo', 4800, 5781.1],
    [{ data: '2026-10-03' }, 'Farmácia São João', -1234.56, 4546.54]];
  const p = P.prepararPlanilha(XL, xlsxAMao([{ nome: 'Extrato', linhas }]), 'xlsx');
  assert.equal(p.sep, 'planilha'); assert.equal(p.mapa.cab, 2); assert.deepEqual(p.abas, ['Extrato']);
  assert.deepEqual(p.rows[3], ['2026-10-01', 'Padaria Pão Quente', '-18.9', '981.1'], 'data como ano-mês-dia, número com ponto');
  assert.equal(p.mapa.fmtData, 'ymd', 'data de verdade não pergunta dia/mês');
  const r = interpretar(p);
  assert.deepEqual(r.tx.map(t => t.slice(0, 4)), [['2026-10-01', 'Padaria Pão Quente', 'Others', -1890], ['2026-10-02', 'Salário Empresa Exemplo', 'Others', 480000], ['2026-10-03', 'Farmácia São João', 'Others', -123456]]);
});

test('planilha: .xlsx e .xls gravados com o extrato genérico de exemplo dão os mesmos movimentos que o CSV', () => {
  const csv = P.prepararImportacao(exemplo('extrato-generico-exemplo.csv')), daCsv = interpretar(csv);
  assert.ok(daCsv.tx.length > 20);
  for (const tipo of ['xlsx', 'xls']) {
    const bytes = gravarComBiblioteca(XL, paraCelulas(csv.rows, 'virgula'), tipo);
    assert.equal(P.tipoArquivo(bytes), tipo);
    const p = P.prepararPlanilha(XL, bytes, tipo);
    assert.equal(p.mapa.cab, csv.mapa.cab, tipo);
    assert.deepEqual(interpretar(p).tx, daCsv.tx, tipo + ': mesmos movimentos, datas, valores e descrições');
    assert.deepEqual(interpretar(p).periodo, daCsv.periodo, tipo + ': o período escrito no cabeçalho ("01/08/2026 a 15/10/2026") também');
  }
});

test('planilha: HTML disfarçado de .xls, em UTF-8 e em Latin-1, com 1.234,56 como texto', () => {
  const linhas = [['Data', 'Descrição', 'Valor'], ['01/10/2026', 'Açougue Boi Gordo', '-1.234,56'], ['02/10/2026', 'Pix recebido JOÃO', '80,00']];
  for (const cod of ['utf-8', 'iso-8859-1']) {
    const b = htmlXls(linhas, cod), p = P.prepararPlanilha(XL, b, P.tipoArquivo(b));
    assert.deepEqual(p.rows[1], ['01/10/2026', 'Açougue Boi Gordo', '-1.234,56'], cod + ': o texto fica como está, com acentos');
    assert.equal(p.mapa.fmtNum, 'virgula');
    // data em texto 01/10/2026 é ambígua: o importador pergunta, como no CSV; aqui a "pessoa" responde
    assert.deepEqual(P.perguntasImportacao(p.rows, p.mapa).map(q => q.id), ['fmtData', 'sinal']);
    p.mapa.fmtData = 'dmy'; p.mapa.valor.saidas = 'negativas';
    assert.deepEqual(interpretar(p).tx.map(t => [t[0], t[3]]), [['2026-10-01', -123456], ['2026-10-02', 8000]]);
  }
});

test('planilha: várias abas; usa a primeira com cabeçalho e deixa escolher outra', () => {
  const abas = [{ nome: 'Resumo', linhas: [['Resumo do mês'], ['Total gasto', 1200]] },
    { nome: 'Extrato', linhas: [['Data', 'Descrição', 'Valor'], [{ data: '2026-10-01' }, 'Padaria Exemplo', -10]] },
    { nome: 'Vazia', linhas: [] }];
  const b = xlsxAMao(abas), p = P.prepararPlanilha(XL, b, 'xlsx');
  assert.deepEqual(p.abas, ['Resumo', 'Extrato'], 'aba vazia não aparece');
  assert.equal(p.aba, 1); assert.equal(interpretar(p).tx.length, 1);
  const q = P.prepararPlanilha(XL, b, 'xlsx', null, 0);
  assert.equal(q.aba, 0); assert.equal(q.mapa.cab, -1, 'na aba de resumo não há cabeçalho');
});

test('planilha: saldo diário em linha própria, cabeçalho repetido por página e células mescladas, igual ao CSV', () => {
  const csv = P.prepararImportacao(exemplo('extrato-saldo-diario-exemplo.csv')), daCsv = interpretar(csv);
  assert.ok(Object.keys(daCsv.saldos).length > 3, 'o exemplo tem saldos do dia');
  const linhas = paraCelulas(csv.rows, 'ponto');
  // mescla o título da página e as colunas vazias ao lado de "Transação" e "Descrição", como nos extratos em PDF convertidos
  const mescladas = ['B1:I1'];
  csv.rows.forEach((r, i) => { if (String(r[1]).trim() === 'Data e hora' || /^\d{2}\/\d{2}\/\d{4}/.test(String(r[1]))) mescladas.push(`D${i + 1}:F${i + 1}`, `G${i + 1}:J${i + 1}`); });
  const p = P.prepararPlanilha(XL, xlsxAMao([{ nome: 'Extrato', linhas, mescladas }]), 'xlsx');
  assert.ok(csv.rows.filter(r => String(r[1]).trim() === 'Data e hora').length > 1, 'o cabeçalho se repete');
  assert.equal(p.mapa.saldoLinhas, csv.mapa.saldoLinhas, 'reconhece as linhas "Saldo Diário"');
  const r = interpretar(p);
  assert.deepEqual(r.tx, daCsv.tx, 'mesmos movimentos');
  assert.deepEqual(r.saldos, daCsv.saldos, 'mesmos saldos do dia');
});

test('planilha: as datas não mudam com o fuso do computador, nem no calendário de 1904', () => {
  const esperado = ['2026-03-29', '2026-03-29', '2026-10-25', '2026-12-31', '2027-01-01'];
  const roteiro = fileURLToPath(new URL('./fuso-planilha.mjs', import.meta.url));
  for (const TZ of ['Europe/Dublin', 'America/Sao_Paulo', 'Pacific/Auckland']) {
    const r = JSON.parse(execFileSync(process.execPath, [roteiro], { env: { ...process.env, TZ }, encoding: 'utf8' }));
    assert.equal(r.fuso, TZ);
    assert.deepEqual(r.d1900, esperado, TZ + ', calendário de 1900');
    assert.deepEqual(r.d1904, esperado, TZ + ', calendário de 1904');
    assert.deepEqual(r.biblioteca, esperado, TZ + ', gravada pelo SheetJS');
  }
  assert.equal(P.serialParaData(46296), '2026-10-01');
  assert.equal(P.serialParaData(46296 - 1462, true), '2026-10-01', 'no calendário de 1904 o mesmo dia tem número 1462 menor');
  assert.equal(P.serialParaData(46296.9999), '2026-10-01', '23:59 continua no mesmo dia');
});

test('planilha: o formato lembrado pula as perguntas na próxima planilha com o mesmo cabeçalho', () => {
  const linhas = [['Data', 'Histórico', 'Débito', 'Crédito'], [{ data: '2026-10-01' }, 'Padaria Exemplo', 10.5, null], [{ data: '2026-10-02' }, 'Salário', null, 4800]];
  const b = xlsxAMao([{ nome: 'Extrato', linhas }]), p = P.prepararPlanilha(XL, b, 'xlsx');
  p.mapa.valor = { modo: 'duas', saida: 2, entrada: 3 };
  const lem = P.lembrarMapa({}, p.rows, p.mapa);
  assert.equal(Object.values(lem)[0].sep, 'planilha');
  assert.doesNotThrow(() => P.checarImportacao(lem, 'c1'), 'o backup aceita o separador "planilha"');
  const q = P.prepararPlanilha(XL, b, 'xlsx', lem);
  assert.equal(q.lembrado, true); assert.deepEqual(q.mapa.valor, { modo: 'duas', saida: 2, entrada: 3 });
  assert.deepEqual(interpretar(q).tx.map(t => t[3]), [-1050, 480000]);
  // um CSV com o mesmo cabeçalho não usa o formato da planilha (as posições podem ser outras)
  const c = P.prepararImportacao(new Uint8Array(Buffer.from('Data;Histórico;Débito;Crédito\n01/10/2026;Padaria;10,50;\n')), lem);
  assert.equal(c.lembrado, false);
});

test('planilha com problema: nada é lido pela metade', () => {
  const b = gravarComBiblioteca(XL, [['Data', 'Descrição', 'Valor'], ...Array.from({ length: 300 }, (_, i) => [{ data: '2026-10-01' }, 'Compra ' + i, -i])], 'xlsx');
  assert.throws(() => P.prepararPlanilha(XL, b.slice(0, Math.floor(b.length / 2)), 'xlsx'), /danificada|nenhuma tabela/, 'arquivo cortado ao meio');
  assert.throws(() => P.prepararPlanilha(XL, gravarComBiblioteca(XL, [[1, 2]], 'xls').slice(0, 600), 'xls'), /danificada|nenhuma tabela/, 'xls cortado');
  assert.throws(() => P.prepararPlanilha(XL, xlsxAMao([{ nome: 'A', linhas: [] }]), 'xlsx'), /nenhuma tabela/);
  const grande = new Uint8Array(15 * 1024 * 1024 + 1); grande.set([0x50, 0x4B, 0x03, 0x04]);
  assert.throws(() => P.prepararPlanilha(XL, grande, 'xlsx'), /15 MB/);
  const muitas = gravarComBiblioteca(XL, Array.from({ length: 20001 }, (_, i) => ['linha', i]), 'xlsx');
  assert.throws(() => P.prepararPlanilha(XL, muitas, 'xlsx'), /20\.000 linhas/);
  // aba e cabeçalho com nomes que tentariam mexer no protótipo dos objetos
  const p = P.prepararPlanilha(XL, xlsxAMao([{ nome: '__proto__', linhas: [['__proto__', 'constructor', 'Valor'], [{ data: '2026-10-01' }, 'x', 1]] }]), 'xlsx');
  assert.deepEqual(p.abas, ['__proto__']);
  assert.equal({}.polluted, undefined); assert.equal(Object.prototype.Valor, undefined); assert.equal(typeof {}.constructor, 'function');
  // e a leitura seguinte, na mesma instância do leitor, sai igual à de uma instância nova
  const outra = xlsxAMao([{ nome: 'Extrato', linhas: [['Data', 'Descrição', 'Valor'], [{ data: '2026-10-02' }, 'Padaria Exemplo', -10]] }]);
  assert.deepEqual(P.prepararPlanilha(XL, outra, 'xlsx').rows, P.prepararPlanilha(carregarXLSX(), outra, 'xlsx').rows);
});

test('planilha com senha: reconhecida pelo conteúdo, com um aviso que diz o que fazer (e não "danificada")', () => {
  const b = comSenha(XL);
  assert.equal(P.tipoArquivo(b), 'senha', 'mesmo com extensão .xlsx, é um contêiner do Office com EncryptedPackage');
  assert.equal(P.tipoArquivo(gravarComBiblioteca(XL, [['Data', 'Valor']], 'xls')), 'xls', 'um .xls comum continua .xls');
  // se chegar ao leitor por outro caminho, o erro da biblioteca vira o mesmo aviso
  assert.throws(() => P.prepararPlanilha(XL, b, 'xls'), /protegida por senha. Abra no Excel e salve sem senha, ou baixe o extrato em CSV/);
});

test('leitor de planilhas: o arquivo do projeto é o conferido, e a página não o carrega de início', () => {
  const lib = readFileSync(new URL('../vendor/sheetjs/xlsx.core.min.js', import.meta.url));
  const sha = createHash('sha256').update(lib).digest('hex');
  const versao = readFileSync(new URL('../vendor/sheetjs/VERSAO.md', import.meta.url), 'utf8');
  assert.match(versao, new RegExp('xlsx\\.core\\.min\\.js.*' + sha), 'o SHA-256 anotado em VERSAO.md é o do arquivo');
  assert.equal(XL.version, '0.20.3');
  assert.match(readFileSync(new URL('../vendor/sheetjs/LICENSE', import.meta.url), 'utf8'), /Apache License/);
  assert.doesNotMatch(lib.toString(), /\bfetch\(|XMLHttpRequest|importScripts/, 'o leitor não acessa a rede');
  assert.doesNotMatch(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /vendor\//);
  assert.match(appJs, /s\.src = 'vendor\/sheetjs\/xlsx\.core\.min\.js'/);
});

// ---------- segurança de conteúdo (CSP) ----------
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'";

test('CSP: a política vem logo depois do charset, com no-referrer, e a página não tem script nem estilo inline', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const metas = [...html.matchAll(/<meta [^>]*>/g)].map(m => m[0]);
  assert.equal(metas[0], '<meta charset="utf-8">');
  assert.equal(metas[1], `<meta http-equiv="Content-Security-Policy" content="${CSP}">`, 'a política, igual à aprovada');
  assert.equal(metas[2], '<meta name="referrer" content="no-referrer">');
  assert.ok(html.indexOf('Content-Security-Policy') < html.search(/<(link|script|style)\b/), 'antes de qualquer arquivo');
  assert.doesNotMatch(html, /<style\b/, 'nenhum bloco <style>');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'nenhum <script> sem src');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'nenhum atributo onclick=, onload=…');
  for (const f of ['app.js', ...scriptsAntes]) {
    const s = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.doesNotMatch(s, /\son(click|change|input|load|error|submit|focus|blur|key\w*|mouse\w*|pointer\w*|touch\w*)\s*=/i, f + ' gera atributo on…=');
    assert.doesNotMatch(s, /javascript:/i, f);
    assert.doesNotMatch(s, /\beval\s*\(|new Function\s*\(/, f + ' usa eval ou new Function (a CSP bloquearia)');
    assert.doesNotMatch(s, /<style\b/, f + ' gera bloco <style>');
  }
});

test('CSP não restringe navegação: nenhum código do projeto navega, abre janela ou manda beacon', () => {
  // navegação de verdade: location sozinho ou de window/document/self/top/parent (não a propriedade "location" de
  // outro objeto, que o SheetJS usa para hiperlinks e arquivos do Numbers), open( sozinho ou window.open, e sendBeacon
  const NAVEGA = [
    /(?<![\w$.\]])location\s*(?:=(?!=)|\.\s*(?:href|assign|replace)\b)/,
    /\b(?:window|document|self|top|parent|globalThis)\s*\.\s*location\b/,
    /(?<![\w$.])open\s*\(/, /\bwindow\s*\.\s*open\b/, /sendBeacon/
  ];
  for (const f of ['app.js', ...scriptsAntes, 'vendor/sheetjs/xlsx.core.min.js']) {
    const s = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    for (const re of NAVEGA) assert.doesNotMatch(s, re, f + ': ' + re);
  }
});

// ---------- leitores de banco (parsers/) ----------
test('leitores: todos seguem o contrato, e o banco é reconhecido pelo conteúdo', () => {
  const L = carregarNucleo(['LEITORES', 'detectarBanco', 'parseCSV', 'decodificar', 'extractTx', 'moedasNoExtrato', 'extractSummary', 'temLeitor']);
  for (const [id, l] of Object.entries(L.LEITORES)) {
    assert.equal(l.id, id); assert.equal(typeof l.nome, 'string');
    assert.equal(typeof l.reconhece, 'function'); assert.equal(typeof l.ler, 'function');
    assert.ok(L.temLeitor(id));
  }
  const linhas = f => L.parseCSV(L.decodificar(exemplo(f)).texto);
  assert.equal(L.detectarBanco(linhas('extrato-exemplo.csv')), 'revolut');
  for (const f of ['extrato-generico-exemplo.csv', 'extrato-transferencia-exemplo.csv'])
    assert.equal(L.detectarBanco(L.parseCSV(L.decodificar(exemplo(f)).texto, ';')), null, f + ': sem leitor próprio');
  assert.equal(L.detectarBanco(linhas('extrato-saldo-diario-exemplo.csv')), 'btg', 'o CSV na estrutura do BTG é reconhecido pelo cabeçalho');
  assert.equal(L.detectarBanco([['Type', 'Product', 'Started Date', 'Completed Date', 'Description', 'Amount']]), 'revolut', 'extrato comum do Revolut');
  assert.equal(L.detectarBanco([]), null);
  // ler devolve o contrato, com o mesmo resultado das funções de antes
  const r = linhas('extrato-exemplo.csv'), lido = L.LEITORES.revolut.ler(r, 'EUR');
  assert.deepEqual(Object.keys(lido).sort(), ['moedas', 'periodo', 'saldos', 'tx']);
  assert.deepEqual(lido.tx, L.extractTx(r, 'EUR'));
  assert.deepEqual(lido.moedas, L.moedasNoExtrato(r));
  assert.deepEqual(lido.saldos, L.extractSummary(r));
  assert.equal(lido.periodo, null, 'o Revolut não informa o período: vale a primeira e a última data');
  assert.ok(lido.tx.every(t => /^\d{4}-\d{2}-\d{2}$/.test(t[0]) && Number.isInteger(t[3])), 'data ISO e centavos inteiros');
  assert.deepEqual([...new Set(lido.tx.map(t => t[2]))].sort(), ['Exchange', 'Merchant', 'Others'], 'tipos do vocabulário da classificação');
});

// ---------- exemplo do BTG (exemplo/extrato-btg-exemplo.xls): inventado, na estrutura do .xls real ----------
test('exemplo do BTG: o arquivo é exatamente o que o gerador produz (não é editado à mão)', () => {
  // instância nova do SheetJS: ler certos arquivos (como uma aba chamada __proto__) muda o arranjo dos bytes que a
  // mesma instância grava depois (o conteúdo é o mesmo); o painel só lê, e o gerador sempre roda numa instância nova
  assert.ok(Buffer.from(exemplo('extrato-btg-exemplo.xls')).equals(Buffer.from(extratoBtgExemplo(carregarXLSX()))), 'rode node scripts/gerar-exemplos.mjs');
});

test('exemplo do BTG: páginas com topo e cabeçalho repetidos e mesclas; o importador genérico lê tudo', () => {
  const b = exemplo('extrato-btg-exemplo.xls');
  assert.equal(P.tipoArquivo(b), 'xls');
  const wb = XL.read(b, { type: 'array', cellNF: true }), ws = wb.Sheets[wb.SheetNames[0]];
  const linhasCom = t => Object.keys(ws).filter(k => k[0] !== '!' && ws[k].v === t).map(k => XL.utils.decode_cell(k).r);
  assert.equal(linhasCom('Extrato de conta corrente').length, 3, 'três páginas');
  assert.equal(linhasCom('Cliente:').length, 3, 'o bloco do topo em cada página');
  const cabs = linhasCom('Data e hora');
  assert.equal(cabs.length, 4, 'cabeçalho da tabela: um por página e mais um no meio da página 2');
  const titulos = linhasCom('Extrato de conta corrente').sort((a, b) => a - b);
  assert.ok(cabs.some(r => r > titulos[1] + 11 && r < titulos[2]), 'um cabeçalho no meio da página 2, longe do topo');
  const mesc = ws['!merges'].map(m => XL.utils.encode_range(m));
  for (const t of titulos) for (const ref of [`B${t + 1}:H${t + 1}`, `C${t + 3}:K${t + 3}`, `M${t + 3}:N${t + 7}`, `C${t + 4}:D${t + 4}`]) assert.ok(mesc.includes(ref), 'mescla do topo ' + ref);
  // o importador genérico (sem leitor do BTG): cabeçalho, saldo do dia, período do arquivo
  const p = P.prepararPlanilha(XL, b, 'xls');
  assert.equal(p.mapa.cab, 10); assert.equal(p.mapa.saldoLinhas, 'Saldo Diário');
  assert.deepEqual(P.perguntasImportacao(p.rows, p.mapa).map(q => q.id), ['sinal']);
  p.mapa.valor.saidas = 'negativas';
  const r = interpretar(p);
  assert.equal(r.tx.length, 24); assert.equal(Object.keys(r.saldos).length, 22);
  assert.deepEqual(r.periodo, { de: '2026-08-01', ate: '2026-10-15', fonte: 'arquivo' });
  assert.ok(r.ignoradas.every(x => x.motivo === 'sem data válida'), 'só os blocos de topo, cabeçalhos e rodapés ficam de fora');
  // saldos coerentes: só o rendimento de 0,42 aparece; os 0,03 são arredondamento
  const S = carregarNucleo(['conferirSaldos']);
  assert.deepEqual(S.conferirSaldos(r.tx, r.saldos).divergencias, [{ de: '2026-08-12', ate: '2026-08-15', dif: 42, tipo: 'rendimento' }]);
  // "Saldo atual" do topo igual ao último saldo do dia
  const atual = linhasCom('Saldo atual:').map(rr => ws['J' + (rr + 1)].v);
  assert.deepEqual(atual, [4793.47, 4793.47, 4793.47]); assert.equal(r.saldos['2026-10-14'], 479347);
  // a fatura do cartão vem com a categoria "Contas" do BTG; o genérico só olha a descrição: Pessoas, taxas e outros
  const fatura = Object.keys(ws).filter(k => ws[k].v === 'Pagamento de fatura do cartão').map(k => XL.utils.decode_cell(k).r);
  assert.equal(fatura.length, 3);
  assert.ok(fatura.every(rr => ws['C' + (rr + 1)].v === 'Contas'));
  const A = load(), c = A.classify(r.tx.find(t => t[1] === 'CARTÃO EXEMPLO'), {}, 'MARIA EXEMPLO', 'BR');
  assert.equal(c.cat, 'outros', 'a fatura não vai para Aluguel e contas');
});

// ---------- leitor do BTG (parsers/btg.js), com o exemplo inventado ----------
const B = carregarNucleo(['LEITORES', 'detectarBanco', 'prepararPlanilha', 'prepararImportacao', 'interpretarCSV', 'perguntasImportacao', 'classify', 'juntarMovimentos']);
const linhasBtg = (extra = {}) => B.prepararPlanilha(carregarXLSX(), extratoBtgExemplo(carregarXLSX(), extra), 'xls').rows;
const semTipo = tx => tx.map(t => [t[0], t[1], t[3], t[4]]);

test('BTG: reconhecido sozinho pelo cabeçalho, no .xls e no CSV; Revolut e genérico não se confundem', () => {
  assert.equal(B.detectarBanco(linhasBtg()), 'btg');
  assert.equal(B.detectarBanco(B.prepararImportacao(exemplo('extrato-saldo-diario-exemplo.csv')).rows), 'btg');
  assert.equal(B.detectarBanco(B.prepararImportacao(exemplo('extrato-exemplo.csv')).rows), 'revolut');
  for (const f of ['extrato-generico-exemplo.csv', 'extrato-transferencia-exemplo.csv']) assert.equal(B.detectarBanco(B.prepararImportacao(exemplo(f)).rows), null, f);
  // só os cinco rótulos, na ordem do banco: com uma coluna a mais no cabeçalho, não é o BTG
  assert.equal(B.detectarBanco([['Data e hora', 'Categoria', 'Transação', 'Descrição', 'Valor', 'Saldo']]), null);
});

test('BTG: o mesmo resultado do importador genérico (movimentos, saldos do dia e período), sem perguntas', () => {
  const rows = linhasBtg(), L = B.LEITORES.btg.ler(rows, 'BRL');
  const g = B.prepararPlanilha(XL, exemplo('extrato-btg-exemplo.xls'), 'xls'); g.mapa.valor.saidas = 'negativas';
  const r = B.interpretarCSV(g.rows, g.mapa);
  assert.deepEqual(semTipo(L.tx), semTipo(r.tx), 'mesmos movimentos: data, descrição, valor e saldo');
  assert.deepEqual(L.saldosDia, r.saldos); assert.deepEqual(L.periodo, r.periodo);
  assert.deepEqual(L.periodo, { de: '2026-08-01', ate: '2026-10-15', fonte: 'arquivo' });
  assert.equal(L.saldoAtual, 479347, '"Saldo atual" do topo, igual ao último saldo do dia');
  assert.deepEqual(B.perguntasImportacao(L.previa.rows, L.previa.mapa), [], 'primeira importação sem perguntas');
  const pr = B.interpretarCSV(L.previa.rows, L.previa.mapa);
  assert.deepEqual(pr.ignoradas, [], 'topo, cabeçalhos repetidos (inclusive o do meio da página) e rodapé pulados');
  assert.deepEqual(pr.linhas, r.linhas, 'cada movimento com o número de linha do arquivo');
  // o CSV de saldo diário (estrutura do BTG): mesmos movimentos que o genérico; o rodapé de outro texto continua listado
  const c = B.prepararImportacao(exemplo('extrato-saldo-diario-exemplo.csv')); c.mapa.valor.saidas = 'negativas';
  const Lc = B.LEITORES.btg.ler(c.rows, 'BRL');
  assert.deepEqual(semTipo(Lc.tx), semTipo(B.interpretarCSV(c.rows, c.mapa).tx));
  assert.equal(Lc.saldoAtual, 604210);
  assert.ok(B.interpretarCSV(Lc.previa.rows, Lc.previa.mapa).ignoradas.every(x => /SAC|CNPJ/.test(x.celulas.join(' '))), 'rodapé que não é o do BTG não é adivinhado');
});

test('BTG: o tipo vem de "Transação" e de Categoria "Investimentos"; o resto segue o caminho genérico', () => {
  const L = B.LEITORES.btg.ler(linhasBtg(), 'BRL'), cl = t => B.classify(t, {}, 'MARIA EXEMPLO', 'BR');
  const achar = (desc, sinal, tipo) => L.tx.filter(t => t[1] === desc && Math.sign(t[3]) === sinal && (!tipo || t[2] === tipo));
  // Categoria "Investimentos" + Transferência enviada/recebida com o titular: Investimentos e Resgate de investimento
  const [apl] = achar('MARIA EXEMPLO', -1, 'Invest'), [res] = achar('MARIA EXEMPLO', 1, 'Invest');
  assert.equal(apl[3], -50000); assert.equal(cl(apl).kind, 'invest', 'saída: Investimentos (guardado)');
  assert.equal(res[3], 30000); assert.equal(cl(res).kind, 'invest'); assert.equal(cl(res).autoE, '_invest', 'entrada: Resgate de investimento');
  // CDB pela Transação (as duas grafias do arquivo)
  achar('CDB EXEMPLO', -1).concat(achar('CDB EXEMPLO', 1)).forEach(t => { assert.equal(t[2], 'Invest'); assert.equal(cl(t).kind, 'invest'); });
  // a mesma transferência com o titular, com outra categoria: caminho genérico (envio para outra conta sua / entre contas)
  const env = achar('MARIA EXEMPLO', -1).find(t => t[2] === 'Others' && t[3] === -60000);
  assert.ok(env, 'Transferência enviada com Categoria "Transferência"'); assert.equal(cl(env).cat, 'brasil');
  assert.equal(cl(achar('MARIA EXEMPLO', 1).find(t => t[2] === 'Others')).kind, 'interno');
  // fatura com Categoria "Contas": Pessoas, taxas e outros (não Aluguel e contas), mesmo com descrição de comerciante
  const fat = L.tx.filter(t => t[2] === 'Fatura');
  assert.equal(fat.length, 3); fat.forEach(t => assert.equal(cl(t).cat, 'outros'));
  assert.equal(cl(['2026-10-10', 'SUPERMERCADO EXEMPLO', 'Fatura', -50000, null]).cat, 'outros', 'a regra de mercado não vale para a fatura');
  // Pix para empresa: regras do Brasil; Categoria "Contas" não é lida
  assert.equal(cl(L.tx.find(t => t[1] === 'ENERGIA EXEMPLO S.A.')).cat, 'outros', 'Pix enviado com Categoria "Contas": só a descrição conta');
  assert.equal(cl(L.tx.find(t => t[1] === 'IMOBILIARIA EXEMPLO')).cat, 'aluguel');
  // nome de Transação que não existe no extrato real: tipo genérico, sem adivinhação
  const rows = linhasBtg(), i = rows.findIndex(r => r.includes('ANA EXEMPLO'));
  rows[i] = rows[i].map(c => (c === 'Pix enviado' ? 'Compra no débito' : c));
  assert.equal(B.LEITORES.btg.ler(rows, 'BRL').tx.find(t => t[1] === 'ANA EXEMPLO')[2], 'Others');
});

test('BTG: "Saldo atual" lido para conferir, moeda errada não lê nada, e dados pessoais do topo nunca saem', () => {
  assert.equal(B.LEITORES.btg.ler(linhasBtg({ saldoAtualExtra: 1234 }), 'BRL').saldoAtual, 479347 + 1234);
  const eur = B.LEITORES.btg.ler(linhasBtg(), 'EUR');
  assert.deepEqual([eur.tx, eur.moedas], [[], ['BRL']]);
  const L = B.LEITORES.btg.ler(linhasBtg(), 'BRL'), tudo = JSON.stringify(L);
  for (const x of ['000.000.000-00', '0000000-0', 'Cliente:', 'CPF:', 'Agência:', 'Conta:', 'Lançamentos:']) assert.ok(!tudo.includes(x), x + ' não sai do leitor');
  assert.ok(!L.previa.rows.some(r => r.includes('MARIA EXEMPLO') && r.length < 5), 'o nome do topo não vai para a prévia (só as descrições de movimentos)');
});

test('BTG: um extrato já importado pelo genérico não duplica quando o leitor lê de novo', () => {
  const g = B.prepararPlanilha(XL, exemplo('extrato-btg-exemplo.xls'), 'xls'); g.mapa.valor.saidas = 'negativas';
  const antes = {};
  B.interpretarCSV(g.rows, g.mapa).tx.forEach(t => { (antes[t[0].slice(0, 7)] = antes[t[0].slice(0, 7)] || []).push(t); });
  const L = B.LEITORES.btg.ler(linhasBtg(), 'BRL'), porMes = {};
  L.tx.forEach(t => { (porMes[t[0].slice(0, 7)] = porMes[t[0].slice(0, 7)] || []).push(t); });
  for (const m in porMes) { const j = B.juntarMovimentos(antes[m], porMes[m]); assert.equal(j.novos, 0, m); assert.equal(j.repetidos, porMes[m].length, m); }
});

// ---------- pdf.js (vendor/pdfjs): leitor de PDF, carregado só quando a pessoa escolhe um PDF ----------
test('leitor de PDF: os arquivos do projeto são os conferidos, e a página não os carrega de início', async () => {
  const versao = readFileSync(new URL('../vendor/pdfjs/VERSAO.md', import.meta.url), 'utf8');
  for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
    const sha = createHash('sha256').update(readFileSync(new URL('../vendor/pdfjs/' + f, import.meta.url))).digest('hex');
    assert.match(versao, new RegExp('`' + f.replace(/\./g, '\\.') + '` \\| `' + sha + '`'), 'o SHA-256 anotado em VERSAO.md é o de ' + f);
  }
  const pdfjs = await import(new URL('../vendor/pdfjs/pdf.min.mjs', import.meta.url));
  assert.equal(pdfjs.version, '6.4.299');
  assert.match(readFileSync(new URL('../vendor/pdfjs/LICENSE', import.meta.url), 'utf8'), /Apache License/);
  assert.doesNotMatch(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /pdfjs/);
});

test('leitor de PDF: só os 4 trechos conhecidos parecem navegação, e nenhum navega', () => {
  // as mesmas expressões do teste de navegação do projeto; no pdf.js há 3 leituras de window.location (montar
  // endereço, comparar origem) e o texto "window.open" numa lista de ações de JavaScript de PDF
  const NAVEGA = [/(?<![\w$.\]])location\s*(?:=(?!=)|\.\s*(?:href|assign|replace)\b)/g, /\b(?:window|document|self|top|parent|globalThis)\s*\.\s*location\b/g,
    /(?<![\w$.])open\s*\(/g, /\bwindow\s*\.\s*open\b/g, /sendBeacon/g];
  const achados = f => { const s = readFileSync(new URL('../vendor/pdfjs/' + f, import.meta.url), 'utf8'); return NAVEGA.flatMap(re => [...s.matchAll(re)].map(m => s.slice(m.index - 20, m.index + 25))); };
  const a = achados('pdf.min.mjs'), w = achados('pdf.worker.min.mjs');
  assert.equal(a.length, 3); assert.ok(a.every(t => /window\.location[,)]/.test(t)), 'só leituras de window.location');
  assert.equal(w.length, 1); assert.match(w[0], /"window\.open"/, 'só o texto "window.open" numa lista');
});

// ---------- PDF: lerPdf (pdf.js do projeto) e tabelaDoPdf; PDFs inventados, montados à mão ----------
const D = carregarNucleo(['lerPdf', 'tabelaDoPdf', 'tipoArquivo']);
const cab = (y = 245) => [{ s: 'data', x: 31, y }, { s: 'lançamentos', x: 96, y }, { s: 'valor (R$)', dir: 466, y }, { s: 'saldo (R$)', dir: 565, y }];

test('lerPdf: texto e posição de cada trecho, pelo pdf.js do projeto; senha, arquivo estragado e limites', async () => {
  const pdfjs = await carregarPdfjs();
  const b = pdfAMao([{ textos: [{ s: 'Olá EXEMPLO', x: 40, y: 100, tam: 10 }, { s: '-1.234,56', dir: 466, y: 100 }] }, { textos: [] }]);
  assert.equal(D.tipoArquivo(b), 'pdf');
  const ps = await D.lerPdf(pdfjs, b);
  assert.equal(ps.length, 2); assert.equal(ps[1].itens.length, 0, 'página sem texto');
  const [t, v] = ps[0].itens;
  assert.equal(t.s, 'Olá EXEMPLO', 'acentos'); assert.ok(Math.abs(t.x - 40) < 0.01 && Math.abs(t.y - 100) < 0.01);
  assert.ok(Math.abs(v.x + v.w - 466) < 0.01, 'borda direita do número');
  assert.equal(b[0], 0x25, 'os bytes originais não são entregues ao pdf.js (ele fica com o buffer)');
  await assert.rejects(D.lerPdf(pdfjs, pdfAMao([{ textos: [{ s: 'x', x: 10, y: 10 }] }], { senha: true })), /protegido por senha/);
  await assert.rejects(D.lerPdf(pdfjs, new Uint8Array(Buffer.from('%PDF-1.7\n% inventado e cortado\n'))), /danificado ou incompleto/);
  await assert.rejects(D.lerPdf(pdfjs, pdfAMao(Array.from({ length: 51 }, () => ({ textos: [] })))), /passa de 50 páginas/);
  const grande = new Uint8Array(10 * 1024 * 1024 + 1); grande.set([0x25, 0x50, 0x44, 0x46]);
  await assert.rejects(D.lerPdf(pdfjs, grande), /passa de 10 MB/);
});

test('tabelaDoPdf: colunas pelo cabeçalho, números pela borda direita, página sem cabeçalho usa o anterior', () => {
  const it = (s, x, y, w) => ({ s, x, y, w: w != null ? w : s.length * 4.8 });
  const r = (s, dir, y) => ({ s, x: dir - s.length * 4.8, y, w: s.length * 4.8 });
  const p1 = { itens: [
    it('MARIA EXEMPLO', 31, 72), it('agência 0000 conta 00000-0', 200, 72), // dados pessoais: nunca copiados
    it('saldo em conta', 31, 119), r('1.000,00', 466, 138), // quadro de saldos: nunca copiado
    it('período de visualização: 01/08/2026 até 15/10/2026', 28, 211),
    ...cab().map(c => (c.dir ? r(c.s, c.dir, c.y) : it(c.s, c.x, c.y))),
    it('16/10/2026', 31, 270), it('SALDO DO DIA', 96, 270), r('4.000,00', 565, 270),
    it('15/10/2026', 31, 289), it('FATURA', 96, 289, 28.8), it('AZUL MC', 124.8, 289), r('-1.234,56', 466, 289),
    it('15/10/2026', 31, 308), it('PIX TRANSF', 96, 308), it('JOAO E14/10', 150, 308), r('200,00', 466, 308)
  ] };
  const p2 = { itens: [it('14/10/2026', 31, 39), it('SALDO DO DIA', 96, 39), r('5.034,56', 564, 39), it('Aviso: a data do lançamento e o valor podem mudar', 28, 400)] };
  const t = D.tabelaDoPdf([p1, p2]);
  const cheias = t.linhas.filter(l => l.length);
  assert.deepEqual(cheias, [
    ['período de visualização: 01/08/2026 até 15/10/2026'],
    ['data', 'lançamentos', 'valor (R$)', 'saldo (R$)'],
    ['16/10/2026', 'SALDO DO DIA', '', '4.000,00'],
    ['15/10/2026', 'FATURAAZUL MC', '-1.234,56', ''],
    ['15/10/2026', 'PIX TRANSF JOAO E14/10', '200,00', ''],
    ['14/10/2026', 'SALDO DO DIA', '', '5.034,56']
  ], 'trechos encostados ficam colados; separados, com espaço; saldo na página 2 pelas colunas da página 1');
  assert.ok(!JSON.stringify(t.linhas).includes('MARIA') && !JSON.stringify(t.linhas).includes('agência') && !JSON.stringify(t.linhas).includes('saldo em conta'), 'nada do topo além do período');
  assert.equal(t.linhas.length, 10, 'uma linha por linha do PDF (8 na página 1, 2 na 2; as de fora da tabela ficam vazias)');
  assert.deepEqual([t.paginas, t.comTexto], [2, 2]);
  // a linha do aviso legal tem "data", "lançamento" e "valor", mas num trecho só: não é cabeçalho
  assert.equal(D.tabelaDoPdf([p2]).linhas.filter(l => l.length).length, 0, 'sem cabeçalho, nenhuma linha de tabela');
  assert.deepEqual(D.tabelaDoPdf([{ itens: [] }, { itens: [] }]).comTexto, 0, 'PDF só com imagem');
});

// ---------- leitor do Itaú (parsers/itau.js), com o PDF inventado de exemplo ----------
const I = carregarNucleo(['lerPdf', 'tabelaDoPdf', 'detectarBanco', 'LEITORES', 'perguntasImportacao', 'interpretarCSV', 'classify', 'conferirSaldos']);
const tabelaItau = async (b = exemplo('extrato-itau-exemplo.pdf')) => I.tabelaDoPdf(await I.lerPdf(await carregarPdfjs(), b));

test('exemplo do Itaú: o arquivo é exatamente o que o gerador produz; 3 páginas, cabeçalho só na primeira', async () => {
  assert.ok(Buffer.from(exemplo('extrato-itau-exemplo.pdf')).equals(Buffer.from(extratoItauExemplo())), 'rode node scripts/gerar-exemplos.mjs');
  const ps = await I.lerPdf(await carregarPdfjs(), exemplo('extrato-itau-exemplo.pdf'));
  assert.equal(ps.length, 3);
  const cab = ps.map(p => p.itens.some(i => i.s === 'data' && Math.abs(i.x - 31) < 1));
  assert.deepEqual(cab, [true, false, false], 'só a página 1 tem cabeçalho');
  assert.ok(ps[1].itens.some(i => Math.abs(i.y - 39) < 1), 'nas outras, a tabela começa em y 39');
  const t = await tabelaItau();
  assert.deepEqual(t.linhas.filter(l => l.length === 4).slice(1), itauExemploLinhas().linhas, 'cada linha do PDF volta igual, pelas colunas');
});

test('Itaú: reconhecido pelo cabeçalho; o mesmo resultado que o PDF descreve, sem perguntas', async () => {
  const t = await tabelaItau();
  assert.equal(I.detectarBanco(t.linhas), 'itau');
  assert.equal(I.detectarBanco([['data', 'lançamentos', 'valor (R$)']]), null, 'outro cabeçalho: não é o Itaú');
  const L = I.LEITORES.itau.ler(t.linhas, 'BRL', {});
  assert.equal(L.tx.length, 37); assert.equal(Object.keys(L.saldosDia).length, 32);
  assert.deepEqual(L.periodo, { de: '2026-08-01', ate: '2026-10-15', fonte: 'arquivo' });
  assert.deepEqual(L.tx[0].slice(0, 2), ['2026-08-01', 'SALARIO EMPRESA EXEMPLO'], 'na ordem do acontecido (o PDF vem do mais novo para o mais antigo)');
  assert.ok(L.tx.every((x, k) => !k || x[0] >= L.tx[k - 1][0]));
  // o SALDO DO DIA do topo (20/10, depois do período) é o saldo atual, e não entra nos saldos do dia
  assert.equal(L.saldoAtual, itauExemploLinhas().saldoFinal); assert.equal(L.saldoAtualData, '2026-10-20');
  assert.ok(!('2026-10-20' in L.saldosDia));
  assert.deepEqual(I.perguntasImportacao(L.previa.rows, L.previa.mapa), [], 'sem perguntas');
  assert.deepEqual(I.interpretarCSV(L.previa.rows, L.previa.mapa).ignoradas, [], 'topo, quadro de saldos, aviso legal: nada sobra');
  assert.deepEqual(I.conferirSaldos(L.tx, L.saldosDia).divergencias, [], 'saldos do dia coerentes com os movimentos');
  // nada do topo sai do leitor: nome, agência, conta, quadro de saldos
  const tudo = JSON.stringify(L);
  for (const x of ['agência', 'conta 00000', 'saldo em conta', 'limite da conta', 'emitido em']) assert.ok(!tudo.includes(x), x);
  assert.ok(!L.previa.rows.some(r => r.length && r[0] === 'MARIA EXEMPLO'));
  assert.deepEqual(I.LEITORES.itau.ler(t.linhas, 'EUR', {}).tx, [], 'carteira em outra moeda: nada');
});

test('Itaú: tipos pelos nomes do extrato (rendimento, investimento, fatura, estorno); o resto, caminho genérico', async () => {
  const L = I.LEITORES.itau.ler((await tabelaItau()).linhas, 'BRL', {}), cl = t => I.classify(t, {}, 'MARIA EXEMPLO', 'BR');
  const tipo = d => L.tx.filter(t => t[1].startsWith(d)).map(t => t[2]);
  for (const d of ['REND PAGO', 'COR DIVIDENDOS', 'COR JSCP']) tipo(d).forEach(x => assert.equal(x, 'Rendimento', d));
  L.tx.filter(t => t[2] === 'Rendimento').forEach(t => { assert.equal(cl(t).kind, 'outras'); assert.equal(cl(t).autoE, '_outras'); });
  for (const d of ['APLICACAO CDB', 'RESGATE CDB', 'INT RESGATE']) tipo(d).forEach(x => assert.equal(x, 'Invest', d));
  assert.equal(cl(L.tx.find(t => t[1] === 'APLICACAO CDB EXEMPLO')).kind, 'invest');
  for (const d of ['RESGATE CDB', 'INT RESGATE']) { const t = L.tx.find(x => x[1].startsWith(d)); assert.equal(cl(t).kind, 'invest'); assert.equal(cl(t).autoE, '_invest', d + ': Resgate de investimento'); }
  for (const d of ['CARTAO EXEMPLOAZUL MC', 'FATURAEXEMPLO ITAU MC', 'INT EXEMPLO AZUL MC']) { const t = L.tx.find(x => x[1] === d); assert.equal(t[2], 'Fatura', d); assert.equal(cl(t).cat, 'outros'); }
  assert.equal(L.tx.find(t => t[1] === 'INT ITAU CLICK')[2], 'Others', 'INT ITAU CLICK fica no caminho genérico');
  // estorno de débito automático: só com o DA do mesmo dia, empresa e valor; volta na mesma categoria
  const da = L.tx.find(t => t[0] === '2026-08-03' && t[1].startsWith('DA ')), est = L.tx.find(t => t[0] === '2026-08-03' && t[1].startsWith('EST '));
  assert.equal(est[2], 'Estorno'); assert.equal(cl(est).kind, 'gasto'); assert.equal(cl(est).cat, cl(da).cat, 'mesma categoria do débito');
  assert.equal(L.tx.find(t => t[1].startsWith('EST LOJA'))[2], 'Others', 'estorno sem débito igual no dia: caminho genérico');
  assert.equal(cl(L.tx.find(t => t[1] === 'SALARIO EMPRESA EXEMPLO')).kind, 'renda', 'salário pelas regras do Brasil');
  assert.equal(cl(L.tx.find(t => t[1].startsWith('PIX TRANSF IMOBILI'))).cat, 'outros', 'nome cortado do Pix: sem regra');
});

test('Itaú: Pix para o titular é só sugestão (começo do nome, 5 letras ou mais, sem acento nem maiúsculas)', async () => {
  const linhas = (await tabelaItau()).linhas;
  const L = I.LEITORES.itau.ler(linhas, 'BRL', { titular: 'María Exemplo' });
  assert.deepEqual(L.sugestoes.map(k => L.tx[k][1]), ['PIX TRANSF MARIA E07/08', 'PIX TRANSF MARIA E18/08', 'PIX TRANSF MARIA E22/09', 'PIX TRANSF MARIA E13/10']);
  // nada é decidido sozinho: sem a escolha da pessoa, o Pix para "MARIA E" não vira entre contas suas
  L.sugestoes.forEach(k => { const c = I.classify(L.tx[k], {}, 'María Exemplo', 'BR'); assert.notEqual(c.kind, 'interno'); assert.notEqual(c.cat, 'brasil'); });
  assert.deepEqual(I.LEITORES.itau.ler(linhas, 'BRL', {}).sugestoes, [], 'sem titular configurado, nenhuma sugestão');
  assert.deepEqual(I.LEITORES.itau.ler(linhas, 'BRL', { titular: 'Ana Exemplo' }).sugestoes.map(k => I.LEITORES.itau.ler(linhas, 'BRL', {}).tx[k][1]), ['PIX TRANSF ANA EXE28/08', 'PIX TRANSF ANA EXE14/10']);
  assert.deepEqual(I.LEITORES.itau.ler(linhas, 'BRL', { titular: 'Joana' }).sugestoes, [], '"JOAOEX" não é o começo de "JOANA"');
  // menos de 5 letras no nome cortado: nunca sugere
  const curto = [['período de visualização: 01/08/2026 até 15/10/2026'], ['data', 'lançamentos', 'valor (R$)', 'saldo (R$)'], ['02/08/2026', 'PIX TRANSF ANA02/08', '-10,00', ''], ['02/08/2026', 'SALDO DO DIA', '', '90,00']];
  assert.deepEqual(I.LEITORES.itau.ler(curto, 'BRL', { titular: 'Ana Exemplo' }).sugestoes, []);
});

// ---------- Pix para o titular depois da importação (Revisar categorias) ----------
test('Pix para o titular depois da importação: lista sem decidir, aplica só os marcados, desfaz só o que a sugestão marcou', async () => {
  const A = carregarNucleo(['LEITORES', 'lerPdf', 'tabelaDoPdf', 'pixParaTitular', 'aplicarPixTitular', 'desfazerPixTitular', 'classify', 'lerSalvo', 'novaCarteira', 'migrate']);
  const L = A.LEITORES.itau.ler(A.tabelaDoPdf(await A.lerPdf(await carregarPdfjs(), exemplo('extrato-itau-exemplo.pdf'))).linhas, 'BRL', {});
  const months = {}; L.tx.forEach(t => { (months[t[0].slice(0, 7)] = months[t[0].slice(0, 7)] || []).push(t); });
  // a mesma regra da prévia: a função é a do leitor
  assert.equal(A.LEITORES.itau.pixDoTitular('PIX TRANSF MARIA E07/08', 'María Exemplo'), true);
  assert.equal(A.LEITORES.itau.pixDoTitular('PIX TRANSF ANA02/08', 'Ana Exemplo'), false, 'menos de 5 letras');
  let P = A.pixParaTitular(months, {}, 'Maria Exemplo', []);
  assert.deepEqual(P.pendentes.map(x => x.chave), ['PIX TRANSF MARIA E07/08', '+PIX TRANSF MARIA E18/08', 'PIX TRANSF MARIA E22/09', '+PIX TRANSF MARIA E13/10']);
  assert.deepEqual(P.aplicados, []);
  assert.deepEqual(A.pixParaTitular(months, {}, '', []).pendentes, [], 'sem titular, nada');
  // escolha manual: fica de fora da lista
  P = A.pixParaTitular(months, { 'PIX TRANSF MARIA E22/09': 'mercado' }, 'Maria Exemplo', []);
  assert.equal(P.pendentes.length, 3);
  // aplicar só os marcados: saída vira Envios para outra conta sua; entrada, Entre contas suas
  let r = A.aplicarPixTitular({ 'PIX TRANSF MARIA E22/09': 'mercado' }, [], ['PIX TRANSF MARIA E07/08', '+PIX TRANSF MARIA E18/08']);
  assert.deepEqual(r.over, { 'PIX TRANSF MARIA E22/09': 'mercado', 'PIX TRANSF MARIA E07/08': 'brasil', '+PIX TRANSF MARIA E18/08': '_ignore' });
  const tx = k => L.tx.find(t => t[1] === k);
  assert.equal(A.classify(tx('PIX TRANSF MARIA E07/08'), r.over, 'Maria Exemplo', 'BR').cat, 'brasil');
  assert.equal(A.classify(tx('PIX TRANSF MARIA E18/08'), r.over, 'Maria Exemplo', 'BR').kind, 'interno');
  P = A.pixParaTitular(months, r.over, 'Maria Exemplo', r.aplicados);
  assert.deepEqual([P.pendentes.length, P.aplicados.length], [1, 2], 'os aplicados saem da lista e aparecem para desfazer');
  // escolha feita à mão depois: o Desfazer não mexe nela
  r.over['PIX TRANSF MARIA E07/08'] = 'lazer';
  const d = A.desfazerPixTitular(r.over, r.aplicados);
  assert.deepEqual(d, { over: { 'PIX TRANSF MARIA E22/09': 'mercado', 'PIX TRANSF MARIA E07/08': 'lazer' }, aplicados: [] });
  // o campo da carteira passa pela validação do backup; em formato errado, nada é lido
  let x = A.novaCarteira(A.migrate({ v: 3, months: {}, over: {}, plan: { titular: 'Maria Exemplo' }, summary: null, div: null }), { nome: 'Itaú', moeda: 'BRL', pais: 'BR', banco: 'itau' });
  x.carteiras[1].pixTitular = ['PIX TRANSF MARIA E07/08'];
  assert.deepEqual(A.lerSalvo(JSON.stringify(x), '').carteiras[1].pixTitular, ['PIX TRANSF MARIA E07/08']);
  x.carteiras[1].pixTitular = 'errado';
  assert.throws(() => A.lerSalvo(JSON.stringify(x), ''), /Pix marcados como seus em formato errado/);
});

// ---------- envios para outra conta sua como "dinheiro movido" (opção por carteira) ----------
const MV = carregarNucleo(['metaDaCarteira', 'buildModel', 'preverMes', 'detectarRecorrentes', 'sugerirMetas', 'montarCats', 'novaCarteira', 'editarCarteira', 'migrate', 'lerSalvo', 'resumir', 'mesResumo', 'previsaoResumo', 'resumoBackup', 'LEITORES', 'lerPdf', 'tabelaDoPdf', 'extractTx', 'parseCSV']);
const somaMes = (months, m) => months[m].reduce((a, t) => a + t[3], 0) / 100;
const fecha = (g) => g.entrou - g.gasto - g.saved - g.movido;

test('dinheiro movido: entrou − gastou − guardou − movido é a variação do saldo, nos dois modos', async () => {
  // Revolut de exemplo, com os envios "To MARIA SILVA" e um mês com eles marcados como "Entre contas suas"
  const rev = MV.extractTx(MV.parseCSV(csv), 'EUR'), mr = {};
  rev.forEach(t => { (mr[t[0].slice(0, 7)] = mr[t[0].slice(0, 7)] || []).push(t); });
  // Itaú de exemplo, com os Pix para a titular marcados (saída: envio; entrada: entre contas suas)
  const L = MV.LEITORES.itau.ler(MV.tabelaDoPdf(await MV.lerPdf(await carregarPdfjs(), exemplo('extrato-itau-exemplo.pdf'))).linhas, 'BRL', { titular: 'Maria Exemplo' }), mi = {}, ovi = {};
  L.tx.forEach(t => { (mi[t[0].slice(0, 7)] = mi[t[0].slice(0, 7)] || []).push(t); });
  L.sugestoes.forEach(k => { const t = L.tx[k], key = t[1].toUpperCase(); if (t[3] > 0) ovi['+' + key] = '_ignore'; else ovi[key] = 'brasil'; });
  for (const [nome, months, over, tit, pais] of [['Revolut', mr, { 'TO MARIA SILVA': 'brasil' }, 'MARIA SILVA', 'IE'], ['Itaú', mi, ovi, 'Maria Exemplo', 'BR']]) {
    for (const envios of ['gasto', 'movido']) {
      const M = MV.buildModel(months, over, tit, pais, null, null, null, { envios });
      for (const m of M.keys) {
        assert.ok(Math.abs(fecha(M.by[m]) - somaMes(months, m)) < 0.005, `${nome}, ${envios}, ${m}: saldo do mês ${fecha(M.by[m])} = variação ${somaMes(months, m)}`);
        assert.equal(M.by[m].saldo, fecha(M.by[m]));
      }
    }
    const G = MV.buildModel(months, over, tit, pais), V = MV.buildModel(months, over, tit, pais, null, null, null, { envios: 'movido' });
    for (const m of G.keys) {
      assert.ok(Math.abs(G.by[m].gasto - V.by[m].gasto - (G.by[m].spend.brasil || 0)) < 0.005, nome + ' ' + m + ': no modo movido, o gasto perde exatamente os envios');
      assert.equal(V.by[m].spend.brasil || 0, 0);
      assert.ok(Math.abs(G.by[m].envios - V.by[m].envios) < 0.005, 'o total de envios (gráfico) é o mesmo nos dois modos');
      assert.ok(Math.abs(V.by[m].movido - G.by[m].movido - (G.by[m].spend.brasil || 0)) < 0.005, 'e eles passam para o movido');
    }
  }
  // sem a opção, o modelo é o de antes (o mesmo que "gasto")
  assert.deepEqual(JSON.stringify(MV.buildModel(mr, {}, 'MARIA SILVA', 'IE')), JSON.stringify(MV.buildModel(mr, {}, 'MARIA SILVA', 'IE', null, null, null, { envios: 'gasto' })));
});

test('dinheiro movido: fora das metas, da previsão e das contas fixas; continua no gráfico de envios', () => {
  const months = {}; MV.extractTx(MV.parseCSV(csv), 'EUR').forEach(t => { (months[t[0].slice(0, 7)] = months[t[0].slice(0, 7)] || []).push(t); });
  const cats = MV.montarCats(null), G = MV.buildModel(months, {}, 'MARIA SILVA', 'IE', cats), V = MV.buildModel(months, {}, 'MARIA SILVA', 'IE', cats, null, null, { envios: 'movido' });
  assert.ok(MV.sugerirMetas(G, cats).cats.brasil > 0); assert.equal(MV.sugerirMetas(V, cats).cats.brasil || 0, 0, 'sem meta sugerida para envios');
  // a meta de envios de cada modo, como o painel a lê (em "movido", 0)
  const cG = { metas: { cats: { brasil: 150 } } }, cV = { metas: { cats: { brasil: 150 } }, envios: 'movido' };
  assert.equal(MV.metaDaCarteira(cG, G, cats)('brasil'), 150); assert.equal(MV.metaDaCarteira(cV, V, cats)('brasil'), 0);
  const pG = MV.preverMes(G, MV.metaDaCarteira(cG, G, cats), cats), pV = MV.preverMes(V, MV.metaDaCarteira(cV, V, cats), cats);
  assert.ok(Math.abs(pG.proj - pV.proj - 150) < 0.005, `a previsão perde exatamente os envios do mês (${pG.proj} → ${pV.proj})`);
  assert.equal(pV.falFix, pG.falFix, 'e nada aparece como conta fixa que falta');
  assert.ok(!MV.detectarRecorrentes(V).some(r => /MARIA/.test(r.nome || r.desc || '')), 'envio movido não vira conta fixa');
  assert.ok(V.rows.filter(r => r.kind === 'movido').every(r => r.cat === 'brasil'), 'a categoria fica, para mostrar');
});

test('dinheiro movido no Resumo: carteira em "gasto" e outra em "movido", sem contar duas vezes nem esquecer nada', () => {
  let x = MV.migrate({ v: 3, months: {}, over: {}, plan: { titular: 'MARIA SILVA', moeda: 'EUR', pais: 'IE', configurado: true }, summary: null, div: null });
  x = MV.novaCarteira(x, { nome: 'Itaú', moeda: 'BRL', pais: 'BR', banco: 'itau' });
  const [A, B] = x.carteiras;
  // A (euro, "gasto"): renda, um mercado, um envio "To MARIA SILVA" para fora do painel e outro que chega em B
  A.months = { '2026-09': [['2026-09-01', 'Payment from ACME', 'Others', 100000, null], ['2026-09-02', 'Tesco', 'Merchant', -5000, null], ['2026-09-03', 'To MARIA SILVA', 'Others', -15000, null], ['2026-09-04', 'To MARIA SILVA ITAU', 'Others', -10000, null]] };
  A.over = { 'TO MARIA SILVA ITAU': '_ignore' };
  // B (real, "movido"): salário, mercado, um Pix para a titular para fora do painel, e a entrada que veio de A (900 = 150 €)
  B.months = { '2026-09': [['2026-09-02', 'SALARIO EMPRESA', 'Others', 300000, null], ['2026-09-06', 'Supermercado X', 'Others', -10000, null], ['2026-09-07', 'PIX TRANSF MARIA S07/09', 'Others', -50000, null], ['2026-09-05', 'TED RECEBIDA MARIA SILVA ITAU', 'Others', 60000, null]] };
  B.over = { 'PIX TRANSF MARIA S07/09': 'brasil', '+TED RECEBIDA MARIA SILVA ITAU': '_ignore' };
  B.envios = 'movido';
  x.cambios = { BRL: { rate: 6, data: '2026-09-30' } };
  const R = MV.resumir(x), Q = MV.mesResumo(R, x, '2026-09'), T = Q.total;
  const [ga, gb] = R.ws.map(w => w.M.by['2026-09']);
  assert.deepEqual([ga.gasto, ga.spend.brasil, ga.movido], [200, 150, 100], 'A: o envio para fora é gasto; o que vai para B é movido');
  assert.deepEqual([gb.gasto, gb.spend.brasil || 0, gb.movido], [100, 0, -100], 'B: o Pix para fora é movido (+500) e a entrada de A também (−600)');
  // total em euro: cada coisa uma vez
  assert.ok(Math.abs(T.gasto - (200 + 100 / 6)) < 0.01, 'gasto: o de A (com o envio dele) + o mercado de B; o Pix movido de B fica fora');
  assert.ok(Math.abs(T.movido - (100 - 100 / 6)) < 0.01, 'movido: A→B se anula (100 € de um lado, 600 R$ = 100 € do outro); sobra o Pix de B para fora');
  const variacao = somaMes(A.months, '2026-09') + somaMes(B.months, '2026-09') / 6;
  assert.ok(Math.abs(T.saldo - variacao) < 0.01, `saldo do Resumo ${T.saldo} = soma das variações ${variacao}`);
  assert.ok(Math.abs(T.entrou - T.gasto - T.saved - T.movido - T.saldo) < 0.01, 'entrou − gastou − guardou − movido = saldo, no total');
  // a meta da categoria de envios não entra na meta do mês da carteira em "movido" (a de "gasto" continua)
  x.carteiras[0].metas = { cats: { brasil: 150 } }; x.carteiras[1].metas = { cats: { brasil: 999 } };
  assert.deepEqual(R.ws.map(w => MV.metaDaCarteira(w.c, w.M, w.cats)('brasil')), [150, 0]);
});

test('dinheiro movido no backup: o antigo restaura igual, o novo guarda a opção, e valor estranho é recusado', () => {
  let x = MV.migrate({ v: 3, months: {}, over: {}, plan: { titular: 'MARIA SILVA' }, summary: null, div: null });
  x = MV.novaCarteira(x, { nome: 'Itaú', moeda: 'BRL', pais: 'BR', banco: 'itau' });
  x.carteiras[1].months = { '2026-09': [['2026-09-07', 'PIX TRANSF MARIA S07/09', 'Others', -50000, null]] };
  x.carteiras[1].over = { 'PIX TRANSF MARIA S07/09': 'brasil' };
  // backup antigo: sem o campo; restaura igual e o modelo é o de "gasto"
  const antigo = MV.lerSalvo(JSON.stringify(x), '');
  assert.equal(antigo.carteiras[1].envios, undefined);
  assert.deepEqual(MV.resumoBackup(antigo).carteiras.map(c => c.envios), ['gasto', 'gasto']);
  assert.equal(MV.resumir(antigo).ws[1].M.by['2026-09'].gasto, 500);
  // a opção muda por editarCarteira, ida e volta
  let y = MV.editarCarteira(antigo, 'c2', { envios: 'movido' });
  assert.equal(y.carteiras[1].envios, 'movido');
  assert.equal(MV.editarCarteira(y, 'c2', { envios: 'gasto' }).carteiras[1].envios, undefined, '"Continua gasto" é reversível: volta ao padrão');
  assert.throws(() => MV.editarCarteira(y, 'c2', { envios: 'talvez' }), /opção de envios desconhecida/);
  // backup novo: a opção volta preservada, e o resumo do restaurar a mostra
  const novo = MV.lerSalvo(JSON.stringify(y), '');
  assert.equal(novo.carteiras[1].envios, 'movido');
  assert.deepEqual(MV.resumoBackup(novo).carteiras.map(c => c.envios), ['gasto', 'movido']);
  const g = MV.resumir(novo).ws[1].M.by['2026-09'];
  assert.deepEqual([g.gasto, g.movido, g.saldo], [0, 500, -500]);
  y.carteiras[1].envios = 'sim';
  assert.throws(() => MV.lerSalvo(JSON.stringify(y), ''), /opção de envios em formato errado/);
});
