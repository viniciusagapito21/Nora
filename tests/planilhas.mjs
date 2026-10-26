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
  // para o investimento, como no extrato real: transferência com o nome do titular e categoria "Investimentos"
  ['22/08/2026', [['11:00', 'Investimentos', 'Transferência enviada', 'MARIA EXEMPLO', -50000]]],
  ['28/08/2026', [['16:20', 'Transferência', 'Transferência enviada', 'MARIA EXEMPLO', -60000]]],
  ['01/09/2026', [['09:05', 'Transferência', 'Pix recebido', 'EMPRESA EXEMPLO LTDA', 480000]]],
  ['02/09/2026', [['10:10', 'Transferência', 'Pix enviado', 'IMOBILIARIA EXEMPLO', -180000]]],
  ['05/09/2026', [['08:31', 'Investimentos', 'CDB Banco BTG Pactual', 'CDB EXEMPLO', 102035]]],
  ['10/09/2026', [['07:50', 'Contas', 'Pagamento de fatura do cartão', 'CARTÃO EXEMPLO', -98710]]],
  ['14/09/2026', [['19:30', 'Transferência', 'Transferência recebida', 'MARIA EXEMPLO', 30000]], 3], // arredondamento de 0,03
  ['18/09/2026', [['08:12', 'Transferência', 'Pix enviado', 'PADARIA SÃO JOÃO', -4590], ['20:44', 'Outra Categoria', 'Pix enviado', 'PEDRO EXEMPLO', -6000]]],
  ['25/09/2026', [['08:29', 'Investimentos', 'CDB BANCO BTG PACTUAL S A', 'CDB EXEMPLO', -200000]]],
  ['30/09/2026', [['10:30', 'Investimentos', 'Transferência recebida', 'MARIA EXEMPLO', 30000]]],
  ['01/10/2026', [['09:07', 'Transferência', 'Pix recebido', 'EMPRESA EXEMPLO LTDA', 480000]]],
  ['02/10/2026', [['10:05', 'Transferência', 'Pix enviado', 'IMOBILIARIA EXEMPLO', -180000]]],
  ['08/10/2026', [['21:10', 'Transferência', 'Pix enviado', 'MARIA EXEMPLO', -100000]]],
  ['10/10/2026', [['07:48', 'Contas', 'Pagamento de fatura do cartão', 'CARTÃO EXEMPLO', -110233]]],
  ['14/10/2026', [['15:35', 'Transferência', 'Pix recebido', 'JOÃO EXEMPLO', 12000]]]
];
// em que linha da tabela cada página termina, e onde a página 2 repete o cabeçalho no meio (como no arquivo real)
const BTG_PAGINAS = [16, 32], BTG_CAB_NO_MEIO = 22;
// saldoAtualExtra: centavos somados ao "Saldo atual" do topo (variante para a tela de saldo que não bate)
export function extratoBtgExemplo(X, { saldoAtualExtra = 0 } = {}) {
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
    put(r, B, s('Lançamentos:')); put(r, H, s('Saldo atual:')); put(r, J, n(saldo + saldoAtualExtra)); m(r, H, r, I_(H)); m(r, J, r, N); r++;
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

// ---------- PDF montado à mão (para os testes do leitor de PDF e o exemplo do Itaú) ----------
// Fonte padrão Courier (cada letra tem 0,6 do tamanho de largura), então dá para alinhar à direita sem biblioteca.
// paginas: [{ largura, altura, textos: [{ s, x, y (do topo), tam, dir (borda direita, no lugar de x) }], imagem }]
// imagem: só um retângulo desenhado, sem texto (como um PDF escaneado). senha: o PDF pede senha para abrir.
export const larguraCourier = (s, tam) => 0.6 * tam * s.length;
export function pdfAMao(paginas, { senha = false } = {}) {
  const esc = s => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const objs = [];
  const add = corpo => { objs.push(corpo); return objs.length; };
  const catalogo = add(null), raiz = add(null), fonte = add('<</Type/Font/Subtype/Type1/BaseFont/Courier/Encoding/WinAnsiEncoding>>');
  const kids = [];
  for (const p of paginas) {
    const L = p.largura || 595, A = p.altura || 842;
    let c = p.imagem ? '0.8 0.8 0.8 rg 40 40 515 760 re f\n' : '';
    for (const t of p.textos || []) {
      const tam = t.tam || 8, x = t.dir != null ? t.dir - larguraCourier(t.s, tam) : t.x;
      c += `BT /F1 ${tam} Tf 1 0 0 1 ${x.toFixed(3)} ${(A - t.y).toFixed(3)} Tm (${esc(t.s)}) Tj ET\n`;
    }
    const cont = add(`<</Length ${Buffer.byteLength(c, 'latin1')}>>\nstream\n${c}endstream`);
    kids.push(add(`<</Type/Page/Parent ${raiz} 0 R/MediaBox[0 0 ${L} ${A}]/Contents ${cont} 0 R/Resources<</Font<</F1 ${fonte} 0 R>>>>>>`));
  }
  objs[catalogo - 1] = `<</Type/Catalog/Pages ${raiz} 0 R>>`;
  objs[raiz - 1] = `<</Type/Pages/Kids[${kids.map(k => k + ' 0 R').join(' ')}]/Count ${kids.length}>>`;
  // proteção "Standard" com valores que não batem com a senha vazia: o leitor tem que pedir senha
  const cifra = senha ? add(`<</Filter/Standard/V 1/R 2/O<${'4f'.repeat(32)}>/U<${'55'.repeat(32)}>/P -44>>`) : 0;
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const pos = [];
  objs.forEach((o, i) => { pos.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + pos.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<</Size ${objs.length + 1}/Root ${catalogo} 0 R${cifra ? `/Encrypt ${cifra} 0 R/ID[<${'0a'.repeat(16)}><${'0a'.repeat(16)}>]` : ''}>>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}
// o pdf.js do projeto, no Node, sem worker (como na página)
export async function carregarPdfjs() {
  const pdfjs = await import(new URL('../vendor/pdfjs/pdf.min.mjs', import.meta.url));
  globalThis.pdfjsWorker = await import(new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url));
  return pdfjs;
}

// ---------- extrato inventado no layout do PDF do Itaú (exemplo/extrato-itau-exemplo.pdf) ----------
// As posições (colunas, onde a tabela começa em cada página, espaço entre linhas, topo, rodapé) foram medidas num
// extrato real; TODO o conteúdo é inventado. Dias do mais novo para o mais antigo; em cada dia, os movimentos e
// depois o "SALDO DO DIA", calculado a partir dos movimentos (o rendimento já é movimento: REND PAGO).
const ITAU_INICIAL = 300000;
const ITAU_DIAS = [
  ['01/08/2026', [['SALARIO EMPRESA EXEMPLO', 520000]]],
  ['03/08/2026', [['PIX TRANSF IMOBILI03/08', -180000], ['DA TELEFONIA EX 12345678', -11990], ['EST TELEFONIA EX 12345678', 11990]]],
  ['05/08/2026', [['APLICACAO CDB EXEMPLO', -100000]]],
  ['07/08/2026', [['PIX TRANSF JOAO EX07/08', -15000], ['PIX TRANSF MARIA E07/08', -50000]]],
  ['10/08/2026', [['CARTAO EXEMPLOAZUL MC', -123456]]],
  ['12/08/2026', [['REND PAGO APLIC AUT EXEMPLO', 42], ['PIX QRS PADARIA EX12/08', -2350]]],
  ['15/08/2026', [['TED 000 0001 EMPRESA EX', 35000]]],
  ['18/08/2026', [['PIX TRANSF MARIA E18/08', 30000]]],
  ['20/08/2026', [['INT ITAU CLICK', -8990]]],
  ['21/08/2026', [['EST LOJA EXEMPLO 87654321', 4500]]],
  ['25/08/2026', [['COR DIVIDENDOS EXEMPLO', 1234]]],
  ['28/08/2026', [['PIX TRANSF ANA EXE28/08', -6000]]],
  ['01/09/2026', [['SALARIO EMPRESA EXEMPLO', 520000]]],
  ['02/09/2026', [['PIX TRANSF IMOBILI02/09', -180000]]],
  ['03/09/2026', [['DA TELEFONIA EX 12345678', -11990]]],
  ['05/09/2026', [['RESGATE CDB EXEMPLO', 102035]]],
  ['08/09/2026', [['FATURAEXEMPLO ITAU MC', -98710]]],
  ['10/09/2026', [['REND PAGO APLIC AUT EXEMPLO', 38]]],
  ['12/09/2026', [['PIX TRANSF PEDRO E12/09', -4500], ['PIX TRANSF LUCIA E12/09', -3000]]],
  ['15/09/2026', [['COR JSCP EXEMPLO', 820]]],
  ['19/09/2026', [['INT RESGATE EXEMPLO', 20000]]],
  ['22/09/2026', [['PIX TRANSF MARIA E22/09', -40000]]],
  ['25/09/2026', [['APLICACAO CDB EXEMPLO', -200000]]],
  ['29/09/2026', [['PIX QRS MERCADO EX29/09', -31045]]],
  ['01/10/2026', [['SALARIO EMPRESA EXEMPLO', 520000]]],
  ['02/10/2026', [['PIX TRANSF IMOBILI02/10', -180000]]],
  ['03/10/2026', [['DA TELEFONIA EX 12345678', -11990]]],
  ['06/10/2026', [['INT EXEMPLO AZUL MC', -110233]]],
  ['08/10/2026', [['PIX TRANSF JOAO EX08/10', -7500]]],
  ['10/10/2026', [['REND PAGO APLIC AUT EXEMPLO', 35]]],
  ['13/10/2026', [['PIX TRANSF MARIA E13/10', 25000]]],
  ['14/10/2026', [['PIX TRANSF ANA EXE14/10', -4000]]]
];
const brl = c => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export function itauExemploLinhas() {
  let saldo = ITAU_INICIAL;
  const dias = ITAU_DIAS.map(([d, movs]) => { movs.forEach(m => { saldo += m[1]; }); return { d, movs, saldo }; });
  // o "SALDO DO DIA" do topo: depois do fim do período (15/10), o saldo de hoje
  const linhas = [['20/10/2026', 'SALDO DO DIA', '', brl(saldo)]];
  dias.slice().reverse().forEach(({ d, movs, saldo: s }) => {
    movs.forEach(([desc, v]) => linhas.push([d, desc, brl(v), '']));
    linhas.push([d, 'SALDO DO DIA', '', brl(s)]);
  });
  return { linhas, saldoFinal: saldo };
}
export function extratoItauExemplo() {
  const { linhas, saldoFinal } = itauExemploLinhas(), PASSO = 18.75, T = 8;
  const linhaTabela = (l, y) => [{ s: l[0], x: 31, y, tam: T }, { s: l[1], x: 96, y, tam: T }, ...(l[2] ? [{ s: l[2], dir: 466, y, tam: T }] : []), ...(l[3] ? [{ s: l[3], dir: 565, y, tam: T }] : [])];
  const p1 = [
    { s: 'MARIA EXEMPLO', x: 31, y: 72, tam: 9 }, { s: 'agência 0000', x: 300, y: 72, tam: 9 }, { s: 'conta 00000-0', x: 400, y: 72, tam: 9 },
    { s: 'saldo em conta', x: 31, y: 119 }, { s: 'limite da conta', x: 137, y: 119 }, { s: 'utilizado da conta', x: 286, y: 119 }, { s: 'disponível total *', x: 438, y: 119 },
    { s: brl(saldoFinal), dir: 120, y: 138 }, { s: '1.000,00', dir: 260, y: 138 }, { s: '0,00', dir: 410, y: 138 }, { s: brl(saldoFinal + 100000), dir: 560, y: 138 },
    { s: '* Total disponível considera o saldo em conta e o limite contratado, sujeito a juros.', x: 171, y: 164, tam: 6 },
    { s: 'extrato conta corrente', x: 31, y: 197, tam: 10 },
    { s: 'período de visualização: 01/08/2026 até 15/10/2026', x: 28, y: 211 }, { s: 'emitido em 20/10/2026 09:12', x: 400, y: 214 },
    { s: 'data', x: 31, y: 245 }, { s: 'lançamentos', x: 96, y: 245 }, { s: 'valor (R$)', dir: 466, y: 245 }, { s: 'saldo (R$)', dir: 565, y: 245 }
  ];
  const paginas = [p1];
  let y = 270, atual = p1, k = 0;
  for (const l of linhas) {
    if (y > 790) { atual = []; paginas.push(atual); y = 39; }
    atual.push(...linhaTabela(l, Math.round(y))); y += PASSO; k++;
  }
  // aviso legal no fim da última página (uma das linhas tem "data", "lançamento" e "valor", num trecho só)
  const aviso = ['Aviso', 'O saldo do dia considera os lançamentos até as 23h59 e pode mudar com estornos.', 'Lançamentos futuros: o valor do débito e a data de pagamento podem ser alterados até a compensação.',
    'Em caso de dúvida, fale com a central de atendimento: 0000 000 0000 (capitais) ou 0000 000 0000 (demais localidades).', 'Ouvidoria: 0000 000 0000, nos dias úteis.'];
  y = Math.max(y + 20, 379);
  aviso.forEach((s, i) => atual.push({ s, x: 28, y: Math.round(y + i * 12), tam: 6 }));
  return pdfAMao(paginas.map(textos => ({ textos })));
}
