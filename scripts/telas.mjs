// Comparação de telas: fotografa as 93 telas do painel (47 em 1280px, 46 em 390px) com o extrato de exemplo
// inventado, confere cada uma (nada além da borda da tela, nenhum texto cortado, contraste AA) e compara com as
// capturas de referência em telas/referencia/ (pixels e estilos calculados de todos os elementos).
// Também faz a ida e volta do backup no navegador: baixa, apaga tudo, restaura, e o painel tem que ficar idêntico;
// um backup corrompido não pode gravar nada.
//
//   npm run telas            fotografa em telas/atual/, confere e compara; sai com erro se algo mudou
//   npm run telas:aprovar    fotografa, confere e, se a conferência passar, troca as referências pelas novas
//
// Roda num servidor local próprio (127.0.0.1, porta livre); nenhum dado sai da máquina.
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync, cpSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const ATUAL = join(RAIZ, 'telas/atual'), REF = join(RAIZ, 'telas/referencia'), DIFF = join(RAIZ, 'telas/diff');
const aprovar = process.argv.includes('--aprovar');
// a data e o fuso ficam fixos, para "vence em 3 dias" e o mês em andamento não mudarem com o dia em que roda
const AGORA = new Date('2026-10-22T12:00:00+01:00');

// ---------- servidor estático só para a pasta do projeto ----------
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.csv': 'text/csv', '.json': 'application/json' };
const servidor = createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const f = join(RAIZ, p || 'index.html');
  if (!f.startsWith(RAIZ) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TIPOS[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => servidor.listen(0, '127.0.0.1', r));
const URL_PAGINA = `http://127.0.0.1:${servidor.address().port}/index.html`;

// ---------- os dados: só o extrato de exemplo e pagamentos inventados ----------
const appJs = readFileSync(join(RAIZ, 'app.js'), 'utf8');
const core = appJs.slice(appJs.indexOf('/*CORE-START*/'), appJs.indexOf('/*CORE-END*/'));
const api = new Function(core + '; return { parseCSV, extractTx, migrate, novaCarteira, escolherCarteira, prepararImportacao, interpretarCSV, trocarMoedaPrincipal, juntarPeriodos, resumir, sugerirTransferencias, confirmarTransferencia, dispensarSugestao, lembrarMapa };')();
const months = {};
api.extractTx(api.parseCSV(readFileSync(join(RAIZ, 'exemplo/extrato-exemplo.csv'), 'utf8')))
  .forEach(t => { (months[t[0].slice(0, 7)] = months[t[0].slice(0, 7)] || []).push(t); });
const plan = { titular: 'MARIA SILVA', moeda: 'EUR', pais: 'IE', nomes: {}, configurado: true, goals: { viagem: { alvo: 2000, prazo: '2027-06', tem: 300 } } };
const div = { items: [
  { id: 'd1', nome: 'Banco', status: 'aberta', criada: '2026-09-01', valor: 3700, moeda: 'BRL', venc: '2026-10-25', desc: 'Parcela 4/5' },
  { id: 'd2', nome: 'Escola', status: 'aberta', criada: '2026-10-01', valor: 250, moeda: 'USD' },
  { id: 'd3', nome: 'Seguro', status: 'aberta', criada: '2026-10-02', valor: 90, moeda: 'CHF' },
  { id: 'd4', nome: 'Curso', status: 'paga', criada: '2026-08-01', valor: 120, moeda: 'EUR', pagaEm: '2026-09-02' }],
  cambios: { BRL: { rate: 5.61, data: '2026-10-01' }, USD: { rate: 1.08, data: '2026-10-01' } }, margem: 2 };
const comDados = { v: 3, months, over: {}, plan, summary: null, div };
const D = { 'cortex-financas.v3': JSON.stringify(comDados) };
// a mesma conta inventada lida como libra (Reino Unido, sem regras próprias) e como real (Brasil, sem regras próprias),
// para pegar valor ou rótulo preso ao euro; o câmbio de "Em observação" é por 1 da moeda da configuração
const emOutraMoeda = (moeda, pais, cambios) => ({ 'cortex-financas.v3': JSON.stringify({ ...comDados, plan: { ...plan, moeda, pais }, div: { ...div, cambios } }) });
const LIBRA = emOutraMoeda('GBP', 'GB', { BRL: { rate: 6.55, data: '2026-10-01' }, USD: { rate: 1.27, data: '2026-10-01' }, EUR: { rate: 1.17, data: '2026-10-01' } });
// categorias e metas editadas: Mercado renomeado, Saúde escondida, "Cafés" criada (com o Costa Coffee) e uma meta "Carro"
const EDITADO = { 'cortex-financas.v3': JSON.stringify({ ...comDados, over: { 'COSTA COFFEE': 'u1' }, plan: { ...plan,
  nomes: { mercado: 'Supermercado' }, ocultas: ['saude'], fixas: ['aluguel', 'assin', 'brasil', 'mercado'], proprias: [{ id: 'u1', nome: 'Cafés', slot: 8 }],
  metasPoupanca: [{ id: 'reserva', nome: 'Reserva de emergência', src: 'flex' }, { id: 'm1', nome: 'Carro', src: null }],
  goals: { reserva: { alvo: 3000 }, m1: { alvo: 5000, tem: 1200, prazo: '2027-12' } } } }) };
// três carteiras: a do exemplo (Revolut, euro) e duas vazias de bancos sem leitor ainda (Wise em libra, Nubank em real)
const tresCarteiras = ativa => {
  let x = api.migrate(JSON.parse(JSON.stringify(comDados)));
  x = api.novaCarteira(x, { nome: 'Wise libras', moeda: 'GBP', pais: 'GB', banco: 'wise' });
  x = api.novaCarteira(x, { nome: 'Nubank', moeda: 'BRL', pais: 'BR', banco: 'nubank' });
  return { 'cortex-financas.v4': JSON.stringify(api.escolherCarteira(x, ativa)) };
};
const CARTEIRAS = tresCarteiras('c1'), SEM_LEITOR = tresCarteiras('c2');
// câmbio: libra informada há 42 dias (fica em âmbar), real e dólar recentes
const comCambio = (moedaPrincipal, cambios) => {
  let x = JSON.parse(CARTEIRAS['cortex-financas.v4']);
  if (moedaPrincipal) x = api.trocarMoedaPrincipal(x, moedaPrincipal);
  x.cambios = cambios;
  return { 'cortex-financas.v4': JSON.stringify(x) };
};
const CAMBIO = comCambio(null, { GBP: { rate: 0.86, data: '2026-09-10' }, BRL: { rate: 6.2, data: '2026-10-15' }, USD: { rate: 1.08, data: '2026-10-15' } });
// moeda principal libra: Em observação e metas de poupança aparecem em libra na carteira principal (Revolut, em euro)
const EM_LIBRA = comCambio('GBP', { EUR: { rate: 1.17, data: '2026-10-15' }, BRL: { rate: 7.2, data: '2026-10-15' }, USD: { rate: 1.27, data: '2026-10-15' } });
// importador genérico: o extrato inventado de um banco brasileiro (Latin-1, ponto e vírgula, sem saldo)
const GENERICO = join(RAIZ, 'exemplo/extrato-generico-exemplo.csv');
const comGenerica = (comMeses, extra) => {
  let x = api.migrate(JSON.parse(JSON.stringify(comDados)));
  x = api.novaCarteira(x, { nome: 'Banco Exemplo', moeda: 'BRL', pais: 'BR', banco: 'outro' });
  if (comMeses) {
    const p = api.prepararImportacao(new Uint8Array(readFileSync(GENERICO)));
    p.mapa.valor.saidas = 'negativas';
    x.carteiras[1].months = {};
    api.interpretarCSV(p.rows, p.mapa).tx.forEach(t => { (x.carteiras[1].months[t[0].slice(0, 7)] = x.carteiras[1].months[t[0].slice(0, 7)] || []).push(t); });
  }
  Object.assign(x.carteiras[1], extra || {});
  return { 'cortex-financas.v4': JSON.stringify(x) };
};
// extrato inventado na estrutura do BTG convertido para CSV: saldo do dia em linhas "Saldo Diário"
const SALDO_DIARIO = join(RAIZ, 'exemplo/extrato-saldo-diario-exemplo.csv');
const comSaldoDiario = () => {
  let x = api.migrate(JSON.parse(JSON.stringify(comDados)));
  x = api.novaCarteira(x, { nome: 'Banco Exemplo', moeda: 'BRL', pais: 'BR', banco: 'btg' });
  const p = api.prepararImportacao(new Uint8Array(readFileSync(SALDO_DIARIO)));
  p.mapa.valor.saidas = 'negativas';
  const r = api.interpretarCSV(p.rows, p.mapa), c = x.carteiras[1];
  c.months = {}; r.tx.forEach(t => { (c.months[t[0].slice(0, 7)] = c.months[t[0].slice(0, 7)] || []).push(t); });
  c.saldosDia = r.saldos;
  return { 'cortex-financas.v4': JSON.stringify(x) };
};
// Resumo: o Revolut do exemplo (euro), o banco genérico do exemplo (real, sem saldo, período 1 ago a 15 out
// informado no arquivo) e uma carteira de libra ainda sem extrato. "Entre contas suas" nas duas com extrato.
// O câmbio do real tem 42 dias (fica em âmbar); sem ele, nenhum total.
const comResumo = cambios => {
  let x = api.migrate(JSON.parse(JSON.stringify({ ...comDados, over: { 'TO MARIA SILVA': '_ignore' } })));
  x = api.novaCarteira(x, { nome: 'Banco Exemplo', moeda: 'BRL', pais: 'BR', banco: 'outro' });
  const p = api.prepararImportacao(new Uint8Array(readFileSync(GENERICO)));
  p.mapa.valor.saidas = 'negativas';
  const r = api.interpretarCSV(p.rows, p.mapa), c = x.carteiras[1];
  r.tx.forEach(t => { (c.months[t[0].slice(0, 7)] = c.months[t[0].slice(0, 7)] || []).push(t); });
  c.periodos = api.juntarPeriodos([], r.periodo);
  c.over = { '+PIX RECEBIDO JOÃO EXEMPLO': '_ignore' };
  x = api.novaCarteira(x, { nome: 'Wise libras', moeda: 'GBP', pais: 'GB', banco: 'wise' });
  x = { ...api.escolherCarteira(x, 'c2'), cambios };
  return { 'cortex-financas.v4': JSON.stringify(x) };
};
const RESUMO = comResumo({ BRL: { rate: 6.2, data: '2026-09-10' }, USD: { rate: 1.08, data: '2026-10-15' }, GBP: { rate: 0.86, data: '2026-10-15' } });
const RESUMO_SEM_CAMBIO = comResumo({ USD: { rate: 1.08, data: '2026-10-15' } });
// transferências (9.4): o Revolut do exemplo e o extrato inventado de transferências (real), que recebe os envios
// "To MARIA SILVA": julho com 0,5% de diferença, agosto com a entrada já marcada pelo titular, setembro fora da
// folga (11 dias) e outubro com 4,8% e 2 dias. confirmar: quantas sugestões confirmar antes (as mais antigas)
const TRANSF = join(RAIZ, 'exemplo/extrato-transferencia-exemplo.csv');
const comTransferencias = (over, confirmar = 0) => {
  let x = api.migrate(JSON.parse(JSON.stringify({ ...comDados, over })));
  x = api.novaCarteira(x, { nome: 'Banco Exemplo', moeda: 'BRL', pais: 'BR', banco: 'outro' });
  const p = api.prepararImportacao(new Uint8Array(readFileSync(TRANSF)));
  p.mapa.valor.saidas = 'negativas';
  const r = api.interpretarCSV(p.rows, p.mapa), c = x.carteiras[1];
  r.tx.forEach(t => { (c.months[t[0].slice(0, 7)] = c.months[t[0].slice(0, 7)] || []).push(t); });
  c.periodos = api.juntarPeriodos([], r.periodo);
  x = { ...api.escolherCarteira(x, 'c1'), cambios: { BRL: { rate: 6.2, data: '2026-09-10' }, USD: { rate: 1.08, data: '2026-10-15' } } };
  const ps = api.sugerirTransferencias(api.resumir(x), x).pares.slice().reverse().slice(0, confirmar);
  ps.forEach(q => { x = api.confirmarTransferencia(x, { s: { c: q.s.w.id, id: q.s.r.id }, e: { c: q.e.w.id, id: q.e.r.id }, ja: q.ja }); });
  return { 'cortex-financas.v4': JSON.stringify(x) };
};
const TRANSFERENCIAS = comTransferencias({}), CONFIRMADAS = comTransferencias({}, 2), SAIDA_MARCADA = comTransferencias({ 'TO MARIA SILVA': '_ignore' });
// backup com tudo (9.5): as transferências confirmadas, outubro dispensado e as colunas do banco lembradas
const BACKUP = (() => {
  const x = JSON.parse(CONFIRMADAS['cortex-financas.v4']), p = api.prepararImportacao(new Uint8Array(readFileSync(TRANSF)));
  p.mapa.valor.saidas = 'negativas';
  x.carteiras[1].importacao = api.lembrarMapa({}, p.rows, p.mapa);
  const q = api.sugerirTransferencias(api.resumir(x), x).pares[0];
  return JSON.stringify(api.dispensarSugestao(x, { s: { c: q.s.w.id, id: q.s.r.id }, e: { c: q.e.w.id, id: q.e.r.id }, ja: q.ja }));
})();
const arquivo = (texto, nome = 'financas-2026-10-22.json') => ({ name: nome, mimeType: 'application/json', buffer: Buffer.from(texto) });
// com duas ou mais carteiras o painel abre no Resumo; as telas de uma carteira clicam na aba dela antes
const aba = (id, depois) => async pg => { await pg.click(`[data-carteira="${id}"]`); if (depois) await depois(pg); };
// cartão inventado e ambíguo de propósito: 03/04/2026, 1.234 e compras sem sinal
const AMBIGUO = { name: 'cartao-exemplo.csv', mimeType: 'text/csv', buffer: Buffer.from('Data,Lançamento,Valor\n03/04/2026,LOJA EXEMPLO,1.234\n05/04/2026,MERCADO EXEMPLO,50\n07/04/2026,POSTO EXEMPLO,120\n') };
// v3 com um campo grande (que o painel preserva): a v3 guardada e a v4 passam juntas de 4 MB
const GRANDE = { 'cortex-financas.v3': JSON.stringify({ ...comDados, plan: { ...plan, extra: 'x'.repeat(2.1 * 1024 * 1024) } }) };
const REAL = emOutraMoeda('BRL', 'BR', { USD: { rate: 0.19, data: '2026-10-01' }, EUR: { rate: 0.18, data: '2026-10-01' } });

// ---------- o que roda dentro da página ----------
// assinatura dos estilos calculados de cada elemento (e de ::before, ::after e ::placeholder): comparação exata, sem ruído de pixel
function estilosDaPagina() {
  // ordenadas: o Chromium lista as variáveis CSS numa ordem que muda de uma rodada para outra
  const props = Array.from(getComputedStyle(document.documentElement)).sort();
  const h = t => { let x = 2166136261; for (let i = 0; i < t.length; i++) { x ^= t.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); };
  const sig = (el, ps) => { const cs = getComputedStyle(el, ps); return props.map(p => p + ':' + cs.getPropertyValue(p)).join(';'); };
  const caminho = el => {
    const p = [];
    for (; el && el !== document.documentElement; el = el.parentElement) {
      const cl = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
      p.unshift(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cl);
    }
    return p.join('>');
  };
  return Array.from(document.querySelectorAll('*')).map(el => caminho(el) + ' ' + h(sig(el)) + ' ' + h(sig(el, '::before')) + ' ' + h(sig(el, '::after')) +
    (el.matches('input,textarea') ? ' ' + h(sig(el, '::placeholder')) : '')).join('\n');
}
// conferência: elementos além da borda (o CSS usa overflow-x: clip, então o excesso some em vez de rolar),
// texto cortado e contraste de todo texto visível com o fundo de verdade (fundos em gradiente ficam de fora)
function conferir() {
  const rgba = c => { const m = c.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m[3] == null ? 1 : m[3]]; };
  const mix = (t, b) => [0, 1, 2].map(i => t[i] * t[3] + b[i] * (1 - t[3])).concat(1);
  const L = c => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const razao = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function fundo(el) {
    const pilha = []; let incerto = false;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none' && !/^repeating/.test(cs.backgroundImage)) incerto = true;
      const c = rgba(cs.backgroundColor); if (c[3] > 0) { pilha.push(c); if (c[3] >= 1) break; }
    }
    let cor = [255, 255, 255, 1]; for (let i = pilha.length - 1; i >= 0; i--) cor = mix(pilha[i], cor);
    return { cor, incerto };
  }
  const contraste = [], cortados = [], vistos = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const t = w.currentNode; if (!t.textContent.trim()) continue;
    const el = t.parentElement; if (vistos.has(el)) continue; vistos.add(el);
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0 || el.closest('[hidden],.vh,option,svg')) continue;
    const f = fundo(el), cor = mix(rgba(cs.color), f.cor), cr = razao(cor, f.cor);
    const px = parseFloat(cs.fontSize), min = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700) ? 3 : 4.5;
    const nome = `"${t.textContent.trim().slice(0, 40)}" (${el.tagName.toLowerCase()}.${el.className})`;
    if (cr < min && !f.incerto) contraste.push(`${cr.toFixed(2)} < ${min} ${nome}`);
    if ((el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible' && cs.textOverflow !== 'ellipsis') ||
        (el.scrollHeight > el.clientHeight + 2 && cs.overflowY === 'hidden' && !/\d/.test(cs.webkitLineClamp || ''))) cortados.push(nome);
  }
  const vw = document.documentElement.clientWidth; let fora = Math.max(0, document.documentElement.scrollWidth - vw), ex = '';
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); if (!r.width || r.right <= vw + 1 || el.closest('.cscroll,.tw,[hidden],.vh')) continue;
    const cs = getComputedStyle(el); if (cs.position === 'fixed' || cs.visibility === 'hidden') continue;
    if (r.right - vw > fora) { fora = Math.round(r.right - vw); ex = el.tagName.toLowerCase() + '.' + el.className; }
  }
  // controles que se cobrem (um campo por cima de outro, caixas de seleção encavaladas): nenhum pode tocar outro
  const sobrepostos = [], ctrls = Array.from(document.querySelectorAll('input:not([type=hidden]), select, button, a[href], label.chk, summary'))
    .filter(el => { const r = el.getBoundingClientRect(); return r.width && r.height && !el.closest('.vh') && el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true }); });
  for (let i = 0; i < ctrls.length; i++) for (let j = i + 1; j < ctrls.length; j++) {
    const a = ctrls[i], b = ctrls[j];
    if (a.contains(b) || b.contains(a)) continue;
    const r = a.getBoundingClientRect(), q = b.getBoundingClientRect();
    const w = Math.min(r.right, q.right) - Math.max(r.left, q.left), h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
    if (w > 2 && h > 2) sobrepostos.push(`${a.tagName.toLowerCase()}#${a.id || a.className} × ${b.tagName.toLowerCase()}#${b.id || b.className}`);
  }
  return { fora, ex, contraste: [...new Set(contraste)], cortados: [...new Set(cortados)], sobrepostos };
}

