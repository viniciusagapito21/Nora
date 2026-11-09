// Comparação de telas: fotografa as 93 telas do painel (47 em 1280px, 46 em 390px) com o extrato de exemplo
// inventado, confere cada uma (nada além da borda da tela, nenhum texto cortado, contraste AA) e compara com as
// capturas de referência em telas/referencia/ (pixels e estilos calculados de todos os elementos).
// Também faz a ida e volta do backup no navegador: baixa, apaga tudo, restaura, e o painel tem que ficar idêntico;
// um backup corrompido não pode gravar nada.
//
//   npm run telas            fotografa em telas/atual/, confere e compara; sai com erro se algo mudou
//   npm run telas:aprovar    fotografa, confere e, se a conferência passar, troca as referências pelas novas
//   npm run telas:completo   as mesmas telas nas 4 combinações de idioma e tema (pt-BR e en-GB, claro e escuro), só
//                            com as conferências (borda, cortado, sobreposto, contraste AA, CSP, chaves): sem
//                            comparação nem referência; fotos em telas/completo/<idioma>-<tema>/
//
// Roda num servidor local próprio (127.0.0.1, porta livre); nenhum dado sai da máquina.
import { chromium, firefox, webkit } from 'playwright';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { createServer } from 'node:http';
import { escolherPorta } from './porta.mjs';
import { xlsxAMao, paraCelulas, comSenha, carregarXLSX, extratoBtgExemplo, pdfAMao, carregarPdfjs } from '../tests/planilhas.mjs';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync, cpSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const ATUAL = join(RAIZ, 'telas/atual'), REF = join(RAIZ, 'telas/referencia'), DIFF = join(RAIZ, 'telas/diff');
const aprovar = process.argv.includes('--aprovar'), completo = process.argv.includes('--completo');
if (aprovar && completo) { console.error('--aprovar e --completo não se misturam: o completo não tem referências'); process.exit(1); }
const COMPLETO = join(RAIZ, 'telas/completo');
// as combinações do telas:completo, gravadas em nora.prefs antes de abrir (o locale do navegador acompanha o idioma)
const COMBOS = [['pt-BR', 'claro'], ['pt-BR', 'escuro'], ['en-GB', 'claro'], ['en-GB', 'escuro']];
// a data e o fuso ficam fixos, para "vence em 3 dias" e o mês em andamento não mudarem com o dia em que roda
const AGORA = new Date('2026-10-22T12:00:00+01:00');

