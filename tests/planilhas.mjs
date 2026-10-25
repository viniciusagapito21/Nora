// Ajuda dos testes de planilha: carrega o núcleo e o SheetJS do projeto, e monta planilhas inventadas em memória.
// Nada aqui lê arquivo de banco de verdade; tudo é gerado pelo próprio teste.
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

const ler = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

export function carregarNucleo(nomes) {
  const appJs = ler('app.js');
  const antes = [...ler('index.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(f => f !== 'app.js');
  const core = antes.map(ler).join('\n') + appJs.slice(appJs.indexOf('/*CORE-START*/'), appJs.indexOf('/*CORE-END*/'));
  return new Function(core + '; return { ' + nomes.join(', ') + ' };')();
}

// o mesmo arquivo que a página carrega (vendor/sheetjs/xlsx.core.min.js)
export function carregarXLSX() { return new Function(ler('vendor/sheetjs/xlsx.core.min.js') + '; return XLSX;')(); }

// ---------- .xlsx montado à mão: zip + o XML que o Excel grava (não depende do SheetJS para escrever) ----------
const TAB = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (const x of b) c = TAB[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
export function zip(arquivos) {
  const partes = [], central = []; let pos = 0, n = 0;
  for (const [nome, cont] of Object.entries(arquivos)) {
    const dados = Buffer.from(cont), comp = deflateRawSync(dados), nm = Buffer.from(nome), crc = crc32(dados);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(dados.length, 22); h.writeUInt16LE(nm.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(dados.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(pos, 42);
    partes.push(h, nm, comp); central.push(c, nm); pos += 30 + nm.length + comp.length; n++;
  }
  const cd = Buffer.concat(central), fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(n, 8); fim.writeUInt16LE(n, 10); fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(pos, 16);
  return new Uint8Array(Buffer.concat([...partes, cd, fim]));
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const coluna = i => (i >= 26 ? coluna(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));
// número de série do Excel de uma data (e hora) no calendário de 1900 ou de 1904
export function serial(iso, hora = '00:00', d1904 = false) {
  const [y, m, d] = iso.split('-').map(Number), [hh, mm] = hora.split(':').map(Number);
  const base = d1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return (Date.UTC(y, m - 1, d) - base) / 864e5 + (hh * 60 + mm) / 1440;
}
// célula: texto, número, null (vazia) ou { data: 'aaaa-mm-dd', hora: 'hh:mm' } (data de verdade, com formato de data)
function celula(v, ref, d1904) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
  if (typeof v === 'object') return `<c r="${ref}" s="${v.hora ? 2 : 1}"><v>${serial(v.data, v.hora, d1904)}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
// abas: [{ nome, linhas: [[célula…]], mescladas: ['A1:F1'] }]
export function xlsxAMao(abas, { d1904 = false } = {}) {
  const f = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      abas.map((a, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${NS}><workbookPr${d1904 ? ' date1904="1"' : ''}/><sheets>` +
      abas.map((a, i) => `<sheet name="${esc(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      abas.map((a, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ${NS}><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm"/></numFmts><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`
  };
  abas.forEach((a, i) => {
    const linhas = a.linhas.map((l, r) => `<row r="${r + 1}">` + l.map((v, c) => celula(v, coluna(c) + (r + 1), d1904)).join('') + '</row>').join('');
    const mesc = a.mescladas && a.mescladas.length ? `<mergeCells count="${a.mescladas.length}">` + a.mescladas.map(m => `<mergeCell ref="${m}"/>`).join('') + '</mergeCells>' : '';
    f[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${NS}><sheetData>${linhas}</sheetData>${mesc}</worksheet>`;
  });
  return zip(f);
}

// a mesma tabela gravada pelo SheetJS (xlsx ou xls), com datas e valores como células de data e número
export function gravarComBiblioteca(X, linhas, bookType, nome = 'Extrato') {
  const ws = X.utils.aoa_to_sheet(linhas.map(l => l.map(v => (v && typeof v === 'object' ? serial(v.data, v.hora) : v))));
  linhas.forEach((l, r) => l.forEach((v, c) => { if (v && typeof v === 'object') ws[coluna(c) + (r + 1)].z = v.hora ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy'; }));
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, nome);
  return new Uint8Array(X.write(wb, { type: 'array', bookType }));
}

// as linhas de um CSV inventado viram células de planilha: data dd/mm/aaaa (com hora opcional) vira data de
// verdade, número no formato do arquivo vira número; o resto continua texto
export function paraCelulas(rows, fmtNum) {
  return rows.map(r => r.map(c => {
    const s = String(c).trim();
    let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}:\d{2}))?$/);
    if (m) return { data: `${m[3]}-${m[2]}-${m[1]}`, hora: m[4] };
    const t = fmtNum === 'virgula' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    if (/^-?\d+(\.\d+)?$/.test(t) && /[.,]/.test(s)) return Number(t);
    return c;
  }));
}

// contêiner do Office como o de um .xlsx protegido por senha: só as partes de criptografia (conteúdo inventado)
export function comSenha(X) {
  const c = X.CFB.utils.cfb_new();
  X.CFB.utils.cfb_add(c, 'EncryptionInfo', new Uint8Array([4, 0, 4, 0, 0x40, 0, 0, 0]));
  X.CFB.utils.cfb_add(c, 'EncryptedPackage', new Uint8Array(64).map((_, i) => (i * 37) & 255));
  return new Uint8Array(X.CFB.write(c, { type: 'array' }));
}

// ---------- extrato inventado na estrutura do .xls do BTG (exemplo/extrato-btg-exemplo.xls) ----------
// A estrutura (colunas, rótulos, mesclas, formatos, bloco do topo e rodapé em cada página) foi copiada de um
// extrato real anonimizado; TODO o conteúdo abaixo é inventado. Saldo do dia = anterior + movimentos + extra
// (extra: rendimento que o extrato não lista, ou arredondamento de até R$ 0,05). Só os nomes de "Transação" que
// existem no arquivo real.
const BTG_INICIAL = 250000; // saldo antes do primeiro dia, em centavos
const BTG_DIAS = [
  ['01/08/2026', [['09:10', 'Transferência', 'Pix recebido', 'EMPRESA EXEMPLO LTDA', 480000]]],
  ['03/08/2026', [['10:22', 'Transferência', 'Pix enviado', 'IMOBILIARIA EXEMPLO', -180000], ['14:05', 'Transferência', 'Pix enviado', 'JOÃO EXEMPLO', -15000]]],
  ['05/08/2026', [['08:30', 'Investimentos', 'CDB BANCO BTG PACTUAL S A', 'CDB EXEMPLO', -100000]]],
  ['10/08/2026', [['07:45', 'Contas', 'Pagamento de fatura do cartão', 'CARTÃO EXEMPLO', -123456]]],
  ['12/08/2026', [['18:02', 'Transferência', 'Pix recebido', 'MARIA EXEMPLO', 50000]]],
  ['15/08/2026', [['12:40', 'Outra Categoria', 'Pix enviado', 'ANA EXEMPLO', -8000]], 42], // rendimento de 0,42
  ['20/08/2026', [['09:15', 'Contas', 'Pix enviado', 'ENERGIA EXEMPLO S.A.', -18744]]],
  ['28/08/2026', [['16:20', 'Transferência', 'Transferência enviada', 'MARIA EXEMPLO', -60000]]],
  ['01/09/2026', [['09:05', 'Transferência', 'Pix recebido', 'EMPRESA EXEMPLO LTDA', 480000]]],
  ['02/09/2026', [['10:10', 'Transferência', 'Pix enviado', 'IMOBILIARIA EXEMPLO', -180000]]],
  ['05/09/2026', [['08:31', 'Investimentos', 'CDB Banco BTG Pactual', 'CDB EXEMPLO', 102035]]],
  ['10/09/2026', [['07:50', 'Contas', 'Pagamento de fatura do cartão', 'CARTÃO EXEMPLO', -98710]]],
  ['14/09/2026', [['19:30', 'Transferência', 'Transferência recebida', 'MARIA EXEMPLO', 30000]], 3], // arredondamento de 0,03
  ['18/09/2026', [['08:12', 'Transferência', 'Pix enviado', 'PADARIA SÃO JOÃO', -4590], ['20:44', 'Outra Categoria', 'Pix enviado', 'PEDRO EXEMPLO', -6000]]],
  ['25/09/2026', [['08:29', 'Investimentos', 'CDB BANCO BTG PACTUAL S A', 'CDB EXEMPLO', -200000]]],
  ['01/10/2026', [['09:07', 'Transferência', 'Pix recebido', 'EMPRESA EXEMPLO LTDA', 480000]]],
  ['02/10/2026', [['10:05', 'Transferência', 'Pix enviado', 'IMOBILIARIA EXEMPLO', -180000]]],
  ['08/10/2026', [['21:10', 'Transferência', 'Pix enviado', 'MARIA EXEMPLO', -100000]]],
  ['10/10/2026', [['07:48', 'Contas', 'Pagamento de fatura do cartão', 'CARTÃO EXEMPLO', -110233]]],
  ['14/10/2026', [['15:35', 'Transferência', 'Pix recebido', 'JOÃO EXEMPLO', 12000]]]
];
// em que linha da tabela cada página termina, e onde a página 2 repete o cabeçalho no meio (como no arquivo real)
const BTG_PAGINAS = [16, 32], BTG_CAB_NO_MEIO = 22;
export function extratoBtgExemplo(X) {
  const linhas = []; // [{ tipo: 'mov'|'saldo', ... }] na ordem do extrato
  let saldo = BTG_INICIAL;
  for (const [dia, movs, extra = 0] of BTG_DIAS) {
    for (const [hora, cat, trans, desc, v] of movs) { linhas.push({ tipo: 'mov', dh: dia + ' ' + hora, cat, trans, desc, v }); saldo += v; }
    saldo += extra;
    linhas.push({ tipo: 'saldo', dh: dia + ' 23:59', v: saldo });
  }
  const ws = {}, merges = [], NUM = '#,##0.00';
  const put = (r, c, cel) => { ws[X.utils.encode_cell({ r, c })] = cel; };
  const s = v => ({ t: 's', v }), n = v => ({ t: 'n', v: v / 100, z: NUM });
  const m = (r1, c1, r2, c2) => merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
  const [B, C, D, G, H, J, K, M] = [1, 2, 3, 6, 7, 9, 10, 12], F = 5, N = 13;
  const emissao = serial('2026-10-15', '09:12') + 34 / 86400; // 15/10/2026 09:12:34
  let r = 0;
  const cabecalho = () => {
    put(r, B, s('Data e hora')); put(r, C, s('Categoria')); put(r, D, s('Transação')); put(r, G, s('Descrição')); put(r, K, s('Valor'));
    m(r, D, r, F); m(r, G, r, J); m(r, K, r, N); r++;
  };
  const topo = () => {
    put(r, B, s('Extrato de conta corrente')); put(r, J, { t: 'n', v: emissao, z: 'dd/MM/yyyy' }); m(r, B, r, H); m(r, J, r, N); r++;
    m(r, B, r, N); r++;
    put(r, B, s('Cliente:')); put(r, C, s('MARIA EXEMPLO')); m(r, C, r, K); m(r, M, r + 4, N); r++;
    put(r, B, s('CPF:')); put(r, C, s('000.000.000-00')); m(r, C, r, D); r++;
    put(r, B, s('Agência:')); put(r, C, s('00')); m(r, C, r, D); r++;
    put(r, B, s('Conta:')); put(r, C, s('0000000-0')); m(r, C, r, D); r++;
    put(r, B, s('Período do extrato:')); put(r, C, s('01/08/2026 a 15/10/2026')); m(r, C, r, G); r++;
    m(r, B, r, N); r++;
    put(r, B, s('Lançamentos:')); put(r, H, s('Saldo atual:')); put(r, J, n(saldo)); m(r, H, r, I_(H)); m(r, J, r, N); r++;
    r++;
    cabecalho();
  };
  const I_ = c => c + 1;
  const rodape = () => {
    r++;
    put(r, F, s('Ouvidoria: 0000-000-0000 ou ouvidoria@btgpactual.com')); m(r, F, r + 1, M); r += 2;
    put(r, F, s('©BTG Pactual - CNPJ 00.000.000/0000-00')); m(r, F, r, M); r++;
    r++;
  };
  topo();
  linhas.forEach((l, i) => {
    if (BTG_PAGINAS.includes(i)) { rodape(); topo(); }
    if (i === BTG_CAB_NO_MEIO) cabecalho();
    put(r, B, s(l.dh));
    if (l.tipo === 'mov') { put(r, C, s(l.cat)); put(r, D, s(l.trans)); put(r, G, s(l.desc)); } else put(r, G, s('Saldo Diário'));
    put(r, K, n(l.v)); m(r, D, r, F); m(r, G, r, J); m(r, K, r, N); r++;
  });
  rodape();
  ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: N } });
  ws['!merges'] = merges;
  const wb = { SheetNames: ['Extrato'], Sheets: { Extrato: ws }, Props: {} };
  return new Uint8Array(X.write(wb, { type: 'array', bookType: 'biff8' }));
}