// ---------- as telas ----------
const quebrado = { 'cortex-financas.v3': '{"v":3,"months":{"2026-09":[["2026' };
const TELAS = [];
for (const w of [1280, 390]) {
  const t = (nome, opts = {}) => TELAS.push({ w, nome, ...opts });
  t('01-primeira-abertura');
  t('02-sem-extrato', { storage: { 'cortex-financas.v3': JSON.stringify({ v: 3, months: {}, over: {}, plan, summary: null, div: null }) } });
  t('03-painel', { storage: D });
  t('04-painel-tudo-aberto', { storage: D, prepara: async pg => {
    await pg.click('.fbtn'); await pg.waitForTimeout(100);
    await pg.evaluate(() => document.querySelectorAll('#fin-app details').forEach(d => { d.open = true; }));
  } });
  t('05-painel-media', { storage: D, prepara: async pg => { await pg.click('[data-all]'); } });
  t('06-painel-filtro-e-arrasta', { storage: D, prepara: async pg => {
    await pg.click('.cat >> nth=0'); await pg.evaluate(() => document.getElementById('fin-app').classList.add('arrasta'));
  } });
  t('07-configuracoes', { storage: D, prepara: async pg => { await pg.click('[data-fin-setup]'); } });
  t('08-aviso-pais', { storage: { 'cortex-financas.v3': JSON.stringify({ ...comDados, plan: { ...plan, pais: 'BR' } }) } });
  t('09-restaurar', { storage: D, prepara: async pg => {
    await pg.setInputFiles('#fin-json', { name: 'financas-2026-10-22.json', mimeType: 'application/json', buffer: Buffer.from(D['cortex-financas.v3']) });
    await pg.waitForSelector('[data-restaurar=confirmar]');
  } });
  t('10-apagar', { storage: D, prepara: async pg => { await pg.click('[data-fin-setup]'); await pg.click('[data-apagar=pedir]'); } });
  t('11-dados-ilegiveis', { storage: quebrado });
  t('12-aviso-toast', { storage: D, viewport: true, toast: true, prepara: async pg => { await pg.evaluate(() => window.__cortexToast('Mensagem de teste', false, 60000)); } });
  t('13-aviso-erro', { storage: D, viewport: true, toast: true, prepara: async pg => { await pg.evaluate(() => window.__cortexToast('Erro de teste', true, 60000)); } });
  t('15-painel-libra', { storage: LIBRA });
  t('16-painel-real', { storage: REAL });
  t('17-configuracoes-real', { storage: REAL, prepara: async pg => { await pg.click('[data-fin-setup]'); } });
  t('18-painel-categorias-editadas', { storage: EDITADO, prepara: async pg => { await pg.click('#fin-gedit > summary'); } });
  t('19-configuracoes-categorias', { storage: EDITADO, prepara: async pg => { await pg.click('[data-fin-setup]'); await pg.click('#fin-kedit > summary'); } });
  t('20-painel-carteiras', { storage: CARTEIRAS, prepara: aba('c1') });
  t('21-carteira-generica-vazia', { storage: SEM_LEITOR, prepara: aba('c2') });
  t('22-configuracoes-carteiras', { storage: CARTEIRAS, prepara: async pg => { await pg.click('[data-fin-setup]'); await pg.click('#fin-wnova > summary'); await pg.selectOption('#fin-wn-banco', 'btg'); } });
  t('23-excluir-carteira', { storage: CARTEIRAS, prepara: async pg => { await pg.click('[data-fin-setup]'); await pg.click('[data-wexcluir=c1]'); } });
  t('24-aviso-espaco', { storage: GRANDE, viewport: true });
  t('25-importar-pergunta', { storage: comGenerica(false), prepara: async pg => { await pg.setInputFiles('#fin-csv', GENERICO); await pg.waitForSelector('#fin-fimp'); } });
  t('26-importar-previa', { storage: comGenerica(false), prepara: async pg => {
    await pg.setInputFiles('#fin-csv', GENERICO); await pg.waitForSelector('#fin-fimp');
    await pg.click('input[name=sinal][value=negativas]'); await pg.waitForSelector('.imp-tot');
    await pg.click('#fin-fimp details > summary');
  } });
  t('27-importar-ambiguo', { storage: comGenerica(false), prepara: async pg => { await pg.setInputFiles('#fin-csv', AMBIGUO); await pg.waitForSelector('#fin-fimp'); } });
  t('28-painel-sem-saldo', { storage: comGenerica(true), prepara: aba('c2') });
  // saldo do dia em linhas próprias, conferido, com um saldo informado que não bate (falta rendimento no extrato)
  t('30-importar-saldo-diario', { storage: comGenerica(false), prepara: async pg => {
    await pg.setInputFiles('#fin-csv', SALDO_DIARIO); await pg.waitForSelector('#fin-fimp');
    await pg.click('input[name=sinal][value=negativas]'); await pg.waitForSelector('.imp-tot');
    await pg.fill('#fin-i-ancora', '6.050,00');
  } });
  t('31-painel-saldo-estimado', { storage: comGenerica(true, { ancora: { data: '2026-10-14', valor: 1250000, informadoEm: '2026-10-15' } }), prepara: aba('c2') });
  t('32-painel-saldo-diario', { storage: comSaldoDiario(), prepara: aba('c2') });
  // Revisar categorias com saídas e entradas: o salário marcado como renda e o Pix como entre contas suas
  t('33-configuracoes-cambio', { storage: CAMBIO, prepara: async pg => { await pg.click('[data-fin-setup]'); } });
  t('34-painel-principal-libra', { storage: EM_LIBRA, prepara: async pg => { await pg.click('#fin-dcamb > summary'); } });
  t('29-revisar-entradas', { storage: comGenerica(true, { over: { '+SALÁRIO EMPRESA EXEMPLO LTDA': '_renda', '+PIX RECEBIDO JOÃO EXEMPLO': '_ignore' } }), prepara: aba('c2', async pg => { await pg.click('#fin-revd > summary'); }) });
  // Resumo (9.3c): todas as carteiras juntas; setembro é o último mês completo
  t('35-resumo', { storage: RESUMO });
  t('36-resumo-sem-cambio', { storage: RESUMO_SEM_CAMBIO });
  t('37-resumo-definir-cambio', { storage: RESUMO_SEM_CAMBIO, prepara: async pg => { await pg.click('[data-rcamb="BRL"]'); } });
  t('38-resumo-mes-sem-cobertura', { storage: RESUMO, prepara: async pg => { await pg.click('[data-rmes="2026-07"]'); } });
  t('39-resumo-detalhes', { storage: RESUMO, prepara: async pg => { await pg.click('#fin-rpor > summary'); await pg.click('#fin-rfd > summary'); } });
  t('40-resumo-escolher-carteira', { storage: RESUMO, prepara: async pg => { await pg.click('[data-fin-add]'); } });
  // transferências entre carteiras (9.4): sugeridas, confirmadas, com a saída já marcada, e ao excluir a carteira
  t('41-resumo-transferencias', { storage: TRANSFERENCIAS });
  t('42-resumo-transferencias-confirmadas', { storage: CONFIRMADAS, prepara: async pg => { await pg.click('#fin-tconf > summary'); } });
  t('43-revisar-transferencias', { storage: SAIDA_MARCADA, prepara: aba('c2', async pg => { await pg.click('#fin-revd > summary'); }) });
  // julho e agosto confirmados, outubro só sugerido: a previsão da carteira avisa e não pinta o estouro de vermelho
  t('45-previsao-transferencia-sugerida', { storage: CONFIRMADAS, prepara: aba('c1') });
  t('44-excluir-carteira-transferencias', { storage: CONFIRMADAS, prepara: async pg => { await pg.click('[data-fin-setup]'); await pg.click('[data-wexcluir=c2]'); } });
  // restaurar (9.5): o resumo por carteira antes de substituir as três carteiras do Resumo, e um backup corrompido
  t('46-restaurar-varias-carteiras', { storage: RESUMO, prepara: async pg => { await pg.setInputFiles('#fin-json', arquivo(BACKUP)); await pg.waitForSelector('[data-restaurar=confirmar]'); } });
  t('47-restaurar-corrompido', { storage: RESUMO, viewport: true, toast: true, prepara: async pg => { await pg.setInputFiles('#fin-json', arquivo(BACKUP.slice(0, 5000))); await pg.waitForSelector('#toast:not([hidden])'); } });
  if (w > 600) t('14-dica-grafico', { storage: D, viewport: true, hover: async pg => {
    const b = await pg.locator('.mcol').nth(1).boundingBox(); await pg.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  } });
}