// ---------- servidor estático só para a pasta do projeto ----------
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.pdf': 'application/pdf', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.csv': 'text/csv', '.json': 'application/json' };
const servidor = createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const f = join(RAIZ, p || 'index.html');
  if (!f.startsWith(RAIZ) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TIPOS[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
// porta livre qualquer; ou exatamente a de PORTA_TELAS (PORTA_TELAS=4100 npm run telas)
const portaTelas = await escolherPorta({ nome: 'PORTA_TELAS', inicio: 0, host: '127.0.0.1' }).catch(e => { console.error(e.message); process.exit(1); });
await new Promise(r => servidor.listen(portaTelas, '127.0.0.1', r));
const URL_PAGINA = `http://127.0.0.1:${servidor.address().port}/index.html`, ORIGEM = new URL(URL_PAGINA).origin;
// CSP: toda violação vira problema; e cada tela só pode pedir arquivos da própria pasta (nada de fetch, XHR,
// WebSocket, EventSource, beacon), nem de outra origem
const anotarViolacoes = () => { window.__violacoes = []; document.addEventListener('securitypolicyviolation', e => window.__violacoes.push(e.violatedDirective + ' ' + (e.blockedURI || ''))); };
const TIPOS_PERMITIDOS = ['document', 'script', 'stylesheet', 'font', 'image'];
const URL_DISCO = pathToFileURL(join(RAIZ, 'index.html')).href, PASTA_DISCO = URL_DISCO.replace(/index\.html$/, '');
const pedidoPermitido = r => ((r.url().startsWith(ORIGEM + '/') || r.url().startsWith(PASTA_DISCO)) && TIPOS_PERMITIDOS.includes(r.resourceType())) || /^(blob|data):/.test(r.url());

// ---------- os dados: só o extrato de exemplo e pagamentos inventados ----------
const appJs = readFileSync(join(RAIZ, 'app.js'), 'utf8');
// regras e leitores de banco vêm antes do app.js, na ordem do index.html
const core = [...readFileSync(join(RAIZ, 'index.html'), 'utf8').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(f => f !== 'app.js' && f !== 'prefs.js')
  .map(f => readFileSync(join(RAIZ, f), 'utf8')).join('\n') + appJs.slice(appJs.indexOf('/*CORE-START*/'), appJs.indexOf('/*CORE-END*/'));
const api = new Function(core + '; return { buildModel, resumir, mesResumo, parseCSV, extractTx, extractSummary, migrate, novaCarteira, escolherCarteira, prepararImportacao, interpretarCSV, trocarMoedaPrincipal, juntarPeriodos, resumir, sugerirTransferencias, confirmarTransferencia, dispensarSugestao, lembrarMapa };')();
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
// planilhas (item 2 da Fase 2): o mesmo extrato genérico inventado, como .xlsx com datas e valores de verdade;
// outra com uma aba de resumo antes da do extrato; e um PDF, que não dá para ler
const linhasGenerico = paraCelulas(api.prepararImportacao(new Uint8Array(readFileSync(GENERICO))).rows, 'virgula');
const xlsx = (name, bytes) => ({ name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(bytes) });
const PLANILHA = xlsx('extrato-banco-exemplo.xlsx', xlsxAMao([{ nome: 'Extrato', linhas: linhasGenerico }]));
const PLANILHA_ABAS = xlsx('extrato-banco-exemplo.xls', xlsxAMao([{ nome: 'Resumo', linhas: [['Resumo do período'], ['Total de entradas', 13600], ['Total de saídas', -9876.54]] }, { nome: 'Extrato', linhas: linhasGenerico }]));
// BTG (item 3 da Fase 2): o extrato inventado na estrutura do .xls do banco, numa carteira BTG; a variante com
// "Saldo atual" que não bate; e o Resumo com uma carteira BTG, para o arquivo arrastado sugerir a carteira certa
const xls = (name, bytes) => ({ name, mimeType: 'application/vnd.ms-excel', buffer: Buffer.from(bytes) });
const BTG_XLS = xls('Extrato_2026-08-01_a_2026-10-15.xls', readFileSync(join(RAIZ, 'exemplo/extrato-btg-exemplo.xls')));
const BTG_XLS_DIFERENTE = xls('Extrato_2026-08-01_a_2026-10-15.xls', extratoBtgExemplo(carregarXLSX(), { saldoAtualExtra: 1250 }));
const comBtg = () => {
  let x = api.migrate(JSON.parse(JSON.stringify(comDados)));
  x = api.novaCarteira(x, { nome: 'BTG', moeda: 'BRL', pais: 'BR', banco: 'btg' });
  return { 'cortex-financas.v4': JSON.stringify(x) };
};
// arrasta um arquivo para a página (o mesmo evento "drop" de quem solta o arquivo com o mouse)
const arrastar = async (pg, arq) => {
  const dt = await pg.evaluateHandle(({ b64, name }) => {
    const d = new DataTransfer(), bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    d.items.add(new File([u], name)); return d;
  }, { b64: arq.buffer.toString('base64'), name: arq.name });
  await pg.dispatchEvent('#fin-app', 'drop', { dataTransfer: dt });
};
// Itaú (PDF): o extrato inventado de exemplo, numa carteira Itaú com titular "Maria Exemplo" (para a sugestão de Pix
// entre contas suas aparecer); e PDFs que não dá para ler: escaneado (só imagem), com senha, de outro tipo
const pdf = (name, bytes) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
const ITAU_PDF = pdf('extrato-itau.pdf', readFileSync(join(RAIZ, 'exemplo/extrato-itau-exemplo.pdf')));
const PDF_ESCANEADO = pdf('extrato-escaneado.pdf', pdfAMao([{ imagem: true }]));
const PDF_SENHA = pdf('extrato-com-senha.pdf', pdfAMao([{ textos: [{ s: 'Extrato inventado', x: 40, y: 100 }] }], { senha: true }));
const PDF_DESCONHECIDO = pdf('fatura-cartao.pdf', pdfAMao([{ textos: [{ s: 'Fatura do cartão EXEMPLO', x: 40, y: 80 }, { s: 'Total a pagar', x: 40, y: 100 }, { s: '1.234,56', dir: 300, y: 100 }] }]));
// com o extrato do Itaú já importado (lido pelo próprio leitor), sem nenhuma sugestão aplicada
const IT = new Function(core + '; return { LEITORES, lerPdf, tabelaDoPdf };')();
const itauPaginas = await IT.lerPdf(await carregarPdfjs(), new Uint8Array(ITAU_PDF.buffer));
const itauLido = IT.LEITORES.itau.ler(IT.tabelaDoPdf(itauPaginas).linhas, 'BRL', {});
// opcoes.movido: Pix para a titular marcados (sugestão aplicada) e envios como "dinheiro movido", com câmbio do real
const comItau = (comMeses, opcoes = {}) => {
  let x = api.migrate(JSON.parse(JSON.stringify(comDados)));
  x = api.novaCarteira(x, { nome: 'Itaú', moeda: 'BRL', pais: 'BR', banco: 'itau' });
  x.config.titular = 'Maria Exemplo';
  if (opcoes.movido) {
    const L = IT.LEITORES.itau.ler(IT.tabelaDoPdf(itauPaginas).linhas, 'BRL', { titular: 'Maria Exemplo' }), c = x.carteiras[1];
    c.over = {}; c.pixTitular = L.sugestoes.map(k => { const t = L.tx[k], key = t[1].toUpperCase(); c.over[t[3] > 0 ? '+' + key : key] = t[3] > 0 ? '_ignore' : 'brasil'; return t[3] > 0 ? '+' + key : key; });
    c.envios = 'movido'; x.cambios = { BRL: { rate: 6.2, data: '2026-10-15' } };
  }
  if (comMeses) {
    const c = x.carteiras[1];
    itauLido.tx.forEach(t => { (c.months[t[0].slice(0, 7)] = c.months[t[0].slice(0, 7)] || []).push(t); });
    c.saldosDia = itauLido.saldosDia; c.periodos = [{ de: itauLido.periodo.de, ate: itauLido.periodo.ate }];
  }
  // opcoes.aviso: os Pix para a titular marcados, ainda como gasto, e mais 3 envios grandes para ela (passa de 50%)
  if (opcoes.aviso) {
    const L = IT.LEITORES.itau.ler(IT.tabelaDoPdf(itauPaginas).linhas, 'BRL', { titular: 'Maria Exemplo' }), c = x.carteiras[1];
    c.over = {}; L.sugestoes.forEach(k => { const t = L.tx[k], key = t[1].toUpperCase(); c.over[t[3] > 0 ? '+' + key : key] = t[3] > 0 ? '_ignore' : 'brasil'; });
    [['2026-08-20', 'PIX TRANSF MARIA E20/08'], ['2026-09-20', 'PIX TRANSF MARIA E20/09'], ['2026-10-09', 'PIX TRANSF MARIA E09/10']].forEach(([d, desc]) => { c.months[d.slice(0, 7)].push([d, desc, 'Others', -800000, null]); c.over[desc] = 'brasil'; });
  }
  return { 'cortex-financas.v4': JSON.stringify(x) };
};
const COM_SENHA = { name: 'extrato-banco-exemplo.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(comSenha(carregarXLSX())) };
const PDF = { name: 'extrato-banco-exemplo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n% extrato inventado\n') };
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
// o Resumo com uma carteira BTG a mais, para o arquivo arrastado sugerir a carteira certa
const RESUMO_BTG = (() => { let x = JSON.parse(RESUMO['cortex-financas.v4']); x = api.novaCarteira(x, { nome: 'BTG', moeda: 'BRL', pais: 'BR', banco: 'btg' }); return { 'cortex-financas.v4': JSON.stringify(api.escolherCarteira(x, 'c1')) }; })();
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
  // <script> e o <head> (meta, título, links) não aparecem na tela: ficam fora, para um arquivo de regras ou uma
  // <meta> nova não contarem como mudança
  return [document.body, ...document.querySelectorAll('body *')].filter(el => el.tagName !== 'SCRIPT').map(el => caminho(el) + ' ' + h(sig(el)) + ' ' + h(sig(el, '::before')) + ' ' + h(sig(el, '::after')) +
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
    // o CSV na estrutura do BTG é reconhecido pelo leitor do BTG: sem a pergunta do sinal das saídas
    await pg.setInputFiles('#fin-csv', SALDO_DIARIO); await pg.waitForSelector('#fin-fimp .imp-tot');
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
  // planilhas: prévia de um .xlsx, uma planilha com duas abas (com extensão .xls: o tipo vem do conteúdo) e um PDF
  t('48-importar-planilha', { storage: comGenerica(false), prepara: async pg => {
    await pg.setInputFiles('#fin-csv', PLANILHA); await pg.waitForSelector('#fin-fimp');
    await pg.click('input[name=sinal][value=negativas]'); await pg.waitForSelector('.imp-tot');
    await pg.click('#fin-fimp details > summary');
  } });
  t('49-importar-planilha-abas', { storage: comGenerica(false), prepara: async pg => { await pg.setInputFiles('#fin-csv', PLANILHA_ABAS); await pg.waitForSelector('#fin-i-aba'); } });
  t('50-arquivo-pdf', { storage: comGenerica(false), viewport: true, toast: true, prepara: async pg => { await pg.setInputFiles('#fin-csv', PDF); await pg.waitForSelector('#toast:not([hidden])'); } });
  t('52-importar-btg', { storage: comBtg(), prepara: async pg => { await pg.setInputFiles('#fin-csv', BTG_XLS); await pg.waitForSelector('#fin-fimp .imp-tot'); await pg.click('#fin-fimp details > summary'); } });
  t('53-btg-saldo-atual-diferente', { storage: comBtg(), prepara: async pg => { await pg.setInputFiles('#fin-csv', BTG_XLS_DIFERENTE); await pg.waitForSelector('#fin-fimp .imp-tot'); } });
  t('54-resumo-arquivo-do-btg', { storage: RESUMO_BTG, prepara: async pg => { await arrastar(pg, BTG_XLS); await pg.waitForSelector('#fin-escolher .aviso'); } });
  t('55-importar-itau', { storage: comItau(), prepara: async pg => { await pg.setInputFiles('#fin-csv', ITAU_PDF); await pg.waitForSelector('#fin-fimp .imp-tot'); } });
  t('56-pdf-painel-do-disco', { storage: comItau(), disco: true, viewport: true, toast: true, prepara: async pg => { await pg.setInputFiles('#fin-csv', ITAU_PDF); await pg.waitForSelector('#toast:not([hidden])'); } });
  t('57-pdf-escaneado', { storage: comItau(), viewport: true, toast: true, prepara: async pg => { await pg.setInputFiles('#fin-csv', PDF_ESCANEADO); await pg.waitForSelector('#toast:not([hidden])'); } });
  t('58-pdf-com-senha', { storage: comItau(), viewport: true, toast: true, prepara: async pg => { await pg.setInputFiles('#fin-csv', PDF_SENHA); await pg.waitForSelector('#toast:not([hidden])'); } });
  t('59-pdf-desconhecido', { storage: comItau(), viewport: true, toast: true, prepara: async pg => { await pg.setInputFiles('#fin-csv', PDF_DESCONHECIDO); await pg.waitForSelector('#toast:not([hidden])'); } });
  // Pix para o titular depois da importação: a lista em Revisar categorias, com duas caixas marcadas; e depois de aplicar
  const abrirPix = async pg => { await pg.click('#fin-revd > summary'); await pg.waitForSelector('#fin-pixtit'); };
  t('60-revisar-pix-titular', { storage: comItau(true), prepara: aba('c2', async pg => { await abrirPix(pg); await pg.click('[data-pixtit-marcar="2026-08"]'); }) });
  t('61-pix-titular-aplicados', { storage: comItau(true), prepara: aba('c2', async pg => { await abrirPix(pg); await pg.check('[data-pixtit="PIX TRANSF MARIA E07/08"]'); await pg.check('[data-pixtit="+PIX TRANSF MARIA E18/08"]'); await pg.click('[data-pixtit-aplicar]'); await pg.waitForSelector('[data-pixtit-desfazer]'); }) });
  // envios para outra conta sua como "dinheiro movido": a carteira, a opção em Configurações e o Resumo misto
  t('62-carteira-dinheiro-movido', { storage: comItau(true, { movido: true }), prepara: aba('c2') });
  t('63-configuracoes-envios-movido', { storage: comItau(true, { movido: true }), prepara: async pg => { await pg.click('[data-fin-setup]'); } });
  t('64-resumo-gasto-e-movido', { storage: comItau(true, { movido: true }) });
  // aviso dos envios: carteira com envios para a titular passando de 50% do Gastou
  t('65-aviso-envios', { storage: comItau(true, { aviso: true }), viewport: true, prepara: aba('c2') });
  t('51-planilha-com-senha', { storage: comGenerica(false), viewport: true, toast: true, prepara: async pg => { await pg.setInputFiles('#fin-csv', COM_SENHA); await pg.waitForSelector('#toast:not([hidden])'); } });
  if (w > 600) t('14-dica-grafico', { storage: D, viewport: true, hover: async pg => {
    const b = await pg.locator('.mcol').nth(1).boundingBox(); await pg.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  } });
}

const browser = await chromium.launch();
const erros = [], problemas = [];
// motores que não abriram: não reprovam a conferência (não é defeito da página), mas saem em destaque no fim
const naoVerificados = [];
// fotografa e confere todas as TELAS em pasta; prefs (opcional) vai para nora.prefs e rot prefixa cada problema
async function fotografar(pasta, prefs, rot) {
rmSync(pasta, { recursive: true, force: true }); mkdirSync(pasta, { recursive: true });
for (const s of TELAS) {
  const arq = (rot ? rot + '/' : '') + `${s.w}-${s.nome}`;
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.w > 600 ? 900 : 844 }, deviceScaleFactor: 1, locale: prefs ? prefs.idioma : 'pt-BR', timezoneId: 'Europe/Dublin', colorScheme: 'light' });
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(AGORA);
  pg.on('pageerror', e => erros.push(arq + ': ' + e.message));
  await pg.addInitScript(anotarViolacoes);
  pg.on('request', r => { if (!pedidoPermitido(r)) problemas.push(`${arq}: pedido fora do permitido: ${r.resourceType()} ${r.url()}`); });
  pg.on('console', m => { if (m.type() === 'error') erros.push(arq + ': ' + m.text()); });
  await pg.goto(s.disco ? URL_DISCO : URL_PAGINA);
  await pg.evaluate(st => { localStorage.clear(); for (const k in st) localStorage.setItem(k, st[k]); }, prefs ? { ...(s.storage || {}), 'nora.prefs': JSON.stringify(prefs) } : s.storage || {});
  await pg.reload(); await pg.waitForTimeout(150);
  if (s.prepara) await s.prepara(pg);
  await pg.evaluate(() => document.fonts.ready);
  if (!s.toast) await pg.evaluate(() => { document.getElementById('toast').hidden = true; });
  await pg.mouse.move(0, 0); // nada em hover, a não ser na tela da dica
  if (s.hover) await s.hover(pg);
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: join(pasta, `${s.w}-${s.nome}.png`), fullPage: !s.viewport, animations: 'disabled' });
  if (!prefs) writeFileSync(join(pasta, `${s.w}-${s.nome}.estilos.txt`), await pg.evaluate(estilosDaPagina));
  (await pg.evaluate(() => window.__violacoes)).forEach(v => problemas.push(`${arq}: violação da CSP: ${v}`));
  // toda chave pedida existe no dicionário (NORA_I18N.faltando vazio)
  (await pg.evaluate(() => (window.NORA_I18N ? NORA_I18N.faltando.map(f => f.idioma + ':' + f.chave) : ['NORA_I18N não carregou'])))
    .forEach(f => problemas.push(`${arq}: chave sem tradução ${f}`));
  const c = await pg.evaluate(conferir);
  if (c.fora > 0) problemas.push(`${arq}: passa ${c.fora}px da borda da tela (${c.ex})`);
  c.contraste.forEach(x => problemas.push(`${arq}: contraste ${x}`));
  c.cortados.forEach(x => problemas.push(`${arq}: texto cortado ${x}`));
  c.sobrepostos.slice(0, 5).forEach(x => problemas.push(`${arq}: controles sobrepostos ${x}`));
  await ctx.close();
}
}

