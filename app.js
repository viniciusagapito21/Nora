/* Painel de finanças pessoais: lê extratos CSV do Revolut, categoriza, mostra metas, previsões e gráficos. Tudo fica no navegador (localStorage). */
(function () {
  'use strict';

  /*CORE-START*/
  /* o nome de 'brasil' é só o padrão; cada pessoa troca em Configurações (plan.nomes) */
  var CATS = [
    { id: 'aluguel', nome: 'Aluguel e contas', slot: 1 },
    { id: 'brasil', nome: 'Envios para outra conta sua', slot: 2 },
    { id: 'mercado', nome: 'Mercado', slot: 3 },
    { id: 'compras', nome: 'Compras', slot: 4 },
    { id: 'grandes', nome: 'Compras grandes', slot: 4, hatch: true },
    { id: 'transporte', nome: 'Transporte', slot: 5 },
    { id: 'lazer', nome: 'Comer fora e lazer', slot: 6 },
    { id: 'assin', nome: 'Assinaturas e celular', slot: 7 },
    { id: 'saude', nome: 'Saúde', slot: 8 },
    { id: 'outros', nome: 'Pessoas, taxas e outros', slot: 0 }
  ];
    var CAT_BY = {}; CATS.forEach(function (c) { CAT_BY[c.id] = c; });
  var RULES = [
    [/BOOTS|^NORMAL$|PHARMACY|HICKEY|LLOYDS|BARBER|\bHAIR|SALON|DENTAL|DENTIST|CLINIC|OPTIC|SPECSAVERS|\bNAILS?\b|BEAUTY|\bSPA\b|WAXING|LASH|BROWS/, 'saude'],
    [/TESCO|LIDL|DUNNES|\bALDI\b|\bSPAR\b|CENTRA|SUPERVALU|BUYMIE|KALABASA|APPLEGREEN|SUMMIT STORES|LONDIS|\bMACE\b|SUPERMARKET/, 'mercado'],
    [/TRANSPORT FOR IRELAND|\bTFI\b|IRISH RAIL|UBER|\bLEAP\b|FREE ?NOW|\bBOLT\b|DUBLIN BUS|\bLUAS\b|BUS [EÉ]IREANN|DART STATION/, 'transporte'],
    [/^THREE$|VODAFONE|\bEIR\b|GIFFGAFF|LEBARA|48 ?ONLINE|PLAN FEE|PLAN TERMINATION/, 'assin'],
    [/DISNEY|NETFLIX|SPOTIFY|APPLE|FLYEFIT|CLASSPASS|YOUTUBE|OPENAI|ANTHROPIC|ICLOUD|PUREGYM/, 'assin'],
    [/BURGER|MCDONALD|DELIVEROO|FIVE GUYS|CARIBOU|TAKEAWAY|COSTA|STARBUCKS|JUST[ -]EAT|SUBWAY|PIZZA|KFC|NANDO'?S\b|COFFEE|CAF[EÉ]|MUG & MINGLE|PIG AND HEIFER|RESTAURANT|ETICKS|TICKETMASTER|^EB |ODEON|CINEMA|CINEWORLD|SAVOY|FIDELITY DUBLIN|ADRIANO|TEMPLE BAR|COPPER FACE|AULD DUBLINER|WILEY FOX|WOOLSHED|MCGUINNESS|GELATO|FORNAIO|\bGRILL\b|PASTEL|SUPERMAC|PADOCA|DOOM SLICE|RESIDENT ADVISOR|\bGENERATOR\b|MADDENS|PYGMALION|WETHERSPOONS|BUFFET|\bPUB\b|TAVERN/, 'lazer'],
    [/REVENUE/, 'outros']
  ];
  var INV = /DIGITAL ASSETS|INVESTMENT ACCOUNT|AVATRADE|REVOLUT SECURITIES|TRADING 212|DEGIRO|ETORO/;
  var EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  function parseCSV(text) {
    var rows = [], row = [], f = '', q = false, i, ch;
    for (i = 0; i < text.length; i++) {
      ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(f); f = ''; }
      else if (ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (ch !== '\r') f += ch;
    }
    if (f.length || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  function cents(s) {
    var n = parseFloat(String(s).replace(/[€\s,]/g, '').replace(/−/g, '-'));
    return isNaN(n) ? null : Math.round(n * 100);
  }
  function isoDate(s) {
    s = String(s || '').trim();
    var m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})/);
    if (m) {
      var mo = EN[m[2].slice(0, 3).toLowerCase()];
      if (!mo) return null;
      return m[3] + '-' + (mo < 10 ? '0' : '') + mo + '-' + (m[1].length < 2 ? '0' : '') + m[1];
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
  }
  /* devolve [data, descrição, categoria do Revolut, centavos, saldo em centavos] */
  function extractTx(rows) {
    var out = [], i, r, c0, inSec = false, mode = null, title = '', d, a, b;
    for (i = 0; i < rows.length; i++) {
      r = rows[i]; c0 = String(r[0] || '').trim();
      if (c0 === 'Current Accounts Transaction Statements') { inSec = true; continue; }
      if (inSec) {
        if (c0.indexOf('---') === 0) { inSec = false; mode = null; continue; }
        if (/\(\w{3}\)\s*$/.test(c0) && !r[1]) title = c0;
        if (c0 === 'Date' && r[1] === 'Description') { mode = (!title || /\(EUR\)/.test(title)) ? 'read' : 'skip'; continue; }
        if (mode === 'read') {
          d = isoDate(c0); a = cents(r[3]); b = cents(r[4]);
          if (d && a !== null) out.push([d, String(r[1] || '').trim(), String(r[2] || '').trim(), a, b === null ? 0 : b]);
        }
      }
    }
    if (out.length) return out;
    /* extrato comum do Revolut: Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance */
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (r.indexOf('Completed Date') >= 0 && r.indexOf('Amount') >= 0 && r.indexOf('Description') >= 0) {
        var ix = { t: r.indexOf('Type'), d: r.indexOf('Completed Date'), s: r.indexOf('Description'), a: r.indexOf('Amount'), f: r.indexOf('Fee'), cu: r.indexOf('Currency'), st: r.indexOf('State'), b: r.indexOf('Balance') };
        for (var j = i + 1; j < rows.length; j++) {
          var x = rows[j];
          if (ix.st >= 0 && x[ix.st] && x[ix.st] !== 'COMPLETED') continue;
          if (ix.cu >= 0 && x[ix.cu] && x[ix.cu] !== 'EUR') continue;
          d = isoDate(x[ix.d]); a = cents(x[ix.a]);
          if (!d || a === null) continue;
          var fee = ix.f >= 0 ? (cents(x[ix.f]) || 0) : 0;
          var ty = ix.t >= 0 ? x[ix.t] : '';
          var rc = ty === 'TOPUP' ? 'Top up' : ty === 'CARD_PAYMENT' ? 'Merchant' : ty === 'EXCHANGE' ? 'Exchange' : ty === 'REFUND' ? 'Refund' : 'Others';
          b = ix.b >= 0 ? cents(x[ix.b]) : 0;
          out.push([d, String(x[ix.s] || '').trim(), rc, a - fee, b === null ? 0 : b]);
        }
        break;
      }
    }
    return out;
  }
  function txKey(t) { return t[0] + '|' + t[1] + '|' + t[3] + '|' + t[4]; }
  /* saldos de fechamento de cada conta, do resumo no começo do extrato consolidado */
  function extractSummary(rows) {
    var sec = '', o = {}, i, j, r, c0, v, n = 0;
    for (i = 0; i < rows.length; i++) {
      r = rows[i]; c0 = String(r[0] || '').trim();
      if (c0 === 'Current Accounts Transaction Statements') break;
      if (c0 === 'Current Accounts Summaries') sec = 'conta';
      else if (c0 === 'Flexible Cash Funds Summaries') sec = 'flex';
      else if (c0 === 'Investment Services Summaries') sec = 'invest';
      else if (c0 === 'Crypto Summaries') sec = 'cripto';
      if (!sec || o[sec] !== undefined) continue;
      for (j = 0; j < r.length - 1; j++) {
        if (String(r[j]).trim() === 'Closing balance') { v = cents(r[j + 1]); if (v !== null) { o[sec] = v; n++; } break; }
      }
    }
    return n ? o : null;
  }

  function bigCheck(id, a) { if ((id === 'compras' || id === 'assin') && a <= -100) return 'grandes'; return id; }
  function byRule(D, a, rc) {
    if (/^CARD PAYMENT$/.test(D)) return a <= -100 ? 'grandes' : 'compras';
    var P = /^(TO|TRANSFER TO|TRANSFER FROM|FROM) /.test(D);
    for (var i = 0; i < RULES.length; i++) {
      var R = RULES[i];
      if (P && R[1] !== 'aluguel') continue;
      if (R[0].test(D) && (!R[2] || Math.abs(a) >= R[2])) return bigCheck(R[1], a);
    }
    if (/^(TO|TRANSFER TO|TRANSFER FROM|FROM) /.test(D) || rc === 'Others') return 'outros';
    return bigCheck('compras', a);
  }
  /* nome do titular como aparece nas transferências ("To FULANO DE TAL"), no formato da chave da descrição */
  function normTitular(s) { return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim(); }
  function classify(t, over, titular) {
    var OWN = normTitular(titular), a = t[3] / 100, D = String(t[1]).toUpperCase(), rc = t[2], kind, cat = null;
    var r = { date: t[0], m: t[0].slice(0, 7), desc: t[1], rc: rc, a: a, bal: t[4] / 100, key: D.replace(/\s+/g, ' ').trim() };
    if (a > 0) {
      if (/^PAYMENT FROM /.test(D) && !(OWN && D.indexOf(OWN) >= 0)) kind = 'renda';
      else if (D.indexOf('FLEXIBLE CASH') >= 0) kind = 'flex';
      else if (OWN && D.indexOf(OWN) >= 0) kind = 'interno';
      else if (INV.test(D)) kind = 'invest';
      else if (rc === 'Refund' || rc === 'Merchant') { kind = 'gasto'; cat = byRule(D, a, rc); }
      else kind = 'outras';
    } else {
      if (D.indexOf('FLEXIBLE CASH') >= 0) kind = 'flex';
      else if (OWN && D.indexOf(OWN) >= 0) { kind = 'gasto'; cat = 'brasil'; }
      else if (INV.test(D) || rc === 'Exchange') kind = 'invest';
      else { kind = 'gasto'; cat = byRule(D, a, rc); }
    }
    r.baseKind = kind;
    r.auto = kind === 'gasto' ? cat : kind === 'invest' ? '_invest' : kind === 'interno' ? '_ignore' : '';
    var ov = over && over[r.key];
    if (ov && (kind === 'gasto' || kind === 'invest' || kind === 'interno')) {
      if (ov === '_invest') { kind = 'invest'; cat = null; }
      else if (ov === '_ignore') { kind = 'interno'; cat = null; }
      else if (CAT_BY[ov]) { kind = 'gasto'; cat = ov; }
    }
    r.kind = kind; r.cat = cat;
    return r;
  }
  /* formato salvo (no navegador e no backup em JSON).
     v1: { months, over, plan, summary, div }, sem número de versão.
     v2: { v: 2, ... } com titular, moeda, país e nomes de exibição das categorias dentro de plan.
     Aceita v1 ou v2 e devolve sempre v2; dados que não são do painel dão erro. */
  var VERSAO = 2;
  function migrate(x, titularAntigo) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error('não são dados do painel');
    var v = x.v == null ? 1 : x.v;
    if (v !== 1 && v !== VERSAO) throw new Error('versão ' + v + ' desconhecida');
    var months = x.months || {};
    if (typeof months !== 'object' || Array.isArray(months)) throw new Error('meses em formato errado');
    Object.keys(months).forEach(function (m) {
      if (!/^\d{4}-\d{2}$/.test(m) || !Array.isArray(months[m])) throw new Error('mês ' + m + ' em formato errado');
    });
    var plan = Object.assign({}, x.plan || {});
    /* na v1 o titular ficava numa chave à parte, gravada pelo console */
    if (plan.titular == null) plan.titular = v === 1 ? String(titularAntigo || '').trim() : '';
    if (!plan.moeda) plan.moeda = 'EUR';
    if (!plan.pais) plan.pais = 'IE';
    if (!plan.nomes) plan.nomes = v === 1 ? { brasil: 'Contas no Brasil' } : {};
    return { v: VERSAO, months: months, over: x.over || {}, plan: plan, summary: x.summary || null, div: x.div || null };
  }
  /* lê dados salvos ou um backup (texto JSON) e devolve sempre a v2; erro com motivo se não der */
  function lerSalvo(texto, titularAntigo) {
    var x;
    try { x = JSON.parse(texto); } catch (e) { throw new Error('o conteúdo não é JSON válido'); }
    return migrate(x, titularAntigo);
  }
  /* resumo para confirmar antes de restaurar ou apagar: quantos meses, de quando a quando */
  function resumoDados(x) {
    var ks = Object.keys((x && x.months) || {}).sort(), mov = 0;
    ks.forEach(function (k) { mov += x.months[k].length; });
    return { meses: ks.length, de: ks[0] || null, ate: ks[ks.length - 1] || null, mov: mov };
  }
  /* contas fixas e assinaturas: o mesmo nome (sem os números) cobrado uma vez por mês, com valor parecido,
     perto do mesmo dia do mês (3 dias de folga), em pelo menos 2 dos últimos 3 meses.
     keys guarda as descrições exatas, para regras manuais. No mês em andamento, atrasada marca a conta
     que já devia ter caído (dia esperado + 3) e ainda não apareceu: continua na previsão, mas a tela avisa. */
  var FOLGA_DIAS = 3;
  function distDia(a, b) { var d = Math.abs(a - b); return Math.min(d, 31 - d); }
  function detectarRecorrentes(model) {
    var ks = model.keys.slice(-3), by = {}, list = [], hoje = model.partial ? +model.lastDate.slice(8) : 0;
    if (ks.length < 2) return list;
    model.rows.forEach(function (r) {
      if (r.kind !== 'gasto' || r.a >= 0 || r.cat === 'brasil' || ks.indexOf(r.m) < 0) return;
      var k = r.key.replace(/[0-9]+/g, '').replace(/\s+/g, ' ').trim(), o = by[k] || (by[k] = { id: k, m: {}, keys: [], dias: [], last: null });
      (o.m[r.m] = o.m[r.m] || []).push(-r.a);
      o.dias.push(+r.date.slice(8));
      if (o.keys.indexOf(r.key) < 0) o.keys.push(r.key);
      if (!o.last || r.date >= o.last.date) o.last = r;
    });
    Object.keys(by).forEach(function (k) {
      var o = by[k], ms = Object.keys(o.m);
      if (ms.length < 2 || ms.some(function (m) { return o.m[m].length > 1; })) return;
      var vs = ms.map(function (m) { return o.m[m][0]; }), mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs);
      if (mn <= 0 || mx / mn > 1.25) return;
      o.dia = +o.last.date.slice(8);
      if (o.dias.some(function (d) { return distDia(d, o.dia) > FOLGA_DIAS; })) return;
      o.v = -o.last.a;
      o.atrasada = !!model.partial && !o.m[model.partial] && hoje > o.dia + FOLGA_DIAS;
      list.push(o);
    });
    return list.sort(function (a, b) { return a.dia - b.dia; });
  }
  /* o maior pagamento recorrente de começo de mês (até o dia 5) que ainda não está em aluguel */
  function sugerirAluguel(recs, dispensados) {
    var best = null;
    recs.forEach(function (o) {
      if (o.dia > 5 || o.last.cat === 'aluguel' || (dispensados && dispensados.indexOf(o.id) >= 0)) return;
      if (!best || o.v > best.v) best = o;
    });
    return best;
  }
  /* previsão do mês em andamento. Categorias fixas entram pelo maior entre o gasto e a meta; cobranças
     recorrentes das outras categorias entram pelo valor de sempre (já pagas ou ainda por cair); só o resto
     segue o ritmo dos dias que passaram. metaCat(id) devolve a meta da categoria. */
  var FIXAS = ['aluguel', 'assin', 'brasil'];
  function preverMes(model, metaCat) {
    var cur = model.partial;
    if (!cur) return null;
    var g = model.by[cur], p = cur.split('-').map(Number), dim = new Date(p[0], p[1], 0).getDate(), day = Math.max(1, +model.lastDate.slice(8));
    var fixo = 0, falFix = 0, vari = 0, rec = 0, pend = [];
    CATS.forEach(function (c) {
      var v = g.spend[c.id] || 0;
      if (FIXAS.indexOf(c.id) >= 0) { var mt = metaCat(c.id); fixo += Math.max(v, mt); falFix += Math.max(0, mt - v); } else vari += v;
    });
    detectarRecorrentes(model).forEach(function (o) {
      if (FIXAS.indexOf(o.last.cat) >= 0) return;
      if (o.m[cur]) { rec += o.m[cur][0]; vari -= o.m[cur][0]; }
      else { rec += o.v; falFix += o.v; pend.push(o); }
    });
    return { m: cur, day: day, dim: dim, gasto: g.gasto, proj: fixo + rec + Math.max(0, vari) / day * dim, falFix: falFix, pend: pend };
  }
  /* metas sugeridas: média dos 3 primeiros meses completos (ou dos que houver), em múltiplos de 5 */
  function sugerirMetas(model) {
    var ks = (model.complete.length ? model.complete : model.keys).slice(0, 3);
    if (!ks.length) return null;
    function media(fn) { var t = 0; ks.forEach(function (k) { t += Math.max(0, fn(model.by[k])); }); return Math.round(t / ks.length / 5) * 5; }
    var o = { cats: {}, poupar: media(function (g) { return g.saved; }) };
    CATS.forEach(function (c) { o.cats[c.id] = media(function (g) { return g.spend[c.id] || 0; }); });
    return o;
  }
  function buildModel(months, over, titular) {
    var rows = [], by = {};
    Object.keys(months).sort().forEach(function (m) { months[m].forEach(function (t) { rows.push(classify(t, over, titular)); }); });
    rows.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
    rows.forEach(function (r) {
      var g = by[r.m] || (by[r.m] = { m: r.m, renda: 0, outras: 0, flex: 0, inv: 0, interno: 0, spend: {}, n: 0 });
      g.n++;
      if (r.kind === 'renda') g.renda += r.a;
      else if (r.kind === 'outras') g.outras += r.a;
      else if (r.kind === 'flex') g.flex += r.a;
      else if (r.kind === 'invest') g.inv += r.a;
      else if (r.kind === 'interno') g.interno += r.a;
      else g.spend[r.cat] = (g.spend[r.cat] || 0) - r.a;
    });
    var keys = Object.keys(by).sort();
    keys.forEach(function (m) {
      var g = by[m]; g.entrou = g.renda + g.outras; g.gasto = 0;
      CATS.forEach(function (c) { g.gasto += g.spend[c.id] || 0; });
      g.saved = -(g.flex + g.inv);
      g.saldo = g.entrou - g.gasto - g.saved;
    });
    var lastDate = rows.length ? rows[rows.length - 1].date : '', partial = null;
    if (lastDate) {
      var p = lastDate.split('-').map(Number);
      if (p[2] < new Date(p[0], p[1], 0).getDate()) partial = lastDate.slice(0, 7);
    }
    return { rows: rows, by: by, keys: keys, partial: partial, complete: keys.filter(function (k) { return k !== partial; }), lastDate: lastDate };
  }
  /*CORE-END*/

  var MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var S = { months: {}, over: {}, plan: null, summary: null, ready: false, sel: null, f: [], fOpen: false, more: 12, movOpen: true, q: '', metasOpen: false, setupOpen: false, bloqueado: null, restaurar: null, apagar: false, model: null, div: null, dAdd: false, dCamb: false, dPaid: false };
  var M = buildModel({}, {}), SUG = null, RECS = [];
  try { if (localStorage.getItem('cortex-financas.mov') === '0') S.movOpen = false; } catch (e) { }
  /* a v1 e a chave antiga do titular ficam como estão, para dar para voltar atrás */
  var LS = 'cortex-financas.v2', LS_V1 = 'cortex-financas.v1', LS_TITULAR = 'cortex-financas.titular';

  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var nf2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nf0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  var nn = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  var n2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function f2(v) { return nf2.format(v); }
  function f0(v) { return nf0.format(Math.round(v)).replace('-', '−'); }
  function sgn(v, fn) { return (v < 0 ? '−' : '+') + (fn || f0)(Math.abs(v)); }
  function mLabel(k) { var p = k.split('-'); return MES[+p[1] - 1] + ' de ' + p[0]; }
  function mShort(k) { return MS[+k.slice(5) - 1]; }
  function dFmt(d) { var p = d.split('-'); return +p[2] + ' ' + MS[+p[1] - 1]; }
  function dFull(d) { return dFmt(d) + ' ' + d.slice(0, 4); }
  function colorOf(c) {
    if (!c.slot) return 'var(--other)';
    var v = 'var(--c' + c.slot + ')';
    return c.hatch ? 'repeating-linear-gradient(135deg,' + v + ' 0 3px,color-mix(in srgb,' + v + ' 40%,var(--surface)) 3px 6px)' : v;
  }

  /* meta definida pela pessoa; sem ela, a sugestão dos primeiros meses (SUG); sem extrato, zero */
  function metaDefinida(id) { var p = S.plan && S.plan.cats; return p && p[id] != null && p[id] !== '' && !isNaN(p[id]) ? +p[id] : null; }
  function pouparDefinido() { var v = S.plan && S.plan.poupar; return v != null && v !== '' && !isNaN(v) ? +v : null; }
  function planCat(id) { var v = metaDefinida(id); return v != null ? v : (SUG ? SUG.cats[id] : 0); }
  function planPoupar() { var v = pouparDefinido(); return v != null ? v : (SUG ? SUG.poupar : 0); }
  function catNome(c) { var n = S.plan && S.plan.nomes && S.plan.nomes[c.id]; return n || c.nome; }
  function planTotal() { var t = 0; CATS.forEach(function (c) { t += planCat(c.id); }); return t; }
  /* campos de metas (usados em "Editar metas" e na configuração); pre separa os ids dos dois formulários */
  /* campo em branco = seguir a sugestão (ou ficar sem meta, sem extrato) */
  function metaCampo(id, rotulo, v, sug) {
    return '<label>' + esc(rotulo) + '<input id="' + id + '" type="number" min="0" step="5" inputmode="decimal" value="' + (v != null ? v : '') + '" placeholder="' + (sug != null ? 'sugestão: ' + sug : 'sem meta') + '"></label>';
  }
  function metasCampos(pre) {
    var h = '';
    CATS.forEach(function (c) { h += metaCampo('fin-' + pre + '-' + c.id, catNome(c), metaDefinida(c.id), SUG ? SUG.cats[c.id] : null); });
    return h + metaCampo('fin-' + pre + '-poupar', 'Guardar por mês', pouparDefinido(), SUG ? SUG.poupar : null);
  }
  function lerMeta(id) { var v = $(id).value.trim(); return v === '' || isNaN(v) ? null : Math.max(0, +v); }
  function lerMetas(pre) {
    var o = { cats: {}, poupar: lerMeta('#fin-' + pre + '-poupar') };
    CATS.forEach(function (c) { var v = lerMeta('#fin-' + pre + '-' + c.id); if (v != null) o.cats[c.id] = v; });
    return o;
  }

  function toast(msg, erro) { if (window.__cortexToast) window.__cortexToast(msg, erro, erro ? 9000 : 6000); }

  /* ---------- números do período ---------- */
  function avgKeys() { return M.complete.length ? M.complete : M.keys; }
  function periodKeys() { return S.sel === 'all' ? avgKeys() : (M.by[S.sel] ? [S.sel] : []); }
  function periodStats() {
    var ks = periodKeys(), n = ks.length || 1, o = { entrou: 0, gasto: 0, saved: 0, saldo: 0, spend: {}, n: ks.length };
    ks.forEach(function (k) {
      var g = M.by[k]; o.entrou += g.entrou; o.gasto += g.gasto; o.saved += g.saved; o.saldo += g.saldo;
      CATS.forEach(function (c) { o.spend[c.id] = (o.spend[c.id] || 0) + (g.spend[c.id] || 0); });
    });
    if (S.sel === 'all') {
      o.entrou /= n; o.gasto /= n; o.saved /= n; o.saldo /= n;
      CATS.forEach(function (c) { o.spend[c.id] /= n; });
    }
    return o;
  }
  function avgOf(fn, pred) {
    var ks = avgKeys().filter(function (k) { return pred ? pred(M.by[k]) : true; });
    if (!ks.length) return null;
    var s = 0; ks.forEach(function (k) { s += fn(M.by[k]); });
    return s / ks.length;
  }
  function dl(v, ref, goodHigh, unit) {
    var d = v - ref;
    if (Math.abs(d) < 0.5) return '<span class="d ok">= igual ' + unit + '</span>';
    var up = d > 0;
    return '<span class="d ' + (up === goodHigh ? 'good' : 'bad') + '">' + (up ? '▲' : '▼') + ' ' + f0(Math.abs(d)) + (up ? ' acima ' : ' abaixo ') + unit + '</span>';
  }

  /* ---------- armazenamento ---------- */
  function dadosAtuais() { return { v: VERSAO, months: S.months, over: S.over, plan: S.plan, summary: S.summary, div: S.div }; }
  /* com dados ilegíveis (S.bloqueado), nada é gravado por cima até a pessoa decidir o que fazer */
  function localSave() {
    if (S.bloqueado) return;
    try { localStorage.setItem(LS, JSON.stringify(dadosAtuais())); } catch (e) { }
  }
  function localLoad() {
    var raw = null, tit = '', velho = false;
    try {
      raw = localStorage.getItem(LS);
      if (raw == null) {
        velho = true; tit = localStorage.getItem(LS_TITULAR) || ''; raw = localStorage.getItem(LS_V1);
        if (raw == null && tit) raw = '{}';
      }
    } catch (e) { return; }
    if (raw == null) return;
    try {
      var x = lerSalvo(raw, tit);
      S.months = x.months; S.over = x.over; S.plan = x.plan; S.summary = x.summary; S.div = x.div;
      if (velho) localSave();
    } catch (e) {
      S.bloqueado = { motivo: e.message, bruto: raw };
    }
  }
  function apagarTudo() {
    try {
      var ks = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('cortex-financas.') === 0) ks.push(k); }
      ks.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { }
    S.months = {}; S.over = {}; S.plan = null; S.summary = null; S.div = null; S.bloqueado = null; S.setupOpen = false;
  }
  var chain = Promise.resolve();
  function enqueue(fn) {
    chain = chain.then(fn).catch(function (e) { toast('Não consegui salvar: ' + ((e && e.message) || e), true); });
    return chain;
  }
  function saveMonth(m, tx) {
    S.months[m] = tx;
    localSave(); return Promise.resolve();
  }
  function saveOver() { localSave(); return Promise.resolve(); }
  function saveSummary(x) { S.summary = x; localSave(); return Promise.resolve(); }
  function saveDiv(d) { S.div = d; localSave(); return Promise.resolve(); }
  function savePlan(p) { S.plan = p; localSave(); return Promise.resolve(); }

  function recompute() {
    M = buildModel(S.months, S.over, S.plan && S.plan.titular);
    SUG = sugerirMetas(M);
    RECS = detectarRecorrentes(M);
    if (S.sel !== 'all' && !M.by[S.sel]) S.sel = M.complete.length ? M.complete[M.complete.length - 1] : (M.keys.length ? M.keys[M.keys.length - 1] : null);
  }

  /* ---------- importação ---------- */
  function handleFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) return Promise.resolve();
    if (S.bloqueado) { toast('Antes de importar, resolva os dados salvos que não consegui ler.', true); return Promise.resolve(); }
    var incoming = {}, bad = [], dup = 0, added = 0, months = 0, best = null;
    return files.reduce(function (p, f) {
      return p.then(function () { return f.text(); }).then(function (txt) {
        var rws = parseCSV(txt), tx = extractTx(rws), sm = extractSummary(rws);
        if (!tx.length) { bad.push(f.name); return; }
        if (sm) {
          var asOf = tx.reduce(function (a, t) { return t[0] > a ? t[0] : a; }, '');
          if (!best || asOf >= best.asOf) { sm.asOf = asOf; best = sm; }
        }
        tx.forEach(function (t) { var m = t[0].slice(0, 7); (incoming[m] = incoming[m] || []).push(t); });
      }).catch(function () { bad.push(f.name); });
    }, Promise.resolve()).then(function () {
      return enqueue(function () {
        var ms = Object.keys(incoming).sort(), p = Promise.resolve();
        ms.forEach(function (m) {
          p = p.then(function () {
            var cur = (S.months[m] || []).slice(), seen = {}, n = 0;
            cur.forEach(function (t) { seen[txKey(t)] = 1; });
            incoming[m].forEach(function (t) { var k = txKey(t); if (seen[k]) dup++; else { seen[k] = 1; cur.push(t); n++; } });
            if (!n) return;
            cur.sort(function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0; });
            added += n; months++;
            return saveMonth(m, cur);
          });
        });
        p = p.then(function () { if (best && (!S.summary || best.asOf >= S.summary.asOf)) return saveSummary(best); });
        return p;
      });
    }).then(function () {
      recompute(); render();
      if (added) toast('Adicionei ' + added + (added === 1 ? ' movimentação' : ' movimentações') + ' em ' + months + (months === 1 ? ' mês' : ' meses') + (dup ? '. ' + dup + (dup === 1 ? ' já estava salva.' : ' já estavam salvas.') : '.') + (bad.length ? ' Não li: ' + bad.join(', ') + '.' : ''));
      else if (bad.length) toast('Não encontrei movimentações em ' + bad.join(', ') + '. Use o extrato consolidado em CSV do Revolut.', true);
      else toast(dup === 1 ? 'Nada novo: a movimentação desse arquivo já estava salva.' : 'Nada novo: as ' + dup + ' movimentações desse arquivo já estavam salvas.');
    });
  }

  /* ---------- peças da página ---------- */
  function header() {
    var st = '';
    if (M.keys.length) {
      var n = 0; M.keys.forEach(function (k) { n += M.by[k].n; });
      st = n + ' movimentações · ' + mShort(M.keys[0]) + ' ' + M.keys[0].slice(0, 4) + ' a ' + mShort(M.keys[M.keys.length - 1]) + ' ' + M.keys[M.keys.length - 1].slice(0, 4) + ' · última em ' + dFull(M.lastDate);
    } else st = 'Revolut · conta em euro';
    if (M.keys.length) st = 'Revolut · ' + st;
    return '<div class="view-top"><div><h1>Finanças</h1><span class="vt-l"><span class="mono sm">' + esc(st) + '</span></span></div>' +
      (configurado() ? '<div class="grupo"><button class="pill" type="button" data-fin-setup aria-pressed="' + S.setupOpen + '">Configurações</button><button class="pill primario" type="button" data-fin-add>Adicionar extrato</button></div>' : '') + '</div>' +
      (configurado() && !suportado() ? '<p class="aviso">' + avisoSuporte() + '</p>' : '');
  }
  /* ---------- configuração guiada ---------- */
  /* moeda e país já ficam guardados, mas por enquanto o painel só lê euro e só tem as regras da Irlanda */
  var MOEDAS = [['EUR', 'Euro (€)'], ['BRL', 'Real (R$)'], ['GBP', 'Libra (£)'], ['USD', 'Dólar (US$)']];
  var PAISES = [['IE', 'Irlanda'], ['PT', 'Portugal'], ['BR', 'Brasil'], ['GB', 'Reino Unido']];
  function configurado() { return !!(S.plan && S.plan.configurado); }
  function suportado() { return !S.plan || ((S.plan.moeda || 'EUR') === 'EUR' && (S.plan.pais || 'IE') === 'IE'); }
  function avisoSuporte() {
    return 'Por enquanto o painel só lê a conta em <b>euro</b> do Revolut e usa as regras de comerciantes da <b>Irlanda</b>. ' +
      'A moeda e o país que você escolher ficam guardados e passam a valer quando forem suportados.';
  }
  function opcoes(lista, sel) {
    return lista.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('');
  }
  function setup() {
    var p = S.plan || {}, primeira = !configurado();
    return '<section class="sec" id="fin-setup"><div class="sec-top"><h2>' + (primeira ? 'Antes de começar' : 'Configurações') + '</h2>' +
      '<span class="hint">tudo fica só neste navegador</span></div><div class="card"><form id="fin-fsetup" class="ggrid">' +
      '<p class="aviso">' + avisoSuporte() + '</p>' +
      '<fieldset><legend>Você</legend><div class="mgrid">' +
      '<label>Seu nome no extrato<input id="fin-s-titular" type="text" autocomplete="off" spellcheck="false" placeholder="ex.: MARIA SILVA" value="' + esc(p.titular || '') + '">' +
      '<small>Como aparece em transferências para você mesmo (ex.: "To MARIA SILVA"). Serve para reconhecer envios para outra conta sua. Pode deixar em branco.</small></label>' +
      '<label>Moeda<select id="fin-s-moeda">' + opcoes(MOEDAS, p.moeda || 'EUR') + '</select></label>' +
      '<label>País<select id="fin-s-pais">' + opcoes(PAISES, p.pais || 'IE') + '</select></label>' +
      '<label>Nome para os envios a outra conta sua<input id="fin-s-nome-brasil" type="text" autocomplete="off" maxlength="40" placeholder="' + esc(CAT_BY.brasil.nome) + '" value="' + esc((p.nomes && p.nomes.brasil) || '') + '">' +
      '<small>Ex.: "Contas no Brasil". Em branco fica "' + esc(CAT_BY.brasil.nome) + '".</small></label>' +
      '</div></fieldset>' +
      '<fieldset><legend>Metas por mês (€)</legend><p class="passo">' + (SUG ? 'Em branco, vale a sugestão: a média dos seus primeiros meses de extrato.' : 'Pode deixar em branco: depois de importar o extrato, o painel sugere metas pela média dos seus primeiros meses.') + '</p>' +
      '<div class="mgrid">' + metasCampos('s') + '</div></fieldset>' + secaoDados() +
      '<div class="grupo"><button class="btn pri" type="submit">' + (primeira ? 'Salvar e começar' : 'Salvar configurações') + '</button>' +
      (primeira ? '' : '<button class="btn" type="button" data-fin-setup>Cancelar</button>') + '</div>' +
      '</form></div></section>';
  }
  /* ---------- seus dados: backup, restaurar, apagar ---------- */
  function baixar(nome, texto, tipo) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: tipo }));
    a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function baixarBackup() {
    var x = Object.assign(dadosAtuais(), { exportadoEm: new Date().toISOString() });
    baixar('financas-' + todayIso() + '.json', JSON.stringify(x, null, 1), 'application/json');
  }
  function baixarCopiaIlegivel() {
    var json = true; try { JSON.parse(S.bloqueado.bruto); } catch (e) { json = false; }
    baixar('financas-copia-' + todayIso() + (json ? '.json' : '.txt'), S.bloqueado.bruto, json ? 'application/json' : 'text/plain');
  }
  function lerBackup(file) {
    if (!file) return Promise.resolve();
    return file.text().then(function (txt) {
      S.restaurar = { nome: file.name, dados: lerSalvo(txt, '') }; render();
    }).catch(function (e) { toast('Esse arquivo não é um backup do painel: ' + ((e && e.message) || e) + '.', true); });
  }
  function resumoTxt(x) {
    var r = resumoDados(x);
    if (!r.meses) return 'nenhum extrato';
    return r.meses + (r.meses === 1 ? ' mês' : ' meses') + ', ' + (r.meses === 1 ? 'de ' + mLabel(r.de) : 'de ' + mLabel(r.de) + ' a ' + mLabel(r.ate)) + ' (' + r.mov + ' movimentações)';
  }
  function temDados() { return !!(Object.keys(S.months).length || S.plan); }
  function secaoDados() {
    return '<fieldset><legend>Seus dados</legend><p class="passo">' + (temDados()
      ? 'Ficam só neste navegador. Se ele for limpo, somem: baixe um backup de vez em quando.'
      : 'Já usou o painel em outro navegador? Restaure o backup que você baixou lá.') + '</p><div class="grupo">' +
      (temDados() ? '<button class="btn" type="button" data-backup="baixar">Baixar backup</button>' : '') +
      '<button class="btn" type="button" data-backup="restaurar">Restaurar backup</button>' +
      (temDados() ? '<button class="pill perigo" type="button" data-apagar="pedir">Apagar meus dados</button>' : '') +
      '</div></fieldset>';
  }
  function telaRestaurar() {
    var R = S.restaurar, atual = S.bloqueado ? 'os dados ilegíveis salvos neste navegador' : (temDados() ? 'o que está salvo neste navegador: ' + resumoTxt(dadosAtuais()) : '');
    return '<section class="sec"><div class="sec-top"><h2>Restaurar backup</h2><span class="hint">' + esc(R.nome) + '</span></div><div class="card ggrid">' +
      '<p>No arquivo: <b>' + esc(resumoTxt(R.dados)) + '</b>' + (R.dados.plan && R.dados.plan.titular ? ', titular ' + esc(R.dados.plan.titular) : '') + '.</p>' +
      (atual ? '<p class="aviso">Isso substitui ' + esc(atual) + '. Não dá para desfazer.</p>' : '') +
      '<div class="grupo"><button class="btn pri" type="button" data-restaurar="confirmar">' + (atual ? 'Substituir pelos dados do backup' : 'Restaurar') + '</button>' +
      (temDados() && !S.bloqueado ? '<button class="btn" type="button" data-backup="baixar">Baixar backup dos dados atuais antes</button>' : '') +
      '<button class="btn" type="button" data-restaurar="cancelar">Cancelar</button></div></div></section>';
  }
  function telaApagar() {
    var o = S.bloqueado ? 'os dados ilegíveis salvos neste navegador' : resumoTxt(dadosAtuais()) + ', suas metas, categorias escolhidas e configuração';
    return '<section class="sec"><div class="sec-top"><h2>Apagar meus dados</h2></div><div class="card ggrid">' +
      '<p class="aviso erro">Isso apaga deste navegador: ' + esc(o) + '. Não dá para desfazer.</p>' +
      '<div class="grupo"><button class="pill perigo" type="button" data-apagar="confirmar">Apagar tudo</button>' +
      (S.bloqueado ? '<button class="btn" type="button" data-backup="copia">Baixar cópia antes</button>' : '<button class="btn" type="button" data-backup="baixar">Baixar backup antes</button>') +
      '<button class="btn" type="button" data-apagar="cancelar">Cancelar</button></div></div></section>';
  }
  function telaBloqueio() {
    return '<section class="sec"><div class="sec-top"><h2>Não consegui ler seus dados</h2></div><div class="card ggrid">' +
      '<p class="aviso erro">Os dados salvos neste navegador estão corrompidos ou são de uma versão do painel que esta não conhece (' + esc(S.bloqueado.motivo) + '). ' +
      'Para não perder nada, o painel não vai gravar por cima.</p>' +
      '<p class="passo">Baixe uma cópia do que existe, restaure um backup ou, se não precisar mais desses dados, apague e comece do zero.</p>' +
      '<div class="grupo"><button class="btn pri" type="button" data-backup="copia">Baixar cópia do que existe</button>' +
      '<button class="btn" type="button" data-backup="restaurar">Restaurar backup</button>' +
      '<button class="pill perigo" type="button" data-apagar="pedir">Apagar e começar do zero</button></div></div></section>';
  }
  function emptyState() {
    return '<section class="vazio-grande"><p class="eyebrow">Primeiro extrato</p><h2>Nenhum extrato salvo ainda</h2>' +
      '<ol><li>No Revolut, abra Extratos e escolha o extrato consolidado.</li><li>Baixe em CSV, de 1º de janeiro até hoje.</li><li>Toque em Adicionar extrato ou arraste o arquivo para esta página.</li></ol>' +
      '<button class="btn pri" type="button" data-fin-add>Escolher arquivo CSV</button></section>';
  }
  function kpis() {
    var s = periodStats(), all = S.sel === 'all';
    var aE = avgOf(function (g) { return g.entrou; }, function (g) { return g.entrou > 0; });
    var aG = avgOf(function (g) { return g.gasto; }, function (g) { return g.gasto > 0; });
    var aS = avgOf(function (g) { return g.saved; });
    var pt = planTotal(), pp = planPoupar();
    var lab = all ? 'Média por mês' : mLabel(S.sel) + (M.partial === S.sel ? ' · até dia ' + +M.lastDate.slice(8) : '');
    var tiles = [
      ['Entrou', s.entrou, all ? (aE == null ? '' : 'só meses com renda') : (aE == null ? '' : dl(s.entrou, aE, true, 'da média') + '<br>média ' + f0(aE)), ''],
      ['Gastou', s.gasto, (all ? '' : (aG == null ? '' : dl(s.gasto, aG, false, 'da média') + '<br>')) + dl(s.gasto, pt, false, 'da meta') + ' de ' + f0(pt), ''],
      ['Guardou', s.saved, dl(s.saved, pp, true, 'da meta') + ' de ' + f0(pp) + '<br>reserva e investimentos', ''],
      ['Saldo do mês', s.saldo, 'entrou − gastou − guardou', 'sg']
    ];
    var h = '<section class="sec"><div class="sec-top"><h2>' + esc(lab.charAt(0).toUpperCase() + lab.slice(1)) + '</h2><button class="btn sm" type="button" data-all aria-pressed="' + all + '">' + (all ? 'Voltar ao mês' : 'Ver média de todos os meses') + '</button></div><div class="kpis">';
    tiles.forEach(function (t) {
      var v = t[3] ? sgn(t[1]) : f0(t[1]);
      h += '<div class="kpi"><span class="l">' + t[0] + '</span><span class="v">' + v + '</span><span class="s">' + t[2] + '</span></div>';
    });
    return h + '</div></section>';
  }
  function niceStep(v) {
    var raw = v / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    return (n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 5 ? 5 : 10) * p;
  }
  function chart() {
    var ks = M.keys, mx = 0;
    ks.forEach(function (k) { mx = Math.max(mx, M.by[k].gasto, M.by[k].entrou); });
    var step = niceStep(mx || 100), top = step * 4, i, yl = '', gl = '', cols = '';
    for (i = 0; i <= 4; i++) {
      yl += '<span class="yl num" style="bottom:' + i * 25 + '%">' + nn.format(step * i) + '</span>';
      gl += '<i style="bottom:' + i * 25 + '%"></i>';
    }
    ks.forEach(function (k, idx) {
      var g = M.by[k], tot = 0, segs = '';
      CATS.forEach(function (c) {
        var v = Math.max(0, g.spend[c.id] || 0);
        if (v > top * .003) { tot += v; segs += '<i style="flex:' + v.toFixed(2) + ' 0 0;background:' + colorOf(c) + '"></i>'; }
      });
      var yr = k.slice(0, 4), showYr = idx === 0 || ks[idx - 1].slice(0, 4) !== yr;
      cols += '<button type="button" class="mcol' + (M.partial === k ? ' parc' : '') + '" data-sel="' + k + '" data-tip="' + k + '" aria-pressed="' + (S.sel === k) + '" aria-label="' + esc(mLabel(k)) + (M.partial === k ? ' (parcial)' : '') + ': gastou ' + f0(g.gasto) + ', entrou ' + f0(g.entrou) + '">' +
        '<span class="bars"><span class="stack" style="height:' + (tot / top * 100).toFixed(2) + '%">' + segs + '</span>' +
        (g.entrou > 0 ? '<b class="inc" style="bottom:' + Math.min(100, g.entrou / top * 100).toFixed(2) + '%"></b>' : '') + '</span>' +
        '<span class="xl"><b>' + mShort(k) + (M.partial === k ? '*' : '') + '</b>' + (showYr ? '<span>' + yr + '</span>' : '') + '</span></button>';
    });
    var leg = '';
    CATS.forEach(function (c) { leg += '<span><i class="sw" style="background:' + colorOf(c) + '"></i>' + esc(catNome(c)) + '</span>'; });
    leg += '<span><i class="sw line"></i>Entrou no mês</span>';
    return '<section class="sec"><div class="sec-top"><h2>Gastos por mês</h2><span class="hint">Toque numa barra para ver o mês' + (M.partial ? ' · * mês em andamento' : '') + '</span></div><div class="card">' +
      '<div class="chart"><div class="yax" aria-hidden="true"><div class="in">' + yl + '</div></div><div class="cscroll"><div class="plot" style="--n:' + ks.length + '"><div class="gl" aria-hidden="true">' + gl + '</div><div class="cols">' + cols + '</div></div></div></div>' +
      '<div class="legend">' + leg + '</div></div></section>';
  }
  function catPanel() {
    var s = periodStats(), all = S.sel === 'all', list = [], mx = 0;
    CATS.forEach(function (c) {
      var v = s.spend[c.id] || 0, g = planCat(c.id);
      if (Math.abs(v) >= 0.5 || g > 0) { list.push({ c: c, v: v, g: g }); mx = Math.max(mx, v, g); }
    });
    list.sort(function (a, b) { return b.v - a.v; });
    var h = '<div><div class="sec-top"><h2>Categorias</h2><span class="hint">' + (all ? 'média por mês' : 'no mês') + ' · o traço é a meta</span></div><div class="card" style="margin-top:12px">';
    if (!list.length) h += '<p class="vazio">Sem gastos neste período.</p>';
    list.forEach(function (x) {
      var over = x.v - x.g, w = mx ? Math.max(0, x.v) / mx * 100 : 0, gp = mx ? x.g / mx * 100 : 0, st;
      if (x.g <= 0) st = x.v > 0.5 ? 'sem meta' : '';
      else if (Math.abs(over) <= 0.5) st = '<span class="d ok">= na meta</span> de ' + f0(x.g);
      else if (over > 0.5) st ='<span class="d bad">▲ ' + f0(over) + ' acima</span> da meta de ' + f0(x.g);
      else st = '<span class="d good">▼ ' + f0(-over) + ' abaixo</span> da meta de ' + f0(x.g);
      h += '<button type="button" class="cat" data-f="' + x.c.id + '" aria-pressed="' + (S.f.indexOf(x.c.id) >= 0) + '"><i class="sw" style="background:' + colorOf(x.c) + '"></i><span class="nm">' + esc(catNome(x.c)) + '</span><span class="val">' + f0(x.v) + '</span>' +
        '<span class="track"><i style="width:' + w.toFixed(1) + '%;background:' + colorOf(x.c) + '"></i>' + (x.g > 0 ? '<b class="goal" style="left:calc(' + gp.toFixed(1) + '% - 1px)"></b>' : '') + '</span><span class="st">' + st + '</span></button>';
    });
    h += '<details class="metas" id="fin-metas"' + (S.metasOpen ? ' open' : '') + '><summary>Editar metas</summary><form id="fin-fmetas"><div class="mgrid">' +
      metasCampos('m') + '</div><button class="btn sm pri" type="submit">Salvar metas</button></form></details></div></div>';
    return h;
  }
  function tagOf(r) {
    if (r.kind === 'gasto') { var c = CAT_BY[r.cat]; return '<i class="sw" style="background:' + colorOf(c) + '"></i>' + esc(catNome(c)); }
    var t = { renda: 'Renda', outras: 'Outra entrada', flex: 'Reserva (Flexible)', invest: 'Investimento', interno: 'Entre contas' }[r.kind];
    return '<i class="sw" style="background:var(--muted)"></i>' + t;
  }
  /* filtro de várias escolhas: sem nada marcado mostra tudo; com marcas, mostra o que casa com qualquer uma */
  function filterMatch(r) {
    var f = S.f, i;
    if (!f.length) return true;
    for (i = 0; i < f.length; i++) {
      if (f[i] === '_in' ? (r.kind === 'renda' || r.kind === 'outras') : f[i] === '_sav' ? (r.kind === 'flex' || r.kind === 'invest') : (r.kind === 'gasto' && r.cat === f[i])) return true;
    }
    return false;
  }
  function movPanel() {
    var all = S.sel === 'all';
    var rows = M.rows.filter(function (r) { return all || r.m === S.sel; });
    var fl = [['_in', 'Entradas', 'var(--muted)'], ['_sav', 'Reserva e investimento', 'var(--muted)']];
    CATS.forEach(function (c) { fl.push([c.id, catNome(c), colorOf(c)]); });
    var hdr = '<div class="sec-top"><h2>Movimentos</h2><span class="rt"><span class="hint">' + rows.length + ' ' + (all ? 'em todos os meses' : 'no mês') + '</span><button type="button" class="btn sm" data-movtoggle aria-expanded="' + S.movOpen + '">' + (S.movOpen ? 'Minimizar' : 'Mostrar') + '</button></span></div>';
    if (!S.movOpen) return '<div>' + hdr + '</div>';
    var ns = S.f.length, nomes = fl.filter(function (x) { return S.f.indexOf(x[0]) >= 0; }).map(function (x) { return x[1]; });
    var h = '<div>' + hdr + '<div class="card" style="margin-top:12px"><div class="fmenu"><button type="button" class="btn sm fbtn" data-fopen aria-expanded="' + S.fOpen + '" aria-controls="fin-fpanel"><span>Filtrar</span>' + (ns ? '<b class="fn">' + ns + '</b>' : '') + '</button>' +
      (ns ? '<button type="button" class="btn sm" data-fclear>Limpar</button><span class="fres">' + esc(nomes.join(', ')) + '</span>' : '');
    if (S.fOpen) h += '<div class="fpanel" id="fin-fpanel" role="group" aria-label="Filtrar movimentos por categoria">' + fl.map(function (x) {
      var on = S.f.indexOf(x[0]) >= 0;
      return '<button type="button" class="fopt" role="checkbox" aria-checked="' + on + '" data-f="' + x[0] + '"><i class="bx"></i><i class="sw" style="background:' + x[2] + '"></i><span>' + esc(x[1]) + '</span></button>';
    }).join('') + '</div>';
    h += '</div>';
    var sh = rows.filter(filterMatch).reverse();
    if (!sh.length) h += '<p class="vazio">Nada neste filtro.</p>';
    sh.slice(0, S.more).forEach(function (r) {
      var d = r.kind === 'renda' ? r.desc.replace(/^Payment from /i, '') : r.desc;
      h += '<div class="mov"><span class="dt">' + dFmt(r.date) + '</span><span class="ds">' + esc(d) + '</span><span class="am num' + (r.a > 0 ? ' in' : '') + '">' + (r.a > 0 ? '+' : '−') + f2(Math.abs(r.a)) + '</span><span class="tg">' + tagOf(r) + '</span></div>';
    });
    if (sh.length > S.more) h += '<div style="padding-top:12px"><button class="btn sm" type="button" data-more>Mostrar mais ' + Math.min(30, sh.length - S.more) + ' de ' + (sh.length - S.more) + '</button></div>';
    return h + '</div></div>';
  }
  function table() {
    var ks = M.keys, comp = avgKeys(), n = comp.length || 1, h = '<section class="sec"><div class="sec-top"><h2>Mês a mês, por categoria</h2><span class="hint">A média usa só meses completos</span></div><div class="tw"><table><thead><tr><th>Categoria</th>';
    ks.forEach(function (k) { h += '<th class="' + (S.sel === k ? 'selc' : '') + '">' + mShort(k) + (M.partial === k ? '*' : '') + '</th>'; });
    h += '<th class="avg">Média</th></tr></thead><tbody>';
    CATS.forEach(function (c) {
      var vals = ks.map(function (k) { return M.by[k].spend[c.id] || 0; }), mxv = Math.max.apply(null, vals.concat([1]));
      if (!vals.some(function (v) { return Math.abs(v) >= .5; })) return;
      var avg = 0; comp.forEach(function (k) { avg += M.by[k].spend[c.id] || 0; });
      h += '<tr><td><span class="rowsw"><i class="sw" style="background:' + colorOf(c) + '"></i>' + esc(catNome(c)) + '</span></td>';
      ks.forEach(function (k, i) { h += '<td class="h' + (S.sel === k ? ' selc' : '') + '" style="--i:' + Math.max(0, vals[i] / mxv).toFixed(2) + '">' + (Math.abs(vals[i]) < .5 ? '–' : nn.format(vals[i])) + '</td>'; });
      h += '<td class="avg">' + nn.format(avg / n) + '</td></tr>';
    });
    function line(lbl, fn, cls) {
      var a = 0; comp.forEach(function (k) { a += fn(M.by[k]); });
      var r = '<tr class="tot' + (cls || '') + '"><td>' + lbl + '</td>';
      ks.forEach(function (k) { r += '<td class="' + (S.sel === k ? 'selc' : '') + '">' + nn.format(fn(M.by[k])) + '</td>'; });
      return r + '<td class="avg">' + nn.format(a / n) + '</td></tr>';
    }
    h += line('Gastou', function (g) { return g.gasto; });
    h += line('Entrou', function (g) { return g.entrou; });
    h += line('Guardou', function (g) { return g.saved; });
    h += line('Saldo do mês', function (g) { return g.saldo; });
    return h + '</tbody></table></div></section>';
  }
  function merchants() {
    var mp = {};
    M.rows.forEach(function (r) {
      if (r.baseKind !== 'gasto') return;
      var x = mp[r.key] || (mp[r.key] = { key: r.key, desc: r.desc, n: 0, total: 0, eff: '', effs: {}, autos: {}, auto: r.auto });
      var e = r.kind === 'gasto' ? r.cat : r.kind === 'invest' ? '_invest' : '_ignore';
      x.n++; x.total -= r.a; x.effs[e] = (x.effs[e] || 0) + 1; x.autos[r.auto] = 1; x.eff = e;
    });
    return Object.keys(mp).map(function (k) { var x = mp[k]; if (Object.keys(x.effs).length > 1) x.eff = ''; return x; }).sort(function (a, b) { return Math.abs(b.total) - Math.abs(a.total); });
  }
  function effNome(e) { return e === '_invest' ? 'Investimento' : e === '_ignore' ? 'Ignorar' : (CAT_BY[e] ? catNome(CAT_BY[e]) : e); }
  function optionsFor(sel, volta) {
    var o = sel === '' ? '<option value="" selected disabled>Em mais de uma categoria</option>' : '';
    if (volta) o += '<option value="_auto">Voltar ao automático</option>';
    CATS.forEach(function (c) { o += '<option value="' + c.id + '"' + (sel === c.id ? ' selected' : '') + '>' + esc(catNome(c)) + '</option>'; });
    o += '<option value="_invest"' + (sel === '_invest' ? ' selected' : '') + '>Investimento (não é gasto)</option>';
    o += '<option value="_ignore"' + (sel === '_ignore' ? ' selected' : '') + '>Ignorar (entre contas)</option>';
    return o;
  }
  function revList() {
    var q = S.q.trim().toUpperCase(), all = merchants().filter(function (x) { return !q || x.key.indexOf(q) >= 0; }), h = '';
    if (!all.length) return '<p class="vazio">Nenhum comerciante encontrado.</p>';
    all.slice(0, 40).forEach(function (x) {
      h += '<div class="rrow"><div class="n">' + esc(x.desc) + '<small>' + x.n + (x.n === 1 ? ' movimento · ' : ' movimentos · ') + f2(x.total) + (S.over[x.key] ? ' · categoria sua' : '') + (x.eff === '' ? ' · hoje dividido: ' + Object.keys(x.effs).map(function (e) { return effNome(e) + ' (' + x.effs[e] + ')'; }).join(', ') + '. Escolha uma para todos.' : '') + '</small></div>' +
        '<select data-ov="' + esc(x.key) + '" aria-label="Categoria de ' + esc(x.desc) + '">' + optionsFor(x.eff, !!S.over[x.key] && Object.keys(x.autos).length > 1) + '</select></div>';
    });
    if (all.length > 40) h += '<p class="passo" style="padding-top:12px">Mostrando 40 de ' + all.length + '. Use a busca para achar os outros.</p>';
    return h;
  }
  function review() {
    var nc = merchants().length;
    return '<section class="sec rev"><details class="revd" id="fin-revd"' + (S.revOpen ? ' open' : '') + '><summary><h2>Revisar categorias</h2><span class="hint">' + nc + ' comerciantes. Abra para trocar a categoria de algum.</span></summary><div class="rv-c"><p class="passo">Os comerciantes novos entram numa categoria pelo nome. Se um estiver no lugar errado, troque aqui e o painel inteiro se refaz, inclusive os meses antigos e os próximos extratos.</p>' +
      '<div class="fbusca"><label class="vh" for="fin-q">Buscar comerciante</label><input id="fin-q" type="search" placeholder="Buscar comerciante" value="' + esc(S.q) + '" autocomplete="off"></div><div class="card" id="fin-revlist">' + revList() + '</div></div></details></section>';
  }
  function dayN(d) { var q = d.split('-'); return Date.UTC(+q[0], +q[1] - 1, +q[2]) / 864e5; }
  /* dinheiro total no fim de cada dia = conta + o que está guardado (Flexible Cash, investimentos e cripto).
     Hoje, o guardado vem do resumo; nos dias anteriores, desfaz as transferências que vieram depois. */
  function balSeries() {
    var pts = [], last = null, sm = S.summary, now = sm ? ((sm.flex || 0) + (sm.invest || 0) + (sm.cripto || 0)) / 100 : 0, after = 0, i;
    M.rows.forEach(function (r) {
      if (!last || last.d !== r.date) { last = { d: r.date, c: r.bal, mv: 0 }; pts.push(last); } else last.c = r.bal;
      if (r.kind === 'flex' || r.kind === 'invest') last.mv += r.a;
    });
    for (i = pts.length - 1; i >= 0; i--) {
      pts[i].g = sm ? Math.max(0, now + after) : 0;
      pts[i].b = pts[i].c + pts[i].g;
      after += pts[i].mv;
    }
    return pts;
  }
  /* saldo médio: cada dia vale o saldo em que ele terminou */
  function avgBal(pts) {
    var sum = 0, i, n = pts.length, days = 0, w;
    for (i = 0; i < n; i++) { w = i < n - 1 ? dayN(pts[i + 1].d) - dayN(pts[i].d) : 1; sum += pts[i].b * w; days += w; }
    return days ? sum / days : 0;
  }
  function cashSummary() {
    var rows = M.rows;
    if (!rows.length) return '';
    var sm = S.summary, pts = balSeries(), lp = pts[pts.length - 1], last = rows[rows.length - 1], pmin = pts[0], nt = [], parts = 'Conta ' + f0(lp.c);
    pts.forEach(function (p) { if (p.b < pmin.b) pmin = p; });
    if (sm) {
      parts += ' + Flexible Cash ' + f0((sm.flex || 0) / 100) + ' + Investimentos ' + f0((sm.invest || 0) / 100) + ' + Cripto ' + f0((sm.cripto || 0) / 100);
      if (sm.asOf && sm.asOf < last.date) nt.push('Flexible Cash e cripto de ' + dFull(sm.asOf));
      if (sm.investAsOf && sm.investAsOf < last.date) nt.push('investimentos de ' + dFull(sm.investAsOf));
    }
    return '<section class="sec"><div class="card cfm"><div><p class="l mono">' + (sm ? 'Dinheiro total · Revolut' : 'Saldo atual · conta Revolut') + '</p><p class="big num">' + f0(lp.b) + '</p>' +
      '<p class="s">' + esc(parts) + '</p>' +
      '<p class="s">em ' + esc(dFull(last.date)) + (nt.length ? ' · ' + esc(nt.join(' · ')) : '') + ' · média do período ' + f0(avgBal(pts)) + ' · mais baixo ' + f2(pmin.b) + '</p></div>' +
      '<div><div id="fin-bal" class="bal spark"></div><div class="axl mono"><span>' + esc(dFull(pts[0].d)) + '</span><span>' + esc(dFull(pts[pts.length - 1].d)) + '</span></div>' +
      (sm ? '<p class="s">Antes de hoje, o total é reconstruído a partir das transferências para o Flexible Cash e para investimentos. Rendimentos e variação de preço não entram.</p>' : '') + '</div></div></section>';
  }
  function cashBridge() {
    var rows = M.rows;
    if (!rows.length) return '';
    var first = rows[0], last = rows[rows.length - 1], open = first.bal - first.a, cur = last.bal;
    var T = { renda: 0, outras: 0, interno: 0, flex: 0, invest: 0, gasto: 0 }, cat = {};
    rows.forEach(function (r) {
      if (r.kind === 'gasto') { T.gasto -= r.a; cat[r.cat] = (cat[r.cat] || 0) - r.a; } else T[r.kind] += r.a;
    });
    var items = [
      { c: 'base', l: 'Saldo inicial (' + dFull(first.date) + ')', v: open },
      { l: 'Renda (salários e pagamentos)', v: T.renda },
      { l: 'Outras entradas', v: T.outras }
    ];
    if (Math.abs(T.interno) >= .5) items.push({ l: 'Entre contas suas', v: T.interno });
    items.push({ l: T.flex <= 0 ? 'Enviado ao Flexible Cash (líquido)' : 'Retirado do Flexible Cash (líquido)', v: T.flex });
    items.push({ l: 'Investimentos e cripto (líquido)', v: T.invest });
    items.push({ l: 'Gastos (já descontados os reembolsos)', v: -T.gasto, cats: true });
    items.push({ c: 'end', l: 'Saldo atual na conta', v: cur });
    var mx = 1; items.forEach(function (x) { mx = Math.max(mx, Math.abs(x.v)); });
    var br = '';
    items.forEach(function (x, i) {
      var cls = x.c || '', sign = x.c ? '' : (x.v >= 0 ? '+' : '−'), tone = x.c ? '' : (x.v >= 0 ? 'pos' : 'neg');
      var col = x.c ? 'var(--accent)' : (x.v >= 0 ? 'var(--pos)' : 'var(--neg)');
      var inner = '<span class="bl">' + esc(x.l) + '</span><b class="num ' + tone + '">' + sign + f0(Math.abs(x.v)) + '</b><span class="bt"><i style="width:' + (Math.abs(x.v) / mx * 100).toFixed(1) + '%;background:' + col + '"></i></span>';
      if (x.cats) {
        var sub = '';
        CATS.forEach(function (c) { if (Math.abs(cat[c.id] || 0) >= .5) sub += '<div><span>' + esc(catNome(c)) + '</span><b>' + f0(cat[c.id]) + '</b></div>'; });
        br += '<details class="brd"' + (S.cfOpen ? ' open' : '') + ' id="fin-cfd"><summary class="br">' + inner + '<span class="sub" style="grid-column:1/3">Toque para ver por categoria</span></summary><div class="brsub">' + sub + '</div></details>';
      } else br += '<div class="br ' + cls + (i === 0 ? ' first' : '') + '">' + inner + '</div>';
    });
    return '<section class="sec"><div class="sec-top"><h2>De onde veio e para onde foi</h2><span class="hint">' + esc(dFull(first.date)) + ' a ' + esc(dFull(last.date)) + '</span></div>' +
      '<div class="card cfb"><h3>Tudo que entrou e saiu da conta</h3>' + br + '</div></section>';
  }

  /* ---------- dívidas em observação ---------- */
  var nr = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  function fR(v) { return 'R$ ' + n2.format(v); }
  function todayIso() { var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function diasAte(iso) { return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(todayIso() + 'T00:00:00Z')) / 86400000); }
  function vencTxt(iso) {
    var n = diasAte(iso);
    return n === 0 ? 'vence hoje' : n === 1 ? 'vence amanhã' : n > 1 ? 'vence em ' + n + ' dias' : n === -1 ? 'venceu ontem' : 'venceu há ' + (-n) + ' dias';
  }
  function parseNum(s) {
    s = String(s == null ? '' : s).replace(/R\$|€|\s/g, '');
    if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return parseFloat(s);
  }
  function divState() {
    var d = S.div || {};
    return { items: Array.isArray(d.items) ? d.items : [], cambio: d.cambio && +d.cambio.rate > 0 ? d.cambio : null, margem: d.margem != null && !isNaN(d.margem) ? +d.margem : 2 };
  }
  function divMut(fn) {
    var d = JSON.parse(JSON.stringify(S.div || {}));
    if (!Array.isArray(d.items)) d.items = [];
    fn(d);
    return enqueue(function () { return saveDiv(d); }).then(function () { render(); });
  }
  function dividas() {
    var D = divState(), open = D.items.filter(function (i) { return i.status !== 'paga'; }).sort(function (a, b) { var x = a.venc || '9999', y = b.venc || '9999'; return x < y ? -1 : x > y ? 1 : 0; }), paid = D.items.filter(function (i) { return i.status === 'paga'; });
    var rate = D.cambio ? +D.cambio.rate : 0, mg = D.margem, tb = 0, tE = 0, te = 0, tr = 0, hasBrl = false;
    var h = '<section class="sec" id="fin-dividas"><div class="sec-top"><h2>Em observação</h2><span class="hint">pagamentos para fazer</span></div><div class="card dv">';
    if (!open.length) h += '<p class="vazio dvv">Nenhum pagamento em observação.</p>';
    open.forEach(function (it) {
      var isE = !(it.brl > 0) && it.eur > 0, eur, partes = [];
      if (isE) { eur = +it.eur; tE += eur; te += eur; tr += eur; } else { hasBrl = true; eur = rate ? it.brl / rate : null; tb += it.brl; if (eur != null) { te += eur; tr += eur * (1 + mg / 100); } }
      if (!isE) partes.push(fR(it.brl));
      partes.push(it.venc ? '<span class="' + (diasAte(it.venc) <= 7 ? 'urg' : '') + '">' + esc(vencTxt(it.venc)) + ', ' + esc(dFull(it.venc)) + '</span>' : (it.criada ? 'anotada em ' + esc(dFull(it.criada)) : ''));
      h += '<div class="dvr"><div class="n">' + esc(it.nome) + '<small>' + partes.filter(Boolean).join(' · ') + '</small>' + (it.desc ? '<small>' + esc(it.desc) + '</small>' : '') + '</div>' +
        '<div class="v">' + (isE ? '<b class="num">' + f0(eur) + '</b><small>pago em euro, sem câmbio</small>' : eur != null ? '<b class="num">≈ ' + f0(eur) + '</b><small>reservar ' + f0(eur * (1 + mg / 100)) + ' com ' + nn.format(mg) + '% de margem</small>' : '<small>defina o câmbio abaixo</small>') + '</div>' +
        '<div class="act"><button type="button" class="btn sm" data-dpay="' + esc(it.id) + '" aria-label="Marcar ' + esc(it.nome) + ' como paga">Paguei</button><button type="button" class="btn sm" data-ddel="' + esc(it.id) + '" aria-label="Remover ' + esc(it.nome) + '">Remover</button></div></div>';
    });
    if (open.length > 1) h += '<div class="dvr dvt"><div class="n">Total<small>' + [tb > 0 ? fR(tb) : '', tE > 0 ? f0(tE) + ' em euro' : ''].filter(Boolean).join(' · ') + '</small></div><div class="v">' + (rate || !hasBrl ? '<b class="num">' + (hasBrl ? '≈ ' : '') + f0(te) + '</b><small>reservar ' + f0(tr) + '</small>' : '') + '</div></div>';
    if (open.length && (rate || !hasBrl)) {
      var cur = M.rows.length ? M.rows[M.rows.length - 1].bal : null, sm = S.summary, flex = sm && sm.flex ? sm.flex / 100 : 0, pos = sm && sm.asOf ? ' (posição de ' + dFmt(sm.asOf) + ')' : '';
      if (cur != null) {
        var msg;
        if (cur >= tr) msg = 'O saldo da conta (' + f0(cur) + ') já cobre o valor reservado' + pos + '.';
        else if (flex > 0 && Math.round(cur) + Math.round(flex) >= Math.round(tr)) msg = 'A conta tem ' + f0(cur) + ' e faltam ' + f0(Math.round(tr) - Math.round(cur)) + ' para cobrir o valor reservado. O Flexible Cash (' + f0(flex) + ') cobre a diferença' + pos + '.';
        else if (flex > 0) msg = 'A conta (' + f0(cur) + ') e o Flexible Cash (' + f0(flex) + ') somam ' + f0(Math.round(cur) + Math.round(flex)) + '; ainda faltam ' + f0(Math.round(tr) - Math.round(cur) - Math.round(flex)) + ' para cobrir tudo' + pos + '.';
        else msg = 'A conta tem ' + f0(cur) + '; faltam ' + f0(Math.round(tr) - Math.round(cur)) + ' para cobrir o valor reservado' + pos + '.';
        h += '<p class="dvn">' + msg + '</p>';
      }
    }
    h += '<details class="metas" id="fin-dcamb"' + (S.dCamb ? ' open' : '') + '><summary>' + (D.cambio ? 'Câmbio usado: 1 € = R$ ' + nr.format(rate) + ' · ' + esc(dFull(D.cambio.data || todayIso())) + (D.cambio.fonte ? ' · ' + esc(D.cambio.fonte) : '') : 'Definir câmbio (R$ por €)') + '</summary>' +
      '<form id="fin-fcamb"><div class="mgrid"><label>Reais por 1 euro<input id="fin-c-rate" type="text" inputmode="decimal" value="' + (rate ? esc(nr.format(rate)) : '') + '" placeholder="5,61"></label>' +
      '<label>Margem para taxa e câmbio (%)<input id="fin-c-mg" type="text" inputmode="decimal" value="' + esc(String(mg).replace('.', ',')) + '"></label></div><button class="btn sm pri" type="submit">Atualizar câmbio</button></form></details>';
    h += '<details class="metas" id="fin-dadd"' + (S.dAdd ? ' open' : '') + '><summary>Adicionar pagamento</summary><form id="fin-fdiv"><div class="mgrid"><label>Nome<input id="fin-d-nome" type="text" placeholder="Ex.: Banco Itaú ou escola" autocomplete="off"></label>' +
      '<label>Valor<input id="fin-d-brl" type="text" inputmode="decimal" placeholder="3.700,00" autocomplete="off"></label>' +
      '<label>Moeda<select id="fin-d-cur"><option value="BRL">Reais (R$)</option><option value="EUR">Euros (€)</option></select></label>' +
      '<label>Vencimento (opcional)<input id="fin-d-venc" type="date"></label>' +
      '<label>Descrição (opcional)<input id="fin-d-desc" type="text" placeholder="Ex.: Parcela 4/5" autocomplete="off"></label></div><button class="btn sm pri" type="submit">Adicionar</button></form></details>';
    if (paid.length) {
      h += '<details class="metas" id="fin-dpaid"' + (S.dPaid ? ' open' : '') + '><summary>Pagas (' + paid.length + ')</summary>';
      paid.forEach(function (it) {
        h += '<div class="dvr paga"><div class="n">' + esc(it.nome) + '<small>' + (it.brl > 0 ? fR(it.brl) : f0(it.eur || 0)) + (it.pagaEm ? ' · paga em ' + esc(dFull(it.pagaEm)) : '') + '</small></div><div></div><div class="act"><button type="button" class="btn sm" data-ddel="' + esc(it.id) + '" aria-label="Remover ' + esc(it.nome) + '">Remover</button></div></div>';
      });
      h += '</details>';
    }
    return h + '</div></section>';
  }
  function drawBal() {
    var el = $('#fin-bal');
    if (!el) return;
    var pts = balSeries();
    if (!pts.length) { el.innerHTML = ''; return; }
    var W = Math.max(200, el.clientWidth), H = 100, L = 4, R = 6, Tp = 10, B = 6, iw = W - L - R, ih = H - Tp - B;
    var d0 = dayN(pts[0].d), d1 = dayN(pts[pts.length - 1].d), span = Math.max(1, d1 - d0), mx = 1, i;
    pts.forEach(function (p) { if (p.b > mx) mx = p.b; });
    var avg = avgBal(pts);
    function X(d) { return L + (dayN(d) - d0) / span * iw; }
    function Y(v) { return Tp + (1 - Math.max(0, v) / mx) * ih; }
    var dd = 'M' + X(pts[0].d).toFixed(1) + ' ' + Y(pts[0].b).toFixed(1);
    for (i = 1; i < pts.length; i++) dd += ' L' + X(pts[i].d).toFixed(1) + ' ' + Y(pts[i - 1].b).toFixed(1) + ' L' + X(pts[i].d).toFixed(1) + ' ' + Y(pts[i].b).toFixed(1);
    var yb = Y(0).toFixed(1), area = dd + ' L' + X(pts[pts.length - 1].d).toFixed(1) + ' ' + yb + ' L' + X(pts[0].d).toFixed(1) + ' ' + yb + ' Z';
    var lastp = pts[pts.length - 1], ya = Y(avg).toFixed(1);
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + (S.summary ? 'Dinheiro total (conta, Flexible Cash, investimentos e cripto) dia a dia' : 'Saldo da conta dia a dia') + ', de ' + esc(dFull(pts[0].d)) + ' a ' + esc(dFull(lastp.d)) + '. Média ' + nn.format(avg) + ' euros, atual ' + nn.format(lastp.b) + ' euros.">' +
      '<path d="' + area + '" fill="var(--accent)" fill-opacity=".13"/><path d="' + dd + '" fill="none" stroke="var(--accent)" stroke-width="1.75" stroke-linejoin="round"/>' +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ya + '" y2="' + ya + '" stroke="var(--muted)" stroke-dasharray="4 4"/>' +
      '<text x="' + (W - R - 2) + '" y="' + (+ya - 6) + '" text-anchor="end" class="a">média ' + nn.format(avg) + '</text>' +
      '<circle cx="' + X(lastp.d).toFixed(1) + '" cy="' + Y(lastp.b).toFixed(1) + '" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>' +
      '<line id="fin-xh" y1="' + Tp + '" y2="' + (Tp + ih) + '" stroke="var(--muted)" visibility="hidden"/><circle id="fin-xd" r="4" fill="var(--fg)" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>' +
      '<rect id="fin-xr" x="' + L + '" y="0" width="' + iw + '" height="' + H + '" fill="transparent"/></svg>';
    var rect = $('#fin-xr'), xh = $('#fin-xh'), xd = $('#fin-xd');
    function at(e) {
      var box = rect.getBoundingClientRect(), fx = (e.clientX - box.left) / box.width * iw + L, best = pts[0], bd = 1e9;
      pts.forEach(function (p) { var dx = Math.abs(X(p.d) - fx); if (dx < bd) { bd = dx; best = p; } });
      xh.setAttribute('x1', X(best.d)); xh.setAttribute('x2', X(best.d)); xh.setAttribute('visibility', 'visible');
      xd.setAttribute('cx', X(best.d)); xd.setAttribute('cy', Y(best.b)); xd.setAttribute('visibility', 'visible');
      placeTip('<h3>' + esc(dFull(best.d)) + '</h3><div class="r"><span>' + (S.summary ? 'Total no fim do dia' : 'Saldo no fim do dia') + '</span><b>' + f2(best.b) + '</b></div>' + (S.summary ? '<div class="r"><span>Na conta</span><b>' + f2(best.c) + '</b></div><div class="r"><span>Fora da conta</span><b>' + f2(best.g) + '</b></div>' : ''), e.clientX, e.clientY);
    }
    rect.addEventListener('pointermove', at);
    rect.addEventListener('pointerdown', at);
    rect.addEventListener('pointerleave', function () { xh.setAttribute('visibility', 'hidden'); xd.setAttribute('visibility', 'hidden'); hideTip(); });
  }
  /* ---------- blocos de planejamento: previsão, metas de poupança, contas fixas, envios a outra conta e taxa de poupança ---------- */
  var GOALS = [
    { id: 'reserva', nome: 'Reserva de emergência', src: 'flex', de: 'Flexible Cash' },
    { id: 'invest', nome: 'Investimentos', src: 'invest', de: 'investimentos e cripto' },
    { id: 'viagens', nome: 'Viagens pequenas', src: null },
    { id: 'viagem', nome: 'Viagem grande do ano', src: null }
  ];
  function pct(v) { return nn.format(v) + '%'; }
  function goalCfg(id) { var g = S.plan && S.plan.goals; return (g && g[id]) || {}; }
  function goalHas(g) {
    var sm = S.summary, t = 0;
    if (!g.src) return +goalCfg(g.id).tem || 0;
    if (sm) return g.src === 'flex' ? (sm.flex || 0) / 100 : ((sm.invest || 0) + (sm.cripto || 0)) / 100;
    M.rows.forEach(function (r) { if (r.kind === g.src) t -= r.a; });
    return Math.max(0, t);
  }
  function refMonth() { var d = M.lastDate || todayIso(); return d.slice(0, 7); }
  function mesesAte(pz) {
    if (!/^\d{4}-\d{2}$/.test(pz || '')) return 0;
    var a = refMonth().split('-').map(Number), b = pz.split('-').map(Number);
    return Math.max(1, (b[0] * 12 + b[1]) - (a[0] * 12 + a[1]) + 1);
  }
  function mesAno(pz) { var p = pz.split('-'); return MS[+p[1] - 1] + ' ' + p[0]; }
  function addMonth(d) {
    var p = d.split('-').map(Number), y = p[0], m = p[1] + 1;
    if (m > 12) { m = 1; y++; }
    var dd = Math.min(p[2], new Date(y, m, 0).getDate());
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }
  function metasPoup() {
    var h = '<section class="sec" id="fin-goals"><div class="sec-top"><h2>Metas de poupança</h2><span class="hint">reserva e investimentos saem do extrato; as viagens você atualiza</span></div><div class="gl4">';
    GOALS.forEach(function (g) {
      var c = goalCfg(g.id), alvo = +c.alvo || 0, tem = goalHas(g), falta = Math.max(0, alvo - tem), pc = alvo ? Math.min(100, tem / alvo * 100) : 0, ml = mesesAte(c.prazo), st;
      if (!alvo) st = 'Defina o valor em Editar metas de poupança.';
      else if (falta < 0.5) st = '<span class="d good">Meta batida</span>';
      else st = 'Faltam ' + f0(falta) + (ml ? '<br>' + f0(falta / ml) + ' por mês até ' + esc(mesAno(c.prazo)) : '<br>sem prazo definido');
      h += '<div class="kpi goal"><span class="l">' + esc(g.nome) + '</span><span class="v">' + f0(tem) + (alvo ? ' <small>de ' + f0(alvo) + '</small>' : '') + '</span>' +
        '<span class="gbar" role="img" aria-label="' + (alvo ? nn.format(pc) + '% da meta' : 'sem meta') + '"><i style="width:' + pc.toFixed(1) + '%"></i></span>' +
        '<span class="s">' + st + (g.src ? '<br><span class="src">valor atual: ' + g.de + '</span>' : '') + '</span></div>';
    });
    h += '</div><details class="metas" id="fin-gedit"' + (S.gOpen ? ' open' : '') + '><summary>Editar metas de poupança</summary><form id="fin-fgoals"><div class="ggrid">';
    GOALS.forEach(function (g) {
      var c = goalCfg(g.id);
      h += '<fieldset><legend>' + esc(g.nome) + '</legend><div class="mgrid"><label>Meta (€)<input id="fin-g-' + g.id + '-alvo" type="number" min="0" step="50" inputmode="decimal" value="' + (+c.alvo || '') + '"></label>' +
        '<label>Prazo<input id="fin-g-' + g.id + '-prazo" type="month" value="' + esc(c.prazo || '') + '"></label>' +
        (g.src ? '' : '<label>Já guardado (€)<input id="fin-g-' + g.id + '-tem" type="number" min="0" step="10" inputmode="decimal" value="' + (+c.tem || '') + '"></label>') + '</div></fieldset>';
    });
    return h + '</div><button class="btn sm pri" type="submit">Salvar metas de poupança</button></form></details></section>';
  }
  function previsao() {
    var cur = M.partial, h = '<section class="sec"><div class="sec-top"><h2>Previsão do mês</h2>';
    if (!cur) return h + '</div><div class="card"><p class="passo">O último extrato fecha ' + esc(mLabel(M.keys[M.keys.length - 1])) + '. Adicione o extrato do mês atual para ver a previsão.</p></div></section>';
    var P = preverMes(M, planCat), g = M.by[cur], p = cur.split('-').map(Number), dim = P.dim, day = P.day, left = Math.max(1, dim - day);
    var proj = P.proj, falFix = P.falFix, meta = planTotal(), sobra = meta - g.gasto - falFix, porDia = sobra / left, dif = proj - meta;
    var mx = Math.max(proj, meta, g.gasto, 1);
    var st = Math.abs(dif) < 0.5 ? '<span class="d ok">deve fechar na meta</span>' : dif > 0 ? '<span class="d bad">▲ deve passar ' + f0(dif) + ' da meta</span>' : '<span class="d good">▼ deve fechar ' + f0(-dif) + ' abaixo da meta</span>';
    return h + '<span class="hint">até dia ' + day + ' de ' + dim + ' · ' + left + ' dias pela frente</span></div><div class="card prv">' +
      '<div class="prv-n"><div><p class="l mono">Gasto até agora</p><p class="v num">' + f0(g.gasto) + '</p></div><div><p class="l mono">Previsão para ' + esc(MES[p[1] - 1]) + '</p><p class="v num">' + f0(proj) + '</p></div><div><p class="l mono">Meta de gasto</p><p class="v num">' + f0(meta) + '</p></div></div>' +
      '<div class="ptrack" role="img" aria-label="Gasto ' + f0(g.gasto) + ', previsão ' + f0(proj) + ', meta ' + f0(meta) + '"><i class="pj' + (dif > 0.5 ? ' over' : '') + '" style="width:' + (proj / mx * 100).toFixed(1) + '%"></i><i class="sp" style="width:' + (g.gasto / mx * 100).toFixed(1) + '%"></i><b style="left:calc(' + (meta / mx * 100).toFixed(1) + '% - 1px)"></b></div>' +
      '<div class="legend"><span><i class="sw" style="background:var(--accent)"></i>gasto até agora</span><span><i class="sw" style="background:color-mix(in srgb, var(--accent) 35%, var(--raised))"></i>previsão no ritmo atual</span><span><i class="sw line"></i>meta</span></div>' +
      '<p class="s">' + st + '. ' + (porDia > 0 ? 'Para fechar na meta, dá para gastar até <b>' + f0(porDia) + ' por dia</b> nos gastos do dia a dia' + (falFix > 0.5 ? ', já separando ' + f0(falFix) + ' de contas fixas que ainda vão cair' : '') + '.' : 'A meta do mês já foi usada' + (falFix > 0.5 ? ', e ainda faltam ' + f0(falFix) + ' de contas fixas' : '') + '.') +
      ' ' + FIXAS.map(function (id) { return catNome(CAT_BY[id]); }).join(', ') + ' e as contas fixas detectadas abaixo entram pelo valor de sempre; o resto segue o ritmo dos ' + day + ' primeiros dias.</p></div></section>';
  }
  /* a pessoa nova não sabe que o aluguel por transferência cai em "outros": pergunta uma vez */
  function aluguelSugerido() { return sugerirAluguel(RECS, S.plan && S.plan.naoAluguel); }
  function perguntaAluguel() {
    var o = aluguelSugerido();
    if (!o) return '';
    return '<div class="aviso pergunta"><p>Todo dia ' + o.dia + ' sai ' + f2(o.v) + ' para <b>' + esc(o.last.desc) + '</b>, hoje em ' + esc(catNome(CAT_BY[o.last.cat] || CAT_BY.outros)) + '. <b>Isso é aluguel?</b></p>' +
      '<div class="grupo"><button class="btn sm pri" type="button" data-aluguel="sim">Sim, é aluguel</button><button class="btn sm" type="button" data-aluguel="nao">Não é</button></div></div>';
  }
  function recorrentes() {
    var nk = Math.min(3, M.keys.length), list = RECS, tot = 0;
    if (nk < 2) return '';
    list.forEach(function (o) { tot += o.v; });
    var h = '<section class="sec"><div class="sec-top"><h2>Contas fixas e assinaturas</h2><span class="hint">cobranças que se repetem nos últimos meses, com valor parecido</span></div><div class="card">';
    if (!list.length) return h + '<p class="vazio">Ainda não dá para ver repetições. Com dois ou três meses de extrato elas aparecem aqui.</p></div></section>';
    list.forEach(function (o, i) {
      var c = CAT_BY[o.last.cat] || CAT_BY.outros;
      h += '<div class="rec' + (i ? '' : ' first') + '"><i class="sw" style="background:' + colorOf(c) + '"></i><span class="rn">' + esc(o.last.desc) + '<small>' + esc(catNome(c)) + ' · ' + Object.keys(o.m).length + ' dos últimos ' + nk + ' meses</small></span><span class="rd">dia ' + o.dia + (o.atrasada ? '<small class="atraso">esperada dia ' + o.dia + ', ainda não apareceu</small>' : '<small>próxima ' + esc(dFmt(addMonth(o.last.date))) + '</small>') + '</span><b class="num">' + f2(o.v) + '</b></div>';
    });
    return h + '<div class="rec tot"><span></span><span class="rn">Total fixo por mês</span><span></span><b class="num">' + f2(tot) + '</b></div></div></section>';
  }
  function vbars(items, fmt) {
    var mx = 0;
    items.forEach(function (x) { if (x.v != null) mx = Math.max(mx, x.v); });
    return '<div class="vb">' + items.map(function (x) {
      var hh = x.v != null && mx > 0 ? Math.max(2, Math.max(0, x.v) / mx * 110) : 2;
      return '<div class="vbc' + (x.at ? ' at' : '') + '"><b>' + (x.v == null ? '–' : fmt(x.v)) + '</b><i style="height:' + hh.toFixed(0) + 'px"></i><span>' + esc(mShort(x.k)) + (x.parc ? '*' : '') + '</span></div>';
    }).join('') + '</div>';
  }
  function enviosBrasil() {
    var ks = M.keys.slice(-6), ano = (M.lastDate || '').slice(0, 4), totAno = 0, sAvg = 0, nAvg = 0;
    M.keys.forEach(function (k) { var v = M.by[k].spend.brasil || 0; if (k.slice(0, 4) === ano) totAno += v; if (k !== M.partial) { sAvg += v; nAvg++; } });
    var items = ks.map(function (k) { return { k: k, v: M.by[k].spend.brasil || 0, at: k === ks[ks.length - 1], parc: k === M.partial }; });
    return '<section class="sec"><div class="sec-top"><h2>' + esc(catNome(CAT_BY.brasil)) + '</h2><span class="hint">dinheiro que vai para outra conta sua</span></div><div class="card">' + vbars(items, f0) +
      '<div class="tri3"><div><b class="num">' + f0(nAvg ? sAvg / nAvg : 0) + '</b><span>média por mês</span></div><div><b class="num">' + f0(totAno) + '</b><span>em ' + esc(ano) + '</span></div><div><b class="num">' + f0(planCat('brasil')) + '</b><span>meta mensal</span></div></div>' +
      (M.partial ? '<p class="s">* mês em andamento</p>' : '') + '</div></section>';
  }
  function taxaPoup() {
    var ks = M.keys.slice(-6), rate = function (k) { var g = M.by[k]; return g.entrou > 0 ? g.saved / g.entrou * 100 : null; };
    var comp = M.complete.map(rate).filter(function (v) { return v != null; }), avg = comp.length ? comp.reduce(function (a, b) { return a + b; }, 0) / comp.length : null;
    var l3 = comp.slice(-3), p3 = comp.slice(-6, -3), tr = '';
    if (l3.length && p3.length) {
      var a1 = l3.reduce(function (a, b) { return a + b; }, 0) / l3.length, a0 = p3.reduce(function (a, b) { return a + b; }, 0) / p3.length, d = a1 - a0;
      tr = Math.abs(d) < 1 ? '<span class="d ok">estável</span>' : d > 0 ? '<span class="d good">▲ ' + nn.format(d) + ' pontos</span>' : '<span class="d bad">▼ ' + nn.format(-d) + ' pontos</span>';
    }
    var items = ks.map(function (k) { return { k: k, v: rate(k), at: k === ks[ks.length - 1], parc: k === M.partial }; });
    var alvo = 0, nE = 0; M.complete.forEach(function (k) { if (M.by[k].entrou > 0) { alvo += M.by[k].entrou; nE++; } });
    alvo = nE ? planPoupar() / (alvo / nE) * 100 : null;
    return '<section class="sec"><div class="sec-top"><h2>Taxa de poupança</h2><span class="hint">quanto do que entrou foi guardado</span></div><div class="card">' + vbars(items, pct) +
      '<div class="tri3"><div><b class="num">' + (avg == null ? '–' : pct(avg)) + '</b><span>média dos meses completos</span></div><div><b>' + (tr || '–') + '</b><span>últimos 3 meses contra os 3 anteriores</span></div><div><b class="num">' + (alvo == null ? '–' : pct(alvo)) + '</b><span>o que a meta de guardar ' + f0(planPoupar()) + ' representa</span></div></div>' +
      (M.partial ? '<p class="s">* mês em andamento</p>' : '') + '</div></section>';
  }
  document.addEventListener('toggle', function (e) { if (e.target && e.target.id === 'fin-gedit') S.gOpen = e.target.open; }, true);

  function render() {
    var root = $('#fin-app'), sc = $('.fin .cscroll'), keep = sc ? sc.scrollLeft : null;
    if (!root) return;
    if (!S.ready) { root.innerHTML = header() + '<p class="passo">Carregando seus dados…</p>'; return; }
    if (S.restaurar) { root.innerHTML = header() + telaRestaurar(); return; }
    if (S.apagar) { root.innerHTML = header() + telaApagar(); return; }
    if (S.bloqueado) { root.innerHTML = header() + telaBloqueio(); return; }
    if (!configurado() || S.setupOpen) { root.innerHTML = header() + setup(); return; }
    if (!M.keys.length) { root.innerHTML = header() + emptyState(); return; }
    root.innerHTML = header() + perguntaAluguel() + cashSummary() + dividas() + kpis() + previsao() + metasPoup() + chart() +
      '<section class="sec"><div class="detail' + (S.movOpen ? '' : ' solo') + '">' + catPanel() + movPanel() + '</div></section>' + recorrentes() +
      '<div class="two">' + enviosBrasil() + taxaPoup() + '</div>' + table() + review() +
      '<p class="passo">Todo fim de mês: baixe o extrato consolidado do Revolut em CSV e toque em Adicionar extrato. Movimentos que já estavam salvos são ignorados.</p>' + cashBridge();
    var s2 = $('.fin .cscroll');
    if (s2) s2.scrollLeft = keep != null ? keep : s2.scrollWidth;
    drawBal();
  }

  /* ---------- dica sobre a barra ---------- */
  function tipHtml(k) {
    var g = M.by[k], h = '<h3>' + esc(mLabel(k)) + (M.partial === k ? ' · em andamento' : '') + '</h3>';
    CATS.forEach(function (c) {
      var v = g.spend[c.id] || 0;
      if (Math.abs(v) >= .5) h += '<div class="r"><i class="sw" style="background:' + colorOf(c) + '"></i><span>' + esc(catNome(c)) + '</span><b>' + f0(v) + '</b></div>';
    });
    h += '<div class="r t"><i class="sw" style="background:transparent"></i><span>Gastou</span><b>' + f0(g.gasto) + '</b></div>';
    h += '<div class="r"><i class="sw line"></i><span>Entrou</span><b>' + f0(g.entrou) + '</b></div>';
    return h;
  }
  function showTip(el, x, y) { placeTip(tipHtml(el.getAttribute('data-tip')), x, y); }
  function placeTip(html, x, y) {
    var t = $('#fin-tip'); t.innerHTML = html; t.hidden = false;
    var w = t.offsetWidth, hh = t.offsetHeight, px = x + 16, py = y - hh / 2;
    if (px + w > window.innerWidth - 12) px = x - w - 16;
    if (px < 12) px = 12;
    py = Math.max(12, Math.min(window.innerHeight - hh - 12, py));
    t.style.left = px + 'px'; t.style.top = py + 'px';
  }
  function hideTip() { var t = $('#fin-tip'); if (t) t.hidden = true; }

  /* ---------- eventos ---------- */
  document.addEventListener('click', function (e) {
    var fechou = false;
    if (S.fOpen && !(e.target.closest && e.target.closest('.fmenu'))) { S.fOpen = false; fechou = true; }
    var t = e.target.closest && e.target.closest('[data-sel],[data-f],[data-fopen],[data-fclear],[data-more],[data-all],[data-movtoggle],[data-fin-add],[data-fin-setup],[data-aluguel],[data-backup],[data-restaurar],[data-apagar],[data-dpay],[data-ddel]');
    if (!t || !t.closest('#fin-app')) { if (fechou) render(); return; }
    if (t.hasAttribute('data-fin-add')) { $('#fin-csv').click(); return; }
    if (t.hasAttribute('data-fin-setup')) { S.setupOpen = !S.setupOpen; render(); return; }
    if (t.hasAttribute('data-backup')) {
      var bk = t.getAttribute('data-backup');
      if (bk === 'baixar') { baixarBackup(); toast('Backup baixado.'); }
      else if (bk === 'copia') { baixarCopiaIlegivel(); toast('Cópia baixada.'); }
      else $('#fin-json').click();
      return;
    }
    if (t.hasAttribute('data-restaurar')) {
      if (t.getAttribute('data-restaurar') === 'confirmar') {
        var x = S.restaurar.dados;
        S.months = x.months; S.over = x.over; S.plan = x.plan; S.summary = x.summary; S.div = x.div;
        S.bloqueado = null; S.restaurar = null; S.setupOpen = false; localSave(); recompute(); render();
        toast('Backup restaurado: ' + resumoTxt(x) + '.');
      } else { S.restaurar = null; render(); }
      return;
    }
    if (t.hasAttribute('data-apagar')) {
      var ap = t.getAttribute('data-apagar');
      if (ap === 'confirmar') { apagarTudo(); S.apagar = false; recompute(); render(); toast('Seus dados foram apagados deste navegador.'); }
      else { S.apagar = ap === 'pedir'; render(); }
      return;
    }
    if (t.hasAttribute('data-aluguel')) {
      var al = aluguelSugerido();
      if (!al) return;
      if (t.getAttribute('data-aluguel') === 'sim') {
        al.keys.forEach(function (k) { S.over[k] = 'aluguel'; });
        enqueue(saveOver).then(function () { recompute(); render(); toast(al.last.desc + ' agora conta como aluguel. Dá para mudar em Revisar categorias.'); });
      } else {
        var pn = Object.assign({}, S.plan || {}, { naoAluguel: ((S.plan && S.plan.naoAluguel) || []).concat(al.id) });
        enqueue(function () { return savePlan(pn); }).then(function () { render(); });
      }
      return;
    }
    if (t.hasAttribute('data-sel')) { S.sel = t.getAttribute('data-sel'); S.more = 12; hideTip(); render(); return; }
    if (t.hasAttribute('data-all')) { S.sel = S.sel === 'all' ? (M.complete.length ? M.complete[M.complete.length - 1] : M.keys[M.keys.length - 1]) : 'all'; S.more = 12; render(); return; }
    if (t.hasAttribute('data-f')) {
      var f = t.getAttribute('data-f'), ix = S.f.indexOf(f), op = t.classList.contains('fopt');
      if (ix >= 0) S.f.splice(ix, 1); else S.f.push(f);
      S.more = 12; render();
      if (op) { var fo = document.querySelector('.fopt[data-f="' + f + '"]'); if (fo) fo.focus(); }
      return;
    }
    if (t.hasAttribute('data-fopen')) { S.fOpen = !S.fOpen; render(); var fb = $('.fbtn'); if (fb) fb.focus(); return; }
    if (t.hasAttribute('data-fclear')) { S.f = []; S.more = 12; render(); return; }
    if (t.hasAttribute('data-movtoggle')) { S.movOpen = !S.movOpen; try { localStorage.setItem('cortex-financas.mov', S.movOpen ? '1' : '0'); } catch (x) { } render(); return; }
    if (t.hasAttribute('data-more')) { S.more += 30; render(); return; }
    if (t.hasAttribute('data-dpay')) {
      var pid = t.getAttribute('data-dpay');
      divMut(function (d) { d.items.forEach(function (i) { if (i.id === pid) { i.status = 'paga'; i.pagaEm = todayIso(); } }); }).then(function () { toast('Marcada como paga.'); });
      return;
    }
    if (t.hasAttribute('data-ddel')) {
      var rid = t.getAttribute('data-ddel');
      divMut(function (d) { d.items = d.items.filter(function (i) { return i.id !== rid; }); }).then(function () { toast('Removida.'); });
    }
  });
  document.addEventListener('pointerover', function (e) { var c = e.target.closest && e.target.closest('.fin .mcol'); if (c && e.pointerType !== 'touch') showTip(c, e.clientX, e.clientY); });
  document.addEventListener('pointermove', function (e) { var c = e.target.closest && e.target.closest('.fin .mcol'); if (c && e.pointerType !== 'touch') showTip(c, e.clientX, e.clientY); else if (!c && !(e.target.closest && e.target.closest('.bal'))) hideTip(); });
  document.addEventListener('focusin', function (e) { var c = e.target.closest && e.target.closest('.mcol'); if (c) { var r = c.getBoundingClientRect(); showTip(c, r.right, r.top + r.height / 2); } });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.fOpen) { S.fOpen = false; render(); var fb = $('.fbtn'); if (fb) fb.focus(); } });
  document.addEventListener('scroll', hideTip, true);
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'fin-csv') { var fl = t.files; handleFiles(fl).then(function () { t.value = ''; }); return; }
    if (t.id === 'fin-json') { lerBackup(t.files && t.files[0]).then(function () { t.value = ''; }); return; }
    if (t.hasAttribute && t.hasAttribute('data-ov') && t.closest('#fin-app')) {
      var key = t.getAttribute('data-ov'), v = t.value, autos = {};
      if (!v) return;
      if (v === '_auto') { delete S.over[key]; v = null; }
      /* só volta ao automático quando todos os movimentos desse nome já cairiam na categoria escolhida */
      M.rows.forEach(function (r) { if (r.key === key) autos[r.auto] = 1; });
      if (v && Object.keys(autos).length === 1 && autos[v]) delete S.over[key]; else if (v) S.over[key] = v;
      enqueue(saveOver).then(function () { recompute(); render(); var q = $('#fin-q'); if (q && S.q) { q.focus(); } });
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'fin-q') { S.q = e.target.value; $('#fin-revlist').innerHTML = revList(); }
  });
  document.addEventListener('submit', function (e) {
    var fid = e.target.id;
    if (fid === 'fin-fdiv') {
      e.preventDefault();
      var nome = $('#fin-d-nome').value.trim(), brl = parseNum($('#fin-d-brl').value);
      if (!nome || !(brl > 0)) { toast('Informe o nome e o valor.', true); return; }
      var venc = $('#fin-d-venc').value, desc = $('#fin-d-desc').value.trim(), moeda = $('#fin-d-cur').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) venc = '';
      S.dAdd = false;
      divMut(function (d) { var it = { id: 'd' + Date.now().toString(36), nome: nome, status: 'aberta', criada: todayIso() }; it[moeda === 'EUR' ? 'eur' : 'brl'] = Math.round(brl * 100) / 100; if (venc) it.venc = venc; if (desc) it.desc = desc.slice(0, 120); d.items.push(it); }).then(function () { toast('Dívida anotada.'); });
      return;
    }
    if (fid === 'fin-fcamb') {
      e.preventDefault();
      var rt = parseNum($('#fin-c-rate').value), mg = parseNum($('#fin-c-mg').value);
      if (!(rt > 0.5 && rt < 50)) { toast('Informe quantos reais valem 1 euro (ex.: 5,61).', true); return; }
      if (isNaN(mg) || mg < 0 || mg > 20) mg = 2;
      S.dCamb = false;
      divMut(function (d) { d.cambio = { rate: rt, data: todayIso(), fonte: 'informado por você' }; d.margem = mg; }).then(function () { toast('Câmbio atualizado.'); });
      return;
    }
    if (fid === 'fin-fsetup') {
      e.preventDefault();
      var nomes = Object.assign({}, (S.plan && S.plan.nomes) || {}), nb = $('#fin-s-nome-brasil').value.trim();
      if (nb) nomes.brasil = nb; else delete nomes.brasil;
      var cfg = Object.assign({}, S.plan || {}, lerMetas('s'), {
        titular: $('#fin-s-titular').value.trim(), moeda: $('#fin-s-moeda').value, pais: $('#fin-s-pais').value, nomes: nomes, configurado: true
      });
      S.setupOpen = false;
      enqueue(function () { return savePlan(cfg); }).then(function () { recompute(); render(); toast('Configuração salva.'); });
      return;
    }
    if (fid === 'fin-fgoals') {
      e.preventDefault();
      var gs = {};
      GOALS.forEach(function (g) {
        var o = { alvo: Math.max(0, +$('#fin-g-' + g.id + '-alvo').value || 0) }, pz = $('#fin-g-' + g.id + '-prazo').value, te = $('#fin-g-' + g.id + '-tem');
        if (/^\d{4}-\d{2}$/.test(pz)) o.prazo = pz;
        if (te) o.tem = Math.max(0, +te.value || 0);
        gs[g.id] = o;
      });
      var pg = Object.assign({}, S.plan || {}, { goals: gs });
      S.gOpen = false;
      enqueue(function () { return savePlan(pg); }).then(function () { render(); toast('Metas de poupança salvas.'); });
      return;
    }
    if (fid !== 'fin-fmetas') return;
    e.preventDefault();
    var p = Object.assign({}, S.plan || {}, lerMetas('m'));
    S.metasOpen = true;
    enqueue(function () { return savePlan(p); }).then(function () { render(); toast('Metas salvas.'); });
  });
  document.addEventListener('toggle', function (e) { if (e.target.id === 'fin-metas') S.metasOpen = e.target.open; if (e.target.id === 'fin-cfd') S.cfOpen = e.target.open; if (e.target.id === 'fin-revd') S.revOpen = e.target.open; if (e.target.id === 'fin-dadd') S.dAdd = e.target.open; if (e.target.id === 'fin-dcamb') S.dCamb = e.target.open; if (e.target.id === 'fin-dpaid') S.dPaid = e.target.open; }, true);
  /* arrastar um extrato só vale com a aba Finanças aberta */
  window.addEventListener('dragover', function (e) { var r = $('#fin-app'); if (!r) return; e.preventDefault(); r.classList.add('arrasta'); });
  window.addEventListener('dragleave', function (e) { var r = $('#fin-app'); if (r && !e.relatedTarget) r.classList.remove('arrasta'); });
  window.addEventListener('drop', function (e) { var r = $('#fin-app'); if (!r) return; e.preventDefault(); r.classList.remove('arrasta'); if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

  var rsz; window.addEventListener('resize', function () { clearTimeout(rsz); rsz = setTimeout(drawBal, 150); });

  /* ---------- início ---------- */
  /* o cartão de Finanças no mapa: quanto saiu no mês e as barras dos últimos seis meses */
  function cartao() {
    var el = document.getElementById('cartao-fin');
    if (!el || !S.ready) return;
    var tag = '<span class="tag">Finanças</span>';
    if (!M.keys.length) { el.innerHTML = tag + '<span class="txt">Nenhum extrato ainda</span><span class="pe">adicione o CSV do Revolut</span>'; return; }
    var ks = M.keys.slice(-6), cur = ks[ks.length - 1], mx = 1;
    ks.forEach(function (k) { mx = Math.max(mx, M.by[k].gasto || 0); });
    var bars = ks.map(function (k) { return '<i' + (k === cur ? ' class="at"' : '') + ' style="height:' + Math.max(8, (M.by[k].gasto || 0) / mx * 100).toFixed(0) + '%"></i>'; }).join('');
    el.title = 'Gasto em ' + mLabel(cur) + (M.partial === cur ? ', até agora' : '');
    el.innerHTML = tag + '<span class="fin-l"><span class="txt">' + f0(M.by[cur].gasto || 0) + ' <small>em ' + mShort(cur) + '</small></span><span class="mini" aria-hidden="true">' + bars + '</span></span><span class="pe">meta ' + f0(planTotal()) + ' por mês</span>';
  }
  function start() {
    localLoad(); S.ready = true; recompute(); render(); cartao();
  }
  /* peças fixas: o seletor de arquivo e a dica dos gráficos */
  document.body.insertAdjacentHTML('beforeend', '<input id="fin-csv" class="vh" type="file" accept=".csv,text/csv" multiple tabindex="-1" aria-label="Escolher extrato CSV"><input id="fin-json" class="vh" type="file" accept=".json,application/json" tabindex="-1" aria-label="Escolher backup"><div id="fin-tip" class="fin-tip" hidden></div>');
  window.__cortexFin = { montar: function () { render(); }, cartao: cartao };
  render();
  start();
})();