rmSync(ATUAL, { recursive: true, force: true }); mkdirSync(ATUAL, { recursive: true });
const browser = await chromium.launch();
const erros = [], problemas = [];
for (const s of TELAS) {
  const arq = `${s.w}-${s.nome}`;
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.w > 600 ? 900 : 844 }, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'Europe/Dublin', colorScheme: 'light' });
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(AGORA);
  pg.on('pageerror', e => erros.push(arq + ': ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') erros.push(arq + ': ' + m.text()); });
  await pg.goto(URL_PAGINA);
  await pg.evaluate(st => { localStorage.clear(); for (const k in st) localStorage.setItem(k, st[k]); }, s.storage || {});
  await pg.reload(); await pg.waitForTimeout(150);
  if (s.prepara) await s.prepara(pg);
  await pg.evaluate(() => document.fonts.ready);
  if (!s.toast) await pg.evaluate(() => { document.getElementById('toast').hidden = true; });
  await pg.mouse.move(0, 0); // nada em hover, a não ser na tela da dica
  if (s.hover) await s.hover(pg);
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: join(ATUAL, arq + '.png'), fullPage: !s.viewport, animations: 'disabled' });
  writeFileSync(join(ATUAL, arq + '.estilos.txt'), await pg.evaluate(estilosDaPagina));
  const c = await pg.evaluate(conferir);
  if (c.fora > 0) problemas.push(`${arq}: passa ${c.fora}px da borda da tela (${c.ex})`);
  c.contraste.forEach(x => problemas.push(`${arq}: contraste ${x}`));
  c.cortados.forEach(x => problemas.push(`${arq}: texto cortado ${x}`));
  c.sobrepostos.slice(0, 5).forEach(x => problemas.push(`${arq}: controles sobrepostos ${x}`));
  await ctx.close();
}