if (completo) {
  for (const [idioma, tema] of COMBOS) {
    const antes = problemas.length + erros.length;
    await fotografar(join(COMPLETO, `${idioma}-${tema}`), { idioma, tema }, `${idioma}-${tema}`);
    console.log(`${idioma}-${tema}: ${TELAS.length} telas, ${problemas.length + erros.length - antes} problema(s)`);
  }
  await browser.close(); servidor.close();
  console.log(erros.length ? 'erros no console:\n  ' + erros.join('\n  ') : 'console sem erros');
  console.log(problemas.length ? `conferência: ${problemas.length} problema(s)\n  ` + problemas.join('\n  ') : 'conferência nas 4 combinações: nada além da borda, nada cortado, nenhum controle sobreposto, contraste AA em todo texto');
  process.exit(erros.length || problemas.length ? 1 : 0);
}
await fotografar(ATUAL, null, '');

// ---------- ida e volta do backup, no navegador ----------
// carrega o backup completo, fotografa o Resumo e cada carteira, baixa o backup pelo botão, apaga tudo, restaura o
// arquivo baixado e, depois de recarregar a página, fotografa de novo: tudo tem que ser idêntico, pixel a pixel.
// Depois tenta restaurar o mesmo arquivo cortado ao meio: nada pode mudar no que está salvo.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'Europe/Dublin', colorScheme: 'light', acceptDownloads: true });
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(AGORA);
  pg.on('pageerror', e => erros.push('ida e volta: ' + e.message));
  await pg.addInitScript(anotarViolacoes);
  pg.on('request', r => { if (!pedidoPermitido(r)) problemas.push(`ida e volta: pedido fora do permitido: ${r.resourceType()} ${r.url()}`); });
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
  // nora.prefs (idioma e tema) não vai para o backup e sobrevive a "Apagar tudo"; o tema auto não muda nenhuma foto
  const PREFS = JSON.stringify({ idioma: null, tema: 'auto' });
  await pg.evaluate(([st, pr]) => { localStorage.clear(); localStorage.setItem('cortex-financas.v4', st); localStorage.setItem('nora.prefs', pr); }, [BACKUP, PREFS]);
  await pg.reload(); await pg.waitForTimeout(150);
  const antes = await fotos(), salvoAntes = await pg.evaluate(() => localStorage.getItem('cortex-financas.v4'));
  await pg.click('[data-fin-setup]');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-backup=baixar]')]);
  const baixado = readFileSync(await dl.path(), 'utf8');
  await pg.click('[data-apagar=pedir]'); await pg.click('[data-apagar=confirmar]');
  const vazio = await pg.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('cortex-financas')).length);
  const prefsDepois = await pg.evaluate(() => localStorage.getItem('nora.prefs'));
  if (prefsDepois !== PREFS) problemas.push('ida e volta: "Apagar tudo" apagou ou mudou as preferências (nora.prefs)');
  if (/nora\.prefs|"tema"|"idioma"/.test(baixado)) problemas.push('ida e volta: as preferências foram para o backup');
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
  (await pg.evaluate(() => window.__violacoes)).forEach(v => problemas.push(`ida e volta: violação da CSP: ${v}`));
  console.log(`ida e volta do backup: ${iguais && salvoAntes === salvoDepois && !vazio ? 'painel idêntico (3 telas, pixel a pixel) e os mesmos dados salvos' : 'FALHOU'}; ` +
    `backup corrompido: ${corrompido[0] === salvoDepois && !corrompido[1] ? 'nada gravado' : 'GRAVOU'} ("${corrompido[2]}")`);
  await ctx.close();
}
// ---------- importar o extrato do Revolut pela tela (o caminho do leitor em parsers/revolut.js) ----------
// carteira configurada e vazia; escolhe o extrato de exemplo e confere que o que ficou salvo é exatamente o que o
// leitor devolve, mês a mês, e que importar de novo não duplica nada
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'Europe/Dublin' });
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(AGORA);
  pg.on('pageerror', e => erros.push('importar Revolut: ' + e.message));
  await pg.goto(URL_PAGINA);
  await pg.evaluate(st => { localStorage.clear(); localStorage.setItem('cortex-financas.v3', st); }, JSON.stringify({ v: 3, months: {}, over: {}, plan, summary: null, div: null }));
  await pg.reload(); await pg.waitForTimeout(150);
  const EXEMPLO = join(RAIZ, 'exemplo/extrato-exemplo.csv');
  const esperado = {};
  api.extractTx(api.parseCSV(readFileSync(EXEMPLO, 'utf8')), 'EUR').forEach(t => { (esperado[t[0].slice(0, 7)] = esperado[t[0].slice(0, 7)] || []).push(t); });
  Object.values(esperado).forEach(l => l.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)));
  await pg.setInputFiles('#fin-csv', EXEMPLO); await pg.waitForSelector('#toast:not([hidden])');
  const aviso1 = await pg.textContent('#toast-txt');
  const salvo = await pg.evaluate(() => JSON.parse(localStorage.getItem('cortex-financas.v4')).carteiras[0]);
  await pg.evaluate(() => { document.getElementById('toast').hidden = true; });
  await pg.setInputFiles('#fin-csv', EXEMPLO); await pg.waitForSelector('#toast:not([hidden])');
  const aviso2 = await pg.textContent('#toast-txt'), aviso2Cod = await pg.getAttribute('#toast', 'data-aviso');
  const igual = JSON.stringify(salvo.months) === JSON.stringify(esperado);
  const n = Object.values(esperado).reduce((a, l) => a + l.length, 0);
  if (!igual) problemas.push('importar Revolut: os meses salvos não são os que o leitor devolve');
  const resumo = api.extractSummary(api.parseCSV(readFileSync(EXEMPLO, 'utf8'))); // o exemplo não tem resumo de saldos: null
  if (JSON.stringify(salvo.summary || null) !== JSON.stringify(resumo)) problemas.push('importar Revolut: o resumo de saldos salvo não é o do leitor');
  if (JSON.stringify(salvo.periodos) !== JSON.stringify([{ de: '2026-07-01', ate: '2026-10-15' }])) problemas.push('importar Revolut: período salvo inesperado ' + JSON.stringify(salvo.periodos));
  if (aviso2Cod !== 'importar.nadaNovo') problemas.push('importar Revolut: importar de novo não foi "Nada novo" (' + aviso2 + ')');
  console.log(`importar Revolut pela tela: ${igual ? n + ' movimentos salvos iguais aos do leitor' : 'FALHOU'} ("${aviso1}"); de novo: "${aviso2}"`);
  await ctx.close();
}

