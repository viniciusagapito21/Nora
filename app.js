/* Nora, painel de finanças pessoais: lê extratos CSV do Revolut, categoriza, mostra metas, previsões e gráficos. Tudo fica no navegador (localStorage). */
/* aviso rápido usado pelo painel (salvou, importou, erro); fica aqui, e não inline no index.html, por causa da CSP */
(function () {
  var el = document.getElementById('toast'), txt = document.getElementById('toast-txt'), t;
  window.__cortexToast = function (msg, erro, ms) {
    txt.textContent = msg;
    el.classList.toggle('erro', !!erro);
    el.hidden = false;
    clearTimeout(t);
    t = setTimeout(function () { el.hidden = true; }, ms || 6000);
  };
})();
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
  /* categorias da pessoa (campos opcionais em plan, ainda na v3): nomes { id: nome }, ocultas [ids],
     fixas [ids] (sem o campo valem as de fábrica) e proprias [{ id, nome, slot }]. Só há 8 cores (slots 1 a 8)
     e "Outros" (slot 0): uma categoria nova pega a cor de uma escondida. "Outros" não se esconde. */
  var FIXAS_PADRAO = ['aluguel', 'assin', 'brasil'];
  var MAX_CORES = 8;
  function montarCats(plan) {
    var p = plan || {}, nomes = p.nomes || {}, ocultas = p.ocultas || [], fixas = Array.isArray(p.fixas) ? p.fixas : FIXAS_PADRAO;
    var lista = CATS.filter(function (c) { return c.id !== 'outros'; }).map(function (c) { return Object.assign({}, c); });
    (p.proprias || []).forEach(function (c) { lista.push({ id: c.id, nome: c.nome, slot: c.slot, propria: true }); });
    lista.push(Object.assign({}, CAT_BY.outros));
    return lista.map(function (c) {
      return Object.assign(c, { padrao: c.propria ? c.nome : CAT_BY[c.id].nome, nome: (!c.propria && nomes[c.id]) || c.nome,
        oculta: c.id !== 'outros' && ocultas.indexOf(c.id) >= 0, fixa: fixas.indexOf(c.id) >= 0 });
    });
  }
  /* cores livres: os slots que nenhuma categoria visível usa (Compras e Compras grandes dividem o 4) */
  function slotsLivres(plan) {
    var usados = {};
    montarCats(plan).forEach(function (c) { if (!c.oculta && c.slot) usados[c.slot] = 1; });
    var o = []; for (var i = 1; i <= MAX_CORES; i++) if (!usados[i]) o.push(i);
    return o;
  }
  /* devolve um plan novo com a categoria criada, ou erro se não houver cor livre */
  function criarCategoria(plan, nome) {
    nome = String(nome || '').trim().slice(0, 40);
    if (!nome) throw new Error('a categoria precisa de um nome');
    var livres = slotsLivres(plan);
    if (!livres.length) throw new Error('as 8 cores estão em uso: esconda uma categoria para liberar a cor dela');
    var p = Object.assign({}, plan || {}), pr = (p.proprias || []).slice(), n = 1;
    while (pr.some(function (c) { return c.id === 'u' + n; })) n++;
    pr.push({ id: 'u' + n, nome: nome, slot: livres[0] });
    p.proprias = pr;
    return p;
  }
  /* metas de poupança: sem lista na configuração, valem as quatro de fábrica.
     origem: null (a pessoa digita quanto já guardou), 'flex' (saldo do Flexible Cash) ou 'invest' (investimentos e cripto) */
  var METAS_POUP_PADRAO = [
    { id: 'reserva', nome: 'Reserva de emergência', src: 'flex' },
    { id: 'invest', nome: 'Investimentos', src: 'invest' },
    { id: 'viagens', nome: 'Viagens pequenas', src: null },
    { id: 'viagem', nome: 'Viagem grande do ano', src: null }
  ];
  var MAX_METAS_POUP = 6;
  function listaMetasPoupanca(plan) {
    var l = plan && Array.isArray(plan.metasPoupanca) ? plan.metasPoupanca : METAS_POUP_PADRAO;
    return l.slice(0, MAX_METAS_POUP).map(function (g) { return { id: g.id, nome: g.nome, src: g.src === 'flex' || g.src === 'invest' ? g.src : null }; });
  }
  /* regras de comerciantes por país (o país vem da carteira): cada lista fica em rules/<país>.js, carregada antes
     deste arquivo; país sem conjunto próprio usa só as marcas internacionais de REGRAS_GERAIS, e a tela avisa
     para categorizar o resto à mão */
  var REGRAS_GERAIS = [
    [/PHARMACY|FARMACIA|FARMÁCIA|DROGARIA/, 'saude'],
    [/\bALDI\b|CARREFOUR|SUPERMARKET|SUPERMERCADO/, 'mercado'],
    [/\bUBER\b|\bBOLT\b|FREE ?NOW|\b99 ?(APP|POP|TAXI)\b/, 'transporte'],
    [/DISNEY|NETFLIX|SPOTIFY|APPLE|YOUTUBE|OPENAI|ANTHROPIC|ICLOUD|AMAZON PRIME|PRIME VIDEO|\bHBO\b/, 'assin'],
    [/MCDONALD|BURGER KING|\bKFC\b|STARBUCKS|SUBWAY|DELIVEROO|JUST[ -]EAT|IFOOD|FIVE GUYS|DOMINO'?S/, 'lazer']
  ];
  var REGRAS_PAIS = { IE: REGRAS_IE, BR: REGRAS_BR.concat(REGRAS_GERAIS, COMPRA_BR) };
  var PAISES_COM_REGRAS = Object.keys(REGRAS_PAIS);
  function regrasDo(pais) { return REGRAS_PAIS[pais || 'IE'] || REGRAS_GERAIS; }
  /* "Compras grandes" automático a partir de 100 na moeda da carteira; no Brasil não há (100 reais é compra comum) */
  var GRANDES_PAIS = { BR: 0 };
  function limiteGrandes(pais) { var v = GRANDES_PAIS[pais || 'IE']; return v === undefined ? 100 : v; }
  /* maiúsculas sem acento, só para comparar com as regras (a chave salva da descrição não muda) */
  function semAcento(D) { return D.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  var INV = /DIGITAL ASSETS|INVESTMENT ACCOUNT|AVATRADE|REVOLUT SECURITIES|TRADING 212|DEGIRO|ETORO/;
  var EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  function parseCSV(text, sep) {
    sep = sep || ',';
    var rows = [], row = [], f = '', q = false, i, ch;
    for (i = 0; i < text.length; i++) {
      ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { row.push(f); f = ''; }
      else if (ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (ch !== '\r') f += ch;
    }
    if (f.length || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  /* tira símbolo de moeda, espaços e separador de milhar (vírgula): "€1,234.50", "£-12.00", "1234.50" */
  function cents(s) {
    var n = parseFloat(String(s).replace(/−/g, '-').replace(/[^\d.\-]/g, ''));
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
  /* devolve [data, descrição, categoria do Revolut, centavos, saldo em centavos], só da conta na moeda pedida */
  function extractTx(rows, moeda) {
    moeda = moeda || 'EUR';
    var out = [], i, r, c0, inSec = false, mode = null, title = '', d, a, b;
    for (i = 0; i < rows.length; i++) {
      r = rows[i]; c0 = String(r[0] || '').trim();
      if (c0 === 'Current Accounts Transaction Statements') { inSec = true; continue; }
      if (inSec) {
        if (c0.indexOf('---') === 0) { inSec = false; mode = null; continue; }
        if (/\(\w{3}\)\s*$/.test(c0) && !r[1]) title = c0;
        if (c0 === 'Date' && r[1] === 'Description') { mode = (!title || title.indexOf('(' + moeda + ')') >= 0) ? 'read' : 'skip'; continue; }
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
          if (ix.cu >= 0 && x[ix.cu] && x[ix.cu] !== moeda) continue;
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
  /* as moedas das contas que o extrato traz (para dizer o que existe quando falta a moeda pedida) */
  function moedasNoExtrato(rows) {
    var o = {}, i, r, c0, inSec = false, m, ic = -1;
    for (i = 0; i < rows.length; i++) {
      r = rows[i]; c0 = String(r[0] || '').trim();
      if (c0 === 'Current Accounts Transaction Statements') { inSec = true; continue; }
      if (inSec && c0.indexOf('---') === 0) inSec = false;
      if (inSec && !r[1] && (m = c0.match(/\((\w{3})\)\s*$/))) o[m[1].toUpperCase()] = 1;
      if (ic < 0 && r.indexOf('Completed Date') >= 0 && r.indexOf('Currency') >= 0) { ic = r.indexOf('Currency'); continue; }
      if (ic >= 0 && /^[A-Z]{3}$/.test(String(r[ic] || '').trim())) o[String(r[ic]).trim()] = 1;
    }
    return Object.keys(o).sort();
  }
  /* com meses salvos, a moeda da configuração não muda: os valores estão na moeda da conta e não seriam
     convertidos, só passariam a aparecer com outro símbolo */
  function moedaTravada(months) {
    return Object.keys(months || {}).some(function (k) { return Array.isArray(months[k]) && months[k].length > 0; });
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

  function bigCheck(id, a, lim) { if (lim === undefined) lim = 100; if (lim && (id === 'compras' || id === 'assin') && a <= -lim) return 'grandes'; return id; }
  function byRule(D, a, rc, pais) {
    var RULES = regrasDo(pais), lim = limiteGrandes(pais);
    D = semAcento(D);
    if (/^CARD PAYMENT$/.test(D)) return a <= -100 ? 'grandes' : 'compras';
    var P = /^(TO|TRANSFER TO|TRANSFER FROM|FROM) /.test(D);
    for (var i = 0; i < RULES.length; i++) {
      var R = RULES[i];
      if (P && R[1] !== 'aluguel') continue;
      if (R[0].test(D) && (!R[2] || Math.abs(a) >= R[2])) return bigCheck(R[1], a, lim);
    }
    if (/^(TO|TRANSFER TO|TRANSFER FROM|FROM) /.test(D) || rc === 'Others') return 'outros';
    return bigCheck('compras', a, lim);
  }
  /* nome do titular como aparece nas transferências ("To FULANO DE TAL"), no formato da chave da descrição */
  function normTitular(s) { return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim(); }
  var ENTRADA = { renda: '_renda', outras: '_outras', interno: '_ignore', invest: '_invest' };
  var DE_ENTRADA = { _renda: 'renda', _outras: 'outras', _ignore: 'interno', _invest: 'invest' };
  function classify(t, over, titular, pais, cats) {
    cats = cats || montarCats(null);
    var vis = {}; cats.forEach(function (c) { if (!c.oculta) vis[c.id] = 1; });
    var OWN = normTitular(titular), a = t[3] / 100, D = String(t[1]).toUpperCase(), rc = t[2], kind, cat = null;
    /* no Brasil: salário é Renda; aplicação e resgate são Investimentos, mas rendimento fica em Outras entradas */
    var BR = (pais || 'IE') === 'BR', N = BR ? semAcento(D) : '';
    var invBR = BR && INVEST_BR.test(N) && !(a > 0 && RENDIMENTO_BR.test(N));
    var r = { date: t[0], m: t[0].slice(0, 7), desc: t[1], rc: rc, a: a, bal: t[4] == null ? null : t[4] / 100, key: D.replace(/\s+/g, ' ').trim() };
    if (a > 0) {
      if (/^PAYMENT FROM /.test(D) && !(OWN && D.indexOf(OWN) >= 0)) kind = 'renda';
      else if (D.indexOf('FLEXIBLE CASH') >= 0) kind = 'flex';
      else if (OWN && D.indexOf(OWN) >= 0) kind = 'interno';
      else if (INV.test(D) || invBR) kind = 'invest';
      else if (BR && RENDA_BR.test(N)) kind = 'renda';
      else if (rc === 'Refund' || rc === 'Merchant') { kind = 'gasto'; cat = byRule(D, a, rc, pais); }
      else kind = 'outras';
    } else {
      if (D.indexOf('FLEXIBLE CASH') >= 0) kind = 'flex';
      else if (OWN && D.indexOf(OWN) >= 0) { kind = 'gasto'; cat = 'brasil'; }
      else if (INV.test(D) || invBR || rc === 'Exchange') kind = 'invest';
      else { kind = 'gasto'; cat = byRule(D, a, rc, pais); }
    }
    r.baseKind = kind;
    r.auto = kind === 'gasto' ? cat : kind === 'invest' ? '_invest' : kind === 'interno' ? '_ignore' : '';
    var ov = over && over[r.key];
    if (ov && (kind === 'gasto' || kind === 'invest' || kind === 'interno')) {
      if (ov === '_invest') { kind = 'invest'; cat = null; }
      else if (ov === '_ignore') { kind = 'interno'; cat = null; }
      else if (vis[ov]) { kind = 'gasto'; cat = ov; }
      else if (cats.some(function (c) { return c.id === ov; })) { kind = 'gasto'; cat = 'outros'; }
    }
    /* entradas têm escolha própria, na chave '+DESCRIÇÃO' (não se mistura com a da saída de mesmo nome):
       _renda, _outras, _ignore (entre contas suas: não conta como entrada) ou _invest (resgate) */
    if (a > 0 && ENTRADA[r.baseKind]) {
      r.keyE = '+' + r.key; r.autoE = ENTRADA[r.baseKind];
      var oe = over && over[r.keyE];
      if (oe && DE_ENTRADA[oe]) { kind = DE_ENTRADA[oe]; cat = null; }
    }
    /* categoria escondida: o movimento vai para Outros (o total gasto não muda) */
    if (kind === 'gasto' && !vis[cat]) cat = 'outros';
    r.kind = kind; r.cat = cat;
    return r;
  }
  /* formato salvo (no navegador e no backup em JSON).
     v1: { months, over, plan, summary, div }, sem número de versão.
     v2: { v: 2, ... } com titular, moeda, país e nomes de exibição das categorias dentro de plan.
     v3: pagamentos em observação com valor + moeda (antes brl ou eur) e câmbio por moeda.
     v4: carteiras (até 5). { v: 4, config, carteiras: [{ id, nome, moeda, pais, banco, months, over, summary,
         metas: { cats, poupar }, naoAluguel, transf, sugDispensadas }], ativa, cambios, div: { items, margem } }.
         config é o que vale para todas (titular, moedaPrincipal, categorias, metas de poupança, campos que o
         painel não conhece); cambios é por 1 da moeda principal.
     Aceita v1 a v4 e devolve sempre v4; dados que não são do painel dão erro. */
  var VERSAO = 4, MAX_CARTEIRAS = 5;
  /* o que em plan pertence a cada carteira (na v3 tudo ficava em plan) */
  var DA_CARTEIRA = ['moeda', 'pais', 'cats', 'poupar', 'naoAluguel'];
  /* v2 → v3 em div: { items: [{ brl | eur }], cambio: { rate: reais por euro } }
     vira { items: [{ valor, moeda }], cambios: { BRL: { rate } } }; rate = unidades da moeda por 1 euro */
  function migrarDiv(d) {
    if (!d || typeof d !== 'object') return null;
    var o = Object.assign({}, d);
    if (Array.isArray(d.items)) o.items = d.items.map(function (it) {
      var n = Object.assign({}, it);
      if (n.valor == null) {
        if (+n.brl > 0) { n.valor = +n.brl; n.moeda = 'BRL'; } else { n.valor = +n.eur || 0; n.moeda = 'EUR'; }
      }
      delete n.brl; delete n.eur;
      return n;
    });
    if (d.cambio) { o.cambios = Object.assign({ BRL: d.cambio }, d.cambios || {}); delete o.cambio; }
    return o;
  }
  function checarMeses(months) {
    if (!months || typeof months !== 'object' || Array.isArray(months)) throw new Error('meses em formato errado');
    Object.keys(months).forEach(function (m) {
      if (!/^\d{4}-\d{2}$/.test(m) || !Array.isArray(months[m])) throw new Error('mês ' + m + ' em formato errado');
    });
    return months;
  }
  /* v1, v2 ou v3 → v3 (o passo antigo, mantido para a migração e para o teste de ida e volta) */
  function migrarAteV3(x, titularAntigo) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error('não são dados do painel');
    var v = x.v == null ? 1 : x.v;
    if (v !== 1 && v !== 2 && v !== 3) throw new Error('versão ' + v + ' desconhecida');
    var months = checarMeses(x.months || {});
    var plan = Object.assign({}, x.plan || {});
    /* na v1 o titular ficava numa chave à parte, gravada pelo console */
    if (plan.titular == null) plan.titular = v === 1 ? String(titularAntigo || '').trim() : '';
    if (!plan.moeda) plan.moeda = 'EUR';
    if (!plan.pais) plan.pais = 'IE';
    if (!plan.nomes) plan.nomes = v === 1 ? { brasil: 'Contas no Brasil' } : {};
    return { v: 3, months: months, over: x.over || {}, plan: plan, summary: x.summary || null, div: v < 3 ? migrarDiv(x.div) : (x.div || null) };
  }
  /* separa o plan da v3 no que é da carteira e no que vale para todas */
  function partirPlan(plan) {
    var config = {}, cart = { metas: {} };
    Object.keys(plan || {}).forEach(function (k) {
      if (k === 'cats' || k === 'poupar') cart.metas[k] = plan[k];
      else if (DA_CARTEIRA.indexOf(k) >= 0) cart[k] = plan[k];
      else config[k] = plan[k];
    });
    return { config: config, cart: cart };
  }
  /* o plan como o painel enxerga (formato da v3) para uma carteira */
  function juntarPlan(config, w) {
    var plan = {};
    Object.keys(config).forEach(function (k) { if (k !== 'moedaPrincipal') plan[k] = config[k]; });
    plan.moeda = w.moeda; plan.pais = w.pais;
    Object.keys(w.metas || {}).forEach(function (k) { plan[k] = w.metas[k]; });
    if (w.naoAluguel !== undefined) plan.naoAluguel = w.naoAluguel;
    return plan;
  }
  /* Em observação na v3 tinha o câmbio dentro; na v4 o câmbio fica fora e vale para tudo */
  function divV3(div, cambios) {
    var temCambio = cambios && Object.keys(cambios).length;
    if (div == null && !temCambio) return null;
    var d = Object.assign({}, div || {});
    if (temCambio) d.cambios = cambios;
    return d;
  }
  function paraV4(v3) {
    var pp = partirPlan(v3.plan), w = pp.cart;
    var cart = { id: 'c1', nome: 'Revolut', moeda: w.moeda || 'EUR', pais: w.pais || 'IE', banco: 'revolut',
      months: v3.months, over: v3.over, summary: v3.summary, metas: w.metas, transf: {}, sugDispensadas: [] };
    cart.periodos = periodosMigrados(cart);
    if (w.naoAluguel !== undefined) cart.naoAluguel = w.naoAluguel;
    var config = pp.config; config.moedaPrincipal = cart.moeda;
    var div = null;
    if (v3.div) { div = Object.assign({}, v3.div); delete div.cambios; }
    return { v: 4, config: config, carteiras: [cart], ativa: 'c1', cambios: (v3.div && v3.div.cambios) || {}, div: div };
  }
  /* períodos importados (campo opcional da carteira, sem nova versão): [{ de, ate }] em ordem, já unidos.
     Cada importação acrescenta o período do arquivo (o que ele informa; senão da primeira à última data entre
     movimentos e saldos do dia). Carteira salva antes do campo: um período só, da primeira à última data que
     ela tem (movimentos, saldos do dia e saldo informado), porque o período dos arquivos antigos não ficou guardado. */
  var DIA_MS = 864e5;
  function isoMais(iso, n) { return new Date(Date.parse(iso + 'T00:00:00Z') + n * DIA_MS).toISOString().slice(0, 10); }
  function juntarPeriodos(lista, novo) {
    var ps = (lista || []).concat(novo ? [novo] : []).filter(function (p) { return p && p.de && p.ate; })
      .map(function (p) { return p.de <= p.ate ? { de: p.de, ate: p.ate } : { de: p.ate, ate: p.de }; })
      .sort(function (a, b) { return a.de < b.de ? -1 : a.de > b.de ? 1 : 0; }), o = [];
    ps.forEach(function (p) {
      var u = o[o.length - 1];
      /* encostados (um termina na véspera do outro) viram um só */
      if (u && p.de <= isoMais(u.ate, 1)) { if (p.ate > u.ate) u.ate = p.ate; } else o.push(p);
    });
    return o;
  }
  function datasDaCarteira(c) {
    var ds = [];
    Object.keys(c.months || {}).forEach(function (k) { c.months[k].forEach(function (t) { ds.push(t[0]); }); });
    Object.keys(c.saldosDia || {}).forEach(function (d) { ds.push(d); });
    if (c.ancora && c.ancora.data) ds.push(c.ancora.data);
    return ds.sort();
  }
  function periodosMigrados(c) { var ds = datasDaCarteira(c); return ds.length ? [{ de: ds[0], ate: ds[ds.length - 1] }] : []; }
  var ISO = /^\d{4}-\d{2}-\d{2}$/;
  function checarPeriodos(ps, id) {
    if (!Array.isArray(ps) || ps.some(function (p) { return !p || !ISO.test(p.de) || !ISO.test(p.ate); })) throw new Error('períodos em formato errado na carteira ' + id);
    return juntarPeriodos(ps);
  }
  /* transf: { id do movimento: { c: carteira da outra ponta, id: movimento dela, lado: 's' | 'e', marca } };
     sugDispensadas: chaves de par (texto JSON de [carteira e movimento da saída, carteira e movimento da entrada]) */
  function checarTransf(w) {
    var t = w.transf, erro = 'transferências em formato errado na carteira ' + w.id;
    if (typeof t !== 'object' || Array.isArray(t)) throw new Error(erro);
    Object.keys(t).forEach(function (k) {
      var r = t[k];
      if (!r || typeof r.c !== 'string' || typeof r.id !== 'string' || (r.lado !== 's' && r.lado !== 'e') || typeof r.marca !== 'boolean') throw new Error(erro);
    });
    if (!Array.isArray(w.sugDispensadas) || w.sugDispensadas.some(function (k) {
      try { var a = JSON.parse(k); return !Array.isArray(a) || a.length !== 4 || a.some(function (v) { return typeof v !== 'string'; }); } catch (e) { return true; }
    })) throw new Error('sugestões dispensadas em formato errado na carteira ' + w.id);
  }
  /* importacao: { código do cabeçalho: { sep, data, desc, valor, ... } }, as colunas lembradas do importador */
  function checarImportacao(imp, id) {
    var erro = 'colunas do importador em formato errado na carteira ' + id;
    if (imp == null) return imp;
    if (typeof imp !== 'object' || Array.isArray(imp)) throw new Error(erro);
    Object.keys(imp).forEach(function (k) {
      var m = imp[k];
      if (!m || typeof m !== 'object' || typeof m.sep !== 'string' || !(m.data >= 0) || !(m.desc >= 0) || !m.valor || typeof m.valor !== 'object') throw new Error(erro);
    });
    return imp;
  }
  /* cambios: { moeda: { rate, data } }, quantos dessa moeda valem 1 da principal e quando a pessoa informou */
  function checarCambios(cs) {
    if (cs == null) return {};
    if (typeof cs !== 'object' || Array.isArray(cs)) throw new Error('câmbio em formato errado');
    Object.keys(cs).forEach(function (m) {
      var c = cs[m];
      if (!/^[A-Z]{3}$/.test(m) || !c || typeof c !== 'object' || !isFinite(+c.rate) || +c.rate < 0 || (c.data != null && !ISO.test(c.data))) throw new Error('câmbio de ' + m + ' em formato errado');
    });
    return cs;
  }
  function semCarteira(transf, ids) {
    var o = {}; Object.keys(transf).forEach(function (k) { if (ids[transf[k].c]) o[k] = transf[k]; }); return o;
  }
  /* confere e completa uma v4; devolve uma cópia (nunca a mesma referência de cima) */
  function validarV4(x) {
    if (!Array.isArray(x.carteiras) || !x.carteiras.length) throw new Error('nenhuma carteira');
    if (x.carteiras.length > MAX_CARTEIRAS) throw new Error('mais de ' + MAX_CARTEIRAS + ' carteiras');
    var ids = {};
    var carteiras = x.carteiras.map(function (c) {
      if (!c || typeof c !== 'object') throw new Error('carteira em formato errado');
      if (typeof c.id !== 'string' || !c.id) throw new Error('carteira sem id');
      if (ids[c.id]) throw new Error('carteira ' + c.id + ' repetida');
      ids[c.id] = 1;
      if (!/^[A-Z]{3}$/.test(c.moeda || '')) throw new Error('moeda ' + c.moeda + ' inválida na carteira ' + c.id);
      var w = Object.assign({}, c, { nome: String(c.nome || 'Carteira'), pais: c.pais || 'IE', banco: c.banco || 'revolut', months: checarMeses(c.months || {}),
        over: c.over || {}, summary: c.summary || null, metas: c.metas || {}, transf: c.transf || {}, sugDispensadas: c.sugDispensadas || [] });
      w.periodos = c.periodos === undefined ? periodosMigrados(w) : checarPeriodos(c.periodos, c.id);
      checarTransf(w);
      checarImportacao(w.importacao, c.id);
      return w;
    });
    /* transferência com uma carteira que não existe mais (backup antigo): sai, e a ponta volta ao que era */
    carteiras.forEach(function (w) { w.transf = semCarteira(w.transf, ids); w.sugDispensadas = w.sugDispensadas.filter(function (k) { return ids[JSON.parse(k)[0]] && ids[JSON.parse(k)[2]]; }); });
    var config = Object.assign({}, x.config || {});
    if (!config.moedaPrincipal) config.moedaPrincipal = carteiras[0].moeda;
    return { v: 4, config: config, carteiras: carteiras, ativa: ids[x.ativa] ? x.ativa : carteiras[0].id, cambios: checarCambios(x.cambios), div: x.div || null };
  }
  function migrate(x, titularAntigo) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error('não são dados do painel');
    if (x.v === 4) return validarV4(x);
    return paraV4(migrarAteV3(x, titularAntigo));
  }
  /* v4 → v3, só com uma carteira: para voltar atrás e para provar que a migração não perde nada */
  function paraV3(x) {
    if (x.carteiras.length > 1) throw new Error('mais de uma carteira: não cabe na v3');
    var w = x.carteiras[0];
    return { v: 3, months: w.months, over: w.over, plan: juntarPlan(x.config, w), summary: w.summary, div: divV3(x.div, x.cambios) };
  }
  function carteiraAtiva(x) { return x.carteiras.filter(function (c) { return c.id === x.ativa; })[0] || x.carteiras[0]; }
  /* carteiras: criar, editar, excluir, escolher. Todas devolvem uma v4 nova (não alteram x).
     A primeira carteira é a principal (onde ficam Em observação e as metas de poupança até o Resumo). A moeda
     principal (config.moedaPrincipal, a soma do Resumo; o câmbio é por 1 dela) é uma escolha à parte, passo 9.3b;
     com uma carteira só, ela acompanha a moeda da carteira. Quando a moeda principal muda, o câmbio é apagado e
     pedido de novo. Uma carteira = um banco e uma moeda; com movimentos salvos, moeda e banco não mudam (para
     mudar, cria-se outra carteira). */
  var BANCOS = [['revolut', 'Revolut'], ['aib', 'AIB'], ['boi', 'Bank of Ireland'], ['wise', 'Wise'], ['nubank', 'Nubank'], ['btg', 'BTG Pactual'], ['outro', 'Outro banco']];
  var COM_LEITOR = ['revolut'];
  function temLeitor(banco) { return COM_LEITOR.indexOf(banco) >= 0; }
  function acharCarteira(x, id) {
    var c = x.carteiras.filter(function (w) { return w.id === id; })[0];
    if (!c) throw new Error('a carteira ' + id + ' não existe');
    return c;
  }
  function nomeCarteira(x, nome, id) {
    nome = String(nome || '').trim().slice(0, 40);
    if (!nome) throw new Error('a carteira precisa de um nome');
    var igual = x.carteiras.filter(function (w) { return w.id !== id && w.nome.toLowerCase() === nome.toLowerCase(); })[0];
    if (igual) throw new Error('já existe uma carteira chamada ' + igual.nome);
    return nome;
  }
  function conferirMoeda(m) { if (!/^[A-Z]{3}$/.test(m || '')) throw new Error('moeda ' + m + ' inválida'); return m; }
  function conferirBanco(b) { if (!BANCOS.some(function (o) { return o[0] === b; })) throw new Error('tipo de extrato ' + b + ' desconhecido'); return b; }
  /* a principal é a primeira; se a moeda dela mudou, o câmbio digitado deixa de valer */
  function comPrincipal(x, carteiras, ativa) {
    var mp = carteiras.length === 1 ? carteiras[0].moeda : x.config.moedaPrincipal, config = Object.assign({}, x.config, { moedaPrincipal: mp });
    return Object.assign({}, x, { config: config, carteiras: carteiras, ativa: ativa, cambios: mp === x.config.moedaPrincipal ? x.cambios : {} });
  }
  function novaCarteira(x, d) {
    if (x.carteiras.length >= MAX_CARTEIRAS) throw new Error('já há ' + MAX_CARTEIRAS + ' carteiras: exclua uma para criar outra');
    var nome = nomeCarteira(x, d.nome), n = 0;
    x.carteiras.forEach(function (w) { var k = +String(w.id).replace(/^c/, ''); if (k > n) n = k; });
    var c = { id: 'c' + (n + 1), nome: nome, moeda: conferirMoeda(d.moeda), pais: d.pais || 'IE', banco: conferirBanco(d.banco || 'revolut'),
      months: {}, over: {}, summary: null, metas: {}, transf: {}, sugDispensadas: [], periodos: [] };
    return Object.assign({}, x, { carteiras: x.carteiras.concat(c), ativa: c.id });
  }
  /* d: { nome, pais, moeda, banco }, todos opcionais */
  function editarCarteira(x, id, d) {
    var c0 = acharCarteira(x, id), c = Object.assign({}, c0), travada = moedaTravada(c0.months);
    if (d.nome != null) c.nome = nomeCarteira(x, d.nome, id);
    if (d.pais) c.pais = d.pais;
    if (d.moeda && d.moeda !== c0.moeda) {
      if (travada) throw new Error('a moeda não muda depois que há extratos salvos: crie outra carteira');
      c.moeda = conferirMoeda(d.moeda);
    }
    if (d.banco && d.banco !== c0.banco) {
      if (travada) throw new Error('o tipo de extrato não muda depois que há extratos salvos: crie outra carteira');
      c.banco = conferirBanco(d.banco);
    }
    return comPrincipal(x, x.carteiras.map(function (w) { return w.id === id ? c : w; }), x.ativa);
  }
  function excluirCarteira(x, id) {
    acharCarteira(x, id);
    if (x.carteiras.length === 1) throw new Error('a única carteira não se exclui: use Apagar meus dados');
    /* as transferências com ela se desfazem: a outra ponta volta ao que era */
    var resto = x.carteiras.filter(function (w) { return w.id !== id; }).map(function (w) {
      var ids = {}; x.carteiras.forEach(function (c) { if (c.id !== id) ids[c.id] = 1; });
      return Object.assign({}, w, { transf: semCarteira(w.transf || {}, ids), sugDispensadas: (w.sugDispensadas || []).filter(function (k) { var a = JSON.parse(k); return a[0] !== id && a[2] !== id; }) });
    });
    return comPrincipal(x, resto, x.ativa === id ? resto[0].id : x.ativa);
  }
  function escolherCarteira(x, id) { acharCarteira(x, id); return Object.assign({}, x, { ativa: id }); }
  /* moeda principal e câmbio: cambios[M].rate = quantos M valem 1 da moeda principal, sempre digitado pela pessoa */
  function trocarMoedaPrincipal(x, moeda) {
    conferirMoeda(moeda);
    if (moeda === x.config.moedaPrincipal) return x;
    return Object.assign({}, x, { config: Object.assign({}, x.config, { moedaPrincipal: moeda }), cambios: {} });
  }
  /* valor na moeda `de` convertido para a principal; null se falta o câmbio */
  function paraPrincipal(v, de, x) {
    if (de === x.config.moedaPrincipal) return v;
    var c = x.cambios && x.cambios[de];
    return c && +c.rate > 0 ? v / +c.rate : null;
  }
  /* as moedas que precisam de câmbio: das carteiras e dos pagamentos em observação em aberto */
  function moedasSemPrincipal(x) {
    var mp = x.config.moedaPrincipal, o = {};
    x.carteiras.forEach(function (c) { if (c.moeda !== mp) o[c.moeda] = 1; });
    ((x.div && x.div.items) || []).forEach(function (i) { if (i.status !== 'paga' && i.moeda && i.moeda !== mp) o[i.moeda] = 1; });
    return Object.keys(o).sort();
  }
  var CAMBIO_ANTIGO = 30;
  function diasDesde(iso, hoje) { return Math.round((Date.parse(hoje + 'T00:00:00Z') - Date.parse(iso + 'T00:00:00Z')) / 864e5); }
  /* espaço ocupado pelas chaves do painel (todas: a v3 fica salva ao lado da v4). O navegador permite cerca de
     5 milhões de caracteres por site; contamos caracteres de chave + valor e chamamos de "MB" */
  var ESPACO_AVISO = 4 * 1024 * 1024;
  function tamanhoSalvo(pares) {
    return pares.reduce(function (t, p) { return p[0].indexOf('cortex-financas.') === 0 ? t + p[0].length + String(p[1] || '').length : t; }, 0);
  }
  /* o que o painel usa (o formato da v3) para a carteira ativa */
  function compor(x) {
    var w = carteiraAtiva(x);
    return { months: w.months, over: w.over, plan: juntarPlan(x.config, w), summary: w.summary, div: divV3(x.div, x.cambios) };
  }
  /* grava de volta na v4 o que o painel mudou (vis = { months, over, plan, summary, div }); não altera x */
  function decompor(x, vis) {
    var pp = partirPlan(vis.plan), w0 = carteiraAtiva(x);
    var w = Object.assign({}, w0, { months: vis.months, over: vis.over, summary: vis.summary, metas: pp.cart.metas });
    if (pp.cart.moeda) w.moeda = pp.cart.moeda;
    if (pp.cart.pais) w.pais = pp.cart.pais;
    if (pp.cart.naoAluguel !== undefined) w.naoAluguel = pp.cart.naoAluguel; else delete w.naoAluguel;
    var config = pp.config;
    /* com uma carteira só, a moeda principal acompanha a dela (o câmbio é por 1 dessa moeda) */
    config.moedaPrincipal = x.carteiras.length === 1 ? w.moeda : x.config.moedaPrincipal;
    var div = null, cambios = x.cambios;
    if (vis.div) { div = Object.assign({}, vis.div); cambios = vis.div.cambios || {}; delete div.cambios; }
    return { v: 4, config: config, carteiras: x.carteiras.map(function (c) { return c.id === w.id ? w : c; }), ativa: x.ativa, cambios: cambios, div: div };
  }
  /* lê dados salvos ou um backup (texto JSON) e devolve sempre a v4; erro com motivo se não der */
  function lerSalvo(texto, titularAntigo) {
    var x;
    try { x = JSON.parse(texto); } catch (e) { throw new Error('o conteúdo não é JSON válido'); }
    return migrate(x, titularAntigo);
  }
  /* resumo para confirmar antes de restaurar ou apagar: quantos meses, de quando a quando (v3 ou v4, todas as carteiras) */
  function resumoDados(x) {
    var meses = {}, mov = 0;
    ((x && x.carteiras) || [x || {}]).forEach(function (c) {
      Object.keys(c.months || {}).forEach(function (k) { meses[k] = 1; mov += c.months[k].length; });
    });
    var ks = Object.keys(meses).sort();
    return { meses: ks.length, de: ks[0] || null, ate: ks[ks.length - 1] || null, mov: mov };
  }
  /* o que um backup traz, para confirmar antes de substituir: cada carteira (nome, moeda, meses, período dos
     extratos, movimentos), o câmbio com a data, transferências confirmadas e dispensadas e as carteiras com
     colunas do importador lembradas. x = v4 (lerSalvo) */
  function resumoBackup(x) {
    var disp = {}, transf = 0;
    var cs = x.carteiras.map(function (c) {
      var r = resumoDados(c), ps = c.periodos || [];
      Object.keys(c.transf || {}).forEach(function (k) { if (c.transf[k].lado === 's') transf++; });
      (c.sugDispensadas || []).forEach(function (k) { disp[k] = 1; });
      return { id: c.id, nome: c.nome, moeda: c.moeda, meses: r.meses, mov: r.mov, de: ps.length ? ps[0].de : null, ate: ps.length ? ps[ps.length - 1].ate : null,
        trechos: ps.length, colunas: Object.keys(c.importacao || {}).length };
    });
    return { carteiras: cs, moedaPrincipal: x.config.moedaPrincipal, titular: x.config.titular || '',
      cambios: Object.keys(x.cambios || {}).sort().map(function (m) { return { moeda: m, rate: +x.cambios[m].rate, data: x.cambios[m].data || null }; }),
      transf: transf, dispensadas: Object.keys(disp).length };
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
  function preverMes(model, metaCat, cats) {
    cats = (cats || montarCats(null)).filter(function (c) { return !c.oculta; });
    var FIXAS = cats.filter(function (c) { return c.fixa; }).map(function (c) { return c.id; });
    var cur = model.partial;
    if (!cur) return null;
    var g = model.by[cur], p = cur.split('-').map(Number), dim = new Date(p[0], p[1], 0).getDate(), day = Math.max(1, +model.lastDate.slice(8));
    var fixo = 0, falFix = 0, vari = 0, rec = 0, pend = [], semBase = [], recs = detectarRecorrentes(model), recCat = {};
    /* conta fixa sem meta (vazia ou zero) entra pelo valor das cobranças recorrentes detectadas nela; sem meta
       e sem recorrente, conta só o que já saiu, e semBase avisa (só se a categoria teve gasto nos meses anteriores) */
    recs.forEach(function (o) { if (FIXAS.indexOf(o.last.cat) >= 0) recCat[o.last.cat] = (recCat[o.last.cat] || 0) + o.v; });
    var antes = model.keys.filter(function (k) { return k !== cur; }).slice(-3);
    cats.forEach(function (c) {
      var v = g.spend[c.id] || 0;
      if (FIXAS.indexOf(c.id) < 0) { vari += v; return; }
      var mt = +metaCat(c.id) || 0, base = mt > 0 ? mt : (recCat[c.id] || 0);
      if (!base && antes.some(function (k) { return (model.by[k].spend[c.id] || 0) > 0; })) semBase.push(c.id);
      fixo += Math.max(v, base); falFix += Math.max(0, base - v);
    });
    recs.forEach(function (o) {
      if (FIXAS.indexOf(o.last.cat) >= 0) return;
      if (o.m[cur]) { rec += o.m[cur][0]; vari -= o.m[cur][0]; }
      else { rec += o.v; falFix += o.v; pend.push(o); }
    });
    return { m: cur, day: day, dim: dim, gasto: g.gasto, proj: fixo + rec + Math.max(0, vari) / day * dim, falFix: falFix, pend: pend, semBase: semBase };
  }
  /* metas sugeridas: média dos 3 primeiros meses completos (ou dos que houver), em múltiplos de 5 */
  function sugerirMetas(model, cats) {
    cats = (cats || montarCats(null)).filter(function (c) { return !c.oculta; });
    var ks = (model.complete.length ? model.complete : model.keys).slice(0, 3);
    if (!ks.length) return null;
    function media(fn) { var t = 0; ks.forEach(function (k) { t += Math.max(0, fn(model.by[k])); }); return Math.round(t / ks.length / 5) * 5; }
    var o = { cats: {}, poupar: media(function (g) { return g.saved; }) };
    cats.forEach(function (c) { o.cats[c.id] = media(function (g) { return g.spend[c.id] || 0; }); });
    return o;
  }
  /* saldos (carteira do importador genérico): { dia: { data: centavos }, ancora: { data, valor } }.
     Cada movimento ganha um id (data, descrição, valor e saldo, mais a ordem entre os idênticos: dois cafés iguais
     no mesmo dia são #1 e #2). transf: as transferências confirmadas da carteira, por id; a ponta com marca vira
     "Entre contas suas", qualquer que seja a escolha por descrição */
  function buildModel(months, over, titular, pais, cats, saldos, transf) {
    var rows = [], by = {}, txs = [], vistos = {};
    cats = cats || montarCats(null);
    Object.keys(months).sort().forEach(function (m) { months[m].forEach(function (t) {
      var k = txKey(t), r = classify(t, over, titular, pais, cats), tf;
      vistos[k] = (vistos[k] || 0) + 1; r.id = k + '#' + vistos[k];
      if (transf && (tf = transf[r.id])) { r.transf = tf; if (tf.marca) { r.kind = 'interno'; r.cat = null; } }
      txs.push(t); rows.push(r);
    }); });
    rows.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
    /* movimentos sem saldo próprio: o saldo depois de cada um sai do fim do dia, andando para trás dentro do dia */
    var fonteSaldo = rows.length && rows.every(function (r) { return r.bal != null; }) ? 'extrato' : null;
    if (rows.length && !fonteSaldo && saldos) {
      txs.sort(function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0; });
      var F = fechamentos(txs, saldos.dia, saldos.ancora);
      if (F.fonte) {
        fonteSaldo = F.fonte;
        for (var i = rows.length - 1, dia = null, b = 0; i >= 0; i--) {
          if (rows[i].date !== dia) { dia = rows[i].date; b = F.fecha[dia] / 100; }
          rows[i].bal = b; b -= rows[i].a;
        }
      }
    }
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
      Object.keys(g.spend).forEach(function (id) { g.gasto += g.spend[id]; });
      g.saved = -(g.flex + g.inv) || 0; /* sem nada guardado, 0 (e não −0) */
      g.saldo = g.entrou - g.gasto - g.saved;
    });
    var lastDate = rows.length ? rows[rows.length - 1].date : '', partial = null;
    if (lastDate) {
      var p = lastDate.split('-').map(Number);
      if (p[2] < new Date(p[0], p[1], 0).getDate()) partial = lastDate.slice(0, 7);
    }
    /* sem saldo do extrato e sem saldo informado: nada de saldo atual nem gráfico de saldo */
    var semSaldo = rows.some(function (r) { return r.bal == null; });
    return { rows: rows, by: by, keys: keys, partial: partial, complete: keys.filter(function (k) { return k !== partial; }), lastDate: lastDate, semSaldo: semSaldo, fonteSaldo: semSaldo ? null : fonteSaldo };
  }
  /* ---------- importador genérico de CSV (bancos sem leitor próprio) ----------
     A pessoa escolhe as colunas; separador, codificação, linha do cabeçalho e formatos são detectados e
     mostrados para conferir. Quando o arquivo deixa dúvida (data 03/04/2026, 1.234, sinal das saídas), a
     resposta fica em branco e a importação só sai depois que a pessoa responder: nada é adivinhado em silêncio.
     Cada movimento vira [data, descrição, 'Others', centavos, saldo em centavos ou null]. */
  var SEPARADORES = [[';', 'ponto e vírgula'], [',', 'vírgula'], ['\t', 'tabulação'], ['|', 'barra vertical']];
  /* UTF-8 se o arquivo for UTF-8 válido; senão Latin-1 (Windows-1252, o que os bancos usam) */
  function decodificar(bytes, cod) {
    var t;
    if (cod !== 'latin1') {
      try { t = new TextDecoder('utf-8', { fatal: true }).decode(bytes); return { texto: t.replace(/^\uFEFF/, ''), cod: 'utf-8' }; }
      catch (e) { if (cod === 'utf-8') throw new Error('o arquivo não é UTF-8 válido'); }
    }
    return { texto: new TextDecoder('windows-1252').decode(bytes), cod: 'latin1' };
  }
  function linhasCheias(rows) { return rows.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); }); }
  /* o separador que deixa mais linhas com o mesmo número de colunas (mais de uma) */
  function detectarSeparador(texto) {
    var amostra = texto.split(/\r?\n/).slice(0, 60).join('\n'), melhor = ',', pts = 0;
    SEPARADORES.forEach(function (o) {
      var cont = {}, max = 0;
      linhasCheias(parseCSV(amostra, o[0])).forEach(function (r) { if (r.length > 1) { cont[r.length] = (cont[r.length] || 0) + 1; max = Math.max(max, cont[r.length]); } });
      if (max > pts) { pts = max; melhor = o[0]; }
    });
    return melhor;
  }
  function pareceData(s) { return /^\s*\d{1,4}[\/\-. ]\d{1,2}[\/\-. ]\d{2,4}\b/.test(s) || !!isoDate(s); }
  function pareceNumero(s) { s = String(s).trim(); return /\d/.test(s) && /^[(\-+−]?\s*[^\d\s,.\-]{0,3}\s*[\d][\d.,\s]*\s*[^\d\s,.]{0,3}\)?-?$/.test(s); }
  /* identifica o cabeçalho sem guardar o texto dele: só um código calculado (FNV-1a) */
  function assinatura(row) {
    var t = row.map(function (c) { return String(c).trim().toLowerCase(); }).join('|'), x = 2166136261;
    for (var i = 0; i < t.length; i++) { x ^= t.charCodeAt(i); x = Math.imul(x, 16777619); }
    return 'h' + (x >>> 0).toString(36) + '.' + row.length;
  }
  /* primeira linha com 3+ textos que não são data nem número, seguida de uma linha do mesmo tamanho com data */
  function detectarCabecalho(rows) {
    for (var i = 0; i < Math.min(rows.length - 1, 40); i++) {
      var r = rows[i], txt = r.filter(function (c) { c = String(c).trim(); return c && !pareceData(c) && !pareceNumero(c); }).length;
      if (txt < 3) continue;
      for (var j = i + 1; j < Math.min(rows.length, i + 4); j++) {
        if (rows[j].length === r.length && rows[j].some(pareceData)) return i;
      }
    }
    return -1;
  }
  /* sugestões pelo nome da coluna; o que não for achado fica para a pessoa escolher */
  var NOMES_COLUNA = {
    data: /(^|\s)(data|date|fecha|dt)(\s|$)|data (do |de )?(lan[cç]amento|movimento)/,
    desc: /descri|hist[oó]rico|lan[cç]amento|details|memo|narrat|payee|estabelecimento|t[ií]tulo|title|refer[eê]ncia/,
    valor: /^(valor|amount|value|montante|quantia|importe|transaction amount)/,
    saida: /d[eé]bit|sa[ií]da|withdraw|money out|paid out/,
    entrada: /cr[eé]dit|entrada|deposit|money in|paid in/,
    saldo: /saldo|balance/
  };
  function sugerirColunas(cab) {
    var n = cab.map(function (c) { return String(c).trim().toLowerCase(); }), o = {};
    Object.keys(NOMES_COLUNA).forEach(function (k) {
      for (var i = 0; i < n.length; i++) if (NOMES_COLUNA[k].test(n[i]) && !Object.keys(o).some(function (q) { return o[q] === i; })) { o[k] = i; break; }
    });
    var m = { data: o.data != null ? o.data : -1, desc: o.desc != null ? o.desc : -1, saldo: o.saldo != null ? o.saldo : -1 };
    if (o.valor != null) m.valor = { modo: 'uma', col: o.valor, saidas: null };
    else if (o.saida != null && o.entrada != null) m.valor = { modo: 'duas', saida: o.saida, entrada: o.entrada };
    else m.valor = { modo: 'uma', col: -1, saidas: null };
    return m;
  }
  /* datas: os formatos que servem para todos os valores da coluna */
  var FORMATOS_DATA = ['dmy', 'mdy', 'ymd'];
  function lerData(s, fmt) {
    s = String(s || '').trim();
    var m = s.match(/^(\d{1,4})[\/\-. ](\d{1,2})[\/\-. ](\d{1,4})(?:\b|$)/), y, mo, d;
    if (!m) return fmt === 'texto' || !fmt ? isoDate(s) : null;
    if (fmt === 'ymd') { if (m[1].length !== 4) return null; y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if (fmt === 'dmy' || fmt === 'mdy') {
      if (m[3].length !== 4 && m[3].length !== 2) return null;
      y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      if (fmt === 'dmy') { d = +m[1]; mo = +m[2]; } else { mo = +m[1]; d = +m[2]; }
    } else return null;
    if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
    return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
  }
  function possiveisData(valores) {
    var vs = valores.filter(function (v) { return String(v).trim(); });
    if (vs.length && vs.every(function (v) { return !/^\s*\d/.test(v) && isoDate(v); })) return ['texto'];
    return FORMATOS_DATA.filter(function (f) { return vs.length && vs.every(function (v) { return lerData(v, f); }); });
  }
  /* números: 'virgula' = 1.234,56 e 'ponto' = 1,234.56 */
  function soDigitos(s) { return String(s).replace(/[^\d.,]/g, ''); }
  function serveNumero(v, fmt) {
    v = soDigitos(v);
    if (!v) return true;
    return fmt === 'virgula' ? /^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(v) : /^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(v);
  }
  function possiveisNumero(valores) { return ['virgula', 'ponto'].filter(function (f) { return valores.every(function (v) { return serveNumero(v, f); }); }); }
  /* o formato só importa se algum valor tem ponto ou vírgula */
  function numeroImporta(valores) { return valores.some(function (v) { return /[.,]/.test(soDigitos(v)); }); }
  function lerNumero(s, fmt) {
    s = String(s == null ? '' : s).trim();
    if (!s) return null;
    var neg = /^\(.*\)$/.test(s) || /^[^\d]*[-−]/.test(s) || /[-−]\s*$/.test(s), v = soDigitos(s);
    if (!v || !serveNumero(v, fmt)) return NaN;
    v = fmt === 'virgula' ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
    var c = Math.round(parseFloat(v) * 100);
    return neg ? -c : c;
  }
  function colunaDe(rows, cab, col) { return col < 0 ? [] : rows.slice(cab + 1).filter(function (r) { return r.length > col; }).map(function (r) { return r[col]; }); }
  /* as linhas de dados: depois do cabeçalho, com a data lida; o resto (rodapé, totais) é listado como ignorado */
  function linhasDeDados(rows, m) {
    return rows.slice(m.cab + 1).map(function (r, i) { return { n: m.cab + i + 2, r: r }; }).filter(function (x) { return x.r.some(function (c) { return String(c).trim(); }); });
  }
  /* o que ainda precisa de resposta, com as opções que o arquivo permite. Quando só um formato serve para
     todos os valores, ele é preenchido em m (e aparece na prévia para conferir) */
  function perguntasImportacao(rows, m) {
    var q = [];
    if (m.cab < 0) return [{ id: 'cab' }];
    if (m.data < 0) q.push({ id: 'data' });
    if (m.desc < 0) q.push({ id: 'desc' });
    var v = m.valor || {};
    if (v.modo === 'duas' ? (v.saida < 0 || v.entrada < 0) : v.col < 0) q.push({ id: 'valor' });
    if (m.saldo >= 0 && (v.modo === 'duas' ? (m.saldo === v.saida || m.saldo === v.entrada) : m.saldo === v.col)) q.push({ id: 'saldoValor', erro: true });
    if (q.length) return q;
    var ds = linhasDeDados(rows, m).map(function (x) { return x.r[m.data]; }).filter(pareceData), pd = possiveisData(ds);
    if (!pd.length) q.push({ id: 'fmtData', erro: true });
    else if (pd.length === 1) m.fmtData = pd[0];
    else if (pd.indexOf(m.fmtData) < 0) q.push({ id: 'fmtData', opcoes: pd, exemplo: ds.filter(function (d) { return pd.length < 2 || lerData(d, pd[0]) !== lerData(d, pd[1]); })[0] || ds[0] });
    var cols = v.modo === 'duas' ? [v.saida, v.entrada] : [v.col];
    if (m.saldo >= 0) cols.push(m.saldo);
    var ns = [];
    linhasDeDados(rows, m).forEach(function (x) { if (lerData(x.r[m.data], pd.indexOf(m.fmtData) >= 0 ? m.fmtData : pd[0])) cols.forEach(function (c) { if (x.r[c] != null && String(x.r[c]).trim()) ns.push(x.r[c]); }); });
    var pn = possiveisNumero(ns);
    if (!pn.length) q.push({ id: 'fmtNum', erro: true });
    else if (numeroImporta(ns) && pn.indexOf(m.fmtNum) < 0) {
      if (pn.length === 1) m.fmtNum = pn[0];
      else q.push({ id: 'fmtNum', opcoes: pn, exemplo: ns.filter(function (x) { return /[.,]/.test(soDigitos(x)); })[0] });
    }
    if (v.modo !== 'duas' && v.saidas !== 'negativas' && v.saidas !== 'positivas') {
      var pos = 0, neg = 0;
      linhasDeDados(rows, m).forEach(function (x) {
        if (!lerData(x.r[m.data], m.fmtData || pd[0])) return;
        var c = lerNumero(x.r[v.col], m.fmtNum || pn[0] || 'ponto'); if (c > 0) pos++; else if (c < 0) neg++;
      });
      q.push({ id: 'sinal', pos: pos, neg: neg });
    }
    return q;
  }
  /* aplica o mapeamento: { tx, linhas (número da linha no arquivo de cada tx), ignoradas: [{ n, motivo, celulas }],
     de, ate, entradas, saidas, saldos: { data: centavos }, nSaldo } (centavos).
     O saldo é do fim do dia e vale para a data, nunca para a linha: vem de uma coluna (m.saldo) ou de linhas
     próprias (m.saldoLinhas, a descrição dessas linhas, ex.: "Saldo Diário"). Ele nunca vira movimento, e o
     movimento guarda null no lugar do saldo (a chave de reimportação não depende dele). */
  function normDesc(s) { return String(s || '').trim().replace(/\s+/g, ' ').toUpperCase(); }
  function interpretarCSV(rows, m) {
    var tx = [], ns = [], ign = [], sal = [], v = m.valor, fmtN = m.fmtNum || 'ponto', rotulo = m.saldoLinhas ? normDesc(m.saldoLinhas) : null;
    linhasDeDados(rows, m).forEach(function (x) {
      var r = x.r, d = lerData(r[m.data], m.fmtData), a;
      if (!d) { ign.push({ n: x.n, motivo: 'sem data válida', celulas: r }); return; }
      /* linha de saldo (ex.: "Saldo Diário"): o valor dela é o saldo do fim do dia */
      if (rotulo && normDesc(r[m.desc]) === rotulo) {
        var vs = v.modo === 'duas' ? null : lerNumero(r[v.col], fmtN);
        if (vs != null && !isNaN(vs)) sal.push([d, vs]); else ign.push({ n: x.n, motivo: 'linha de saldo sem valor', celulas: r });
        return;
      }
      var b = m.saldo >= 0 ? lerNumero(r[m.saldo], fmtN) : null;
      if (b != null && !isNaN(b)) sal.push([d, b]);
      if (v.modo === 'duas') {
        var sa = lerNumero(r[v.saida], fmtN), en = lerNumero(r[v.entrada], fmtN);
        if (isNaN(sa) || isNaN(en)) a = NaN; else if (sa == null && en == null) a = null; else a = (en ? Math.abs(en) : 0) - (sa ? Math.abs(sa) : 0);
      } else { a = lerNumero(r[v.col], fmtN); if (v.saidas === 'positivas' && a) a = -a; }
      /* só saldo, sem valor de movimento: não é movimento (o saldo já foi anotado) */
      if (a == null && b != null && !isNaN(b)) return;
      if (a == null || isNaN(a)) { ign.push({ n: x.n, motivo: 'valor não entendido', celulas: r }); return; }
      if (!a) { ign.push({ n: x.n, motivo: 'valor zero', celulas: r }); return; }
      tx.push([d, String(r[m.desc] || '').trim() || '(sem descrição)', 'Others', a, null]); ns.push(x.n);
    });
    /* extrato do mais novo para o mais antigo: inverte, para a ordem dentro do dia ser a do acontecido */
    var dts = tx.map(function (t) { return t[0]; }).concat(sal.map(function (z) { return z[0]; }));
    if (dts.length > 1 && dts[0] > dts[dts.length - 1]) { tx.reverse(); ns.reverse(); sal.reverse(); }
    var saldos = {};
    sal.forEach(function (z) { saldos[z[0]] = z[1]; }); /* o último do dia vale */
    var de = null, ate = null, ent = 0, sai = 0;
    tx.forEach(function (t) { if (!de || t[0] < de) de = t[0]; if (!ate || t[0] > ate) ate = t[0]; if (t[3] > 0) ent += t[3]; else sai += t[3]; });
    return { tx: tx, linhas: ns, ignoradas: ign, de: de, ate: ate, entradas: ent, saidas: sai, saldos: saldos, nSaldo: sal.length, periodo: periodoDoArquivo(rows, m, tx, saldos) };
  }
  /* linhas de saldo: uma descrição que começa com "Saldo", sem outra informação, repetida em várias datas */
  function detectarLinhasSaldo(rows, m) {
    if (m.cab < 0 || m.desc < 0 || m.data < 0) return null;
    var cont = {}, orig = {};
    linhasDeDados(rows, m).forEach(function (x) {
      var ds = String(x.r[m.desc] || '').trim();
      if (/^saldo\b/i.test(ds) && pareceData(x.r[m.data])) { var k = normDesc(ds); cont[k] = (cont[k] || 0) + 1; orig[k] = ds; }
    });
    var melhor = null;
    Object.keys(cont).forEach(function (k) { if (cont[k] >= 2 && (!melhor || cont[k] > cont[melhor])) melhor = k; });
    return melhor ? orig[melhor] : null;
  }
  /* saldo do fim de cada dia: do extrato (saldos por data) ou, sem ele, reconstruído a partir de um saldo que a
     pessoa informou (ancora: { data, valor }) andando pelos movimentos para trás e para a frente.
     tx: movimentos em ordem; devolve { fecha: { data: centavos }, fonte: 'extrato' | 'estimado' | null } */
  function fechamentos(tx, saldos, ancora) {
    var mov = {}, dias = {};
    tx.forEach(function (t) { mov[t[0]] = (mov[t[0]] || 0) + t[3]; dias[t[0]] = 1; });
    var conhecidos = saldos && Object.keys(saldos).length ? saldos : null, fonte = conhecidos ? 'extrato' : null;
    if (!conhecidos && ancora && ancora.data && ancora.valor != null) { conhecidos = {}; conhecidos[ancora.data] = ancora.valor; fonte = 'estimado'; dias[ancora.data] = 1; }
    if (!conhecidos) return { fecha: {}, fonte: null };
    Object.keys(conhecidos).forEach(function (d) { dias[d] = 1; });
    var ks = Object.keys(dias).sort(), fecha = {}, i, prim = -1;
    for (i = 0; i < ks.length; i++) {
      if (conhecidos[ks[i]] != null) { fecha[ks[i]] = conhecidos[ks[i]]; if (prim < 0) prim = i; }
      else if (i > 0 && fecha[ks[i - 1]] != null) fecha[ks[i]] = fecha[ks[i - 1]] + (mov[ks[i]] || 0);
    }
    /* antes do primeiro saldo conhecido: anda para trás desfazendo os movimentos do dia seguinte */
    for (i = prim - 1; i >= 0; i--) fecha[ks[i]] = fecha[ks[i + 1]] - (mov[ks[i + 1]] || 0);
    return { fecha: fecha, fonte: fonte };
  }
  /* confere o saldo do extrato: cada saldo do dia contra o anterior mais os movimentos entre os dois; e o saldo
     informado pela pessoa contra o do extrato na mesma data. Devolve [{ de, ate, dif, tipo }] e { data, dif }.
     tipo 'rendimento': diferença positiva de até RENDIMENTO_DIA por dia corrido (o rendimento da conta, que o
     extrato não lista); 'falta': negativa ou maior que isso (pode faltar alguma linha). Nada vira movimento. */
  var RENDIMENTO_DIA = 500;
  function conferirSaldos(tx, saldos, ancora) {
    var ks = Object.keys(saldos || {}).sort(), div = [], i, cmp = null;
    for (i = 1; i < ks.length; i++) {
      var soma = 0;
      tx.forEach(function (t) { if (t[0] > ks[i - 1] && t[0] <= ks[i]) soma += t[3]; });
      var dif = saldos[ks[i]] - (saldos[ks[i - 1]] + soma);
      var dias = Math.round((Date.parse(ks[i]) - Date.parse(ks[i - 1])) / 864e5);
      if (dif) div.push({ de: ks[i - 1], ate: ks[i], dif: dif, tipo: dif > 0 && dif <= RENDIMENTO_DIA * dias ? 'rendimento' : 'falta' });
    }
    if (ancora && ancora.data && ancora.valor != null && ks.length) {
      var f = fechamentos(tx, saldos, null).fecha[ancora.data];
      if (f == null) { var ult = ks[ks.length - 1], s2 = saldos[ult]; tx.forEach(function (t) { if (t[0] > ult && t[0] <= ancora.data) s2 += t[3]; }); f = s2; }
      cmp = { data: ancora.data, extrato: f, dif: ancora.valor - f };
    }
    return { divergencias: div, ancora: cmp };
  }
  /* abre o arquivo: usa um mapeamento lembrado se o cabeçalho bater; senão detecta e sugere */
  function prepararImportacao(bytes, lembrados, cod, sep) {
    var dec = decodificar(bytes, cod), lem = lembrados || {};
    var ks = Object.keys(lem);
    if (!sep) for (var i = 0; i < ks.length; i++) {
      if (lem[ks[i]].sep === 'planilha') continue;
      var rws = parseCSV(dec.texto, lem[ks[i]].sep), j = linhaLembrada(rws, ks[i]);
      if (j >= 0) return { cod: dec.cod, sep: lem[ks[i]].sep, rows: rws, lembrado: true, mapa: Object.assign(JSON.parse(JSON.stringify(lem[ks[i]])), { cab: j }) };
    }
    sep = sep || detectarSeparador(dec.texto);
    var rows = parseCSV(dec.texto, sep);
    return { cod: dec.cod, sep: sep, rows: rows, lembrado: false, mapa: mapaInicial(rows, sep) };
  }
  function linhaLembrada(rows, k) {
    for (var j = 0; j < Math.min(rows.length, 40); j++) if (assinatura(rows[j]) === k) return j;
    return -1;
  }
  function mapaInicial(rows, sep) {
    var cab = detectarCabecalho(rows);
    var mapa = cab < 0 ? { cab: -1, data: -1, desc: -1, saldo: -1, valor: { modo: 'uma', col: -1, saidas: null } } : sugerirColunas(rows[cab]);
    mapa.cab = cab; mapa.sep = sep;
    if (cab >= 0) { perguntasImportacao(rows, mapa); /* preenche os formatos que o arquivo deixa claros */
      if (mapa.saldo < 0) mapa.saldoLinhas = detectarLinhasSaldo(rows, mapa); }
    return mapa;
  }
  /* ---------- planilhas (.xls, .xlsx, HTML ou XML do Excel) ----------
     O tipo vem do conteúdo, nunca da extensão. A leitura usa o SheetJS (vendor/sheetjs), que a interface só
     carrega quando a pessoa escolhe uma planilha e passa para cá como parâmetro (X). A planilha vira a mesma
     tabela de linhas do CSV, com o separador 'planilha', e segue o mesmo caminho: cabeçalho, colunas, prévia. */
  var LIMITE_PLANILHA = 15 * 1024 * 1024, LIMITE_LINHAS = 20000;
  var SENHA = 'a planilha está protegida por senha. Abra no Excel e salve sem senha, ou baixe o extrato em CSV';
  function comeca(bytes, sig) {
    if (bytes.length < sig.length) return false;
    for (var i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false;
    return true;
  }
  /* o começo do arquivo como texto de 1 byte por letra, só para procurar marcas (não decodifica o conteúdo) */
  function inicioTexto(bytes, n) {
    var s = '', i, fim = Math.min(bytes.length, n);
    for (i = 0; i < fim; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(fim, i + 8192)));
    return s;
  }
  function tipoArquivo(bytes) {
    if (!bytes || !bytes.length) return 'vazio';
    /* contêiner do Office: .xls, ou um .xlsx protegido por senha (só tem a parte EncryptedPackage, nome em UTF-16) */
    if (comeca(bytes, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])) return inicioTexto(bytes, bytes.length).indexOf('E\0n\0c\0r\0y\0p\0t\0e\0d\0P\0a\0c\0k\0a\0g\0e\0') >= 0 ? 'senha' : 'xls';
    if (comeca(bytes, [0x50, 0x4B, 0x03, 0x04])) return inicioTexto(bytes, bytes.length).indexOf('xl/workbook.xml') >= 0 ? 'xlsx' : 'zip';
    if (comeca(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf';
    var ini = inicioTexto(bytes, 1 << 20).replace(/^\xEF\xBB\xBF/, '').replace(/^\s+/, '').toLowerCase();
    if (ini.charAt(0) === '<') {
      if (ini.indexOf('urn:schemas-microsoft-com:office:spreadsheet') >= 0 && ini.indexOf('<workbook') >= 0) return 'xml';
      if (ini.indexOf('<table') >= 0) return 'html';
    }
    return 'texto';
  }
  function ehPlanilha(tipo) { return tipo === 'xls' || tipo === 'xlsx' || tipo === 'html' || tipo === 'xml'; }
  /* número de série do Excel para ano-mês-dia, contado em UTC: o fuso do computador não desloca o dia.
     d1904: calendário de 1904 (planilhas antigas do Mac), em que o dia 0 é 1/1/1904 */
  function serialParaData(n, d1904) {
    var base = d1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    return new Date(base + Math.floor(n + 1e-7) * 864e5).toISOString().slice(0, 10);
  }
  function textoCelula(X, c, d1904) {
    if (!c || c.v == null || c.t === 'z' || c.t === 'e') return '';
    if (c.t === 'n') {
      if (c.z && X.SSF.is_date(c.z)) return c.v >= 1 ? serialParaData(c.v, d1904) : String(c.w || '');
      return String(Math.round(c.v * 1e6) / 1e6);
    }
    if (c.t === 'b') return c.v ? 'VERDADEIRO' : 'FALSO';
    return String(c.v);
  }
  /* todas as linhas e colunas desde A1, para as posições baterem com o que a pessoa vê; célula mesclada vale só
     na primeira (as outras ficam vazias, como no Excel) */
  function linhasDaAba(X, ws, d1904) {
    if (!ws || !ws['!ref']) return [];
    var R = X.utils.decode_range(ws['!ref']), rows = [], r, c, row;
    if (R.e.r + 1 > LIMITE_LINHAS) throw new Error('a planilha passa de ' + LIMITE_LINHAS.toLocaleString('pt-BR') + ' linhas');
    for (r = 0; r <= R.e.r; r++) {
      row = [];
      for (c = 0; c <= R.e.c; c++) row.push(textoCelula(X, ws[X.utils.encode_cell({ r: r, c: c })], d1904));
      rows.push(row);
    }
    return rows;
  }
  /* as abas com algum conteúdo; fórmulas não são calculadas (vale o valor que o arquivo já traz) */
  function lerPlanilha(X, bytes, tipo) {
    if (bytes.length > LIMITE_PLANILHA) throw new Error('o arquivo passa de 15 MB');
    var op = { cellNF: true, cellDates: false, cellFormula: false, sheetRows: LIMITE_LINHAS + 1, raw: true }, wb;
    try { wb = tipo === 'html' || tipo === 'xml' ? X.read(decodificar(bytes).texto, Object.assign({ type: 'string' }, op)) : X.read(bytes, Object.assign({ type: 'array' }, op)); }
    catch (e) { throw new Error(/password|encrypt/i.test(e && e.message) ? SENHA : 'a planilha está danificada ou incompleta'); }
    var d1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
    var abas = (wb.SheetNames || []).map(function (n) { return { nome: String(n), rows: linhasDaAba(X, wb.Sheets[n], d1904) }; })
      .filter(function (a) { return linhasCheias(a.rows).length; });
    if (!abas.length) throw new Error('a planilha não tem nenhuma tabela');
    return abas;
  }
  /* sem aba escolhida: a que tem o formato lembrado, senão a primeira com cabeçalho, senão a primeira */
  function prepararPlanilha(X, bytes, tipo, lembrados, aba) {
    var abas = lerPlanilha(X, bytes, tipo), lem = lembrados || {}, ks = Object.keys(lem).filter(function (k) { return lem[k].sep === 'planilha'; }), i, j;
    var res = function (a, p) { return Object.assign(p, { cod: null, abas: abas.map(function (x) { return x.nome; }), aba: a }); };
    if (aba == null) {
      for (i = 0; i < abas.length; i++) for (j = 0; j < ks.length; j++) {
        var lj = linhaLembrada(abas[i].rows, ks[j]);
        if (lj >= 0) return res(i, { sep: 'planilha', rows: abas[i].rows, lembrado: true, mapa: Object.assign(JSON.parse(JSON.stringify(lem[ks[j]])), { cab: lj }) });
      }
      aba = 0;
      for (i = 0; i < abas.length; i++) if (detectarCabecalho(abas[i].rows) >= 0) { aba = i; break; }
    }
    aba = Math.max(0, Math.min(abas.length - 1, aba));
    return res(aba, { sep: 'planilha', rows: abas[aba].rows, lembrado: false, mapa: mapaInicial(abas[aba].rows, 'planilha') });
  }
  /* o que fica guardado na carteira: só posições de coluna e formatos, debaixo do código do cabeçalho */
  function lembrarMapa(importacao, rows, m) {
    var o = Object.assign({}, importacao || {}), k = assinatura(rows[m.cab]);
    delete o[k];
    var ks = Object.keys(o); if (ks.length >= 5) delete o[ks[0]];
    o[k] = { sep: m.sep, data: m.data, fmtData: m.fmtData, desc: m.desc, valor: m.valor, fmtNum: m.fmtNum || null, saldo: m.saldo, saldoLinhas: m.saldoLinhas || null };
    return o;
  }
  /* junta movimentos novos aos de um mês: um movimento igual (data, descrição, valor e saldo) a um já salvo é
     ignorado. Conta repetições: dois cafés iguais no mesmo dia continuam dois; reimportar o mesmo arquivo não
     acrescenta nada. */
  function juntarMovimentos(atuais, novos) {
    var tem = {}, vistos = {}, add = [], rep = 0;
    atuais.forEach(function (t) { var k = txKey(t); tem[k] = (tem[k] || 0) + 1; });
    novos.forEach(function (t) { var k = txKey(t); vistos[k] = (vistos[k] || 0) + 1; if (vistos[k] <= (tem[k] || 0)) rep++; else add.push(t); });
    var lista = atuais.concat(add).map(function (t, i) { return [t, i]; });
    lista.sort(function (a, b) { return a[0][0] < b[0][0] ? -1 : a[0][0] > b[0][0] ? 1 : a[1] - b[1]; });
    return { lista: lista.map(function (x) { return x[0]; }), novos: add.length, repetidos: rep };
  }
  /* o período que o arquivo informa no cabeçalho ("Período: 01/08/2026 a 15/10/2026"), lido no formato de data
     escolhido; sem ele, da primeira à última data entre movimentos e saldos do dia */
  var DATA_TXT = '(\\d{1,4}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{1,4})';
  var PERIODO_TXT = new RegExp('per[ií]odo[^0-9]{0,40}' + DATA_TXT + '\\s*(?:a|até|ate|-|–)\\s*' + DATA_TXT, 'i');
  /* numa planilha as datas das células já vêm como ano-mês-dia, mas o período do cabeçalho continua texto no
     formato do banco: vale o formato em que ele cobre todas as datas do arquivo */
  function periodoDoArquivo(rows, m, tx, saldos) {
    var datas = periodoDasDatas(tx.map(function (t) { return t[0]; }).concat(Object.keys(saldos || {})));
    var pl = m.sep === 'planilha', fmts = pl ? FORMATOS_DATA : [m.fmtData];
    for (var i = 0; i < Math.min(m.cab, 40); i++) {
      var p = rows[i].join(' ').match(PERIODO_TXT);
      if (p) for (var f = 0; f < fmts.length; f++) {
        var de = lerData(p[1], fmts[f]), ate = lerData(p[2], fmts[f]);
        if (de && ate && de <= ate && (!pl || !datas || (de <= datas.de && ate >= datas.ate))) return { de: de, ate: ate, fonte: 'arquivo' };
      }
    }
    return datas;
  }
  function periodoDasDatas(ds) { ds = ds.slice().sort(); return ds.length ? { de: ds[0], ate: ds[ds.length - 1], fonte: 'datas' } : null; }
  /* ---------- Resumo: todas as carteiras juntas, na moeda principal ---------- */
  function fimDoMes(mes) { var p = mes.split('-').map(Number); return new Date(Date.UTC(p[0], p[1], 0)).toISOString().slice(0, 10); }
  /* um mês está coberto quando os períodos importados vão do dia 1 ao último dia dele; no mês em andamento,
     até ref (o último dia importado, somando todas as carteiras). Devolve { ok, faltas: [{ de, ate }], nada } */
  function cobreMes(periodos, mes, ref) {
    var ini = mes + '-01', fim = fimDoMes(mes), faltas = [], cur = ini;
    if (ref && ref.slice(0, 7) === mes && ref < fim) fim = ref;
    juntarPeriodos(periodos).forEach(function (p) {
      if (p.ate < cur || p.de > fim) return;
      if (p.de > cur) faltas.push({ de: cur, ate: isoMais(p.de, -1) });
      cur = isoMais(p.ate, 1);
    });
    if (cur <= fim) faltas.push({ de: cur, ate: fim });
    return { ok: !faltas.length, faltas: faltas, nada: faltas.length === 1 && faltas[0].de === ini && faltas[0].ate === fim };
  }
  /* meta de gasto da carteira por categoria: a definida, senão a sugestão dos primeiros meses */
  function metaDaCarteira(c, M, cats) {
    var def = (c.metas && c.metas.cats) || {}, sug = sugerirMetas(M, cats);
    return function (id) { var v = def[id]; return v != null && v !== '' && !isNaN(v) ? +v : (sug ? sug.cats[id] || 0 : 0); };
  }
  /* cada carteira com o modelo dela, o período importado ("dados até") e o saldo atual (só o da conta).
     faltaCambio: moedas de carteiras com extrato que não têm câmbio; sem elas, nenhum total sai. */
  function resumir(x) {
    var mp = x.config.moedaPrincipal, ws = x.carteiras.map(function (c) {
      var cats = montarCats(juntarPlan(x.config, c)), M = buildModel(c.months, c.over, x.config.titular, c.pais, cats, { dia: c.saldosDia, ancora: c.ancora }, c.transf);
      var ps = c.periodos || periodosMigrados(c), saldo = null;
      if (M.rows.length && !M.semSaldo) {
        var r = M.rows[M.rows.length - 1], ks = Object.keys(c.saldosDia || {}).sort(), u = ks[ks.length - 1];
        saldo = { v: r.bal, d: r.date, fonte: M.fonteSaldo };
        if (M.fonteSaldo === 'extrato' && u && u >= r.date) saldo = { v: c.saldosDia[u] / 100, d: u, fonte: 'extrato' };
      }
      return { id: c.id, nome: c.nome, moeda: c.moeda, banco: c.banco, c: c, cats: cats, M: M, periodos: ps, ate: ps.length ? ps[ps.length - 1].ate : null,
        saldo: saldo, temDados: M.rows.length > 0, taxa: c.moeda === mp || paraPrincipal(1, c.moeda, x) != null };
    });
    var ref = null, meses = {}, falta = {};
    ws.forEach(function (w) {
      if (w.ate && (!ref || w.ate > ref)) ref = w.ate;
      w.M.keys.forEach(function (k) { meses[k] = 1; });
      if (w.temDados && !w.taxa) (falta[w.moeda] = falta[w.moeda] || []).push(w.nome);
    });
    var partial = ref && ref < fimDoMes(ref.slice(0, 7)) ? ref.slice(0, 7) : null, ks = Object.keys(meses).sort();
    return { mp: mp, ws: ws, ref: ref, partial: partial, meses: ks, completos: ks.filter(function (k) { return k !== partial; }),
      faltaCambio: Object.keys(falta).sort().map(function (m) { return { moeda: m, nomes: falta[m] }; }) };
  }
  /* o mês escolhido: os números de cada carteira na moeda dela, a cobertura e o que ficou fora das somas
     ("Entre contas suas"); total na moeda principal, ou null se falta câmbio. Carteira sem nenhum extrato não
     entra em semCobertura (ela já aparece como "sem extrato" no saldo) */
  function mesResumo(R, x, m) {
    var por = R.ws.map(function (w) {
      var g = w.M.by[m] || null, it = { n: 0, entrou: 0, saiu: 0 };
      w.M.rows.forEach(function (r) { if (r.m === m && r.kind === 'interno') { it.n++; if (r.a > 0) it.entrou += r.a; else it.saiu -= r.a; } });
      return { w: w, g: g, cob: cobreMes(w.periodos, m, R.ref), interno: it };
    });
    var total = null;
    if (!R.faltaCambio.length) {
      total = { entrou: 0, gasto: 0, saved: 0, saldo: 0, spend: {} };
      por.forEach(function (p) {
        if (!p.g) return;
        var cv = function (v) { return paraPrincipal(v, p.w.moeda, x); };
        ['entrou', 'gasto', 'saved', 'saldo'].forEach(function (k) { total[k] += cv(p.g[k]); });
        Object.keys(p.g.spend).forEach(function (id) { total.spend[id] = (total.spend[id] || 0) + cv(p.g.spend[id]); });
      });
    }
    return { m: m, por: por, total: total, semCobertura: por.filter(function (p) { return !p.cob.ok && p.w.periodos.length; }) };
  }
  /* previsão do mês em andamento: a de cada carteira com dados nele (no ritmo até o fim do período importado
     dela), somadas na moeda principal com as metas. fora: carteiras sem dados no mês. null sem mês em andamento
     ou sem câmbio. */
  function previsaoResumo(R, x, sug) {
    if (!R.partial || R.faltaCambio.length) return null;
    var o = { m: R.partial, dia: +R.ref.slice(8), dim: +fimDoMes(R.partial).slice(8), gasto: 0, proj: 0, meta: 0, falFix: 0, pend: 0, nPend: 0, por: [], fora: [] };
    R.ws.forEach(function (w) {
      if (!w.temDados) return;
      if (w.M.partial !== R.partial) { o.fora.push(w); return; }
      var ate = function (M) { return w.ate && w.ate.slice(0, 7) === R.partial && w.ate > M.lastDate ? Object.assign({}, M, { lastDate: w.ate }) : M; };
      var mf = metaDaCarteira(w.c, w.M, w.cats), P = preverMes(ate(w.M), mf, w.cats), meta = 0, cv = function (v) { return paraPrincipal(v, w.moeda, x); };
      w.cats.forEach(function (c) { if (!c.oculta) meta += mf(c.id); });
      var q = { w: w, gasto: cv(P.gasto), proj: cv(P.proj), meta: cv(meta), dia: P.day, cedo: P.day < o.dia, pend: 0, nPend: 0 };
      var rs = sug ? saidasPendentes(sug, w.id, R.partial) : [];
      if (rs.length) {
        var M2 = buildModel(w.c.months, w.c.over, x.config.titular, w.c.pais, w.cats, { dia: w.c.saldosDia, ancora: w.c.ancora }, comPendentes(w.c.transf, rs));
        q.pend = Math.max(0, q.proj - cv(preverMes(ate(M2), mf, w.cats).proj)); q.nPend = rs.length;
      }
      o.gasto += q.gasto; o.proj += q.proj; o.meta += q.meta; o.falFix += cv(P.falFix); o.pend += q.pend; o.nPend += q.nPend; o.por.push(q);
    });
    return o;
  }
  /* saídas do mês m da carteira que estão numa transferência sugerida ainda não confirmada e contam como gasto
     (sug = sugerirTransferencias). A previsão do mês as conta, porque ainda não foram confirmadas. */
  function saidasPendentes(sug, wid, m) {
    return sug.pares.filter(function (p) { return p.s.w.id === wid && p.s.r.m === m && p.s.r.kind === 'gasto'; }).map(function (p) { return p.s.r; });
  }
  /* as transferências da carteira como ficariam com essas saídas confirmadas: para medir quanto da previsão vem delas */
  function comPendentes(transf, rs) {
    var t = Object.assign({}, transf);
    rs.forEach(function (r) { t[r.id] = { c: '', id: '', lado: 's', marca: true }; });
    return t;
  }
  /* dif = previsão − meta. O estouro até o valor que vem de transferências sugeridas (pend) não conta como
     passar da meta: esse dinheiro pode não ser gasto */
  function passaMesmo(dif, pend) { return dif > Math.max(0.5, pend || 0); }
  /* ---------- transferências entre carteiras ----------
     O painel só sugere: uma saída numa carteira e uma entrada em outra, com valor e data parecidos. A pessoa
     confirma, e as duas pontas viram "Entre contas suas" (a que já era fica como está); desfazer devolve as duas
     ao que eram. Mesma moeda: valores até 1% e datas até 3 dias. Moedas diferentes: os dois lados na moeda
     principal, pelo câmbio informado (um só para todos os meses), até 6% e 5 dias.
     Saída candidata: "Envios para outra conta sua", "Pessoas, taxas e outros" (o que não tem categoria
     reconhecida) ou já "Entre contas suas". Entrada candidata: renda, outras entradas ou já "Entre contas suas".
     Par com as duas pontas já marcadas não é sugerido. Cada movimento entra em um par só: fica o de datas mais
     próximas e, no empate, o de valor mais próximo. */
  var TRANSF_FOLGA = { mesma: { valor: 0.01, dias: 3 }, outra: { valor: 0.06, dias: 5 } };
  function chavePar(sc, sid, ec, eid) { return JSON.stringify([sc, sid, ec, eid]); }
  function saidaCandidata(r) { return r.a < 0 && !r.transf && (r.kind === 'interno' || (r.kind === 'gasto' && (r.cat === 'brasil' || r.cat === 'outros'))); }
  function entradaCandidata(r) { return r.a > 0 && !r.transf && (r.kind === 'interno' || r.kind === 'renda' || r.kind === 'outras'); }
  function diasEntre(a, b) { return Math.round(Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DIA_MS); }
  /* R = resumir(x). Devolve { pares: [{ chave, s: { w, r }, e: { w, r }, dias, dif, moedas, ja: 's' | 'e' | null }]
     (mais recentes primeiro), semCambio: carteiras com extrato cujo câmbio falta, fora das sugestões com outra moeda } */
  function sugerirTransferencias(R, x) {
    var disp = {}, cand = [], semCambio = [];
    R.ws.forEach(function (w) { (w.c.sugDispensadas || []).forEach(function (k) { disp[k] = 1; }); if (w.temDados && !w.taxa) semCambio.push(w); });
    R.ws.forEach(function (ws) {
      var sai = ws.M.rows.filter(saidaCandidata);
      if (!sai.length) return;
      R.ws.forEach(function (we) {
        if (we === ws) return;
        var mesma = ws.moeda === we.moeda, f = mesma ? TRANSF_FOLGA.mesma : TRANSF_FOLGA.outra;
        if (!mesma && (!ws.taxa || !we.taxa)) return;
        var ent = we.M.rows.filter(entradaCandidata);
        sai.forEach(function (rs) {
          var vs = mesma ? -rs.a : paraPrincipal(-rs.a, ws.moeda, x);
          ent.forEach(function (re) {
            if (rs.kind === 'interno' && re.kind === 'interno') return;
            var dias = diasEntre(rs.date, re.date);
            if (dias > f.dias) return;
            var ve = mesma ? re.a : paraPrincipal(re.a, we.moeda, x), dif = Math.abs(vs - ve) / vs;
            if (dif > f.valor + 1e-9) return;
            var k = chavePar(ws.id, rs.id, we.id, re.id);
            if (disp[k]) return;
            cand.push({ chave: k, s: { w: ws, r: rs }, e: { w: we, r: re }, dias: dias, dif: dif, moedas: mesma ? [] : [ws.moeda, we.moeda].filter(function (m) { return m !== R.mp; }),
              ja: rs.kind === 'interno' ? 's' : re.kind === 'interno' ? 'e' : null });
          });
        });
      });
    });
    cand.sort(function (a, b) { return a.dias - b.dias || a.dif - b.dif || (a.s.r.date < b.s.r.date ? -1 : a.s.r.date > b.s.r.date ? 1 : 0) || (a.chave < b.chave ? -1 : 1); });
    var usado = {}, pares = [];
    cand.forEach(function (p) {
      var a = p.s.w.id + '\n' + p.s.r.id, b = p.e.w.id + '\n' + p.e.r.id;
      if (usado[a] || usado[b]) return;
      usado[a] = usado[b] = 1; pares.push(p);
    });
    pares.sort(function (a, b) { return a.s.r.date < b.s.r.date ? 1 : a.s.r.date > b.s.r.date ? -1 : 0; });
    return { pares: pares, semCambio: semCambio };
  }
  /* as transferências confirmadas: [{ s: { w, r }, e: { w, r } }] (r null se o movimento não está mais na carteira) */
  function transferenciasConfirmadas(R) {
    var por = {}, o = [];
    R.ws.forEach(function (w) { por[w.id] = w; });
    R.ws.forEach(function (w) {
      var t = w.c.transf || {}, ach = function (ww, id) { return ww ? ww.M.rows.filter(function (r) { return r.id === id; })[0] || null : null; };
      Object.keys(t).forEach(function (id) {
        if (t[id].lado !== 's' || !por[t[id].c]) return;
        o.push({ s: { w: w, r: ach(w, id), id: id }, e: { w: por[t[id].c], r: ach(por[t[id].c], t[id].id), id: t[id].id } });
      });
    });
    return o.sort(function (a, b) { var da = a.s.r ? a.s.r.date : '', db = b.s.r ? b.s.r.date : ''; return da < db ? 1 : da > db ? -1 : 0; });
  }
  function comTransf(x, fn) {
    return Object.assign({}, x, { carteiras: x.carteiras.map(function (c) {
      var t = Object.assign({}, c.transf || {}), d = (c.sugDispensadas || []).slice(), r = fn(c.id, t, d);
      return r ? Object.assign({}, c, { transf: t, sugDispensadas: d }) : c;
    }) });
  }
  /* par: { s: { c, id }, e: { c, id }, ja: 's' | 'e' | null }; a ponta que já era "Entre contas suas" fica sem marca */
  function confirmarTransferencia(x, par) {
    acharCarteira(x, par.s.c); acharCarteira(x, par.e.c);
    if (par.s.c === par.e.c) throw new Error('as duas pontas estão na mesma carteira');
    return comTransf(x, function (cid, t) {
      if (cid === par.s.c) t[par.s.id] = { c: par.e.c, id: par.e.id, lado: 's', marca: par.ja !== 's' };
      else if (cid === par.e.c) t[par.e.id] = { c: par.s.c, id: par.s.id, lado: 'e', marca: par.ja !== 'e' };
      else return false;
      return true;
    });
  }
  /* desfaz pelas duas pontas, a partir de qualquer uma (carteira e movimento) */
  function desfazerTransferencia(x, cid, id) {
    var r = (acharCarteira(x, cid).transf || {})[id];
    if (!r) return x;
    return comTransf(x, function (c, t) {
      if (c === cid) delete t[id]; else if (c === r.c) delete t[r.id]; else return false;
      return true;
    });
  }
  /* "Não são": a sugestão não volta (fica guardada nas duas carteiras) */
  function dispensarSugestao(x, par) {
    var k = chavePar(par.s.c, par.s.id, par.e.c, par.e.id);
    return comTransf(x, function (c, t, d) {
      if (c !== par.s.c && c !== par.e.c) return false;
      if (d.indexOf(k) < 0) d.push(k);
      return true;
    });
  }
  /* quantas transferências confirmadas a carteira tem (para avisar ao excluir) */
  function contarTransferencias(c) { return Object.keys((c && c.transf) || {}).length; }
  /*CORE-END*/

  var MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var S = { dados: null, months: {}, over: {}, plan: null, summary: null, ready: false, sel: null, f: [], fOpen: false, more: 12, movOpen: true, q: '', metasOpen: false, setupOpen: false, bloqueado: null, restaurar: null, apagar: false, excluir: null, importar: null, espaco: 0, semEspaco: false, model: null, div: null, dAdd: false, dCamb: false, dPaid: false };
  var M = buildModel({}, {}), SUG = null, RECS = [], RES = null, TR = null;
  /* as categorias da configuração: CATST todas (inclusive escondidas), CATSV só as visíveis, CPOR por id */
  var CATST = montarCats(null), CATSV = CATST, CPOR = {};
  try { if (localStorage.getItem('cortex-financas.mov') === '0') S.movOpen = false; } catch (e) { }
  /* a v1 e a chave antiga do titular ficam como estão, para dar para voltar atrás */
  /* a v4 grava numa chave nova; as anteriores ficam como estão, para dar para voltar atrás */
  var LS = 'cortex-financas.v4', LS_V3 = 'cortex-financas.v3', LS_V2 = 'cortex-financas.v2', LS_V1 = 'cortex-financas.v1', LS_TITULAR = 'cortex-financas.titular';

  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* todo valor aparece na moeda da configuração (a conta que o painel lê) */
  var NOME_MOEDA = { EUR: 'euro', BRL: 'real', GBP: 'libra', USD: 'dólar' };
  function moeda() { return (S.plan && S.plan.moeda) || 'EUR'; }
  function nomeMoeda(cod) { cod = cod || moeda(); return NOME_MOEDA[cod] || cod; }
  var fmtCache = {};
  function fmtDe(cod, casas) {
    var k = cod + casas;
    if (!fmtCache[k]) {
      try { fmtCache[k] = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cod, minimumFractionDigits: casas, maximumFractionDigits: casas }); }
      catch (e) { fmtCache[k] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }); }
    }
    return fmtCache[k];
  }
  /* o símbolo que o Intl usa para a moeda (€, R$, £, US$), para rótulos como "Meta (R$)" */
  function simbolo(cod) {
    cod = cod || moeda();
    var p = fmtDe(cod, 0).formatToParts(1).filter(function (x) { return x.type === 'currency'; })[0];
    return p ? p.value : cod;
  }
  var nn = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  var n2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function f2(v) { return fmtDe(moeda(), 2).format(v); }
  function f0(v) { return fmtDe(moeda(), 0).format(Math.round(v)).replace('-', '−'); }
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
  function catPor(id) { return CPOR[id] || CPOR.outros; }
  function catNome(c) { return CPOR[c.id] ? CPOR[c.id].nome : c.nome; }
  function planTotal() { var t = 0; CATSV.forEach(function (c) { t += planCat(c.id); }); return t; }
  /* campos de metas (usados em "Editar metas" e na configuração); pre separa os ids dos dois formulários */
  /* campo em branco = seguir a sugestão (ou ficar sem meta, sem extrato) */
  function metaCampo(id, rotulo, v, sug) {
    return '<label>' + esc(rotulo) + '<input id="' + id + '" type="number" min="0" step="5" inputmode="decimal" value="' + (v != null ? v : '') + '" placeholder="' + (sug != null ? 'sugestão: ' + sug : 'sem meta') + '"></label>';
  }
  function metasCampos(pre) {
    var h = '';
    CATSV.forEach(function (c) { h += metaCampo('fin-' + pre + '-' + c.id, catNome(c), metaDefinida(c.id), SUG ? SUG.cats[c.id] : null); });
    return h + metaCampo('fin-' + pre + '-poupar', 'Guardar por mês', pouparDefinido(), SUG ? SUG.poupar : null);
  }
  function lerMeta(id) { var v = $(id).value.trim(); return v === '' || isNaN(v) ? null : Math.max(0, +v); }
  function lerMetas(pre) {
    var o = { cats: {}, poupar: lerMeta('#fin-' + pre + '-poupar') };
    CATSV.forEach(function (c) { var v = lerMeta('#fin-' + pre + '-' + c.id); if (v != null) o.cats[c.id] = v; });
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
      CATSV.forEach(function (c) { o.spend[c.id] = (o.spend[c.id] || 0) + (g.spend[c.id] || 0); });
    });
    if (S.sel === 'all') {
      o.entrou /= n; o.gasto /= n; o.saved /= n; o.saldo /= n;
      CATSV.forEach(function (c) { o.spend[c.id] /= n; });
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
  /* S.dados é a v4 inteira; o painel trabalha com a carteira ativa em S.months, S.over, S.plan, S.summary e S.div
     (o formato da v3), e compor/decompor fazem a ponte */
  function dadosAtuais() {
    var base = S.dados || migrate({ v: 3, months: {}, over: {}, plan: {}, summary: null, div: null });
    return decompor(base, { months: S.months, over: S.over, plan: S.plan || {}, summary: S.summary, div: S.div });
  }
  function usarDados(x) {
    var vis = compor(x);
    S.dados = x; S.months = vis.months; S.over = vis.over; S.plan = vis.plan; S.summary = vis.summary; S.div = vis.div;
  }
  /* com dados ilegíveis (S.bloqueado), nada é gravado por cima até a pessoa decidir o que fazer */
  function localSave() {
    if (S.bloqueado) return;
    S.dados = dadosAtuais();
    try { localStorage.setItem(LS, JSON.stringify(S.dados)); S.semEspaco = false; } catch (e) {
      if (!S.semEspaco) toast('Não consegui salvar neste navegador: o espaço acabou. Baixe um backup agora para não perder o que fez.', true);
      S.semEspaco = true;
    }
    S.espaco = espacoUsado();
  }
  /* soma todas as chaves do painel: a v3 continua salva ao lado da v4 e ocupa espaço também */
  function espacoUsado() {
    var pares = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); pares.push([k, localStorage.getItem(k)]); } } catch (e) { }
    return tamanhoSalvo(pares);
  }
  function localLoad() {
    var raw = null, tit = '', velho = false;
    try {
      raw = localStorage.getItem(LS);
      if (raw == null) { velho = true; raw = localStorage.getItem(LS_V3); }
      if (raw == null) raw = localStorage.getItem(LS_V2);
      if (raw == null) {
        tit = localStorage.getItem(LS_TITULAR) || ''; raw = localStorage.getItem(LS_V1);
        if (raw == null && tit) raw = '{}';
      }
    } catch (e) { return; }
    if (raw == null) return;
    try {
      usarDados(lerSalvo(raw, tit));
      if (velho) localSave(); else S.espaco = espacoUsado();
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
    S.dados = null; S.months = {}; S.over = {}; S.plan = null; S.summary = null; S.div = null; S.bloqueado = null; S.setupOpen = false;
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
    CATST = montarCats(S.plan); CATSV = CATST.filter(function (c) { return !c.oculta; }); CPOR = {};
    CATST.forEach(function (c) { CPOR[c.id] = c; });
    var cw = cartAtual();
    M = buildModel(S.months, S.over, S.plan && S.plan.titular, S.plan && S.plan.pais, CATST, cw ? { dia: cw.saldosDia, ancora: cw.ancora } : null, cw && cw.transf);
    SUG = sugerirMetas(M, CATST);
    RECS = detectarRecorrentes(M);
    if (S.sel !== 'all' && !M.by[S.sel]) S.sel = M.complete.length ? M.complete[M.complete.length - 1] : (M.keys.length ? M.keys[M.keys.length - 1] : null);
  }

  /* ---------- importação ---------- */
  function handleFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) return Promise.resolve();
    if (S.bloqueado) { toast('Antes de importar, resolva os dados salvos que não consegui ler.', true); return Promise.resolve(); }
    if (!temLeitor(bancoAtual())) return abrirGenerico(files);
    var incoming = {}, bad = [], dup = 0, added = 0, months = 0, best = null, outras = {}, periodos = [];
    return files.reduce(function (p, f) {
      return p.then(function () { return f.text(); }).then(function (txt) {
        var rws = parseCSV(txt), tx = extractTx(rws, moeda()), sm = extractSummary(rws);
        if (!tx.length) { bad.push(f.name); moedasNoExtrato(rws).forEach(function (c) { outras[c] = 1; }); return; }
        if (sm) {
          var asOf = tx.reduce(function (a, t) { return t[0] > a ? t[0] : a; }, '');
          if (!best || asOf >= best.asOf) { sm.asOf = asOf; best = sm; }
        }
        tx.forEach(function (t) { var m = t[0].slice(0, 7); (incoming[m] = incoming[m] || []).push(t); });
        periodos.push(periodoDasDatas(tx.map(function (t) { return t[0]; })));
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
        /* o período de cada arquivo fica guardado: é ele que diz até quando a carteira tem dados */
        if (periodos.length) p = p.then(function () {
          var x = dadosAtuais();
          usarDados(Object.assign({}, x, { carteiras: x.carteiras.map(function (c) { return c.id !== x.ativa ? c : Object.assign({}, c, { periodos: periodos.reduce(juntarPeriodos, c.periodos || []) }); }) }));
          localSave();
        });
        return p;
      });
    }).then(function () {
      recompute(); render();
      if (added) toast('Adicionei ' + added + (added === 1 ? ' movimentação' : ' movimentações') + ' em ' + months + (months === 1 ? ' mês' : ' meses') + (dup ? '. ' + dup + (dup === 1 ? ' já estava salva.' : ' já estavam salvas.') : '.') + (bad.length ? ' Não li: ' + bad.join(', ') + '.' : ''));
      else if (bad.length && Object.keys(outras).length) toast('Não há conta em ' + moeda() + ' em ' + bad.join(', ') + ': o extrato tem ' + Object.keys(outras).join(', ') + '. Troque a moeda em Configurações ou baixe o extrato da conta em ' + moeda() + '.', true);
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
    } else st = origem() + ' · conta em ' + nomeMoeda();
    if (M.keys.length) st = origem() + ' · ' + st;
    if (emResumo() && RES) st = S.dados.carteiras.length + ' carteiras · somas em ' + nomeMoeda(moedaP()) + (RES.ref ? ' · dados até ' + dFull(RES.ref) : '');
    return '<div class="view-top"><div><h1 class="marca"><img src="logo.svg" alt="Nora" width="134" height="44"></h1><span class="vt-l"><span class="mono sm">' + esc(st) + '</span></span></div>' +
      (configurado() ? '<div class="grupo"><button class="pill" type="button" data-fin-setup aria-pressed="' + S.setupOpen + '">Configurações</button><button class="pill primario" type="button" data-fin-add>Adicionar extrato</button></div>' : '') + '</div>' +
      avisoEspaco() +
      (configurado() && !suportado() && !S.setupOpen && !RES ? '<p class="aviso">' + avisoSuporte() + '</p>' : '');
  }
  /* acima de 4 MB (somando a v3 guardada e a v4), sugere backup; se a gravação falhou, avisa como erro */
  function avisoEspaco() {
    if (S.semEspaco) return '<div class="aviso erro pergunta"><p>A última mudança não foi salva: o espaço deste navegador acabou. Baixe um backup para não perder o que fez.</p><button class="btn sm" type="button" data-backup="baixar">Baixar backup</button></div>';
    if (S.espaco <= ESPACO_AVISO) return '';
    return '<div class="aviso pergunta"><p>Os dados do Nora ocupam ' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(S.espaco / 1048576) + ' MB neste navegador, perto do limite de cerca de 5 MB. A cópia da versão anterior, guardada para dar para voltar, entra na conta. Baixe um backup: se o espaço acabar, o que você mudar deixa de ser salvo.</p>' +
      '<button class="btn sm" type="button" data-backup="baixar">Baixar backup</button></div>';
  }
  /* ---------- carteiras ---------- */
  var GENERICO = 'Sem leitor próprio: na primeira importação, você escolhe as colunas de data, descrição e valor e confere uma prévia.';
  function cartAtual() { return S.dados ? carteiraAtiva(S.dados) : null; }
  function bancoAtual() { var c = cartAtual(); return c ? c.banco : 'revolut'; }
  function nomeBanco(b) { var o = BANCOS.filter(function (x) { return x[0] === b; })[0]; return o ? o[1] : b; }
  /* de onde vem o extrato: o banco, ou o nome da carteira quando o banco é "Outro banco" */
  function origem() { var c = cartAtual(); return c && c.banco === 'outro' ? c.nome : nomeBanco(bancoAtual()); }
  function variasCarteiras() { return !!(S.dados && S.dados.carteiras.length > 1); }
  /* moeda principal: a de Em observação, das metas de poupança e do Resumo; com uma carteira, a dela */
  function moedaP() { return variasCarteiras() ? S.dados.config.moedaPrincipal : moeda(); }
  function fP0(v) { return fmtDe(moedaP(), 0).format(Math.round(v)).replace('-', '−'); }
  /* campos de câmbio "1 € = [ ] £", com o inverso e a data; taxa com mais de 30 dias em âmbar */
  function camposCambio(moedas, attr) {
    var mp = moedaP(), C = divState().cambios, hoje = todayIso();
    return moedas.map(function (c) {
      var cb = C[c], rt = cb && +cb.rate > 0 ? +cb.rate : 0, idade = rt && cb.data ? diasDesde(cb.data, hoje) : null, info;
      if (!rt) info = 'Sem taxa: ' + esc(c) + ' fica fora das somas.';
      else info = '1 ' + esc(simbolo(c)) + ' ≈ ' + esc(simbolo(mp)) + ' ' + esc(nr.format(1 / rt)) + (idade == null ? '' : idade > CAMBIO_ANTIGO
        ? ' · <span class="velho">informado há ' + idade + ' dias (' + esc(dFull(cb.data)) + '): confira</span>' : ' · informado em ' + esc(dFull(cb.data)));
      return '<label class="camb"><span class="cr"><span>1 ' + esc(simbolo(mp)) + ' =</span><input id="fin-' + attr + '-' + esc(c) + '" data-' + attr + '="' + esc(c) + '" type="text" inputmode="decimal" autocomplete="off" placeholder="taxa" value="' + (rt ? esc(nr.format(rt)) : '') + '" aria-label="Quantos ' + esc(c) + ' valem 1 ' + esc(mp) + '"><span>' + esc(c) + '</span></span><small>' + info + '</small></label>';
    }).join('');
  }
  /* lê os campos de câmbio: { novos: { M: { rate, data } }, ruim: moeda com valor inválido } */
  function lerCambios(attr) {
    var novos = {}, ruim = null, C = divState().cambios;
    Array.prototype.forEach.call(document.querySelectorAll('[data-' + attr + ']'), function (el) {
      var c = el.getAttribute('data-' + attr), v = el.value.trim(), rt = parseNum(v), atual = C[c];
      if (!v) return;
      if (!(rt > 0)) { ruim = c; return; }
      if (!atual || +atual.rate !== rt) novos[c] = { rate: rt, data: todayIso(), fonte: 'informado por você' };
    });
    return { novos: novos, ruim: ruim };
  }
  function resumoCambio(moedas) {
    var mp = moedaP(), C = divState().cambios, velho = false;
    var t = moedas.map(function (c) { var cb = C[c]; if (cb && cb.data && diasDesde(cb.data, todayIso()) > CAMBIO_ANTIGO) velho = true; return '1 ' + esc(simbolo(mp)) + ' = ' + esc(nr.format(+cb.rate)) + ' ' + esc(c); }).join(' · ');
    return 'Câmbio: ' + t + ' · informado por você' + (velho ? ' · <span class="velho">taxa com mais de ' + CAMBIO_ANTIGO + ' dias</span>' : '');
  }
  /* com duas ou mais carteiras, a primeira aba é o Resumo (abre nele); Em observação e as metas de poupança, que
     valem para todas, ficam lá. Com uma carteira, nada de abas e tudo fica no painel. */
  function emResumo() { return !!S.resumo && variasCarteiras(); }
  function abas() {
    if (!variasCarteiras()) return '';
    var r = emResumo();
    return '<nav class="abas" aria-label="Carteiras"><button type="button" data-carteira="resumo"' + (r ? ' aria-current="true"' : '') + '>Resumo <small>' + esc(moedaP()) + '</small></button>' + S.dados.carteiras.map(function (c) {
      return '<button type="button" data-carteira="' + esc(c.id) + '"' + (!r && c.id === S.dados.ativa ? ' aria-current="true"' : '') + '>' + esc(c.nome) + ' <small>' + esc(c.moeda) + '</small></button>';
    }).join('') + '</nav>';
  }
  function notaResumo() {
    return '<p class="passo">Em observação e Metas de poupança valem para todas as carteiras e ficam no <b>Resumo</b>.</p>';
  }
  /* ---------- Resumo ---------- */
  /* valor na moeda de uma carteira (sem casas) */
  function fW(v, cod) { return fmtDe(cod, 0).format(Math.round(v)).replace('-', '−'); }
  function nomes(l) { return l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1]; }
  function trecho(f) { return f.de === f.ate ? dFull(f.de) : f.de.slice(0, 7) === f.ate.slice(0, 7) ? +f.de.slice(8) + ' a ' + dFull(f.ate) : dFull(f.de) + ' a ' + dFull(f.ate); }
  /* as moedas das carteiras com extrato que entram nas somas por câmbio */
  function moedasConvertidas(R) { var o = {}; R.ws.forEach(function (w) { if (w.temDados && w.moeda !== R.mp) o[w.moeda] = 1; }); return Object.keys(o).sort(); }
  function avisoCambioResumo(R) {
    if (R.faltaCambio.length) return '<div class="aviso pergunta" id="fin-rfalta"><p>' + R.faltaCambio.map(function (f) {
      return 'Falta o câmbio de <b>' + esc(f.moeda) + '</b> para somar ' + (f.nomes.length === 1 ? 'a carteira ' : 'as carteiras ') + '<b>' + esc(nomes(f.nomes)) + '</b>.';
    }).join(' ') + ' Sem ' + (R.faltaCambio.length === 1 ? 'ele' : 'eles') + ', o Resumo não mostra nenhum total (cada carteira aparece na moeda dela) nem sugere transferências com outra moeda.</p><div class="grupo">' +
      R.faltaCambio.map(function (f) { return '<button class="btn sm pri" type="button" data-rcamb="' + esc(f.moeda) + '">Definir câmbio de ' + esc(f.moeda) + '</button>'; }).join('') + '</div></div>';
    var ms = moedasConvertidas(R), C = divState().cambios, hoje = todayIso();
    if (!ms.length) return '';
    return '<div class="aviso pergunta" id="fin-restima"><p>Somas em ' + esc(nomeMoeda(R.mp)) + ', estimadas com o câmbio que você informou: ' + ms.map(function (c) {
      var cb = C[c], id = cb.data ? diasDesde(cb.data, hoje) : null;
      return '<b>1 ' + esc(simbolo(R.mp)) + ' = ' + esc(nr.format(+cb.rate)) + ' ' + esc(simbolo(c)) + '</b>' + (id == null ? '' : id > CAMBIO_ANTIGO ? ' <span class="velho">(de ' + esc(dFull(cb.data)) + ', há ' + id + ' dias: confira)</span>' : ' (de ' + esc(dFull(cb.data)) + ')');
    }).join(' · ') + '. Não é a cotação de hoje.</p><button class="btn sm" type="button" data-rcamb="">Atualizar câmbio</button></div>';
  }
  function saldoCarteiras(R) {
    var x = S.dados, tot = 0, fora = [], semExtrato = [], h = '';
    R.ws.forEach(function (w) {
      var v = '';
      if (!w.temDados) { v = '<small>sem extrato</small>'; semExtrato.push(w.nome); }
      else if (!w.saldo) { v = '<small>sem saldo no extrato: fora do total</small>'; fora.push(w.nome); }
      else {
        var p = w.moeda === R.mp ? w.saldo.v : paraPrincipal(w.saldo.v, w.moeda, x);
        if (p != null) tot += p;
        v = '<b class="num">' + fW(w.saldo.v, w.moeda) + '</b>' + (w.moeda !== R.mp && p != null && !R.faltaCambio.length ? '<small>≈ ' + fP0(p) + '</small>' : '') + (w.saldo.fonte === 'estimado' ? '<small>estimado a partir dos movimentos</small>' : '');
      }
      h += '<div class="rs"><span class="rn">' + esc(w.nome) + '<small>' + (w.ate ? 'dados até ' + esc(dFull(w.ate)) : 'nenhum extrato importado') + '</small></span><span class="rv">' + v + '</span></div>';
    });
    var conv = R.ws.some(function (w) { return w.saldo && w.moeda !== R.mp; }), nenhum = !R.ws.some(function (w) { return w.saldo; });
    var semTot = (fora.length ? [nomes(fora) + ' (o extrato não traz saldo)'] : []).concat(semExtrato.length ? [nomes(semExtrato) + ' (sem extrato)'] : []), tl = R.faltaCambio.length ? '<small>sem total: falta o câmbio de ' + esc(nomes(R.faltaCambio.map(function (f) { return f.moeda; }))) + '</small>'
      : nenhum ? '<small>nenhuma carteira traz saldo</small>' : '<b class="num">' + (conv ? '≈ ' : '') + fP0(tot) + '</b>';
    h += '<div class="rs tot"><span class="rn">' + (semTot.length && !nenhum ? 'Total parcial' : 'Total') + (semTot.length && !nenhum ? '<small>sem ' + esc(semTot.join(' e ')) + '</small>' : '') + '</span><span class="rv">' + tl + '</span></div>';
    return '<section class="sec"><div class="sec-top"><h2>Saldo nas carteiras</h2><span class="hint">o saldo de cada conta; reservas e investimentos ficam nas metas de poupança</span></div><div class="card rsal">' + h + '</div></section>';
  }
  function mesesResumo(R) {
    return '<div class="rmeses" role="group" aria-label="Escolher o mês">' + R.meses.map(function (k) {
      return '<button type="button" class="btn sm" data-rmes="' + k + '" aria-pressed="' + (S.rMes === k) + '" aria-label="' + esc(mLabel(k)) + (R.partial === k ? ' (em andamento)' : '') + '">' + mShort(k) + ' ' + k.slice(2, 4) + (R.partial === k ? '*' : '') + '</button>';
    }).join('') + '</div>';
  }
  function avisoCobertura(R, Q) {
    if (!Q.semCobertura.length) return '';
    var nm = MES[+Q.m.slice(5) - 1];
    return '<div class="aviso" id="fin-rcob"><p>Nem todas as carteiras cobrem ' + esc(nm) + (R.partial === Q.m ? ' até ' + esc(dFull(R.ref)) : '') + ': os números deste mês não são a soma de todas.</p><ul class="imp-ign">' + Q.semCobertura.map(function (p) {
      return '<li><b>' + esc(p.w.nome) + '</b>: ' + (p.cob.nada ? 'nenhum extrato de ' + esc(nm) : 'sem dados de ' + p.cob.faltas.map(function (f) { return esc(trecho(f)); }).join(' e de ')) + '.</li>';
    }).join('') + '</ul></div>';
  }
  function tabelaPorCarteira(Q) {
    var h = '<div class="tw"><table class="rpor"><thead><tr><th>Carteira</th><th>Entrou</th><th>Gastou</th><th>Guardou</th><th>Saldo do mês</th></tr></thead><tbody>';
    Q.por.forEach(function (p) {
      var g = p.g, c = p.w.moeda;
      h += '<tr><td>' + esc(p.w.nome) + ' <small>' + esc(c) + '</small></td>' + (g ? '<td>' + fW(g.entrou, c) + '</td><td>' + fW(g.gasto, c) + '</td><td>' + fW(g.saved, c) + '</td><td>' + sgn(g.saldo, function (v) { return fW(v, c); }) + '</td>' : '<td colspan="4" class="sem">' + (p.w.temDados ? 'sem movimentos no mês' : 'sem extrato') + '</td>') + '</tr>';
    });
    return h + '</tbody></table></div>';
  }
  function foraDasSomas(Q) {
    var nm = MES[+Q.m.slice(5) - 1], com = Q.por.filter(function (p) { return p.interno.n; }), n = 0;
    com.forEach(function (p) { n += p.interno.n; });
    if (!n) return '<p class="passo rfora">Nenhum movimento marcado como "Entre contas suas" em ' + esc(nm) + ': nada ficou fora do Entrou e do Gastou.</p>';
    var partes = com.map(function (p) {
      var it = p.interno, c = p.w.moeda, v = [];
      if (it.saiu) v.push('saíram ' + fW(it.saiu, c)); if (it.entrou) v.push('entraram ' + fW(it.entrou, c));
      return esc(p.w.nome) + ' ' + it.n + ' (' + v.join(', ') + ')';
    });
    var lista = '';
    Q.por.forEach(function (p) { p.w.M.rows.forEach(function (r) { if (r.m === Q.m && r.kind === 'interno') lista += '<li>' + esc(dFmt(r.date)) + ' · ' + esc(p.w.nome) + ' · ' + esc(r.desc) + ': ' + (r.a > 0 ? '+' : '−') + esc(fmtDe(p.w.moeda, 2).format(Math.abs(r.a))) + '</li>'; }); });
    return '<div class="rfora"><p class="passo">Fora do Entrou e do Gastou: ' + n + (n === 1 ? ' movimento marcado' : ' movimentos marcados') + ' como "Entre contas suas" em ' + esc(nm) + ', ' + partes.join(' e ') + '.</p>' +
      '<details class="metas" id="fin-rfd"' + (S.rFora ? ' open' : '') + '><summary>Ver quais</summary><ul class="imp-ign">' + lista + '</ul><p class="passo">Para mudar, use Revisar categorias na aba da carteira. Uma transferência confirmada se desfaz em Transferências confirmadas.</p></details></div>';
  }
  function categoriasResumo(Q, conv) {
    var list = [], mx = 0, h = '';
    CATSV.forEach(function (c) { var v = Q.total.spend[c.id] || 0; if (Math.abs(v) >= 0.5) { list.push({ c: c, v: v }); mx = Math.max(mx, v); } });
    list.sort(function (a, b) { return b.v - a.v; });
    if (!list.length) h = '<p class="vazio">Sem gastos neste mês.</p>';
    list.forEach(function (x) {
      h += '<div class="cat"><i class="sw" style="background:' + colorOf(x.c) + '"></i><span class="nm">' + esc(catNome(x.c)) + '</span><span class="val">' + (conv ? '≈ ' : '') + fP0(x.v) + '</span>' +
        '<span class="track"><i style="width:' + (mx ? Math.max(0, x.v) / mx * 100 : 0).toFixed(1) + '%;background:' + colorOf(x.c) + '"></i></span></div>';
    });
    return '<div class="sec-top"><h3>Gasto por categoria</h3><span class="hint">a soma das carteiras</span></div><div class="rcats">' + h + '</div>';
  }
  function mesResumoTela(R) {
    var x = S.dados, Q = mesResumo(R, x, S.rMes), T = Q.total, conv = Q.por.some(function (p) { return p.g && p.w.moeda !== R.mp; }), ap = conv ? '≈ ' : '';
    var lab = mLabel(S.rMes), h = '<section class="sec" id="fin-rmes"><div class="sec-top"><h2>' + esc(lab.charAt(0).toUpperCase() + lab.slice(1)) + (R.partial === S.rMes ? ' <small class="hint">até ' + esc(dFull(R.ref)) + '</small>' : '') + '</h2>' +
      '<span class="hint">a soma das carteiras' + (R.partial ? ' · * mês em andamento' : '') + '</span></div>' + mesesResumo(R) + avisoCobertura(R, Q);
    if (T) {
      var n = Q.por.filter(function (p) { return p.g; }).length, sub = n === 1 ? 'só ' + esc(Q.por.filter(function (p) { return p.g; })[0].w.nome) : 'soma de ' + n + ' carteiras';
      h += '<div class="kpis">' + [['Entrou', T.entrou, 0], ['Gastou', T.gasto, 0], ['Guardou', T.saved, 0], ['Saldo do mês', T.saldo, 1]].map(function (t) {
        return '<div class="kpi"><span class="l">' + t[0] + '</span><span class="v">' + ap + (t[2] ? sgn(t[1], fP0) : fP0(t[1])) + '</span><span class="s">' + (t[2] ? 'entrou − gastou − guardou' : sub) + '</span></div>';
      }).join('') + '</div>' +
        '<details class="metas" id="fin-rpor"' + (S.rPor ? ' open' : '') + '><summary>Por carteira, cada uma na moeda dela</summary>' + tabelaPorCarteira(Q) + '</details>';
    } else h += '<p class="passo">Sem total enquanto falta câmbio. Cada carteira, na moeda dela:</p>' + tabelaPorCarteira(Q);
    h += foraDasSomas(Q);
    h += '<div class="card">' + (T ? categoriasResumo(Q, conv) : '<h3>Gasto por categoria</h3><p class="passo">Aparece depois do câmbio de ' + esc(nomes(R.faltaCambio.map(function (f) { return f.moeda; }))) + '.</p>') + '</div>';
    return h + '</section>';
  }
  /* o aviso de transferência a confirmar aparece no número da previsão e na linha de status */
  function statusPrevisao(dif, pend, fmt) {
    if (Math.abs(dif) < 0.5) return '<span class="d ok">deve fechar na meta</span>';
    if (dif < 0) return '<span class="d good">▼ deve fechar ' + fmt(-dif) + ' abaixo da meta</span>';
    return '<span class="d ' + (passaMesmo(dif, pend) ? 'bad' : 'ok') + '">▲ deve passar ' + fmt(dif) + ' da meta</span>';
  }
  function pendNum(pend, fmt) { return pend < 0.5 ? '' : '<p class="pend">inclui ' + fmt(pend) + ' a confirmar</p>'; }
  function pendFrase(pend, n, fmt) {
    return pend < 0.5 ? '' : ', mas inclui ' + fmt(pend) + (n === 1 ? ' de uma transferência sugerida ainda não confirmada' : ' de ' + n + ' transferências sugeridas ainda não confirmadas');
  }
  function pendBotao(pend) { return pend < 0.5 ? '' : '<p class="pendb"><button class="btn sm" type="button" data-irtransf>Ver transferências sugeridas</button></p>'; }
  function previsaoResumoTela(R) {
    var h = '<section class="sec" id="fin-rprev"><div class="sec-top"><h2>Previsão ' + (R.partial ? 'de ' + esc(MES[+R.partial.slice(5) - 1]) : 'do mês') + '</h2>';
    if (!R.partial) return h + '</div><div class="card"><p class="passo">O último extrato fecha ' + esc(mLabel(R.meses[R.meses.length - 1])) + '. Adicione o extrato do mês atual para ver a previsão.</p></div></section>';
    if (R.faltaCambio.length) return h + '</div><div class="card"><p class="passo">Aparece depois do câmbio de ' + esc(nomes(R.faltaCambio.map(function (f) { return f.moeda; }))) + '.</p></div></section>';
    var P = previsaoResumo(R, S.dados, TR && TR.S), conv = P.por.some(function (q) { return q.w.moeda !== R.mp; }), ap = conv ? '≈ ' : '';
    if (!P.por.length) return h + '</div><div class="card"><p class="passo">Nenhuma carteira tem movimentos de ' + esc(MES[+R.partial.slice(5) - 1]) + ' ainda.</p></div></section>';
    var dif = P.proj - P.meta, mx = Math.max(P.proj, P.meta, P.gasto, 1), fp = function (v) { return ap + fP0(v); }, st = statusPrevisao(dif, P.pend, fp), over = passaMesmo(dif, P.pend);
    var cedo = P.por.filter(function (q) { return q.cedo; });
    return h + '<span class="hint">até ' + esc(dFull(R.ref)) + ' · a soma das previsões de cada carteira</span></div><div class="card prv">' +
      '<div class="prv-n"><div><p class="l mono">Gasto até agora</p><p class="v num">' + ap + fP0(P.gasto) + '</p></div><div><p class="l mono">Previsão para ' + esc(MES[+R.partial.slice(5) - 1]) + '</p><p class="v num">' + ap + fP0(P.proj) + '</p>' + pendNum(P.pend, fp) + '</div><div><p class="l mono">Meta de gasto</p><p class="v num">' + ap + fP0(P.meta) + '</p></div></div>' +
      '<div class="ptrack" role="img" aria-label="Gasto ' + fP0(P.gasto) + ', previsão ' + fP0(P.proj) + ', meta ' + fP0(P.meta) + '"><i class="pj' + (over ? ' over' : '') + '" style="width:' + (P.proj / mx * 100).toFixed(1) + '%"></i><i class="sp" style="width:' + (P.gasto / mx * 100).toFixed(1) + '%"></i><b style="left:calc(' + (P.meta / mx * 100).toFixed(1) + '% - 1px)"></b></div>' +
      '<div class="legend"><span><i class="sw" style="background:var(--accent)"></i>gasto até agora</span><span><i class="sw" style="background:color-mix(in srgb, var(--accent) 35%, var(--raised))"></i>previsão no ritmo atual</span><span><i class="sw line"></i>meta</span></div>' +
      '<p class="s">' + st + pendFrase(P.pend, P.nPend, fp) + '. ' + P.por.map(function (q) { var a = q.w.moeda === R.mp ? '' : '≈ '; return esc(q.w.nome) + ': previsão ' + a + fP0(q.proj) + ', meta ' + a + fP0(q.meta); }).join(' · ') + '.</p>' + pendBotao(P.pend) +
      (cedo.length ? '<p class="aviso">' + cedo.map(function (q) { return '<b>' + esc(q.w.nome) + '</b> tem dados só até ' + esc(dFull(q.w.ate || q.w.M.lastDate)); }).join('; ') + ': a previsão ' + (cedo.length === 1 ? 'dela' : 'delas') + ' segue o ritmo até ali.</p>' : '') +
      (P.fora.length ? '<p class="aviso">' + esc(nomes(P.fora.map(function (w) { return w.nome; }))) + (P.fora.length === 1 ? ' não tem' : ' não têm') + ' movimentos de ' + esc(MES[+R.partial.slice(5) - 1]) + ': fora da previsão.</p>' : '') + '</div></section>';
  }
  function cambioResumo(R) {
    var ms = {}; R.ws.forEach(function (w) { if (w.moeda !== R.mp) ms[w.moeda] = 1; });
    ms = Object.keys(ms).sort();
    if (!ms.length) return '';
    return '<section class="sec"><details class="metas" id="fin-rcamb"' + (S.rCamb ? ' open' : '') + '><summary>Câmbio das carteiras (' + esc(ms.join(', ')) + ')</summary><form id="fin-frcamb">' +
      '<p class="passo">Digitado por você, nunca buscado na internet. As somas com câmbio são estimativas.</p><div class="mgrid">' + camposCambio(ms, 'cambr') + '</div>' +
      '<button class="btn sm pri" type="submit">Salvar câmbio</button></form></details></section>';
  }
  /* "Adicionar extrato" no Resumo: cada importação vai para uma carteira só; a última usada (a ativa) vem marcada */
  function escolherTela() {
    var F = S.escolher.files;
    return '<section class="sec" id="fin-escolher"><div class="card ggrid"><h2>Para qual carteira é o extrato?</h2><p class="passo">' + (F ? esc(F[0].name) + (F.length > 1 ? ' e mais ' + (F.length - 1) : '') + '. ' : '') + 'Cada importação vai para uma carteira só.</p>' +
      '<div class="radios">' + S.dados.carteiras.map(function (c) {
        var r = resumoDados(c);
        return '<label class="chk"><input type="radio" name="fin-ecart" value="' + esc(c.id) + '"' + (c.id === S.dados.ativa ? ' checked' : '') + '><span>' + esc(c.nome) + ' <small class="hint">' + esc(nomeBanco(c.banco)) + ' · ' + esc(c.moeda) + (r.meses ? '' : ' · sem extrato') + '</small></span></label>';
      }).join('') + '</div><div class="grupo"><button class="btn pri" type="button" data-escolher="ok">' + (F ? 'Importar nesta carteira' : 'Escolher arquivo') + '</button><button class="btn" type="button" data-escolher="cancelar">Cancelar</button></div></div></section>';
  }
  function telaResumo(R) {
    var h = S.escolher ? escolherTela() : '';
    if (!R.meses.length) return h + '<section class="vazio-grande"><p class="eyebrow">Resumo</p><h2>Nenhuma carteira tem extrato ainda</h2><p class="passo">Toque em Adicionar extrato e escolha a carteira. O Resumo soma todas, na moeda principal.</p>' +
      '<button class="btn pri" type="button" data-fin-add>Adicionar extrato</button></section>' + dividas() + metasPoup() + cambioResumo(R);
    return h + avisoCambioResumo(R) + transfSecao() + saldoCarteiras(R) + mesResumoTela(R) + previsaoResumoTela(R) + dividas() + metasPoup() + cambioResumo(R);
  }
  /* ---------- transferências entre carteiras (Resumo e Revisar categorias) ---------- */
  function valorMov(r, cod) { return (r.a < 0 ? '−' : '+') + fmtDe(cod, 2).format(Math.abs(r.a)); }
  var n1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  function difPar(p) {
    var d = p.dias === 0 ? 'mesmo dia' : p.dias + (p.dias === 1 ? ' dia' : ' dias') + ' de diferença', v;
    if (p.dif < 0.0005) v = p.moedas.length ? 'valores iguais' : 'mesmo valor';
    else v = 'valor ' + n1.format(p.dif * 100) + '% diferente';
    if (p.moedas.length === 1) {
      var cb = (S.dados.cambios || {})[p.moedas[0]] || {};
      v += ' pela taxa que você informou' + (cb.data ? ' em ' + dFmt(cb.data) : '') + ' (usada em todos os meses)';
    } else if (p.moedas.length) v += ' pelas taxas que você informou (usadas em todos os meses)';
    return d + ' · ' + v;
  }
  function ladoPar(rot, w, r) {
    return '<div class="tl"><span class="tlr">' + rot + ' · ' + esc(w.nome) + '</span>' + (r ? '<span class="td">' + esc(dFmt(r.date)) + ' · ' + esc(r.desc) + '</span><b class="num">' + valorMov(r, w.moeda) + '</b>'
      : '<span class="td">movimento que não está mais no extrato</span>') + '</div>';
  }
  function parTela(p) {
    var nome = esc(p.s.w.nome + ' ' + dFmt(p.s.r.date) + ' ' + valorMov(p.s.r, p.s.w.moeda) + ' e ' + p.e.w.nome + ' ' + dFmt(p.e.r.date) + ' ' + valorMov(p.e.r, p.e.w.moeda));
    var ja = p.ja === 's' ? 'A saída no ' + esc(p.s.w.nome) + ' já está marcada como entre contas suas: confirmar marca só a entrada.'
      : p.ja === 'e' ? 'A entrada no ' + esc(p.e.w.nome) + ' já está marcada como entre contas suas: confirmar marca só a saída.' : '';
    return '<div class="tpar" role="group" aria-label="' + nome + '">' + ladoPar('Saiu', p.s.w, p.s.r) + '<span class="tseta" aria-hidden="true">→</span>' + ladoPar('Entrou', p.e.w, p.e.r) +
      '<p class="tm">' + esc(difPar(p)) + (ja ? '<span class="tja">' + ja + '</span>' : '') + '</p>' +
      '<div class="grupo"><button class="btn sm pri" type="button" data-tconf="' + esc(p.chave) + '">São a mesma transferência</button><button class="btn sm" type="button" data-tdisp="' + esc(p.chave) + '">Não são</button></div></div>';
  }
  function confirmadasTela(C) {
    if (!C.length) return '';
    return '<details class="metas" id="fin-tconf"' + (S.tConf ? ' open' : '') + '><summary>Transferências confirmadas (' + C.length + ')</summary><ul class="tconf">' + C.map(function (t) {
      var lado = function (l) { return l.r ? esc(dFmt(l.r.date)) + ' · ' + esc(l.w.nome) + ' · ' + esc(l.r.desc) + ' <b class="num">' + valorMov(l.r, l.w.moeda) + '</b>' : esc(l.w.nome) + ' · movimento que não está mais no extrato'; };
      return '<li><span>' + lado(t.s) + ' → ' + lado(t.e) + '</span><button class="btn sm" type="button" data-tdesf="' + esc(t.s.w.id) + '" data-tmov="' + esc(t.s.id) + '">Desfazer</button></li>';
    }).join('') + '</ul><p class="passo">Desfazer devolve as duas pontas ao que eram: a escolha por descrição em Revisar categorias, ou o automático.</p></details>';
  }
  /* carteiras sem câmbio que deixam de ter sugestões com carteiras de outra moeda (wid: só as que envolvem ela) */
  function semCambioTransf(wid) {
    var ws = TR.R.ws.filter(function (w) { return w.temDados; });
    return TR.S.semCambio.filter(function (w) {
      var outras = ws.filter(function (o) { return o.id !== w.id && o.moeda !== w.moeda; });
      return outras.length && (!wid || w.id === wid || outras.some(function (o) { return o.id === wid; }));
    });
  }
  /* no Resumo: todas; só aparece com sugestão ou transferência confirmada */
  function transfSecao() {
    if (!TR || (!TR.S.pares.length && !TR.C.length)) return '';
    var n = TR.S.pares.length;
    return '<section class="sec" id="fin-transf"><div class="sec-top"><h2 tabindex="-1">' + (n ? 'Transferências sugeridas' : 'Transferências entre carteiras') + '</h2><span class="hint">' +
      (n ? n + (n === 1 ? ' par' : ' pares') + ' · confirme o que for dinheiro seu indo de uma conta para outra' : 'nenhuma sugestão nova') + '</span></div>' +
      (n ? '<div class="card tlist">' + TR.S.pares.map(parTela).join('') + '</div>' : '') + confirmadasTela(TR.C) + '</section>';
  }
  /* em Revisar categorias: os pares que envolvem a carteira */
  function transfBloco(wid) {
    if (!TR) return '';
    var ps = TR.S.pares.filter(function (p) { return p.s.w.id === wid || p.e.w.id === wid; }), C = TR.C.filter(function (t) { return t.s.w.id === wid || t.e.w.id === wid; }), sc = semCambioTransf(wid);
    if (!ps.length && !C.length && !sc.length) return '';
    return '<div class="rtransf" id="fin-transf"><h3 class="rvt" tabindex="-1">' + (ps.length ? 'Transferências sugeridas' : 'Transferências entre carteiras') + '</h3>' +
      (ps.length ? '<p class="passo">Uma saída numa carteira e uma entrada em outra, com valor e data parecidos. Confirme o que for dinheiro seu indo de uma conta para outra: as duas pontas saem do Entrou e do Gastou. As mesmas sugestões aparecem no Resumo.</p><div class="tlist">' + ps.map(parTela).join('') + '</div>' : '') +
      (sc.length ? '<p class="passo">' + sc.map(function (w) { return 'Defina o câmbio de ' + esc(w.moeda) + ' no Resumo para ver sugestões com ' + esc(w.nome) + '.'; }).join(' ') + '</p>' : '') + confirmadasTela(C) + '</div>';
  }
  /* depois de confirmar, dispensar ou desfazer: grava e leva o foco para a próxima sugestão (ou o título) */
  function mudarTransf(fn, msg) {
    var x = fn(dadosAtuais());
    usarDados(x); localSave(); recompute(); render();
    var nx = document.querySelector('#fin-transf [data-tconf]') || document.querySelector('#fin-transf [tabindex="-1"]') || document.querySelector('#fin-revd summary');
    if (nx) nx.focus();
    toast(msg);
  }
  function parPorChave(k) {
    var p = TR && TR.S.pares.filter(function (q) { return q.chave === k; })[0];
    return p ? { s: { c: p.s.w.id, id: p.s.r.id }, e: { c: p.e.w.id, id: p.e.r.id }, ja: p.ja, p: p } : null;
  }
  /* ---------- configuração guiada ---------- */
  /* a moeda escolhe a conta que o painel lê no extrato; o país escolhe as regras de comerciantes */
  var MOEDAS = [['EUR', 'Euro (€)'], ['BRL', 'Real (R$)'], ['GBP', 'Libra (£)'], ['USD', 'Dólar (US$)']];
  var PAISES = [['IE', 'Irlanda'], ['PT', 'Portugal'], ['BR', 'Brasil'], ['GB', 'Reino Unido']];
  function configurado() { return !!(S.plan && S.plan.configurado); }
  function temRegras(pais) { return PAISES_COM_REGRAS.indexOf(pais || 'IE') >= 0; }
  function suportado() { return !S.plan || temRegras(S.plan.pais); }
  function nomePais(cod) { var p = PAISES.filter(function (x) { return x[0] === cod; })[0]; return p ? p[1] : cod; }
  function avisoSuporte(pais) {
    pais = pais || (S.plan && S.plan.pais);
    return 'Sem regras de comerciantes de <b>' + esc(nomePais(pais)) + '</b>: categorize manualmente em Revisar categorias. ' +
      'Só marcas internacionais (Netflix, Spotify, Uber…) são reconhecidas sozinhas. Regras completas por enquanto: ' +
      PAISES_COM_REGRAS.map(nomePais).join(', ') + '.';
  }
  function opcoes(lista, sel) {
    return lista.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('');
  }
  function setup() {
    var p = S.plan || {}, primeira = !configurado();
    return '<section class="sec" id="fin-setup"><div class="sec-top"><h2>' + (primeira ? 'Antes de começar' : 'Configurações') + '</h2>' +
      '<span class="hint">tudo fica só neste navegador</span></div><div class="card"><form id="fin-fsetup" class="ggrid">' +
      '<fieldset><legend>Você</legend><div class="mgrid">' +
      '<label>Seu nome no extrato<input id="fin-s-titular" type="text" autocomplete="off" spellcheck="false" placeholder="ex.: MARIA SILVA" value="' + esc(p.titular || '') + '">' +
      '<small>Como aparece em transferências para você mesmo (ex.: "To MARIA SILVA"). Serve para reconhecer envios para outra conta sua. Pode deixar em branco.</small></label>' +
      '</div></fieldset>' + carteirasCampos() + categoriasCampos() +
      '<fieldset><legend>Metas por mês' + (variasCarteiras() ? ' de ' + esc(cartAtual().nome) : '') + ' (' + esc(simbolo()) + ')</legend><p class="passo">' + (SUG ? 'Em branco, vale a sugestão: a média dos seus primeiros meses de extrato.' : 'Pode deixar em branco: depois de importar o extrato, o painel sugere metas pela média dos seus primeiros meses.') + '</p>' +
      '<div class="mgrid">' + metasCampos('s') + '</div></fieldset>' + secaoDados() +
      '<div class="grupo"><button class="btn pri" type="submit">' + (primeira ? 'Salvar e começar' : 'Salvar configurações') + '</button>' +
      (primeira ? '' : '<button class="btn" type="button" data-fin-setup>Cancelar</button>') + '</div>' +
      '</form></div></section>';
  }
  /* as moedas da lista, mais a da carteira se ela não estiver na lista (veio de um backup) */
  function opcoesMoeda(sel) { return opcoes(MOEDAS.some(function (o) { return o[0] === sel; }) ? MOEDAS : MOEDAS.concat([[sel, sel]]), sel); }
  /* cada carteira: nome, tipo de extrato (banco), moeda e país; com extrato salvo, banco e moeda travam */
  function carteirasCampos() {
    var x = dadosAtuais(), h = '', varias = x.carteiras.length > 1;
    x.carteiras.forEach(function (c, i) {
      var k = 'fin-w-' + c.id, trava = moedaTravada(c.months), r = resumoDados(c), desc = trava ? ' disabled aria-describedby="' + k + '-trava"' : '';
      h += '<div class="wcart">' + (varias ? '<div class="wtop"><b>' + esc(c.nome) + '</b><small>' + (i === 0 ? 'principal · ' : '') +
        (r.meses ? r.meses + (r.meses === 1 ? ' mês' : ' meses') + ', ' + r.mov + ' movimentações' : 'sem extrato') + '</small>' +
        '<button class="btn sm" type="button" data-wexcluir="' + esc(c.id) + '">Excluir carteira</button></div>' : '') +
        '<div class="mgrid"><label>Nome da carteira<input id="' + k + '-nome" type="text" autocomplete="off" maxlength="40" value="' + esc(c.nome) + '"></label>' +
        '<label>Extrato<select id="' + k + '-banco"' + desc + '>' + opcoes(BANCOS, c.banco) + '</select>' +
        '<small id="' + k + '-leitor"' + (temLeitor(c.banco) ? ' hidden' : '') + '>' + GENERICO + '</small></label>' +
        '<label>Moeda da conta<select id="' + k + '-moeda"' + desc + '>' + opcoesMoeda(c.moeda) + '</select>' +
        (trava ? '' : '<small>O painel lê a conta nessa moeda do extrato e mostra tudo nela. Depois do primeiro extrato, não muda mais.</small>') + '</label>' +
        '<label>País<select id="' + k + '-pais">' + opcoes(PAISES, c.pais) + '</select><small>Escolhe as regras que reconhecem lojas e serviços.</small></label></div>' +
        (trava ? '<p class="passo" id="' + k + '-trava">Extrato e moeda não mudam depois que há extratos salvos nesta carteira: os valores estão em ' + esc(nomeMoeda(c.moeda)) + ' e não seriam convertidos. Para outro banco ou outra moeda, crie outra carteira.</p>' : '') +
        '<p class="aviso" id="' + k + '-aviso"' + (temRegras(c.pais) ? ' hidden' : '') + '>' + avisoSuporte(c.pais) + '</p></div>';
    });
    var nova = x.carteiras.length >= MAX_CARTEIRAS
      ? '<p class="passo">Já há ' + MAX_CARTEIRAS + ' carteiras, o máximo. Para criar outra, exclua uma.</p>'
      : '<details class="metas" id="fin-wnova"' + (S.wOpen ? ' open' : '') + '><summary>Adicionar carteira</summary>' +
        '<p class="passo">Uma carteira para cada conta: um banco e uma moeda. Até ' + MAX_CARTEIRAS + '. Cada uma tem a sua aba, com o extrato dela. Ao salvar, a carteira nova é criada e aberta.</p>' +
        '<div class="mgrid"><label>Nome da carteira<input id="fin-wn-nome" type="text" autocomplete="off" maxlength="40" placeholder="ex.: Wise libras"></label>' +
        '<label>Extrato<select id="fin-wn-banco">' + opcoes(BANCOS, 'revolut') + '</select><small id="fin-wn-leitor" hidden>' + GENERICO + '</small></label>' +
        '<label>Moeda da conta<select id="fin-wn-moeda">' + opcoes(MOEDAS, x.config.moedaPrincipal) + '</select></label>' +
        '<label>País<select id="fin-wn-pais">' + opcoes(PAISES, carteiraAtiva(x).pais) + '</select></label></div>' +
        '<p class="aviso" id="fin-wn-aviso"' + (temRegras(carteiraAtiva(x).pais) ? ' hidden' : '') + '>' + avisoSuporte(carteiraAtiva(x).pais) + '</p></details>';
    var mp = '';
    if (varias) {
      var mpv = x.config.moedaPrincipal, precisa = moedasSemPrincipal(x);
      mp = '<div class="wcart"><div class="mgrid"><label>Moeda principal (a soma do Resumo)<select id="fin-w-mp">' + opcoesMoeda(mpv) + '</select>' +
        '<small>Ao trocar, o câmbio informado é apagado e pedido de novo. As metas de poupança não são convertidas: os números ficam os mesmos, na moeda nova.</small></label></div>' +
        (precisa.length ? '<div id="fin-cambc-w"><p class="passo">Câmbio, digitado por você e nunca buscado na internet. As somas com câmbio são estimativas.</p><div class="mgrid">' + camposCambio(precisa, 'cambc') + '</div></div>' +
          '<p class="aviso" id="fin-cambc-troca" hidden>Ao salvar, a moeda principal muda e o câmbio acima é apagado. Depois, informe as taxas de novo.</p>' : '') + '</div>';
    }
    return '<fieldset><legend>' + (varias ? 'Carteiras' : 'Carteira') + '</legend>' + h + mp + nova + '</fieldset>';
  }
  function lerCarteira(id) {
    var k = '#fin-w-' + id, mo = $(k + '-moeda'), bc = $(k + '-banco');
    return { nome: $(k + '-nome').value, pais: $(k + '-pais').value, moeda: mo.disabled ? undefined : mo.value, banco: bc.disabled ? undefined : bc.value };
  }
  /* ---------- importador genérico: prévia e perguntas ---------- */
  /* cada escolha na tela refaz a prévia; trocar codificação ou separador relê o arquivo e refaz as sugestões */
  function mudarImportacao(t) {
    var I = S.importar, m = I.mapa, k = t.getAttribute('data-imp-campo'), v = t.value, n = +v, foco = t.id;
    if (k === 'aba') {
      try { Object.assign(I, prepararPlanilha(window.XLSX, I.bytes, I.tipo, null, n)); }
      catch (er) { toast('Não consegui ler essa aba: ' + er.message + '.', true); }
    } else if (k === 'cod' || k === 'sep') {
      try { Object.assign(I, prepararImportacao(I.bytes, null, k === 'cod' ? v : I.cod, k === 'sep' ? v : I.sep)); }
      catch (er) { toast('Não consegui ler o arquivo assim: ' + er.message + '.', true); }
    } else if (k === 'cab') {
      I.mapa = n < 0 ? { cab: -1, sep: I.sep, data: -1, desc: -1, saldo: -1, valor: { modo: 'uma', col: -1, saidas: null } } : Object.assign(sugerirColunas(I.rows[n]), { cab: n, sep: I.sep });
      if (n >= 0) perguntasImportacao(I.rows, I.mapa);
    } else if (k === 'data') { m.data = n; delete m.fmtData; }
    else if (k === 'desc') m.desc = n;
    else if (k === 'saldo') { m.saldoLinhas = v === 'l' ? detectarLinhasSaldo(I.rows, m) : null; m.saldo = v.charAt(0) === 'c' ? +v.slice(1) : -1; delete m.fmtNum; }
    else if (k === 'modo') { m.valor = v === 'duas' ? { modo: 'duas', saida: -1, entrada: -1 } : { modo: 'uma', col: -1, saidas: null }; delete m.fmtNum; }
    else if (k === 'col' || k === 'saida' || k === 'entrada') { m.valor[k] = n; delete m.fmtNum; }
    else if (k === 'fmtData' || k === 'fmtNum') m[k] = v;
    else if (k === 'sinal') m.valor.saidas = v;
    I.lembrado = false;
    render();
    var el = foco ? document.getElementById(foco) : document.querySelector('[name="' + k + '"][value="' + v + '"]');
    if (el) el.focus();
  }
  /* saldo atual digitado na prévia (o "segundo o banco", na data do último movimento do arquivo) */
  function ancoraDigitada(I) { var v = parseNum(I.ancoraTxt); return I.ancoraTxt && !isNaN(v) ? Math.round(v * 100) : null; }
  function saldoNovo(r) { var c = cartAtual(), sd = (c && c.saldosDia) || {}; return Object.keys(r.saldos).some(function (d) { return sd[d] !== r.saldos[d]; }); }
  function podeSalvar(I) { var p = I.previa; return !!(p && (p.novos || p.ancora != null || p.saldoNovo)); }
  function previaSaldo(I, r) {
    var ks = Object.keys(r.saldos);
    return '<div id="fin-i-conf">' + confSaldo(I, r) + '</div><div class="mgrid"><label>Saldo atual segundo o banco, em ' + esc(dFull(r.ate)) + ' (opcional)<input id="fin-i-ancora" type="text" inputmode="decimal" autocomplete="off" placeholder="ex.: 1.234,56" value="' + esc(I.ancoraTxt || '') + '">' +
      '<small>' + (ks.length ? 'Serve para conferir o saldo do extrato.' : 'Com ele, o painel estima o saldo de cada dia a partir dos movimentos.') + '</small></label></div>';
  }
  /* o saldo digitado só refaz esta parte e o botão (refazer a tela inteira faria perder o clique em Importar) */
  function digitouAncora(t) {
    var I = S.importar; I.ancoraTxt = t.value;
    if (!I.previa) return;
    I.previa.ancora = ancoraDigitada(I);
    $('#fin-i-conf').innerHTML = confSaldo(I, I.previa.r);
    var b = $('#fin-fimp button[type=submit]'), ok = podeSalvar(I);
    b.disabled = !ok; b.textContent = textoBotao(I);
  }
  function textoBotao(I) {
    var p = I.previa;
    return !p ? 'Importar' : p.novos ? 'Importar ' + p.novos + (p.novos === 1 ? ' movimento' : ' movimentos') : podeSalvar(I) ? 'Salvar só o saldo' : 'Nada novo para importar';
  }
  function confSaldo(I, r) {
    var h = '', an = ancoraDigitada(I), ks = Object.keys(r.saldos).sort(), m = I.mapa;
    if (ks.length) {
      var ult = ks[ks.length - 1], c = conferirSaldos(r.tx, r.saldos, an != null ? { data: r.ate, valor: an } : null), dv = c.divergencias;
      h += '<p class="passo">Saldo do fim do dia: ' + ks.length + (ks.length === 1 ? ' dia' : ' dias') + ', ' + (m.saldoLinhas ? 'das linhas "' + esc(m.saldoLinhas) + '", que não entram como movimento' : 'da coluna ' + esc(nomeColuna(I, m.saldo))) +
        '. Último: <b>' + esc(f2(r.saldos[ult] / 100)) + '</b> em ' + esc(dFull(ult)) + '.</p>';
      var rend = dv.filter(function (x) { return x.tipo === 'rendimento'; }), falta = dv.filter(function (x) { return x.tipo === 'falta'; });
      var lista = function (xs) { return '<ul class="imp-ign">' + xs.slice(0, 6).map(function (x) { return '<li>Entre ' + esc(dFull(x.de)) + ' e ' + esc(dFull(x.ate)) + ': ' + esc(sgn(x.dif / 100, f2)) + '</li>'; }).join('') + (xs.length > 6 ? '<li>e mais ' + (xs.length - 6) + '</li>' : '') + '</ul>'; };
      if (rend.length) {
        var tr = 0; rend.forEach(function (x) { tr += x.dif; });
        h += '<details class="metas"><summary>' + esc(sgn(tr / 100, f2)) + ' em ' + rend.length + (rend.length === 1 ? ' dia' : ' dias') + ': provável rendimento da conta, não listado no extrato</summary>' +
          '<p class="passo">O saldo subiu um pouco mais do que os movimentos explicam (até ' + esc(f2(RENDIMENTO_DIA / 100)) + ' por dia). Nenhum movimento é criado para isso: o saldo do extrato vale como está.</p>' + lista(rend) + '</details>';
      }
      if (falta.length) h += '<div class="aviso"><p>Em ' + falta.length + (falta.length === 1 ? ' trecho' : ' trechos') + ' o saldo do extrato não bate com o do dia anterior mais os movimentos: pode faltar alguma linha entre estes dias. Confira com o app do banco.</p>' + lista(falta) + '</div>';
      if (c.ancora) h += c.ancora.dif
        ? '<p class="aviso erro">O saldo que você informou (' + esc(f2(an / 100)) + ') não bate com o do extrato em ' + esc(dFull(r.ate)) + ' (' + esc(f2(c.ancora.extrato / 100)) + '): diferença de ' + esc(sgn(c.ancora.dif / 100, f2)) + '. Pode faltar alguma linha depois de ' + esc(dFull(ult)) + ', ou o saldo informado é de outro dia.</p>'
        : '<p class="passo">O saldo que você informou bate com o do extrato em ' + esc(dFull(r.ate)) + '.</p>';
    } else if (an != null) h += '<p class="passo">Sem saldo no extrato: o saldo de cada dia vai ser estimado a partir dos movimentos e desse saldo.</p>';
    return h;
  }
  function confirmarImportacao() {
    var I = S.importar, r = interpretarCSV(I.rows, I.mapa), porMes = {}, novos = 0, rep = 0, meses = 0;
    r.tx.forEach(function (t) { (porMes[t[0].slice(0, 7)] = porMes[t[0].slice(0, 7)] || []).push(t); });
    Object.keys(porMes).forEach(function (k) {
      var j = juntarMovimentos(S.months[k] || [], porMes[k]);
      novos += j.novos; rep += j.repetidos;
      if (j.novos) { S.months[k] = j.lista; meses++; }
    });
    /* guarda só o mapeamento (posições e formatos), debaixo do código do cabeçalho; nada do conteúdo do arquivo */
    var x = dadosAtuais();
    var an = ancoraDigitada(I);
    x = Object.assign({}, x, { carteiras: x.carteiras.map(function (c) {
      if (c.id !== x.ativa) return c;
      var n = Object.assign({}, c, { importacao: lembrarMapa(c.importacao, I.rows, I.mapa), periodos: juntarPeriodos(c.periodos, r.periodo) });
      if (Object.keys(r.saldos).length) n.saldosDia = Object.assign({}, c.saldosDia || {}, r.saldos);
      if (an != null) { n.ancora = { data: r.ate, valor: an, informadoEm: todayIso() }; delete n.ancoraDispensada; }
      return n;
    }) });
    S.importar = null;
    return enqueue(function () { usarDados(x); localSave(); }).then(function () {
      recompute(); render(); window.scrollTo(0, 0);
      toast(!novos && rep === 0 ? 'Saldo salvo.' : novos ? 'Adicionei ' + novos + (novos === 1 ? ' movimentação' : ' movimentações') + ' em ' + meses + (meses === 1 ? ' mês' : ' meses') + (rep ? '. ' + rep + (rep === 1 ? ' já estava salva.' : ' já estavam salvas.') : '.')
        : 'Nada novo: ' + (rep === 1 ? 'a movimentação desse arquivo já estava salva.' : 'as ' + rep + ' movimentações desse arquivo já estavam salvas.'));
    });
  }
  function abrirGenerico(files) {
    if (files.length > 1) toast('Um arquivo por vez neste banco: abri só ' + files[0].name + '.');
    var f = files[0];
    return f.arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf), c = cartAtual(), tipo = tipoArquivo(b), lem = c && c.importacao;
      if (tipo === 'pdf') throw new Error('PDF não dá para ler; baixe o extrato em CSV ou planilha (.xls, .xlsx)');
      if (tipo === 'zip') throw new Error('é um arquivo compactado, não uma planilha');
      if (tipo === 'senha') throw new Error(SENHA);
      if (tipo === 'vazio') throw new Error('o arquivo está vazio');
      if (!ehPlanilha(tipo)) return Object.assign({ nome: f.name, bytes: b }, prepararImportacao(b, lem));
      return carregarLeitorPlanilhas().then(function (X) { return Object.assign({ nome: f.name, bytes: b, tipo: tipo }, prepararPlanilha(X, b, tipo, lem)); });
    }).then(function (I) {
      S.importar = I; render(); window.scrollTo(0, 0);
    }).catch(function (e) { toast('Não consegui ler ' + f.name + ': ' + ((e && e.message) || e) + '.', true); });
  }
  /* o leitor de planilhas (vendor/sheetjs, 0,5 MB) só entra na página quando a pessoa escolhe uma planilha */
  var leitorPlanilhas = null;
  function carregarLeitorPlanilhas() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (leitorPlanilhas) return leitorPlanilhas;
    leitorPlanilhas = new Promise(function (ok, falhou) {
      var s = document.createElement('script');
      s.src = 'vendor/sheetjs/xlsx.core.min.js';
      s.onload = function () { if (window.XLSX) ok(window.XLSX); else s.onerror(); };
      s.onerror = function () { leitorPlanilhas = null; s.remove(); falhou(new Error('o leitor de planilhas não abriu')); };
      document.head.appendChild(s);
    });
    return leitorPlanilhas;
  }
  var NOME_FMT_DATA = { dmy: 'dia/mês/ano', mdy: 'mês/dia/ano', ymd: 'ano-mês-dia', texto: 'com o mês por extenso' };
  var NOME_FMT_NUM = { virgula: '1.234,56', ponto: '1,234.56' };
  function nomeColuna(I, i) { var c = String(I.rows[I.mapa.cab][i] || '').trim(); return c || 'coluna ' + (i + 1); }
  function opColunas(I, sel, vazio) {
    return '<option value="-1"' + (sel < 0 ? ' selected' : '') + '>' + vazio + '</option>' + I.rows[I.mapa.cab].map(function (c, i) {
      return '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + esc(nomeColuna(I, i)) + '</option>';
    }).join('');
  }
  /* papel do saldo: nenhum, uma coluna, ou linhas próprias com uma descrição (ex.: "Saldo Diário") */
  function opSaldo(I) {
    var m = I.mapa, rot = m.saldoLinhas || detectarLinhasSaldo(I.rows, m), o = '<option value="-1"' + (m.saldo < 0 && !m.saldoLinhas ? ' selected' : '') + '>Sem saldo</option>';
    if (rot) o += '<option value="l"' + (m.saldoLinhas ? ' selected' : '') + '>Linhas "' + esc(rot) + '"</option>';
    return o + I.rows[m.cab].map(function (c, i) {
      return '<option value="c' + i + '"' + (i === m.saldo ? ' selected' : '') + '>Coluna ' + esc(nomeColuna(I, i)) + '</option>';
    }).join('');
  }
  function radios(nome, ops, sel) {
    return '<div class="radios">' + ops.map(function (o) {
      return '<label class="chk"><input type="radio" name="' + nome + '" value="' + o[0] + '" data-imp-campo="' + nome + '"' + (o[0] === sel ? ' checked' : '') + '>' + o[1] + '</label>';
    }).join('') + '</div>';
  }
  function celulas(r) { return r.map(function (c) { return String(c).trim(); }).filter(Boolean).join(' · ').slice(0, 90); }
  function telaImportar() {
    var I = S.importar, m = I.mapa, c = cartAtual(), h = '';
    var cabs = [], ix = 0;
    I.rows.slice(0, 40).forEach(function (r, i) { if (r.some(function (x) { return String(x).trim(); }) && ix++ < 25) cabs.push([String(i), 'Linha ' + (i + 1) + ': ' + celulas(r).slice(0, 60)]); });
    h += (I.lembrado ? '<p class="aviso">Reconheci o formato deste arquivo e usei as colunas da última importação. Confira a prévia.</p>'
      : '<p class="passo">Diga quais colunas são a data, a descrição e o valor. O que o painel detectou já vem marcado: confira.</p>') +
      '<fieldset><legend>Arquivo</legend><div class="mgrid">' + (I.tipo
        ? (I.abas.length > 1 ? '<label>Aba<select id="fin-i-aba" data-imp-campo="aba">' + opcoes(I.abas.map(function (a, i) { return [String(i), a]; }), String(I.aba)) + '</select><small>A planilha tem ' + I.abas.length + ' abas com dados.</small></label>' : '')
        : '<label>Codificação<select id="fin-i-cod" data-imp-campo="cod">' + opcoes([['utf-8', 'UTF-8'], ['latin1', 'Latin-1 (Windows)']], I.cod) + '</select><small>Se aparecerem letras trocadas (ex.: "HistÃ³rico"), troque aqui.</small></label>' +
          '<label>Separador<select id="fin-i-sep" data-imp-campo="sep">' + opcoes(SEPARADORES, I.sep) + '</select></label>') +
      '<label>Linha do cabeçalho<select id="fin-i-cab" data-imp-campo="cab"><option value="-1"' + (m.cab < 0 ? ' selected' : '') + '>Escolha a linha com os nomes das colunas</option>' + opcoes(cabs, String(m.cab)) + '</select></label></div></fieldset>';
    var q = m.cab < 0 ? [{ id: 'cab' }] : perguntasImportacao(I.rows, m);
    if (m.cab >= 0) {
      var v = m.valor;
      h += '<fieldset><legend>Colunas</legend><div class="mgrid">' +
        '<label>Data<select id="fin-i-data" data-imp-campo="data">' + opColunas(I, m.data, 'Escolha') + '</select></label>' +
        '<label>Descrição<select id="fin-i-desc" data-imp-campo="desc">' + opColunas(I, m.desc, 'Escolha') + '</select></label>' +
        '<label>Valor em<select id="fin-i-modo" data-imp-campo="modo">' + opcoes([['uma', 'Uma coluna'], ['duas', 'Duas colunas: saídas e entradas']], v.modo) + '</select></label>' +
        (v.modo === 'duas'
          ? '<label>Saídas (débitos)<select id="fin-i-saida" data-imp-campo="saida">' + opColunas(I, v.saida, 'Escolha') + '</select></label>' +
            '<label>Entradas (créditos)<select id="fin-i-entrada" data-imp-campo="entrada">' + opColunas(I, v.entrada, 'Escolha') + '</select></label>'
          : '<label>Valor<select id="fin-i-col" data-imp-campo="col">' + opColunas(I, v.col, 'Escolha') + '</select></label>') +
        '<label>Saldo (fim do dia)<select id="fin-i-saldo" data-imp-campo="saldo">' + opSaldo(I) + '</select><small>Opcional. O saldo nunca entra como movimento: vale para o fim do dia.</small></label>' +
        '</div></fieldset>';
      var perg = '';
      q.forEach(function (x) {
        if (x.id === 'fmtData' && x.erro) perg += '<p class="aviso erro">A coluna ' + esc(nomeColuna(I, m.data)) + ' não tem datas num formato só. Confira se é a coluna certa.</p>';
        else if (x.id === 'fmtData') perg += '<fieldset><legend>Formato da data</legend><p class="passo">Datas como <b>' + esc(x.exemplo) + '</b> servem para mais de um formato. Como o banco escreve?</p>' +
          radios('fmtData', x.opcoes.map(function (f) { return [f, NOME_FMT_DATA[f] + ': ' + esc(dFull(lerData(x.exemplo, f)))]; }), m.fmtData) + '</fieldset>';
        else if (x.id === 'saldoValor') perg += '<p class="aviso erro">A mesma coluna não pode ser o valor do movimento e o saldo. Escolha outra para o saldo, ou "Sem saldo".</p>';
        else if (x.id === 'fmtNum' && x.erro) perg += '<p class="aviso erro">Há valores que não são número nas colunas escolhidas. Confira as colunas de valor e de saldo.</p>';
        else if (x.id === 'fmtNum') perg += '<fieldset><legend>Formato do número</legend><p class="passo">Valores como <b>' + esc(x.exemplo) + '</b> servem para os dois formatos. Como o banco escreve?</p>' +
          radios('fmtNum', x.opcoes.map(function (f) { return [f, NOME_FMT_NUM[f] + ': ' + esc(x.exemplo) + ' = ' + esc(f2(lerNumero(x.exemplo, f) / 100))]; }), m.fmtNum) + '</fieldset>';
        else if (x.id === 'sinal') perg += '<fieldset><legend>Saídas</legend><p class="passo">Como as saídas (débitos) aparecem na coluna ' + esc(nomeColuna(I, v.col)) + '? No arquivo há ' +
          x.pos + (x.pos === 1 ? ' valor positivo' : ' valores positivos') + ' e ' + x.neg + (x.neg === 1 ? ' negativo' : ' negativos') + '.</p>' +
          radios('sinal', [['negativas', 'Com sinal de menos (−50,00); as entradas vêm sem sinal'], ['positivas', 'Sem sinal (50,00); as entradas é que vêm com menos']], v.saidas) + '</fieldset>';
      });
      h += perg;
    }
    var pend = q.length > 0, r = null, novos = 0, rep = 0;
    if (!pend) {
      r = interpretarCSV(I.rows, m);
      var porMes = {};
      r.tx.forEach(function (t) { (porMes[t[0].slice(0, 7)] = porMes[t[0].slice(0, 7)] || []).push(t); });
      Object.keys(porMes).forEach(function (k) { var j = juntarMovimentos(S.months[k] || [], porMes[k]); novos += j.novos; rep += j.repetidos; });
      I.previa = { r: r, novos: novos, ancora: ancoraDigitada(I), saldoNovo: saldoNovo(r) };
      h += '<fieldset><legend>Prévia</legend>' + (r.tx.length
        ? '<p class="passo">Lido como: datas ' + NOME_FMT_DATA[m.fmtData] + (m.fmtNum ? ', números ' + NOME_FMT_NUM[m.fmtNum] : '') + ', valores em ' + esc(nomeMoeda()) + '. Confira com o app do banco: o período e os totais devem bater.</p>' +
          '<div class="imp-tot"><div><span>Período do extrato</span><b>' + esc(dFull(r.periodo.de)) + ' a ' + esc(dFull(r.periodo.ate)) + '</b>' +
          (r.periodo.fonte === 'arquivo' ? '<small>como o arquivo informa' + (r.periodo.de !== r.de || r.periodo.ate !== r.ate ? '; movimentos de ' + esc(dFmt(r.de)) + ' a ' + esc(dFmt(r.ate)) : '') + '</small>' : '<small>da primeira à última data do arquivo</small>') + '</div><div><span>Movimentos</span><b>' + r.tx.length + '</b></div>' +
          '<div><span>Entradas</span><b class="num pos">+' + f2(r.entradas / 100) + '</b></div><div><span>Saídas</span><b class="num neg">−' + f2(-r.saidas / 100) + '</b></div></div>' +
          '<div class="tw"><table class="imp"><thead><tr><th>Linha</th><th>Data</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>' +
          r.tx.slice(0, 5).map(function (t, i) {
            var n = r.linhas[i];
            return '<tr><td>' + n + '</td><td>' + esc(dFull(t[0])) + '</td><td class="ds">' + esc(t[1]) + '<small>no arquivo: ' + esc(celulas(I.rows[n - 1])) + '</small></td><td class="num ' + (t[3] < 0 ? 'neg' : 'pos') + '">' + (t[3] < 0 ? '−' : '+') + f2(Math.abs(t[3]) / 100) + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          (r.ignoradas.length ? '<details class="metas"><summary>' + r.ignoradas.length + (r.ignoradas.length === 1 ? ' linha ignorada' : ' linhas ignoradas') + ' (rodapé, totais ou sem valor)</summary><ul class="imp-ign">' +
            r.ignoradas.slice(0, 20).map(function (x) { return '<li>Linha ' + x.n + ', ' + x.motivo + ': ' + esc(celulas(x.celulas)) + '</li>'; }).join('') + '</ul></details>' : '') +
          (rep ? '<p class="aviso">' + rep + (rep === 1 ? ' movimento já estava salvo e vai ser ignorado' : ' movimentos já estavam salvos e vão ser ignorados') + ' (mesma data, descrição e valor).</p>' : '') +
          previaSaldo(I, r)
        : '<p class="aviso erro">Nenhum movimento entendido com essas colunas. Confira a linha do cabeçalho e as colunas.</p>') + '</fieldset>';
    }
    return '<section class="sec" id="fin-imp"><div class="sec-top"><h2>Importar extrato</h2><span class="hint">' + esc(I.nome) + ' · ' + esc(c ? c.nome : '') + '</span></div>' +
      '<div class="card"><form id="fin-fimp" class="ggrid">' + h +
      '<div class="grupo"><button class="btn pri" type="submit"' + (pend || !r || !podeSalvar(I) ? ' disabled aria-describedby="fin-i-falta"' : '') + '>' +
      (pend || !r ? 'Importar' : textoBotao(I)) + '</button>' +
      '<button class="btn" type="button" data-imp="cancelar">Cancelar</button></div>' +
      (pend ? '<p class="passo" id="fin-i-falta">Responda o que falta acima para ver a prévia.</p>' : '') + '</form></div></section>';
  }
  function telaExcluirCarteira() {
    var x = dadosAtuais(), c = x.carteiras.filter(function (w) { return w.id === S.excluir; })[0], r = resumoDados(c);
    var prox = x.carteiras[0].id === c.id ? x.carteiras[1] : null;
    var oQue = r.meses ? r.meses + (r.meses === 1 ? ' mês' : ' meses') + ' e ' + r.mov + ' movimentações (' + (r.meses === 1 ? mLabel(r.de) : mLabel(r.de) + ' a ' + mLabel(r.ate)) + ')' : 'a carteira, que ainda não tem extrato';
    return '<section class="sec"><div class="sec-top"><h2>Excluir a carteira ' + esc(c.nome) + '</h2></div><div class="card ggrid">' +
      '<p class="aviso erro">Isso apaga deste navegador ' + esc(oQue) + ', com as escolhas de categoria e as metas por mês dessa carteira. Não dá para desfazer.</p>' +
      '<p>As outras carteiras, a configuração, Em observação e as metas de poupança ficam.</p>' +
      (contarTransferencias(c) ? '<p class="aviso">' + (contarTransferencias(c) === 1 ? 'A transferência confirmada' : 'As ' + contarTransferencias(c) + ' transferências confirmadas') + ' com outras carteiras se desfaz' + (contarTransferencias(c) === 1 ? '' : 'em') + ': a outra ponta volta ao que era.</p>' : '') +
      (prox ? '<p class="aviso">' + esc(prox.nome) + ' passa a ser a carteira principal' + (prox.moeda !== c.moeda ? ', em ' + esc(nomeMoeda(prox.moeda)) + ': o câmbio de Em observação terá de ser informado de novo, e os valores das metas de poupança não são convertidos.' : '.') + '</p>' : '') +
      '<div class="grupo"><button class="pill perigo" type="button" data-excluir="confirmar">Excluir carteira</button>' +
      '<button class="btn" type="button" data-backup="baixar">Baixar backup antes</button>' +
      '<button class="btn" type="button" data-excluir="cancelar">Cancelar</button></div></div></section>';
  }
  /* renomear, marcar como conta fixa, esconder, excluir (só as criadas) e criar categorias */
  function categoriasCampos() {
    var cont = {}, livres = slotsLivres(S.plan), h = '';
    M.rows.forEach(function (r) { if (r.kind === 'gasto') cont[r.cat] = (cont[r.cat] || 0) + 1; });
    CATST.forEach(function (c) {
      var k = 'fin-k-' + c.id, n = cont[c.id] || 0, outros = c.id === 'outros';
      h += '<div class="crow' + (c.oculta ? ' oculta' : '') + '"><i class="sw" style="background:' + colorOf(c) + '"></i>' +
        '<label class="cnome"><span class="vh">Nome da categoria ' + esc(c.padrao) + '</span><input id="' + k + '-nome" type="text" autocomplete="off" maxlength="40" placeholder="' + esc(c.padrao) + '" value="' + esc(c.propria || c.nome !== c.padrao ? c.nome : '') + '"></label>' +
        '<label class="chk"><input id="' + k + '-fixa" type="checkbox"' + (c.fixa ? ' checked' : '') + '>Conta fixa</label>' +
        (outros ? '<span></span>' : '<label class="chk"><input id="' + k + '-oculta" type="checkbox"' + (c.oculta ? ' checked' : '') + '>Esconder</label>') +
        (c.propria ? '<label class="chk"><input id="' + k + '-excluir" type="checkbox">Excluir</label>' : '<span></span>') +
        '<small>' + (c.oculta ? 'escondida' : n + (n === 1 ? ' movimento' : ' movimentos')) + '</small></div>';
    });
    return '<fieldset><legend>Categorias</legend><details class="metas" id="fin-kedit"' + (S.kOpen ? ' open' : '') + '><summary>Renomear, esconder ou criar categorias</summary>' +
      '<p class="passo">Nome em branco volta ao nome de fábrica. "Conta fixa" entra na previsão pela meta, e não pelo ritmo do mês. ' +
      'Ao esconder ou excluir, os movimentos vão para ' + esc(catPor('outros').nome) + '; ao mostrar de novo uma categoria escondida, voltam.</p>' +
      '<div class="clista">' + h + '</div>' +
      '<div class="mgrid"><label>Nova categoria<input id="fin-k-nova" type="text" autocomplete="off" maxlength="40" placeholder="ex.: Educação"' + (livres.length ? '' : ' aria-describedby="fin-k-nova-d"') + '>' +
      '<small id="fin-k-nova-d">' + (livres.length ? (livres.length === 1 ? '1 cor livre.' : livres.length + ' cores livres.') + ' Depois, escolha a categoria dos comerciantes em Revisar categorias.' : 'As ' + MAX_CORES + ' cores estão em uso: esconda uma categoria para liberar a cor dela.') + '</small></label></div>' +
      '</details></fieldset>';
  }
  /* lê o editor de categorias para dentro de um plan novo; devolve { plan, erro, tirar } (erro só ao criar sem cor livre;
     tirar = categorias criadas que a pessoa excluiu) */
  function lerCategorias(p) {
    var nomes = {}, ocultas = [], fixas = [], proprias = [], tirar = [];
    CATST.forEach(function (c) {
      var k = '#fin-k-' + c.id, nm = $(k + '-nome').value.trim(), oc = $(k + '-oculta'), ex = $(k + '-excluir');
      if (ex && ex.checked) { tirar.push(c.id); return; }
      if (c.propria) proprias.push({ id: c.id, nome: nm || c.nome, slot: c.slot });
      else if (nm && nm !== c.padrao) nomes[c.id] = nm;
      if (oc && oc.checked) ocultas.push(c.id);
      if ($(k + '-fixa').checked) fixas.push(c.id);
    });
    var np = Object.assign({}, p, { nomes: nomes, ocultas: ocultas, fixas: fixas, proprias: proprias }), nova = $('#fin-k-nova').value.trim(), erro = null;
    if (nova) { try { np = criarCategoria(np, nova); } catch (e) { erro = 'Não criei "' + nova + '": ' + e.message + '.'; } }
    return { plan: np, erro: erro, tirar: tirar };
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
    var R = S.restaurar, B = resumoBackup(R.dados), ag = dadosAtuais(), nAg = ag.carteiras.length;
    var atual = S.bloqueado ? 'os dados ilegíveis salvos neste navegador' : (temDados() ? 'tudo o que está salvo neste navegador: ' + (nAg > 1 ? nAg + ' carteiras (' + nomes(ag.carteiras.map(function (c) { return c.nome; })) + '), ' : '') + resumoTxt(ag) : '');
    var mp = B.moedaPrincipal, extra = [];
    if (B.cambios.length) extra.push('Câmbio: ' + B.cambios.map(function (c) {
      return '1 ' + esc(simbolo(mp)) + ' = ' + esc(nr.format(c.rate)) + ' ' + esc(simbolo(c.moeda)) + (c.data ? ' (informado em ' + esc(dFull(c.data)) + ')' : '');
    }).join(' · ') + '.');
    if (B.transf || B.dispensadas) extra.push([B.transf ? B.transf + (B.transf === 1 ? ' transferência entre carteiras confirmada' : ' transferências entre carteiras confirmadas') : '',
      B.dispensadas ? B.dispensadas + (B.dispensadas === 1 ? ' sugestão dispensada' : ' sugestões dispensadas') : ''].filter(Boolean).join(' e ') + '.');
    var col = B.carteiras.filter(function (c) { return c.colunas; });
    if (col.length) extra.push('Colunas do importador lembradas para ' + esc(nomes(col.map(function (c) { return c.nome; }))) + '.');
    return '<section class="sec"><div class="sec-top"><h2>Restaurar backup</h2><span class="hint">' + esc(R.nome) + '</span></div><div class="card ggrid">' +
      '<p>No arquivo: <b>' + (B.carteiras.length === 1 ? 'uma carteira' : B.carteiras.length + ' carteiras') + '</b>, somas em ' + esc(nomeMoeda(mp)) + (B.titular ? ', titular ' + esc(B.titular) : '') + '.</p>' +
      '<div class="tw"><table class="rpor rbk"><thead><tr><th>Carteira</th><th>Moeda</th><th>Meses</th><th>Período dos extratos</th><th>Movimentos</th></tr></thead><tbody>' +
      B.carteiras.map(function (c) {
        return '<tr><td>' + esc(c.nome) + '</td><td data-l="Moeda">' + esc(c.moeda) + '</td>' + (c.mov ? '<td data-l="Meses">' + c.meses + '</td><td data-l="Período">' + (c.de ? esc(dFull(c.de)) + ' a ' + esc(dFull(c.ate)) + (c.trechos > 1 ? ' <small>em ' + c.trechos + ' trechos</small>' : '') : '–') + '</td><td data-l="Movimentos">' + c.mov + '</td>' : '<td colspan="3" class="sem">sem extrato</td>') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      (extra.length ? '<ul class="bkx">' + extra.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' : '') +
      (atual ? '<p class="aviso">Isso substitui ' + esc(atual) + '. Não dá para desfazer.</p>' : '') +
      '<div class="grupo"><button class="btn pri" type="button" data-restaurar="confirmar">' + (atual ? 'Substituir tudo pelos dados do backup' : 'Restaurar') + '</button>' +
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
    if (!temLeitor(bancoAtual())) return '<section class="vazio-grande"><p class="eyebrow">Primeiro extrato</p><h2>Nenhum extrato salvo ainda</h2>' +
      '<ol><li>No app ou no site de ' + esc(origem()) + ', baixe o extrato da conta em CSV ou planilha (.xls, .xlsx).</li><li>Toque em Adicionar extrato ou arraste o arquivo para esta página.</li>' +
      '<li>Na primeira vez, diga quais colunas são a data, a descrição e o valor, e confira a prévia antes de importar.</li></ol>' +
      '<button class="btn pri" type="button" data-fin-add>Escolher arquivo</button></section>';
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
      CATSV.forEach(function (c) {
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
    CATSV.forEach(function (c) { leg += '<span><i class="sw" style="background:' + colorOf(c) + '"></i>' + esc(catNome(c)) + '</span>'; });
    leg += '<span><i class="sw line"></i>Entrou no mês</span>';
    return '<section class="sec"><div class="sec-top"><h2>Gastos por mês</h2><span class="hint">Toque numa barra para ver o mês' + (M.partial ? ' · * mês em andamento' : '') + '</span></div><div class="card">' +
      '<div class="chart"><div class="yax" aria-hidden="true"><div class="in">' + yl + '</div></div><div class="cscroll"><div class="plot" style="--n:' + ks.length + '"><div class="gl" aria-hidden="true">' + gl + '</div><div class="cols">' + cols + '</div></div></div></div>' +
      '<div class="legend">' + leg + '</div></div></section>';
  }
  function catPanel() {
    var s = periodStats(), all = S.sel === 'all', list = [], mx = 0;
    CATSV.forEach(function (c) {
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
    if (r.kind === 'gasto') { var c = catPor(r.cat); return '<i class="sw" style="background:' + colorOf(c) + '"></i>' + esc(catNome(c)); }
    var t = { renda: 'Renda', outras: 'Outra entrada', flex: 'Reserva (Flexible)', invest: 'Investimento', interno: 'Entre contas suas' }[r.kind];
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
    CATSV.forEach(function (c) { fl.push([c.id, catNome(c), colorOf(c)]); });
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
    CATSV.forEach(function (c) {
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
      if (r.baseKind !== 'gasto' || (r.transf && r.transf.marca)) return;
      var x = mp[r.key] || (mp[r.key] = { key: r.key, desc: r.desc, n: 0, total: 0, eff: '', effs: {}, autos: {}, auto: r.auto });
      var e = r.kind === 'gasto' ? r.cat : r.kind === 'invest' ? '_invest' : '_ignore';
      x.n++; x.total -= r.a; x.effs[e] = (x.effs[e] || 0) + 1; x.autos[r.auto] = 1; x.eff = e;
    });
    return Object.keys(mp).map(function (k) { var x = mp[k]; if (Object.keys(x.effs).length > 1) x.eff = ''; return x; }).sort(function (a, b) { return Math.abs(b.total) - Math.abs(a.total); });
  }
  /* as entradas, agrupadas pela descrição (chave '+DESCRIÇÃO') */
  function entradas() {
    var mp = {};
    M.rows.forEach(function (r) {
      if (!r.keyE || (r.transf && r.transf.marca)) return;
      var x = mp[r.keyE] || (mp[r.keyE] = { key: r.keyE, desc: r.desc, n: 0, total: 0, eff: '', effs: {}, autos: {} });
      var e = ENTRADA[r.kind] || '_outras';
      x.n++; x.total += r.a; x.effs[e] = (x.effs[e] || 0) + 1; x.autos[r.autoE] = 1; x.eff = e;
    });
    return Object.keys(mp).map(function (k) { var x = mp[k]; if (Object.keys(x.effs).length > 1) x.eff = ''; return x; }).sort(function (a, b) { return b.total - a.total; });
  }
  var NOME_ENTRADA = { _renda: 'Renda', _outras: 'Outras entradas', _ignore: 'Entre contas suas', _invest: 'Resgate de investimento' };
  function optionsEntrada(sel, volta) {
    var o = sel === '' ? '<option value="" selected disabled>Em mais de um tipo</option>' : '';
    if (volta) o += '<option value="_auto">Voltar ao automático</option>';
    [['_renda', 'Renda'], ['_outras', 'Outras entradas'], ['_ignore', 'Entre contas suas'], ['_invest', 'Resgate de investimento']].forEach(function (x) {
      o += '<option value="' + x[0] + '"' + (sel === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
    });
    return o;
  }
  function effNome(e) { return e === '_invest' ? 'Investimento' : e === '_ignore' ? 'Entre contas suas' : (CPOR[e] ? CPOR[e].nome : e); }
  function optionsFor(sel, volta) {
    var o = sel === '' ? '<option value="" selected disabled>Em mais de uma categoria</option>' : '';
    if (volta) o += '<option value="_auto">Voltar ao automático</option>';
    CATSV.forEach(function (c) { o += '<option value="' + c.id + '"' + (sel === c.id ? ' selected' : '') + '>' + esc(catNome(c)) + '</option>'; });
    o += '<option value="_invest"' + (sel === '_invest' ? ' selected' : '') + '>Investimento (não é gasto)</option>';
    o += '<option value="_ignore"' + (sel === '_ignore' ? ' selected' : '') + '>Entre contas suas</option>';
    return o;
  }
  function revList() {
    var q = S.q.trim().toUpperCase(), all = merchants().filter(function (x) { return !q || x.key.indexOf(q) >= 0; }), h = '';
    var ent = entradas().filter(function (x) { return !q || x.key.indexOf(q) >= 0; });
    if (!all.length && !ent.length) return '<p class="vazio">Nada encontrado.</p>';
    if (all.length) h += '<h3 class="rvt">Saídas</h3>';
    all.slice(0, 40).forEach(function (x) {
      h += '<div class="rrow"><div class="n">' + esc(x.desc) + '<small>' + x.n + (x.n === 1 ? ' movimento · ' : ' movimentos · ') + f2(x.total) + (S.over[x.key] ? ' · categoria sua' : '') + (x.eff === '' ? ' · hoje dividido: ' + Object.keys(x.effs).map(function (e) { return effNome(e) + ' (' + x.effs[e] + ')'; }).join(', ') + '. Escolha uma para todos.' : '') + '</small></div>' +
        '<select data-ov="' + esc(x.key) + '" aria-label="Categoria de ' + esc(x.desc) + '">' + optionsFor(x.eff, !!S.over[x.key] && Object.keys(x.autos).length > 1) + '</select></div>';
    });
    if (all.length > 40) h += '<p class="passo" style="padding-top:12px">Mostrando 40 de ' + all.length + '. Use a busca para achar os outros.</p>';
    if (ent.length) h += '<h3 class="rvt">Entradas</h3>';
    ent.slice(0, 40).forEach(function (x) {
      h += '<div class="rrow"><div class="n">' + esc(x.desc) + '<small>' + x.n + (x.n === 1 ? ' movimento · +' : ' movimentos · +') + f2(x.total) + (S.over[x.key] ? ' · escolha sua' : '') +
        (x.eff === '' ? ' · hoje dividido: ' + Object.keys(x.effs).map(function (e) { return NOME_ENTRADA[e] + ' (' + x.effs[e] + ')'; }).join(', ') + '. Escolha um para todos.' : '') + '</small></div>' +
        '<select data-ov="' + esc(x.key) + '" aria-label="Tipo de entrada de ' + esc(x.desc) + '">' + optionsEntrada(x.eff, !!S.over[x.key] && Object.keys(x.autos).length > 1) + '</select></div>';
    });
    if (ent.length > 40) h += '<p class="passo" style="padding-top:12px">Mostrando 40 de ' + ent.length + ' entradas. Use a busca para achar as outras.</p>';
    return h;
  }
  function review() {
    var nc = merchants().length, ne = entradas().length, cw = cartAtual(), np = TR ? TR.S.pares.filter(function (p) { return p.s.w.id === cw.id || p.e.w.id === cw.id; }).length : 0;
    return '<section class="sec rev"><details class="revd" id="fin-revd"' + (S.revOpen ? ' open' : '') + '><summary><h2>Revisar categorias</h2><span class="hint">' + nc + ' comerciantes e ' + ne + (ne === 1 ? ' entrada' : ' entradas') +
      (np ? ' · ' + np + (np === 1 ? ' transferência sugerida' : ' transferências sugeridas') : '') + '. Abra para trocar a categoria de algum.</span></summary><div class="rv-c">' + transfBloco(cw.id) + '<p class="passo">Os comerciantes novos entram numa categoria pelo nome. Se um estiver no lugar errado, troque aqui e o painel inteiro se refaz, inclusive os meses antigos e os próximos extratos. ' +
      'O que for dinheiro seu indo ou vindo de outra conta sua, marque como "Entre contas suas": não conta como gasto nem como entrada.</p>' +
      '<div class="fbusca"><label class="vh" for="fin-q">Buscar comerciante ou entrada</label><input id="fin-q" type="search" placeholder="Buscar comerciante ou entrada" value="' + esc(S.q) + '" autocomplete="off"></div><div class="card" id="fin-revlist">' + revList() + '</div></div></details></section>';
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
    if (M.semSaldo) return perguntaSaldo();
    var sm = S.summary, pts = balSeries(), lp = pts[pts.length - 1], last = rows[rows.length - 1], pmin = pts[0], nt = [], parts = 'Conta ' + f0(lp.c);
    pts.forEach(function (p) { if (p.b < pmin.b) pmin = p; });
    if (sm) {
      parts += ' + Flexible Cash ' + f0((sm.flex || 0) / 100) + ' + Investimentos ' + f0((sm.invest || 0) / 100) + ' + Cripto ' + f0((sm.cripto || 0) / 100);
      if (sm.asOf && sm.asOf < last.date) nt.push('Flexible Cash e cripto de ' + dFull(sm.asOf));
      if (sm.investAsOf && sm.investAsOf < last.date) nt.push('investimentos de ' + dFull(sm.investAsOf));
    }
    var est = M.fonteSaldo === 'estimado', an = est && cartAtual().ancora;
    return '<section class="sec"><div class="card cfm"><div><p class="l mono">' + (sm ? 'Dinheiro total · Revolut' : bancoAtual() === 'revolut' ? 'Saldo atual · conta Revolut' : (est ? 'Saldo estimado · ' : 'Saldo atual · ') + esc(origem())) + '</p><p class="big num">' + f0(lp.b) + '</p>' +
      '<p class="s">' + esc(parts) + '</p>' +
      '<p class="s">em ' + esc(dFull(last.date)) + (nt.length ? ' · ' + esc(nt.join(' · ')) : '') + ' · média do período ' + f0(avgBal(pts)) + ' · mais baixo ' + f2(pmin.b) + '</p></div>' +
      '<div><div id="fin-bal" class="bal spark"></div><div class="axl mono"><span>' + esc(dFull(pts[0].d)) + '</span><span>' + esc(dFull(pts[pts.length - 1].d)) + '</span></div>' +
      (sm ? '<p class="s">Antes de hoje, o total é reconstruído a partir das transferências para o Flexible Cash e para investimentos. Rendimentos e variação de preço não entram.</p>' : '') +
      (est ? '<p class="s">Estimado a partir dos movimentos, com o saldo que você informou para ' + esc(dFull(an.data)) + ' (' + esc(f2(an.valor / 100)) + '). Rendimentos e tarifas que o extrato não lista não entram.</p>' : '') +
      (!sm && bancoAtual() !== 'revolut' && !est ? '<p class="s">Saldo do fim de cada dia, como está no extrato.</p>' : '') + '</div></div></section>';
  }
  /* sem saldo no extrato: pergunta uma vez o saldo segundo o banco, na data do último movimento */
  function perguntaSaldo() {
    var c = cartAtual();
    if (c && c.ancoraDispensada) return '<section class="sec"><div class="aviso pergunta"><p>O extrato de ' + esc(origem()) + ' não traz saldo: o painel mostra o que entrou e saiu, sem saldo atual nem gráfico de saldo.</p>' +
      '<button class="btn sm" type="button" data-saldo="perguntar">Informar o saldo</button></div></section>';
    return '<section class="sec"><form class="aviso pergunta" id="fin-fancora"><p>O extrato de ' + esc(origem()) + ' não traz saldo. Qual era o saldo segundo o banco no fim de <b>' + esc(dFull(M.lastDate)) + '</b>? Com ele, o painel estima o saldo de cada dia a partir dos movimentos.</p>' +
      '<div class="grupo"><label class="vh" for="fin-ancora">Saldo em ' + esc(dFull(M.lastDate)) + '</label><input id="fin-ancora" type="text" inputmode="decimal" autocomplete="off" placeholder="ex.: 1.234,56">' +
      '<button class="btn sm pri" type="submit">Salvar</button><button class="btn sm" type="button" data-saldo="dispensar">Agora não</button></div></form></section>';
  }
  function mudarCarteira(fn) {
    var x = dadosAtuais();
    x = Object.assign({}, x, { carteiras: x.carteiras.map(function (c) { return c.id === x.ativa ? fn(Object.assign({}, c)) : c; }) });
    usarDados(x); localSave(); recompute(); render();
  }
  function cashBridge() {
    var rows = M.rows;
    if (!rows.length) return '';
    var first = rows[0], last = rows[rows.length - 1], open = M.semSaldo ? null : first.bal - first.a, cur = M.semSaldo ? null : last.bal;
    var T = { renda: 0, outras: 0, interno: 0, flex: 0, invest: 0, gasto: 0 }, cat = {};
    rows.forEach(function (r) {
      if (r.kind === 'gasto') { T.gasto -= r.a; cat[r.cat] = (cat[r.cat] || 0) - r.a; } else T[r.kind] += r.a;
    });
    var items = (M.semSaldo ? [] : [{ c: 'base', l: 'Saldo inicial' + (M.fonteSaldo === 'estimado' ? ' estimado' : '') + ' (' + dFull(first.date) + ')', v: open }]).concat([
      { l: 'Renda (salários e pagamentos)', v: T.renda },
      { l: 'Outras entradas', v: T.outras }
    ]);
    if (Math.abs(T.interno) >= .5) items.push({ l: 'Entre contas suas', v: T.interno });
    items.push({ l: T.flex <= 0 ? 'Enviado ao Flexible Cash (líquido)' : 'Retirado do Flexible Cash (líquido)', v: T.flex });
    items.push({ l: 'Investimentos e cripto (líquido)', v: T.invest });
    items.push({ l: 'Gastos (já descontados os reembolsos)', v: -T.gasto, cats: true });
    if (!M.semSaldo) items.push({ c: 'end', l: M.fonteSaldo === 'estimado' ? 'Saldo atual estimado' : 'Saldo atual na conta', v: cur });
    var mx = 1; items.forEach(function (x) { mx = Math.max(mx, Math.abs(x.v)); });
    var br = '';
    items.forEach(function (x, i) {
      var cls = x.c || '', sign = x.c ? '' : (x.v >= 0 ? '+' : '−'), tone = x.c ? '' : (x.v >= 0 ? 'pos' : 'neg');
      var col = x.c ? 'var(--accent)' : (x.v >= 0 ? 'var(--pos)' : 'var(--neg)');
      var inner = '<span class="bl">' + esc(x.l) + '</span><b class="num ' + tone + '">' + sign + f0(Math.abs(x.v)) + '</b><span class="bt"><i style="width:' + (Math.abs(x.v) / mx * 100).toFixed(1) + '%;background:' + col + '"></i></span>';
      if (x.cats) {
        var sub = '';
        CATSV.forEach(function (c) { if (Math.abs(cat[c.id] || 0) >= .5) sub += '<div><span>' + esc(catNome(c)) + '</span><b>' + f0(cat[c.id]) + '</b></div>'; });
        br += '<details class="brd"' + (S.cfOpen ? ' open' : '') + ' id="fin-cfd"><summary class="br">' + inner + '<span class="sub" style="grid-column:1/3">Toque para ver por categoria</span></summary><div class="brsub">' + sub + '</div></details>';
      } else br += '<div class="br ' + cls + (i === 0 ? ' first' : '') + '">' + inner + '</div>';
    });
    return '<section class="sec"><div class="sec-top"><h2>De onde veio e para onde foi</h2><span class="hint">' + esc(dFull(first.date)) + ' a ' + esc(dFull(last.date)) + '</span></div>' +
      '<div class="card cfb"><h3>Tudo que entrou e saiu da conta</h3>' + br + '</div></section>';
  }

  /* ---------- dívidas em observação ---------- */
  var nr = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  function todayIso() { var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function diasAte(iso) { return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(todayIso() + 'T00:00:00Z')) / 86400000); }
  function vencTxt(iso) {
    var n = diasAte(iso);
    return n === 0 ? 'vence hoje' : n === 1 ? 'vence amanhã' : n > 1 ? 'vence em ' + n + ' dias' : n === -1 ? 'venceu ontem' : 'venceu há ' + (-n) + ' dias';
  }
  function parseNum(s) {
    s = String(s == null ? '' : s).replace(/[^\d,.\-]/g, '');
    if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return parseFloat(s);
  }
  /* pagamentos em observação: cada um na sua moeda; o câmbio para a moeda da configuração é sempre digitado
     pela pessoa (rate = unidades da moeda por 1 da moeda da configuração) */
  var fmtMoeda = {};
  function fMoeda(v, cod) {
    if (!(cod in fmtMoeda)) { try { fmtMoeda[cod] = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cod }); } catch (e) { fmtMoeda[cod] = null; } }
    return fmtMoeda[cod] ? fmtMoeda[cod].format(v) : cod + ' ' + n2.format(v);
  }
  function divState() {
    var d = S.div || {};
    return { items: Array.isArray(d.items) ? d.items : [], cambios: d.cambios || {}, margem: d.margem != null && !isNaN(d.margem) ? +d.margem : 2 };
  }
  function divMut(fn) {
    var d = JSON.parse(JSON.stringify(S.div || {}));
    if (!Array.isArray(d.items)) d.items = [];
    fn(d);
    return enqueue(function () { return saveDiv(d); }).then(function () { render(); });
  }
  function dividas() {
    var f0 = fP0, BASE = moedaP(), D = divState(), open = D.items.filter(function (i) { return i.status !== 'paga'; }).sort(function (a, b) { var x = a.venc || '9999', y = b.venc || '9999'; return x < y ? -1 : x > y ? 1 : 0; }), paid = D.items.filter(function (i) { return i.status === 'paga'; });
    var mg = D.margem, porMoeda = {}, te = 0, tr = 0, falta = [], fora = [];
    function taxa(cod) { if (cod === BASE) return 1; var c = D.cambios[cod]; return c && +c.rate > 0 ? +c.rate : 0; }
    var h = '<section class="sec" id="fin-dividas"><div class="sec-top"><h2>Em observação</h2><span class="hint">pagamentos para fazer</span></div><div class="card dv">';
    if (!open.length) h += '<p class="vazio dvv">Nenhum pagamento em observação.</p>';
    open.forEach(function (it) {
      var cod = it.moeda || BASE, rt = taxa(cod), eur = rt ? it.valor / rt : null, partes = [];
      porMoeda[cod] = (porMoeda[cod] || 0) + it.valor;
      if (cod !== BASE && fora.indexOf(cod) < 0) fora.push(cod);
      if (eur == null) { if (falta.indexOf(cod) < 0) falta.push(cod); } else { te += eur; tr += cod === BASE ? eur : eur * (1 + mg / 100); }
      if (cod !== BASE) partes.push(fMoeda(it.valor, cod));
      partes.push(it.venc ? '<span class="' + (diasAte(it.venc) <= 7 ? 'urg' : '') + '">' + esc(vencTxt(it.venc)) + ', ' + esc(dFull(it.venc)) + '</span>' : (it.criada ? 'anotada em ' + esc(dFull(it.criada)) : ''));
      h += '<div class="dvr"><div class="n">' + esc(it.nome) + '<small>' + partes.filter(Boolean).join(' · ') + '</small>' + (it.desc ? '<small>' + esc(it.desc) + '</small>' : '') + '</div>' +
        '<div class="v">' + (cod === BASE ? '<b class="num">' + f0(eur) + '</b><small>pago em ' + esc(nomeMoeda(BASE)) + ', sem câmbio</small>' : eur != null ? '<b class="num">≈ ' + f0(eur) + '</b><small>reservar ' + f0(eur * (1 + mg / 100)) + ' com ' + nn.format(mg) + '% de margem</small>' : '<small>defina o câmbio de ' + esc(cod) + ' abaixo</small>') + '</div>' +
        '<div class="act"><button type="button" class="btn sm" data-dpay="' + esc(it.id) + '" aria-label="Marcar ' + esc(it.nome) + ' como paga">Paguei</button><button type="button" class="btn sm" data-ddel="' + esc(it.id) + '" aria-label="Remover ' + esc(it.nome) + '">Remover</button></div></div>';
    });
    if (open.length > 1) h += '<div class="dvr dvt"><div class="n">Total<small>' + Object.keys(porMoeda).map(function (c) { return c === BASE ? f0(porMoeda[c]) + ' em ' + esc(nomeMoeda(BASE)) : fMoeda(porMoeda[c], c); }).join(' · ') + '</small></div><div class="v">' + (!falta.length ? '<b class="num">' + (fora.length ? '≈ ' : '') + f0(te) + '</b><small>reservar ' + f0(tr) + '</small>' : '') + '</div></div>';
    /* o saldo da conta só se compara quando está na mesma moeda */
    if (open.length && !falta.length && moeda() === BASE && !emResumo()) {
      var cur = M.rows.length && !M.semSaldo ? M.rows[M.rows.length - 1].bal : null, sm = S.summary, flex = sm && sm.flex ? sm.flex / 100 : 0, pos = sm && sm.asOf ? ' (posição de ' + dFmt(sm.asOf) + ')' : '';
      if (cur != null) {
        var msg;
        if (cur >= tr) msg = 'O saldo da conta (' + f0(cur) + ') já cobre o valor reservado' + pos + '.';
        else if (flex > 0 && Math.round(cur) + Math.round(flex) >= Math.round(tr)) msg = 'A conta tem ' + f0(cur) + ' e faltam ' + f0(Math.round(tr) - Math.round(cur)) + ' para cobrir o valor reservado. O Flexible Cash (' + f0(flex) + ') cobre a diferença' + pos + '.';
        else if (flex > 0) msg = 'A conta (' + f0(cur) + ') e o Flexible Cash (' + f0(flex) + ') somam ' + f0(Math.round(cur) + Math.round(flex)) + '; ainda faltam ' + f0(Math.round(tr) - Math.round(cur) - Math.round(flex)) + ' para cobrir tudo' + pos + '.';
        else msg = 'A conta tem ' + f0(cur) + '; faltam ' + f0(Math.round(tr) - Math.round(cur)) + ' para cobrir o valor reservado' + pos + '.';
        h += '<p class="dvn">' + msg + '</p>';
      }
    }
    /* câmbio só das moedas dos pagamentos em aberto; nada é buscado na internet */
    if (fora.length) {
      h += '<details class="metas" id="fin-dcamb"' + (S.dCamb ? ' open' : '') + '><summary>' + (falta.length ? 'Definir câmbio (' + esc(falta.join(', ')) + ')' : resumoCambio(fora)) + '</summary>' +
        '<form id="fin-fcamb"><div class="mgrid">' + camposCambio(fora, 'camb') +
        '<label>Margem para taxa e câmbio (%)<input id="fin-c-mg" type="text" inputmode="decimal" value="' + esc(String(mg).replace('.', ',')) + '"></label></div><button class="btn sm pri" type="submit">Atualizar câmbio</button></form></details>';
    }
    h += '<details class="metas" id="fin-dadd"' + (S.dAdd ? ' open' : '') + '><summary>Adicionar pagamento</summary><form id="fin-fdiv"><div class="mgrid"><label>Nome<input id="fin-d-nome" type="text" placeholder="Ex.: banco ou escola" autocomplete="off"></label>' +
      '<label>Valor<input id="fin-d-valor" type="text" inputmode="decimal" placeholder="3.700,00" autocomplete="off"></label>' +
      '<label>Moeda<select id="fin-d-cur">' + opcoes(MOEDAS, BASE) + '<option value="outra">Outra…</option></select></label>' +
      '<label id="fin-d-outra-l" hidden>Código da moeda<input id="fin-d-outra" type="text" maxlength="3" placeholder="Ex.: CHF" autocomplete="off" autocapitalize="characters"></label>' +
      '<label>Vencimento (opcional)<input id="fin-d-venc" type="date"></label>' +
      '<label>Descrição (opcional)<input id="fin-d-desc" type="text" placeholder="Ex.: Parcela 4/5" autocomplete="off"></label></div><button class="btn sm pri" type="submit">Adicionar</button></form></details>';
    if (paid.length) {
      h += '<details class="metas" id="fin-dpaid"' + (S.dPaid ? ' open' : '') + '><summary>Pagas (' + paid.length + ')</summary>';
      paid.forEach(function (it) {
        h += '<div class="dvr paga"><div class="n">' + esc(it.nome) + '<small>' + ((it.moeda || BASE) === BASE ? f0(it.valor || 0) : fMoeda(it.valor, it.moeda)) + (it.pagaEm ? ' · paga em ' + esc(dFull(it.pagaEm)) : '') + '</small></div><div></div><div class="act"><button type="button" class="btn sm" data-ddel="' + esc(it.id) + '" aria-label="Remover ' + esc(it.nome) + '">Remover</button></div></div>';
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
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + (S.summary ? 'Dinheiro total (conta, Flexible Cash, investimentos e cripto) dia a dia' : 'Saldo da conta dia a dia') + ', de ' + esc(dFull(pts[0].d)) + ' a ' + esc(dFull(lastp.d)) + '. Média ' + f0(avg) + ', atual ' + f0(lastp.b) + '.">' +
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
  var ORIGENS = [['', 'Digitado por você'], ['flex', 'Saldo do Flexible Cash'], ['invest', 'Investimentos e cripto']];
  var DE_ORIGEM = { flex: 'Flexible Cash', invest: 'investimentos e cripto' };
  function metasPoupanca() { return listaMetasPoupanca(S.plan); }
  function pct(v) { return nn.format(v) + '%'; }
  function goalCfg(id) { var g = S.plan && S.plan.goals; return (g && g[id]) || {}; }
  /* valor atual da meta; null quando falta o câmbio de uma carteira Revolut (fica em goalFalta) */
  var goalFalta = null;
  function goalHas(g) {
    var sm = S.summary, t = 0;
    goalFalta = null;
    if (!g.src) return +goalCfg(g.id).tem || 0;
    if (variasCarteiras()) {
      /* com várias carteiras: soma o Flexible Cash ou os investimentos de todas as carteiras Revolut, na moeda principal */
      var x = dadosAtuais();
      x.carteiras.forEach(function (c) {
        if (c.banco !== 'revolut' || goalFalta) return;
        var v = 0;
        if (c.summary) v = g.src === 'flex' ? (c.summary.flex || 0) / 100 : ((c.summary.invest || 0) + (c.summary.cripto || 0)) / 100;
        else { buildModel(c.months, c.over, S.plan && S.plan.titular, c.pais, CATST).rows.forEach(function (r) { if (r.kind === g.src) v -= r.a; }); v = Math.max(0, v); }
        var p = paraPrincipal(v, c.moeda, x);
        if (p == null) goalFalta = c.moeda; else t += p;
      });
      return goalFalta ? null : t;
    }
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
    var f0 = fP0, h = '<section class="sec" id="fin-goals"><div class="sec-top"><h2>Metas de poupança</h2><span class="hint">as de Flexible Cash e investimentos saem do extrato; as outras você atualiza</span></div><div class="gl4">';
    metasPoupanca().forEach(function (g) {
      var c = goalCfg(g.id), alvo = +c.alvo || 0, tem = goalHas(g), semCambio = tem == null ? goalFalta : null, ml = mesesAte(c.prazo), st;
      if (semCambio) tem = 0;
      var falta = Math.max(0, alvo - tem), pc = alvo ? Math.min(100, tem / alvo * 100) : 0;
      if (semCambio) st = 'Defina o câmbio de ' + esc(semCambio) + ' em Configurações para somar esta meta.';
      else if (!alvo) st = 'Defina o valor em Editar metas de poupança.';
      else if (falta < 0.5) st = '<span class="d good">Meta batida</span>';
      else st = 'Faltam ' + f0(falta) + (ml ? '<br>' + f0(falta / ml) + ' por mês até ' + esc(mesAno(c.prazo)) : '<br>sem prazo definido');
      h += '<div class="kpi goal"><span class="l">' + esc(g.nome) + '</span><span class="v">' + f0(tem) + (alvo ? ' <small>de ' + f0(alvo) + '</small>' : '') + '</span>' +
        '<span class="gbar" role="img" aria-label="' + (alvo ? nn.format(pc) + '% da meta' : 'sem meta') + '"><i style="width:' + pc.toFixed(1) + '%"></i></span>' +
        '<span class="s">' + st + (g.src ? '<br><span class="src">valor atual: ' + DE_ORIGEM[g.src] + '</span>' : '') + '</span></div>';
    });
    h += '</div><details class="metas" id="fin-gedit"' + (S.gOpen ? ' open' : '') + '><summary>Editar metas de poupança</summary><form id="fin-fgoals"><div class="ggrid">';
    var lista = metasPoupanca();
    lista.forEach(function (g) {
      var c = goalCfg(g.id), k = 'fin-g-' + g.id;
      h += '<fieldset><legend>' + esc(g.nome) + '</legend><div class="mgrid">' +
        '<label>Nome<input id="' + k + '-nome" type="text" autocomplete="off" maxlength="40" value="' + esc(g.nome) + '"></label>' +
        '<label>De onde vem o valor<select id="' + k + '-src">' + opcoes(ORIGENS, g.src || '') + '</select></label>' +
        '<label>Meta (' + esc(simbolo(moedaP())) + ')<input id="' + k + '-alvo" type="number" min="0" step="50" inputmode="decimal" value="' + (+c.alvo || '') + '"></label>' +
        '<label>Prazo<input id="' + k + '-prazo" type="month" value="' + esc(c.prazo || '') + '"></label>' +
        '<label>Já guardado (' + esc(simbolo(moedaP())) + ')<input id="' + k + '-tem" type="number" min="0" step="10" inputmode="decimal" value="' + (+c.tem || '') + '"><small>Só vale quando o valor é digitado por você.</small></label>' +
        '<label class="chk"><input id="' + k + '-excluir" type="checkbox">Excluir esta meta</label></div></fieldset>';
    });
    if (lista.length < MAX_METAS_POUP) h += '<fieldset><legend>Nova meta</legend><div class="mgrid"><label>Nome<input id="fin-g-nova" type="text" autocomplete="off" maxlength="40" placeholder="ex.: Carro"><small>Até ' + MAX_METAS_POUP + ' metas.</small></label></div></fieldset>';
    return h + '</div><button class="btn sm pri" type="submit">Salvar metas de poupança</button></form></details></section>';
  }
  function previsao() {
    var cur = M.partial, h = '<section class="sec"><div class="sec-top"><h2>Previsão do mês</h2>';
    if (!cur) return h + '</div><div class="card"><p class="passo">O último extrato fecha ' + esc(mLabel(M.keys[M.keys.length - 1])) + '. Adicione o extrato do mês atual para ver a previsão.</p></div></section>';
    var P = preverMes(M, planCat, CATST), g = M.by[cur], p = cur.split('-').map(Number), dim = P.dim, day = P.day, left = Math.max(1, dim - day);
    var proj = P.proj, falFix = P.falFix, meta = planTotal(), sobra = meta - g.gasto - falFix, porDia = sobra / left, dif = proj - meta;
    var mx = Math.max(proj, meta, g.gasto, 1), cw = cartAtual(), rs = TR && cw ? saidasPendentes(TR.S, cw.id, cur) : [], pend = 0;
    if (rs.length) pend = Math.max(0, proj - preverMes(buildModel(S.months, S.over, S.plan && S.plan.titular, S.plan && S.plan.pais, CATST, { dia: cw.saldosDia, ancora: cw.ancora }, comPendentes(cw.transf, rs)), planCat, CATST).proj);
    var st = statusPrevisao(dif, pend, f0);
    return h + '<span class="hint">até dia ' + day + ' de ' + dim + ' · ' + left + ' dias pela frente</span></div><div class="card prv">' +
      '<div class="prv-n"><div><p class="l mono">Gasto até agora</p><p class="v num">' + f0(g.gasto) + '</p></div><div><p class="l mono">Previsão para ' + esc(MES[p[1] - 1]) + '</p><p class="v num">' + f0(proj) + '</p>' + pendNum(pend, f0) + '</div><div><p class="l mono">Meta de gasto</p><p class="v num">' + f0(meta) + '</p></div></div>' +
      '<div class="ptrack" role="img" aria-label="Gasto ' + f0(g.gasto) + ', previsão ' + f0(proj) + ', meta ' + f0(meta) + '"><i class="pj' + (passaMesmo(dif, pend) ? ' over' : '') + '" style="width:' + (proj / mx * 100).toFixed(1) + '%"></i><i class="sp" style="width:' + (g.gasto / mx * 100).toFixed(1) + '%"></i><b style="left:calc(' + (meta / mx * 100).toFixed(1) + '% - 1px)"></b></div>' +
      '<div class="legend"><span><i class="sw" style="background:var(--accent)"></i>gasto até agora</span><span><i class="sw" style="background:color-mix(in srgb, var(--accent) 35%, var(--raised))"></i>previsão no ritmo atual</span><span><i class="sw line"></i>meta</span></div>' +
      '<p class="s">' + st + pendFrase(pend, rs.length, f0) + '. ' + (porDia > 0 ? 'Para fechar na meta, dá para gastar até <b>' + f0(porDia) + ' por dia</b> nos gastos do dia a dia' + (falFix > 0.5 ? ', já separando ' + f0(falFix) + ' de contas fixas que ainda vão cair' : '') + '.' : 'A meta do mês já foi usada' + (falFix > 0.5 ? ', e ainda faltam ' + f0(falFix) + ' de contas fixas' : '') + '.') +
      ' ' + CATSV.filter(function (c) { return c.fixa; }).map(function (c) { return c.nome; }).concat(['as contas fixas detectadas abaixo']).join(', ').replace(/, ([^,]*)$/, ' e $1') + ' entram pelo valor de sempre; o resto segue o ritmo dos ' + day + ' primeiros dias.</p>' + pendBotao(pend) +
      (P.semBase.length ? '<p class="aviso">' + P.semBase.map(function (id) { return '<b>' + esc(catPor(id).nome) + '</b>'; }).join(', ') + (P.semBase.length === 1 ? ' está' : ' estão') +
        ' como conta fixa, mas sem meta e sem cobrança recorrente: a previsão conta só o que já saiu este mês. Defina a meta em Editar metas.</p>' : '') + '</div></section>';
  }
  /* a pessoa nova não sabe que o aluguel por transferência cai em "outros": pergunta uma vez */
  function aluguelSugerido() { return CPOR.aluguel && !CPOR.aluguel.oculta ? sugerirAluguel(RECS, S.plan && S.plan.naoAluguel) : null; }
  function perguntaAluguel() {
    var o = aluguelSugerido();
    if (!o) return '';
    return '<div class="aviso pergunta"><p>Todo dia ' + o.dia + ' sai ' + f2(o.v) + ' para <b>' + esc(o.last.desc) + '</b>, hoje em ' + esc(catPor(o.last.cat).nome) + '. <b>Isso é aluguel?</b></p>' +
      '<div class="grupo"><button class="btn sm pri" type="button" data-aluguel="sim">Sim, é aluguel</button><button class="btn sm" type="button" data-aluguel="nao">Não é</button></div></div>';
  }
  function recorrentes() {
    var nk = Math.min(3, M.keys.length), list = RECS, tot = 0;
    if (nk < 2) return '';
    list.forEach(function (o) { tot += o.v; });
    var h = '<section class="sec"><div class="sec-top"><h2>Contas fixas e assinaturas</h2><span class="hint">cobranças que se repetem nos últimos meses, com valor parecido</span></div><div class="card">';
    if (!list.length) return h + '<p class="vazio">Ainda não dá para ver repetições. Com dois ou três meses de extrato elas aparecem aqui.</p></div></section>';
    list.forEach(function (o, i) {
      var c = catPor(o.last.cat);
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
    return '<section class="sec"><div class="sec-top"><h2>' + esc(catPor('brasil').nome) + '</h2><span class="hint">dinheiro que vai para outra conta sua</span></div><div class="card">' + vbars(items, f0) +
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
  document.addEventListener('toggle', function (e) {
    if (e.target && e.target.id === 'fin-gedit') S.gOpen = e.target.open;
    if (e.target && e.target.id === 'fin-kedit') S.kOpen = e.target.open;
  }, true);

  function render() {
    var root = $('#fin-app'), sc = $('.fin .cscroll'), keep = sc ? sc.scrollLeft : null;
    if (!root) return;
    RES = null;
    if (!S.ready) { root.innerHTML = header() + '<p class="passo">Carregando seus dados…</p>'; return; }
    if (S.restaurar) { root.innerHTML = header() + telaRestaurar(); return; }
    if (S.apagar) { root.innerHTML = header() + telaApagar(); return; }
    if (S.excluir) { root.innerHTML = header() + telaExcluirCarteira(); return; }
    if (S.importar) { root.innerHTML = header() + telaImportar(); return; }
    if (S.bloqueado) { root.innerHTML = header() + telaBloqueio(); return; }
    if (!configurado() || S.setupOpen) { root.innerHTML = header() + setup(); return; }
    TR = null;
    if (variasCarteiras() && configurado() && !S.setupOpen) {
      var RT = resumir(dadosAtuais());
      TR = { R: RT, S: sugerirTransferencias(RT, S.dados), C: transferenciasConfirmadas(RT) };
    }
    if (emResumo()) {
      RES = TR.R;
      if (RES.meses.indexOf(S.rMes) < 0) S.rMes = RES.completos.length ? RES.completos[RES.completos.length - 1] : RES.meses[RES.meses.length - 1] || null;
      root.innerHTML = header() + abas() + telaResumo(RES); return;
    }
    if (!M.keys.length) { root.innerHTML = header() + abas() + emptyState(); return; }
    var uma = !variasCarteiras();
    root.innerHTML = header() + abas() + perguntaAluguel() + cashSummary() + (uma ? dividas() : notaResumo()) + kpis() + previsao() + (uma ? metasPoup() : '') + chart() +
      '<section class="sec"><div class="detail' + (S.movOpen ? '' : ' solo') + '">' + catPanel() + movPanel() + '</div></section>' + recorrentes() +
      (CPOR.brasil.oculta ? taxaPoup() : '<div class="two">' + enviosBrasil() + taxaPoup() + '</div>') + table() + review() +
      '<p class="passo">Todo fim de mês: baixe o extrato ' + (bancoAtual() === 'revolut' ? 'consolidado do Revolut' : 'de ' + esc(origem())) + (bancoAtual() === 'revolut' ? ' em CSV' : ' em CSV ou planilha') + ' e toque em Adicionar extrato. Movimentos que já estavam salvos são ignorados.</p>' + cashBridge();
    var s2 = $('.fin .cscroll');
    if (s2) s2.scrollLeft = keep != null ? keep : s2.scrollWidth;
    drawBal();
  }

  /* ---------- dica sobre a barra ---------- */
  function tipHtml(k) {
    var g = M.by[k], h = '<h3>' + esc(mLabel(k)) + (M.partial === k ? ' · em andamento' : '') + '</h3>';
    CATSV.forEach(function (c) {
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
    var t = e.target.closest && e.target.closest('[data-irtransf],[data-tconf],[data-tdisp],[data-tdesf],[data-rmes],[data-rcamb],[data-escolher],[data-sel],[data-f],[data-fopen],[data-fclear],[data-more],[data-all],[data-movtoggle],[data-fin-add],[data-fin-setup],[data-aluguel],[data-backup],[data-restaurar],[data-apagar],[data-dpay],[data-ddel],[data-carteira],[data-wexcluir],[data-excluir],[data-imp],[data-saldo]');
    if (!t || !t.closest('#fin-app')) { if (fechou) render(); return; }
    if (t.hasAttribute('data-fin-add')) {
      if (emResumo()) { S.escolher = {}; render(); var ec = $('#fin-escolher input:checked'); if (ec) ec.focus(); window.scrollTo(0, 0); return; }
      $('#fin-csv').click(); return;
    }
    if (t.hasAttribute('data-escolher')) {
      var esc0 = S.escolher, sel0 = $('input[name="fin-ecart"]:checked');
      S.escolher = null;
      if (t.getAttribute('data-escolher') === 'ok' && sel0) {
        if (sel0.value !== S.dados.ativa) { usarDados(escolherCarteira(dadosAtuais(), sel0.value)); localSave(); S.sel = null; S.f = []; S.q = ''; S.more = 12; recompute(); }
        render();
        if (esc0 && esc0.files) handleFiles(esc0.files); else $('#fin-csv').click();
      } else render();
      return;
    }
    if (t.hasAttribute('data-irtransf')) {
      if (!emResumo() && !S.revOpen) { S.revOpen = true; render(); }
      var it = document.querySelector('#fin-transf [tabindex="-1"]');
      if (it) { it.scrollIntoView({ block: 'start' }); it.focus(); }
      return;
    }
    if (t.hasAttribute('data-tconf') || t.hasAttribute('data-tdisp')) {
      var tc = t.hasAttribute('data-tconf'), pq = parPorChave(t.getAttribute(tc ? 'data-tconf' : 'data-tdisp'));
      if (!pq) return;
      var pp = pq.p, quem = pp.ja === 's' ? 'a entrada no ' + pp.e.w.nome : pp.ja === 'e' ? 'a saída no ' + pp.s.w.nome : pp.s.w.nome + ' ' + dFmt(pp.s.r.date) + ' e ' + pp.e.w.nome + ' ' + dFmt(pp.e.r.date);
      if (tc) mudarTransf(function (x) { return confirmarTransferencia(x, pq); }, 'Marcado como Entre contas suas: ' + quem + '. Dá para desfazer em Transferências confirmadas.');
      else mudarTransf(function (x) { return dispensarSugestao(x, pq); }, 'Sugestão dispensada: ela não volta.');
      return;
    }
    if (t.hasAttribute('data-tdesf')) {
      var tw = t.getAttribute('data-tdesf'), tm = t.getAttribute('data-tmov');
      S.tConf = true;
      mudarTransf(function (x) { return desfazerTransferencia(x, tw, tm); }, 'Transferência desfeita: as duas pontas voltaram ao que eram.');
      return;
    }
    if (t.hasAttribute('data-rmes')) { S.rMes = t.getAttribute('data-rmes'); render(); var rb = document.querySelector('[data-rmes="' + S.rMes + '"]'); if (rb) rb.focus(); return; }
    if (t.hasAttribute('data-rcamb')) {
      var rm = t.getAttribute('data-rcamb');
      S.rCamb = true; render();
      var ri = rm ? $('#fin-cambr-' + rm) : $('#fin-frcamb input');
      if (ri) { ri.focus(); ri.scrollIntoView({ block: 'center' }); }
      return;
    }
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
        usarDados(x);
        S.bloqueado = null; S.restaurar = null; S.setupOpen = false; S.resumo = true; localSave(); recompute(); render();
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
    if (t.hasAttribute('data-imp')) { S.importar = null; render(); return; }
    if (t.hasAttribute('data-saldo')) {
      var ds = t.getAttribute('data-saldo') === 'dispensar';
      mudarCarteira(function (c) { if (ds) c.ancoraDispensada = true; else delete c.ancoraDispensada; return c; });
      if (!ds) { var ia = $('#fin-ancora'); if (ia) ia.focus(); }
      return;
    }
    if (t.hasAttribute('data-carteira')) {
      var cid = t.getAttribute('data-carteira');
      if (cid === 'resumo' || (cid === S.dados.ativa && emResumo())) {
        S.resumo = cid === 'resumo'; S.escolher = null; render();
        var ar = document.querySelector('[data-carteira="' + cid + '"]'); if (ar) ar.focus();
        return;
      }
      if (cid === S.dados.ativa) return;
      S.resumo = false; S.escolher = null;
      usarDados(escolherCarteira(dadosAtuais(), cid)); localSave();
      S.sel = null; S.f = []; S.q = ''; S.more = 12; recompute(); render();
      var ab = document.querySelector('[data-carteira="' + cid + '"]'); if (ab) ab.focus();
      return;
    }
    if (t.hasAttribute('data-wexcluir')) { S.excluir = t.getAttribute('data-wexcluir'); render(); window.scrollTo(0, 0); return; }
    if (t.hasAttribute('data-excluir')) {
      if (t.getAttribute('data-excluir') === 'confirmar') {
        var x0 = dadosAtuais(), ex = x0.carteiras.filter(function (w) { return w.id === S.excluir; })[0], x1 = excluirCarteira(x0, S.excluir);
        var semCambio = Object.keys(x0.cambios || {}).length && !Object.keys(x1.cambios).length;
        usarDados(x1); localSave(); S.excluir = null; S.sel = null; recompute(); render();
        toast('Carteira ' + ex.nome + ' excluída.' + (semCambio ? ' A carteira principal mudou de moeda: informe o câmbio de novo em Em observação.' : ''));
      } else { S.excluir = null; render(); }
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
    if (t.hasAttribute && t.hasAttribute('data-imp-campo') && S.importar) { mudarImportacao(t); return; }
    if (t.id === 'fin-csv') { var fl = t.files; handleFiles(fl).then(function () { t.value = ''; }); return; }
    if (t.id === 'fin-d-cur') { $('#fin-d-outra-l').hidden = t.value !== 'outra'; return; }
    var wm = /^(fin-w-.+|fin-wn)-(pais|banco)$/.exec(t.id || '');
    if (t.id === 'fin-w-mp') {
      var tr0 = t.value !== S.dados.config.moedaPrincipal, cw = $('#fin-cambc-w'), ct = $('#fin-cambc-troca');
      if (cw) cw.hidden = tr0; if (ct) ct.hidden = !tr0; return;
    }
    if (wm && wm[2] === 'pais') { var av = $('#' + wm[1] + '-aviso'); av.innerHTML = avisoSuporte(t.value); av.hidden = temRegras(t.value); return; }
    if (wm) { $('#' + wm[1] + '-leitor').hidden = temLeitor(t.value); return; }
    if (t.id === 'fin-json') { lerBackup(t.files && t.files[0]).then(function () { t.value = ''; }); return; }
    if (t.hasAttribute && t.hasAttribute('data-ov') && t.closest('#fin-app')) {
      var key = t.getAttribute('data-ov'), v = t.value, autos = {};
      if (!v) return;
      if (v === '_auto') { delete S.over[key]; v = null; }
      /* só volta ao automático quando todos os movimentos desse nome já cairiam na categoria escolhida */
      M.rows.forEach(function (r) { if (r.key === key) autos[r.auto] = 1; if (r.keyE === key) autos[r.autoE] = 1; });
      if (v && Object.keys(autos).length === 1 && autos[v]) delete S.over[key]; else if (v) S.over[key] = v;
      enqueue(saveOver).then(function () { recompute(); render(); var q = $('#fin-q'); if (q && S.q) { q.focus(); } });
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'fin-i-ancora' && S.importar) { digitouAncora(e.target); return; }
    if (e.target.id === 'fin-q') { S.q = e.target.value; $('#fin-revlist').innerHTML = revList(); }
  });
  document.addEventListener('submit', function (e) {
    var fid = e.target.id;
    if (fid === 'fin-fancora') {
      e.preventDefault();
      var va = parseNum($('#fin-ancora').value);
      if (isNaN(va)) { toast('Informe o saldo, ex.: 1.234,56.', true); return; }
      mudarCarteira(function (c) { c.ancora = { data: M.lastDate, valor: Math.round(va * 100), informadoEm: todayIso() }; delete c.ancoraDispensada; return c; });
      toast('Saldo salvo: o gráfico de saldo é estimado a partir dele.');
      return;
    }
    if (fid === 'fin-fimp') { e.preventDefault(); if (S.importar && podeSalvar(S.importar)) confirmarImportacao(); return; }
    if (fid === 'fin-fdiv') {
      e.preventDefault();
      var nome = $('#fin-d-nome').value.trim(), valor = parseNum($('#fin-d-valor').value);
      if (!nome || !(valor > 0)) { toast('Informe o nome e o valor.', true); return; }
      var venc = $('#fin-d-venc').value, desc = $('#fin-d-desc').value.trim(), cod = $('#fin-d-cur').value;
      if (cod === 'outra') cod = $('#fin-d-outra').value.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(cod)) { toast('Use o código de 3 letras da moeda (ex.: CHF).', true); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) venc = '';
      S.dAdd = false;
      divMut(function (d) { var it = { id: 'd' + Date.now().toString(36), nome: nome, status: 'aberta', criada: todayIso(), valor: Math.round(valor * 100) / 100, moeda: cod }; if (venc) it.venc = venc; if (desc) it.desc = desc.slice(0, 120); d.items.push(it); }).then(function () { toast('Pagamento anotado.'); });
      return;
    }
    if (fid === 'fin-frcamb') {
      e.preventDefault();
      var lr = lerCambios('cambr');
      if (lr.ruim) { toast('Informe quantos ' + lr.ruim + ' valem 1 ' + nomeMoeda(moedaP()) + ' (ex.: 0,86).', true); return; }
      S.rCamb = false;
      divMut(function (d) { d.cambios = Object.assign({}, d.cambios || {}, lr.novos); }).then(function () { toast(Object.keys(lr.novos).length ? 'Câmbio salvo.' : 'Nada mudou no câmbio.'); });
      return;
    }
    if (fid === 'fin-fcamb') {
      e.preventDefault();
      var mg = parseNum($('#fin-c-mg').value), lc = lerCambios('camb'), novos = lc.novos;
      if (lc.ruim) { toast('Informe quantos ' + lc.ruim + ' valem 1 ' + nomeMoeda(moedaP()) + ' (ex.: 1,08).', true); return; }
      if (isNaN(mg) || mg < 0 || mg > 20) mg = 2;
      S.dCamb = false;
      divMut(function (d) { d.cambios = Object.assign({}, d.cambios || {}, novos); d.margem = mg; }).then(function () { toast('Câmbio atualizado.'); });
      return;
    }
    if (fid === 'fin-fsetup') {
      e.preventDefault();
      /* 1) carteiras (nome, banco, moeda, país); 2) você, categorias e metas da carteira ativa; 3) carteira nova, que vira a ativa */
      var x = dadosAtuais(), erros = [], tinhaCambio = Object.keys(x.cambios || {}).length > 0, mp0 = x.config.moedaPrincipal;
      x.carteiras.forEach(function (c) {
        try { x = editarCarteira(x, c.id, lerCarteira(c.id)); } catch (er) { erros.push(c.nome + ': ' + er.message + '.'); }
      });
      /* moeda principal (com várias carteiras) e câmbio; trocar a moeda apaga as taxas, e as digitadas não valem */
      var mpSel = $('#fin-w-mp'), trocouMP = false;
      if (mpSel && mpSel.value !== x.config.moedaPrincipal) { x = trocarMoedaPrincipal(x, mpSel.value); trocouMP = true; }
      else if (mpSel) {
        var lc = lerCambios('cambc');
        if (lc.ruim) erros.push('Câmbio de ' + lc.ruim + ' inválido: informe quantos ' + lc.ruim + ' valem 1 ' + x.config.moedaPrincipal + ' (ex.: 0,86).');
        else if (Object.keys(lc.novos).length) x = Object.assign({}, x, { cambios: Object.assign({}, x.cambios, lc.novos) });
      }
      var mudouPrincipal = x.config.moedaPrincipal !== mp0;
      usarDados(x);
      var lk = lerCategorias(Object.assign({}, S.plan, lerMetas('s'), { titular: $('#fin-s-titular').value.trim(), configurado: true }));
      if (lk.erro) erros.push(lk.erro);
      S.plan = lk.plan; x = dadosAtuais();
      /* categoria excluída: as escolhas manuais que apontavam para ela voltam ao automático, em todas as carteiras */
      if (lk.tirar.length) x = Object.assign({}, x, { carteiras: x.carteiras.map(function (c) {
        var ov = {}; Object.keys(c.over).forEach(function (k) { if (lk.tirar.indexOf(c.over[k]) < 0) ov[k] = c.over[k]; });
        return Object.assign({}, c, { over: ov });
      }) });
      var wn = $('#fin-wn-nome'), criada = null;
      if (wn && wn.value.trim()) {
        try { x = novaCarteira(x, { nome: wn.value, banco: $('#fin-wn-banco').value, moeda: $('#fin-wn-moeda').value, pais: $('#fin-wn-pais').value }); criada = carteiraAtiva(x); }
        catch (er) { erros.push('Não criei a carteira "' + wn.value.trim() + '": ' + er.message + '.'); }
      }
      S.setupOpen = false; S.wOpen = false;
      if (criada) { S.sel = null; S.f = []; S.q = ''; S.resumo = false; }
      enqueue(function () { usarDados(x); localSave(); }).then(function () {
        recompute(); render();
        var msg = 'Configuração salva.' + (criada ? ' Carteira ' + criada.nome + ' criada: adicione o extrato dela.' : '') +
          (trocouMP ? ' A moeda principal agora é ' + nomeMoeda(x.config.moedaPrincipal) + ': informe o câmbio de novo. As metas de poupança não foram convertidas.' :
            mudouPrincipal && tinhaCambio ? ' A moeda principal mudou: informe o câmbio de novo em Em observação.' : '');
        toast(erros.length ? msg + ' ' + erros.join(' ') : msg, !!erros.length);
      });
      return;
    }
    if (fid === 'fin-fgoals') {
      e.preventDefault();
      var gs = {}, lm = [];
      metasPoupanca().forEach(function (g) {
        var k = '#fin-g-' + g.id;
        if ($(k + '-excluir').checked) return;
        var o = { alvo: Math.max(0, +$(k + '-alvo').value || 0), tem: Math.max(0, +$(k + '-tem').value || 0) }, pz = $(k + '-prazo').value;
        if (/^\d{4}-\d{2}$/.test(pz)) o.prazo = pz;
        gs[g.id] = o;
        lm.push({ id: g.id, nome: $(k + '-nome').value.trim() || g.nome, src: $(k + '-src').value || null });
      });
      var ng = $('#fin-g-nova'), nn2 = ng ? ng.value.trim() : '';
      if (nn2 && lm.length < MAX_METAS_POUP) {
        var gi = 1; while (lm.some(function (g) { return g.id === 'm' + gi; }) || gs['m' + gi]) gi++;
        lm.push({ id: 'm' + gi, nome: nn2.slice(0, 40), src: null }); gs['m' + gi] = { alvo: 0, tem: 0 };
      }
      var pg = Object.assign({}, S.plan || {}, { goals: gs, metasPoupanca: lm });
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
  document.addEventListener('toggle', function (e) { if (e.target.id === 'fin-metas') S.metasOpen = e.target.open; if (e.target.id === 'fin-cfd') S.cfOpen = e.target.open; if (e.target.id === 'fin-revd') S.revOpen = e.target.open; if (e.target.id === 'fin-dadd') S.dAdd = e.target.open; if (e.target.id === 'fin-dcamb') S.dCamb = e.target.open; if (e.target.id === 'fin-dpaid') S.dPaid = e.target.open; if (e.target.id === 'fin-wnova') S.wOpen = e.target.open; if (e.target.id === 'fin-rcamb') S.rCamb = e.target.open; if (e.target.id === 'fin-rpor') S.rPor = e.target.open; if (e.target.id === 'fin-rfd') S.rFora = e.target.open; if (e.target.id === 'fin-tconf') S.tConf = e.target.open; }, true);
  /* arrastar um extrato só vale com a aba Finanças aberta */
  window.addEventListener('dragover', function (e) { var r = $('#fin-app'); if (!r) return; e.preventDefault(); r.classList.add('arrasta'); });
  window.addEventListener('dragleave', function (e) { var r = $('#fin-app'); if (r && !e.relatedTarget) r.classList.remove('arrasta'); });
  window.addEventListener('drop', function (e) { var r = $('#fin-app'); if (!r) return; e.preventDefault(); r.classList.remove('arrasta');
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    /* no Resumo, pergunta antes para qual carteira vai o arquivo */
    if (emResumo() && !S.importar) { S.escolher = { files: Array.prototype.slice.call(e.dataTransfer.files) }; render(); window.scrollTo(0, 0); return; }
    handleFiles(e.dataTransfer.files); });

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
    localLoad(); S.ready = true; S.resumo = true; recompute(); render(); cartao();
  }
  /* peças fixas: o seletor de arquivo e a dica dos gráficos */
  document.body.insertAdjacentHTML('beforeend', '<input id="fin-csv" class="vh" type="file" accept=".csv,.txt,.xls,.xlsx,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple tabindex="-1" aria-label="Escolher extrato"><input id="fin-json" class="vh" type="file" accept=".json,application/json" tabindex="-1" aria-label="Escolher backup"><div id="fin-tip" class="fin-tip" hidden></div>');
  window.__cortexFin = { montar: function () { render(); }, cartao: cartao };
  render();
  start();
})();