// ---------- ida e volta do backup, no navegador ----------
// carrega o backup completo, fotografa o Resumo e cada carteira, baixa o backup pelo botão, apaga tudo, restaura o
// arquivo baixado e, depois de recarregar a página, fotografa de novo: tudo tem que ser idêntico, pixel a pixel.
// Depois tenta restaurar o mesmo arquivo cortado ao meio: nada pode mudar no que está salvo.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'Europe/Dublin', colorScheme: 'light', acceptDownloads: true });
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(AGORA);
  pg.on('pageerror', e => erros.push('ida e volta: ' + e.message));
  const fotos = async () => {
    const o = [];
    for (const aba of ['resumo', 'c1', 'c2']) {
      await pg.click(`[data-carteira="${aba}"]`);
      await pg.evaluate(() => { document.getElementById('toast').hidden = true; });
      await pg.mouse.move(0, 0); await pg.waitForTimeout(300);
      o.push(await pg.screenshot({ fullPage: true, animations: 'disabled' }));
    }
    return o;
  };
  await pg.goto(URL_PAGINA);
  await pg.evaluate(st => { localStorage.clear(); localStorage.setItem('cortex-financas.v4', st); }, BACKUP);
  await pg.reload(); await pg.waitForTimeout(150);
  const antes = await fotos(), salvoAntes = await pg.evaluate(() => localStorage.getItem('cortex-financas.v4'));
  await pg.click('[data-fin-setup]');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-backup=baixar]')]);
  const baixado = readFileSync(await dl.path(), 'utf8');
  await pg.click('[data-apagar=pedir]'); await pg.click('[data-apagar=confirmar]');
  const vazio = await pg.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('cortex-financas')).length);
  await pg.setInputFiles('#fin-json', arquivo(baixado)); await pg.click('[data-restaurar=confirmar]');
  await pg.reload(); await pg.waitForTimeout(150);
  const depois = await fotos(), salvoDepois = await pg.evaluate(() => localStorage.getItem('cortex-financas.v4'));
  const iguais = antes.every((b, i) => b.equals(depois[i]));
  if (vazio) problemas.push(`ida e volta: depois de apagar tudo ficaram ${vazio} chave(s)`);
  if (salvoAntes !== salvoDepois) problemas.push('ida e volta: os dados salvos depois de restaurar não são os de antes');
  if (!iguais) problemas.push('ida e volta: o painel restaurado não ficou idêntico (Resumo, Revolut, Banco Exemplo)');
  await pg.setInputFiles('#fin-json', arquivo(baixado.slice(0, Math.floor(baixado.length / 2))));
  await pg.waitForSelector('#toast:not([hidden])');
  const corrompido = await pg.evaluate(() => [localStorage.getItem('cortex-financas.v4'), !!document.querySelector('[data-restaurar]'), document.getElementById('toast').textContent]);
  if (corrompido[0] !== salvoDepois || corrompido[1]) problemas.push('ida e volta: um backup corrompido mudou o que estava salvo');
  console.log(`ida e volta do backup: ${iguais && salvoAntes === salvoDepois && !vazio ? 'painel idêntico (3 telas, pixel a pixel) e os mesmos dados salvos' : 'FALHOU'}; ` +
    `backup corrompido: ${corrompido[0] === salvoDepois && !corrompido[1] ? 'nada gravado' : 'GRAVOU'} ("${corrompido[2]}")`);
  await ctx.close();
}
await browser.close();
servidor.close();