// ---------- importar o extrato do BTG pela tela (parsers/btg.js): o que fica salvo é o que o leitor devolve ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'Europe/Dublin' });
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(AGORA);
  pg.on('pageerror', e => erros.push('importar BTG: ' + e.message));
  await pg.goto(URL_PAGINA);
  await pg.evaluate(st => { localStorage.clear(); for (const k in st) localStorage.setItem(k, st[k]); }, comBtg());
  await pg.reload(); await pg.waitForTimeout(150);
  const B = new Function(core + '; return { LEITORES, prepararPlanilha };')(), X = carregarXLSX();
  const L = B.LEITORES.btg.ler(B.prepararPlanilha(X, new Uint8Array(BTG_XLS.buffer), 'xls').rows, 'BRL');
  await pg.setInputFiles('#fin-csv', BTG_XLS); await pg.waitForSelector('#fin-fimp .imp-tot');
  await pg.click('#fin-fimp button[type=submit]'); await pg.waitForSelector('#toast:not([hidden])');
  const aviso1 = await pg.textContent('#toast-txt');
  const c = await pg.evaluate(() => JSON.parse(localStorage.getItem('cortex-financas.v4')).carteiras[1]);
  const salvos = Object.values(c.months).flat().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const ok = JSON.stringify(salvos) === JSON.stringify(L.tx.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) && JSON.stringify(c.saldosDia) === JSON.stringify(L.saldosDia) && !c.importacao;
  await pg.evaluate(() => { document.getElementById('toast').hidden = true; });
  // de novo: a prévia avisa que todos já estavam salvos e não deixa importar
  await pg.setInputFiles('#fin-csv', BTG_XLS); await pg.waitForSelector('#fin-fimp .imp-tot');
  const rep2 = await pg.evaluate(() => { const p = document.querySelector('#fin-fimp [data-aviso="importar.repetidos"]'); return p ? { n: +p.getAttribute('data-n'), txt: p.textContent } : { n: 0, txt: '' }; }), aviso2 = rep2.txt;
  const travado = await pg.evaluate(() => document.querySelector('#fin-fimp button[type=submit]').disabled);
  if (!ok) problemas.push('importar BTG: o que ficou salvo não é o que o leitor devolve (movimentos com tipo, saldos do dia, sem mapeamento lembrado)');
  if (rep2.n !== L.tx.length || !travado) problemas.push('importar BTG: importar de novo não avisou que tudo já estava salvo');
  const tipos = salvos.reduce((o, t) => ((o[t[2]] = (o[t[2]] || 0) + 1), o), {});
  console.log(`importar BTG pela tela: ${ok ? salvos.length + ' movimentos salvos iguais aos do leitor (' + Object.entries(tipos).map(([k, v]) => v + ' ' + k).join(', ') + '), ' + Object.keys(c.saldosDia).length + ' saldos do dia' : 'FALHOU'} ("${aviso1}"); de novo, a prévia: "${aviso2}"${travado ? ', sem botão de importar' : ''}`);
  await ctx.close();
}

// ---------- importar o extrato do Itaú pela tela (PDF, parsers/itau.js), marcando a sugestão de Pix entre contas ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'Europe/Dublin' });
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(AGORA);
  pg.on('pageerror', e => erros.push('importar Itaú: ' + e.message));
  await pg.goto(URL_PAGINA);
  await pg.evaluate(st => { localStorage.clear(); for (const k in st) localStorage.setItem(k, st[k]); }, comItau());
  await pg.reload(); await pg.waitForTimeout(150);
  const N = new Function(core + '; return { LEITORES, lerPdf, tabelaDoPdf };')();
  const L = N.LEITORES.itau.ler(N.tabelaDoPdf(await N.lerPdf(await carregarPdfjs(), new Uint8Array(ITAU_PDF.buffer))).linhas, 'BRL', { titular: 'Maria Exemplo' });
  await pg.setInputFiles('#fin-csv', ITAU_PDF); await pg.waitForSelector('#fin-fimp .imp-tot');
  const desmarcada = await pg.evaluate(() => { const c = document.getElementById('fin-i-titular'); return !!c && !c.checked; });
  await pg.check('#fin-i-titular');
  await pg.click('#fin-fimp button[type=submit]'); await pg.waitForSelector('#toast:not([hidden])');
  const aviso = await pg.textContent('#toast-txt');
  const c = await pg.evaluate(() => JSON.parse(localStorage.getItem('cortex-financas.v4')).carteiras[1]);
  const ord = l => l.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const salvos = ord(Object.values(c.months).flat());
  const marcados = Object.entries(c.over || {});
  const ok = JSON.stringify(salvos) === JSON.stringify(ord(L.tx)) && JSON.stringify(c.saldosDia) === JSON.stringify(L.saldosDia) && !c.importacao;
  const sugOk = desmarcada && marcados.length === L.sugestoes.length && marcados.every(([k, v]) => (k[0] === '+' ? v === '_ignore' : v === 'brasil'));
  if (!ok) problemas.push('importar Itaú: o que ficou salvo não é o que o leitor devolve');
  if (!sugOk) problemas.push('importar Itaú: a sugestão de Pix entre contas não começou desmarcada ou não marcou só os Pix sugeridos');
  const tipos = salvos.reduce((o, t) => ((o[t[2]] = (o[t[2]] || 0) + 1), o), {});
  console.log(`importar Itaú pela tela: ${ok ? salvos.length + ' movimentos iguais aos do leitor (' + Object.entries(tipos).map(([k, v]) => v + ' ' + k).join(', ') + '), ' + Object.keys(c.saldosDia).length + ' saldos do dia' : 'FALHOU'}; sugestão de Pix: ${sugOk ? 'começou desmarcada; marcada, ' + marcados.length + ' Pix (' + marcados.filter(([k]) => k[0] === '+').length + ' entradas entre contas, ' + marcados.filter(([k]) => k[0] !== '+').length + ' saídas para outra conta sua)' : 'FALHOU'} ("${aviso}")`);
  await ctx.close();
}

// ---------- Pix para o titular depois da importação: aplicar e desfazer, pela tela ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'Europe/Dublin' });
  const pg = await ctx.newPage();
  await pg.clock.setFixedTime(AGORA);
  pg.on('pageerror', e => erros.push('Pix para o titular: ' + e.message));
  await pg.goto(URL_PAGINA);
  await pg.evaluate(st => { localStorage.clear(); for (const k in st) localStorage.setItem(k, st[k]); }, comItau(true));
  await pg.reload(); await pg.waitForTimeout(150);
  await pg.click('[data-carteira="c2"]'); await pg.click('#fin-revd > summary'); await pg.waitForSelector('#fin-pixtit');
  const estado = () => pg.evaluate(() => { const c = JSON.parse(localStorage.getItem('cortex-financas.v4')).carteiras[1]; return { over: c.over || {}, ap: c.pixTitular || [] }; });
  const caixas = await pg.evaluate(() => [...document.querySelectorAll('[data-pixtit]')].map(i => i.checked));
  const antes = await estado();
  // "Marcar todos de <mês>" e "Marcar todos" só marcam as caixas: nada é gravado até "Aplicar aos marcados"
  const marcadas = () => pg.evaluate(() => [...document.querySelectorAll('[data-pixtit]')].filter(i => i.checked).map(i => i.getAttribute('data-pixtit')));
  await pg.click('[data-pixtit-marcar="2026-08"]');
  const soAgosto = await marcadas(), gravadoMes = await estado();
  await pg.click('[data-pixtit-marcar=""]');
  const todas = await marcadas(), gravadoTodos = await estado();
  const botoes = await pg.evaluate(() => [...document.querySelectorAll('[data-pixtit-marcar]')].map(b => b.getAttribute('data-pixtit-marcar')));
  const marcarOk = JSON.stringify(soAgosto) === JSON.stringify(['PIX TRANSF MARIA E07/08', '+PIX TRANSF MARIA E18/08']) && todas.length === 4 &&
    JSON.stringify(gravadoMes) === JSON.stringify(antes) && JSON.stringify(gravadoTodos) === JSON.stringify(antes) &&
    JSON.stringify(botoes) === JSON.stringify(['', '2026-08', '2026-09', '2026-10']);
  if (!marcarOk) problemas.push('Pix para o titular: "Marcar todos" ou "Marcar todos de <mês>" não marcou só as caixas certas, ou gravou algo');
  await pg.evaluate(() => document.querySelectorAll('[data-pixtit]').forEach(i => { i.checked = false; }));
  await pg.check('[data-pixtit="PIX TRANSF MARIA E07/08"]'); await pg.check('[data-pixtit="+PIX TRANSF MARIA E18/08"]');
  await pg.click('[data-pixtit-aplicar]'); await pg.waitForSelector('[data-pixtit-desfazer]');
  const depois = await estado(), resto = await pg.evaluate(() => document.querySelectorAll('[data-pixtit]').length);
  await pg.click('[data-pixtit-desfazer]'); await pg.waitForFunction(() => !document.querySelector('[data-pixtit-desfazer]'));
  const desfeito = await estado();
  const ok = caixas.length === 4 && caixas.every(c => !c) && Object.keys(antes.over).length === 0 &&
    JSON.stringify(depois.over) === JSON.stringify({ 'PIX TRANSF MARIA E07/08': 'brasil', '+PIX TRANSF MARIA E18/08': '_ignore' }) && depois.ap.length === 2 && resto === 2 &&
    Object.keys(desfeito.over).length === 0 && desfeito.ap.length === 0;
  if (!ok) problemas.push('Pix para o titular: aplicar ou desfazer não deu o esperado');
  console.log(`Pix para o titular, marcar: ${marcarOk ? '"Marcar todos de agosto de 2026" marca as 2 caixas de agosto, "Marcar todos" as 4, e nada é gravado' : 'FALHOU'}`);
  console.log(`Pix para o titular pela tela: ${ok ? '4 sugeridos, todos desmarcados; aplicar 2 grava 1 envio e 1 entre contas, sobram 2 na lista; desfazer volta ao automático' : 'FALHOU'}`);
  await ctx.close();
}