console.log(`${TELAS.length} telas fotografadas em telas/atual/`);
console.log(erros.length ? 'erros no console:\n  ' + erros.join('\n  ') : 'console sem erros');
console.log(problemas.length ? `conferência: ${problemas.length} problema(s)\n  ` + problemas.join('\n  ') : 'conferência: nada além da borda, nada cortado, nenhum controle sobreposto, contraste AA em todo texto');
const falhouConferencia = erros.length || problemas.length;

if (aprovar) {
  if (falhouConferencia) { console.log('\nreferências NÃO trocadas: resolva os problemas acima primeiro'); process.exit(1); }
  rmSync(REF, { recursive: true, force: true }); cpSync(ATUAL, REF, { recursive: true });
  console.log('\nreferências trocadas: telas/referencia/ agora tem as capturas novas (faça commit junto com a mudança)');
  process.exit(0);
}

// ---------- comparação com as referências ----------
if (!existsSync(REF)) { console.log('\nsem telas/referencia/: rode npm run telas:aprovar para criar'); process.exit(1); }
rmSync(DIFF, { recursive: true, force: true }); mkdirSync(DIFF, { recursive: true });
let mudaram = 0;
const nomes = new Set([...readdirSync(REF), ...readdirSync(ATUAL)].filter(f => f.endsWith('.png')));
for (const f of [...nomes].sort()) {
  if (!existsSync(join(REF, f)) || !existsSync(join(ATUAL, f))) { mudaram++; console.log(`✖ ${f}: ${existsSync(join(REF, f)) ? 'sumiu' : 'tela nova, sem referência'}`); continue; }
  const A = PNG.sync.read(readFileSync(join(REF, f))), B = PNG.sync.read(readFileSync(join(ATUAL, f)));
  const ea = readFileSync(join(REF, f.replace('.png', '.estilos.txt')), 'utf8').split('\n');
  const eb = readFileSync(join(ATUAL, f.replace('.png', '.estilos.txt')), 'utf8').split('\n');
  const difEst = ea.length !== eb.length ? ['quantidade de elementos: ' + ea.length + ' → ' + eb.length]
    : ea.map((l, i) => (l === eb[i] ? null : l.split(' ')[0])).filter(Boolean);
  let n = 0;
  if (A.width !== B.width || A.height !== B.height) n = -1;
  else {
    const d = new PNG({ width: A.width, height: A.height });
    for (let i = 0; i < A.data.length; i += 4) {
      // até 2/255 é ruído de antisserrilhado; acima disso conta como pixel diferente
      const dd = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
      if (dd > 2) { n++; d.data[i] = 255; d.data[i + 3] = 255; } else { d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.round(A.data[i] * 0.3 + 179); d.data[i + 3] = 255; }
    }
    if (n) writeFileSync(join(DIFF, f), PNG.sync.write(d));
  }
  const ok = n === 0 && !difEst.length;
  if (!ok) mudaram++;
  console.log(`${ok ? '✔' : '✖'} ${f}: ` + (n < 0 ? `tamanho ${A.width}x${A.height} → ${B.width}x${B.height}` : `${n} pixels diferentes`) +
    `, estilos ${difEst.length ? 'diferentes em ' + difEst.length + ' elemento(s) (ex.: ' + difEst.slice(0, 2).join(' | ') + ')' : 'iguais'}`);
}
console.log(mudaram ? `\n${mudaram} tela(s) mudaram (pixels em vermelho em telas/diff/). Se a mudança foi aprovada: npm run telas:aprovar` : '\nnenhuma tela mudou');
process.exit(mudaram || falhouConferencia ? 1 : 0);