// ---------- nota "inclui X de envios para outra conta sua": só mostra; o Gastou continua o do modelo ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'Europe/Dublin' });
  const pg = await ctx.newPage(), digitos = s => Number(String(s).replace(/[^\d]/g, ''));
  await pg.clock.setFixedTime(AGORA);
  pg.on('pageerror', e => erros.push('nota de envios: ' + e.message));
  await pg.goto(URL_PAGINA);
  await pg.evaluate(st => { localStorage.clear(); for (const k in st) localStorage.setItem(k, st[k]); }, D);
  await pg.reload(); await pg.waitForTimeout(150);
  const g = api.buildModel(comDados.months, {}, plan.titular, plan.pais).by['2026-09'];
  const cartao = await pg.evaluate(() => { const k = document.querySelector('.kpi[data-kpi="gastou"]'), p = k.querySelector('[data-nota="envios"]'); return { v: k.querySelector('.v').textContent, nota: p ? p.textContent : '', temNota: !!p }; });
  const linha = await pg.evaluate(() => !!document.querySelector('tr[data-linha="envios"]'));
  const okCarteira = digitos(cartao.v) === Math.round(g.gasto) && cartao.temNota && digitos(cartao.nota) === Math.round(g.spend.brasil) && linha;
  // no Resumo (Revolut + Banco Exemplo, transferências do exemplo): a nota é a soma das carteiras, na moeda principal
  await pg.evaluate(st => { localStorage.clear(); for (const k in st) localStorage.setItem(k, st[k]); }, TRANSFERENCIAS);
  await pg.reload(); await pg.waitForTimeout(150);
  const x = JSON.parse(TRANSFERENCIAS['cortex-financas.v4']), R = api.resumir(x), Q = api.mesResumo(R, x, R.meses.filter(m => m !== R.partial).slice(-1)[0]);
  const resumo = await pg.evaluate(() => { const k = document.querySelector('#fin-rmes .kpi[data-kpi="gastou"]'); return { v: k.querySelector('.v').textContent, nota: (k.querySelector('[data-nota="envios"]') || {}).textContent || '' }; });
  const okResumo = digitos(resumo.v) === Math.round(Q.total.gasto) && digitos(resumo.nota) === Math.round(Q.total.spend.brasil);
  if (!okCarteira || !okResumo) problemas.push(`nota de envios: carteira ${okCarteira ? 'ok' : 'FALHOU'}, Resumo ${okResumo ? 'ok' : 'FALHOU'} (${cartao.v} / ${cartao.nota} / ${resumo.v} / ${resumo.nota})`);
  console.log(`nota de envios: ${okCarteira && okResumo ? `carteira "${cartao.v}" ${cartao.nota.replace(/\s+/g, ' ')}; mês a mês com a linha "dos quais"; Resumo "${resumo.v}" ${resumo.nota.replace(/\s+/g, ' ')} — os valores do Gastou são os do modelo` : 'FALHOU'}`);
  await ctx.close();
}

// ---------- aviso dos envios: aparece uma vez, a resposta fica lembrada, e Configurações continua mandando ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'Europe/Dublin' });
  const pg = await ctx.newPage(), r = [];
  await pg.clock.setFixedTime(AGORA);
  pg.on('pageerror', e => erros.push('aviso dos envios: ' + e.message));
  const abrir = async () => { await pg.goto(URL_PAGINA); await pg.evaluate(st => { localStorage.clear(); for (const k in st) localStorage.setItem(k, st[k]); }, comItau(true, { aviso: true })); await pg.reload(); await pg.waitForTimeout(150); await pg.click('[data-carteira="c2"]'); };
  const tem = () => pg.evaluate(() => !!document.getElementById('fin-avenvios'));
  const cart = () => pg.evaluate(() => { const c = JSON.parse(localStorage.getItem('cortex-financas.v4')).carteiras[1]; return { envios: c.envios || 'gasto', decidido: !!c.enviosDecidido }; });
  const gastou = () => pg.evaluate(() => document.querySelector('.kpi[data-kpi="gastou"] .v').textContent);
  // "Continua gasto": some, fica lembrado depois de recarregar, nada muda nos números
  await abrir(); r.push(await tem()); const g0 = await gastou();
  await pg.click('[data-envios="gasto"]'); r.push(!(await tem())); r.push(JSON.stringify(await cart()) === JSON.stringify({ envios: 'gasto', decidido: true }));
  await pg.reload(); await pg.click('[data-carteira="c2"]'); r.push(!(await tem())); r.push((await gastou()) === g0);
  // "Contar como movido": some, a opção vira movido e o Gastou cai; voltar para gasto em Configurações não traz o aviso
  await abrir(); await pg.click('[data-envios="movido"]'); r.push(!(await tem())); r.push(JSON.stringify(await cart()) === JSON.stringify({ envios: 'movido', decidido: true })); const g1 = await gastou();
  r.push(Number(g1.replace(/\D/g, '')) < Number(g0.replace(/\D/g, '')));
  await pg.click('[data-fin-setup]'); await pg.selectOption('#fin-w-c2-envios', 'gasto'); await pg.click('#fin-fsetup button[type=submit]'); await pg.waitForTimeout(300);
  await pg.click('[data-carteira="c2"]').catch(() => {}); r.push(JSON.stringify(await cart()) === JSON.stringify({ envios: 'gasto', decidido: true })); r.push(!(await tem()));
  const ok = r.every(Boolean);
  if (!ok) problemas.push('aviso dos envios: ' + JSON.stringify(r));
  console.log(`aviso dos envios: ${ok ? `aparece; "Continua gasto" some e fica lembrado (Gastou ${g0} igual); "Contar como movido" some e o Gastou cai para ${g1}; voltar para gasto em Configurações não traz o aviso de volta` : 'FALHOU ' + JSON.stringify(r)}`);
  await ctx.close();
}

// ---------- cadastro da carteira: moeda filtra os países, país preenche a moeda (sem mexer em moeda travada) ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'Europe/Dublin' });
  const pg = await ctx.newPage(), r = {};
  await pg.clock.setFixedTime(AGORA);
  pg.on('pageerror', e => erros.push('países e moedas: ' + e.message));
  await pg.goto(URL_PAGINA);
  await pg.evaluate(st => { localStorage.clear(); for (const k in st) localStorage.setItem(k, st[k]); }, CARTEIRAS);
  await pg.reload(); await pg.waitForTimeout(150);
  await pg.click('[data-fin-setup]'); await pg.click('#fin-wnova > summary');
  const opcoesPais = id => pg.evaluate(i => [...document.querySelectorAll(i + ' option')].map(o => o.value), id);
  await pg.selectOption('#fin-wn-moeda', 'EUR'); r.euro = (await opcoesPais('#fin-wn-pais optgroup:first-child')).length; r.todos = (await opcoesPais('#fin-wn-pais')).length;
  await pg.selectOption('#fin-wn-pais', 'BR'); r.brasil = await pg.inputValue('#fin-wn-moeda');
  await pg.selectOption('#fin-wn-pais', 'GB'); r.reino = await pg.inputValue('#fin-wn-moeda');
  await pg.selectOption('#fin-wn-moeda', 'EUR'); r.volta = await pg.inputValue('#fin-wn-pais');
  // nenhum país usa dólar: escolher USD não mexe no país
  await pg.selectOption('#fin-wn-pais', 'BR'); await pg.selectOption('#fin-wn-moeda', 'USD'); r.dolar = await pg.inputValue('#fin-wn-pais');
  // o banco preenche moeda e país só enquanto a pessoa não mexeu neles (formulário recém-aberto)
  await pg.reload(); await pg.waitForTimeout(150); await pg.click('[data-fin-setup]'); await pg.click('#fin-wnova > summary');
  const mp = () => pg.evaluate(() => document.querySelector('#fin-wn-moeda').value + '/' + document.querySelector('#fin-wn-pais').value);
  await pg.selectOption('#fin-wn-banco', 'itau'); r.itau = await mp();
  await pg.selectOption('#fin-wn-banco', 'wise'); r.wise = await mp();
  await pg.selectOption('#fin-wn-banco', 'revolut'); r.revolut = await mp();
  await pg.selectOption('#fin-wn-banco', 'itau'); await pg.selectOption('#fin-wn-banco', 'boi'); r.boi = await mp();
  await pg.selectOption('#fin-wn-banco', 'outro'); r.outro = await mp();
  await pg.selectOption('#fin-wn-pais', 'PT'); await pg.selectOption('#fin-wn-banco', 'nubank'); r.mexeu = await mp();
  // carteira existente sem extrato (c2, Wise em libra): trocar o banco não mexe em moeda nem país
  await pg.selectOption('#fin-w-c2-banco', 'btg'); r.existente = await pg.evaluate(() => document.querySelector('#fin-w-c2-moeda').value + '/' + document.querySelector('#fin-w-c2-pais').value);
  // a carteira com extrato (c1, euro): moeda travada; trocar o país não muda a moeda
  await pg.selectOption('#fin-w-c1-pais', 'BR'); r.travada = await pg.inputValue('#fin-w-c1-moeda');
  r.nota = await pg.evaluate(() => !!document.querySelector('#fin-wnova [data-nota="regras"]'));
  const ok = r.euro === 27 && r.todos === 29 && r.brasil === 'BRL' && r.reino === 'GBP' && r.volta === 'IE' && r.dolar === 'BR' && r.itau === 'BRL/BR' && r.wise === 'BRL/BR' && r.revolut === 'EUR/IE' && r.boi === 'EUR/IE' && r.outro === 'EUR/IE' && r.mexeu === 'EUR/PT' && r.existente === 'GBP/GB' && r.travada === 'EUR' && r.nota;
  if (!ok) problemas.push('países e moedas: ' + JSON.stringify(r));
  console.log(`países e moedas: ${ok ? 'EUR mostra os 27 países no primeiro grupo (29 no total); Brasil põe BRL, Reino Unido põe GBP; de volta a EUR, Irlanda; USD mantém o país; banco preenche (Itaú → BRL/Brasil, Revolut e Bank of Ireland → EUR/Irlanda, Wise e Outro banco não mexem) e nunca depois da escolha da pessoa nem em carteira existente; moeda travada não muda; aviso das regras de lojas' : 'FALHOU ' + JSON.stringify(r)}`);
  await ctx.close();
}

// ---------- o leitor de planilhas só é pedido quando a pessoa escolhe uma planilha, e uma vez só ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'Europe/Dublin' });
  const pg = await ctx.newPage(), pedidos = [];
  pg.on('request', r => { if (r.url().includes('/vendor/')) pedidos.push(r.url()); });
  pg.on('pageerror', e => erros.push('leitor de planilhas: ' + e.message));
  await pg.goto(URL_PAGINA);
  await pg.evaluate(st => { localStorage.clear(); for (const k in st) localStorage.setItem(k, st[k]); }, comGenerica(false));
  await pg.reload(); await pg.waitForTimeout(150);
  const ao = { abrir: pedidos.length };
  await pg.setInputFiles('#fin-csv', GENERICO); await pg.waitForSelector('#fin-fimp'); await pg.click('[data-imp=cancelar]');
  ao.csv = pedidos.length;
  await pg.setInputFiles('#fin-csv', PLANILHA); await pg.waitForSelector('#fin-fimp'); await pg.click('[data-imp=cancelar]');
  ao.planilha = pedidos.length;
  await pg.setInputFiles('#fin-csv', PLANILHA_ABAS); await pg.waitForSelector('#fin-i-aba');
  ao.segunda = pedidos.length;
  const ok = ao.abrir === 0 && ao.csv === 0 && ao.planilha === 1 && ao.segunda === 1;
  if (!ok) problemas.push(`leitor de planilhas: pedidos ao abrir ${ao.abrir}, depois do CSV ${ao.csv}, da 1ª planilha ${ao.planilha}, da 2ª ${ao.segunda} (esperado 0, 0, 1, 1)`);
  console.log(`leitor de planilhas: ${ok ? 'não carrega ao abrir nem com CSV; carrega uma vez na primeira planilha' : 'FALHOU'}`);
  await ctx.close();
}
await browser.close();

// ---------- CSP nos três motores (Chromium, Firefox, WebKit), pelo servidor local e aberta do disco (file://) ----------
// Em cada um: o painel abre, uma planilha é lida (o SheetJS carrega), o backup é baixado, sem nenhuma violação.
// Depois a prova da isca: um segundo servidor, em outra porta, conta toda conexão que recebe; a página tenta
// alcançá-lo de 12 jeitos e tem que dar zero. Navegação (location, window.open, links, envio de formulário) não é
// tentada: a CSP em <meta> não a restringe, e isso é coberto por um teste estático (veja o CLAUDE.md).
{
  let conexoes = 0;
  const isca = createServer((req, res) => res.end('isca'));
  isca.on('connection', () => { conexoes++; });
  await new Promise(r => isca.listen(0, '127.0.0.1', r));
  const ISCA = `http://127.0.0.1:${isca.address().port}`;
  const tentativas = async ISCA => {
    const r = {}, ate = p => Promise.race([p, new Promise(ok => setTimeout(() => ok('sem resposta'), 1500))]);
    const evento = (el, ok) => { el.onload = () => ok('passou'); el.onerror = () => ok('bloqueado'); };
    r.fetch = await ate(fetch(ISCA + '/fetch').then(() => 'passou', () => 'bloqueado'));
    r.fetchMesmaOrigem = await ate(fetch('index.html').then(() => 'passou', () => 'bloqueado'));
    r.xhr = await ate(new Promise(ok => { const x = new XMLHttpRequest(); evento(x, ok); try { x.open('GET', ISCA + '/xhr'); x.send(); } catch (e) { ok('bloqueado'); } }));
    r.websocket = await ate(new Promise(ok => { try { const w = new WebSocket(ISCA.replace('http', 'ws') + '/ws'); w.onopen = () => ok('passou'); w.onerror = () => ok('bloqueado'); } catch (e) { ok('bloqueado'); } }));
    r.eventsource = await ate(new Promise(ok => { try { const e = new EventSource(ISCA + '/es'); e.onopen = () => ok('passou'); e.onerror = () => { e.close(); ok('bloqueado'); }; } catch (er) { ok('bloqueado'); } }));
    try { r.beacon = navigator.sendBeacon(ISCA + '/beacon', 'x') ? 'aceito pelo navegador' : 'bloqueado'; } catch (e) { r.beacon = 'bloqueado'; }
    r.imagem = await ate(new Promise(ok => { const i = new Image(); evento(i, ok); i.src = ISCA + '/imagem'; }));
    r.script = await ate(new Promise(ok => { const s = document.createElement('script'); evento(s, ok); s.src = ISCA + '/script.js'; document.head.appendChild(s); }));
    r.fonte = await ate(new FontFace('Isca', `url(${ISCA}/fonte.woff2)`).load().then(() => 'passou', () => 'bloqueado'));
    const f = document.createElement('iframe'); f.src = ISCA + '/iframe'; document.body.appendChild(f); r.iframe = 'tentado';
    const l = document.createElement('link'); l.rel = 'prefetch'; l.href = ISCA + '/prefetch'; document.head.appendChild(l); r.prefetch = 'tentado';
    // o atributo style é permitido (style-src-attr), mas o url() dentro dele não alcança nada (img-src 'self')
    const d = document.createElement('div'); d.setAttribute('style', `width:10px;height:10px;background-image:url(${ISCA}/estilo)`); document.body.appendChild(d);
    getComputedStyle(d).backgroundImage; r.urlNoStyle = 'tentado';
    await new Promise(ok => setTimeout(ok, 1500));
    return r;
  };
  for (const tipo of [chromium, firefox, webkit]) {
    let b;
    try { b = await tipo.launch({ timeout: 60000 }); }
    catch (e) { naoVerificados.push(`${tipo.name()}: o navegador não abriu (${e.message.split('\n')[0]})`); console.log(`CSP ${tipo.name()}: NÃO VERIFICADO, o navegador não abriu`); continue; }
    for (const modo of ['servidor', 'file://']) {
      const rot = `CSP ${tipo.name()} ${modo}`, antes = conexoes, falhas = [];
      const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'Europe/Dublin', acceptDownloads: true });
      const pg = await ctx.newPage();
      await pg.addInitScript(anotarViolacoes);
      pg.on('pageerror', e => falhas.push('erro na página: ' + e.message));
      let workers = 0; pg.on('worker', () => { workers++; });
      try {
        await pg.goto(modo === 'servidor' ? URL_PAGINA : pathToFileURL(join(RAIZ, 'index.html')).href);
        await pg.evaluate(st => { localStorage.clear(); for (const k in st) localStorage.setItem(k, st[k]); }, comGenerica(false));
        await pg.reload(); await pg.waitForSelector('.vazio-grande, #fin-app .sec', { timeout: 10000 });
        const fontes = await pg.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(f => f.status === 'loaded').length; });
        if (!fontes) falhas.push('nenhuma fonte do projeto carregou');
        await pg.setInputFiles('#fin-csv', PLANILHA); await pg.waitForSelector('#fin-fimp', { timeout: 10000 });
        if (!(await pg.evaluate(() => typeof window.XLSX === 'object'))) falhas.push('o SheetJS não carregou');
        await pg.click('[data-imp=cancelar]');
        // PDF: servido, o pdf.js carrega e roda na própria página (nenhum worker); do disco, o aviso
        await pg.evaluate(() => { document.getElementById('toast').hidden = true; });
        await pg.setInputFiles('#fin-csv', ITAU_PDF);
        if (modo === 'servidor') {
          await pg.waitForSelector('#fin-fimp .imp-tot', { timeout: 15000 });
          if (!(await pg.evaluate(() => !!(window.pdfjsWorker && window.pdfjsWorker.WorkerMessageHandler)))) falhas.push('o pdf.js não carregou');
          await pg.click('[data-imp=cancelar]');
        } else {
          await pg.waitForSelector('#toast:not([hidden])', { timeout: 10000 });
          if ((await pg.getAttribute('#toast', 'data-aviso')) !== 'importar.pdfDoDisco') falhas.push('do disco, o PDF não deu o aviso de abrir pelo npm start');
        }
        if (workers) falhas.push(workers + ' worker(s) criado(s): o pdf.js tinha que rodar na própria página');
        await pg.click('[data-fin-setup]');
        const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 10000 }), pg.click('[data-backup=baixar]')]);
        const bk = JSON.parse(readFileSync(await dl.path(), 'utf8'));
        if (bk.v !== 4 || !bk.carteiras || bk.carteiras.length !== 2) falhas.push('o backup baixado não é o esperado');
        const v = await pg.evaluate(() => window.__violacoes);
        v.forEach(x => falhas.push('violação da CSP no uso normal: ' + x));
        const r = await pg.evaluate(tentativas, ISCA);
        const passaram = Object.entries(r).filter(([, x]) => x === 'passou').map(([k]) => k);
        if (passaram.length) falhas.push('passaram pela CSP: ' + passaram.join(', '));
        const nV = (await pg.evaluate(() => window.__violacoes)).length;
        const n = conexoes - antes;
        if (n) falhas.push(`a isca recebeu ${n} conexão(ões)`);
        console.log(`${rot}: ${falhas.length ? 'FALHOU' : 'ok'}; painel, planilha (SheetJS), ${modo === 'servidor' ? 'PDF (pdf.js, sem worker)' : 'aviso do PDF aberto do disco'} e backup sem violação; ` +
          `isca: 12 tentativas, ${n} conexões recebidas, ${nV} violações registradas (${Object.entries(r).map(([k, x]) => k + ' ' + x).join(', ')})`);
      } catch (e) { falhas.push('não terminou: ' + e.message.split('\n')[0]); console.log(`${rot}: FALHOU`); }
      falhas.forEach(f => problemas.push(`${rot}: ${f}`));
      await ctx.close();
    }
    await b.close();
  }
  isca.close();
}
servidor.close();

console.log(`${TELAS.length} telas fotografadas em telas/atual/`);
console.log(erros.length ? 'erros no console:\n  ' + erros.join('\n  ') : 'console sem erros');
console.log(problemas.length ? `conferência: ${problemas.length} problema(s)\n  ` + problemas.join('\n  ') : 'conferência: nada além da borda, nada cortado, nenhum controle sobreposto, contraste AA em todo texto');
const falhouConferencia = erros.length || problemas.length;
if (naoVerificados.length) console.log('\n' + '!'.repeat(78) + '\n!! CSP NÃO VERIFICADA em ' + naoVerificados.length + ' motor(es); o resto da conferência vale:\n' +
  naoVerificados.map(x => '!!   ' + x).join('\n') + '\n!! Veja "Segurança de conteúdo (CSP)" no CLAUDE.md para voltar a testar.\n' + '!'.repeat(78));

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
  const semScript = l => !/(^|>)script /.test(l) && !/^(head[ >]| )/.test(l); // referências antigas ainda listam <script>, <html> e o <head>
  const ea = readFileSync(join(REF, f.replace('.png', '.estilos.txt')), 'utf8').split('\n').filter(semScript);
  const eb = readFileSync(join(ATUAL, f.replace('.png', '.estilos.txt')), 'utf8').split('\n').filter(semScript);
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
