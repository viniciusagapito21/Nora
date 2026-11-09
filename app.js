/* Nora, painel de finanças pessoais: lê extratos CSV do Revolut, categoriza, mostra metas, previsões e gráficos. Tudo fica no navegador (localStorage). */
/* aviso rápido usado pelo painel (salvou, importou, erro); fica aqui, e não inline no index.html, por causa da CSP */
(function () {
  var el = document.getElementById('toast'), txt = document.getElementById('toast-txt'), t;
  /* aviso: identificador estável do aviso (data-aviso), para o roteiro de telas não depender do texto */
  window.__cortexToast = function (msg, erro, ms, aviso) {
    txt.textContent = msg;
    if (aviso) el.setAttribute('data-aviso', aviso); else el.removeAttribute('data-aviso');
    el.classList.toggle('erro', !!erro);
    el.hidden = false;
    clearTimeout(t);
    t = setTimeout(function () { el.hidden = true; }, ms || 6000);
  };
})();
(function () {
  'use strict';

  /*CORE-START*/
  /* erro com um código estável e as variáveis, para a tela traduzir (textoErro, no i18n.js); a mensagem continua a frase em
     pt-BR de sempre, que os testes conferem e que vale como reserva. Em vars, número é quantidade (a tela formata) e texto
     (nome de carteira, de arquivo, id) entra como está */
  function erroCod(codigo, vars, texto) { var e = new Error(texto); e.codigo = codigo; e.vars = vars || {}; return e; }
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
  /* nomes padrão que ficam gravados nos dados, sempre em pt-BR: as metas de poupança de fábrica (gravadas ao salvar o
     formulário) e o "Contas no Brasil" que a migração da v1 põe na categoria brasil. Sem marcador nem versão nova: é
     padrão o nome de um id de fábrica igual ao texto da chave em qualquer dicionário, ou a um texto pt-BR antigo
     (NOMES_ANTIGOS). Padrão é traduzido na tela; o que a pessoa digitou nunca muda. Mudou um texto padrão em
     i18n/pt-BR.js? Acrescente o antigo em NOMES_ANTIGOS (tests/nomes-padrao.test.mjs trava isso). */
  var NOMES_PADRAO = {
    meta: { reserva: 'metas.padrao.reserva', invest: 'metas.padrao.invest', viagens: 'metas.padrao.viagens', viagem: 'metas.padrao.viagem' },
    cat: { brasil: 'cats.brasil.antigo' }
  };
  var NOMES_ANTIGOS = {};
  /* a chave do dicionário se o nome é o padrão daquele id; senão null */
  function chavePadrao(tipo, id, nome) {
    var k = NOMES_PADRAO[tipo] && Object.prototype.hasOwnProperty.call(NOMES_PADRAO[tipo], id) ? NOMES_PADRAO[tipo][id] : null;
    if (!k || typeof nome !== 'string') return null;
    var textos = (NOMES_ANTIGOS[k] || []).slice(), dics = typeof NORA_DICIONARIOS !== 'undefined' ? NORA_DICIONARIOS : {};
    Object.keys(dics).forEach(function (i) { if (typeof dics[i][k] === 'string') textos.push(dics[i][k]); });
    return textos.indexOf(nome) >= 0 ? k : null;
  }
  /* o nome para mostrar: a tradução (tr = t do i18n.js) só quando é padrão; sem tradução, o próprio nome */
  function nomeExibido(tipo, id, nome, tr) {
    var k = chavePadrao(tipo, id, nome), s = k && tr ? tr(k) : null;
    return typeof s === 'string' && s && s !== k ? s : nome;
  }
  /* o nome para gravar: campo igual a um padrão (de qualquer idioma) grava o texto pt-BR padrão */
  function nomeParaGravar(tipo, id, digitado) {
    var k = chavePadrao(tipo, id, digitado), pt = k && typeof NORA_DICIONARIOS !== 'undefined' && NORA_DICIONARIOS['pt-BR'] ? NORA_DICIONARIOS['pt-BR'][k] : null;
    return typeof pt === 'string' ? pt : digitado;
  }
  /* tr: a função de tradução (nos testes, a de um idioma); sem ela, a do i18n.js */
  function montarCats(plan, tr) {
    tr = tr || (typeof NORA_I18N !== 'undefined' ? NORA_I18N.t : null);
    var p = plan || {}, nomes = p.nomes || {}, ocultas = p.ocultas || [], fixas = Array.isArray(p.fixas) ? p.fixas : FIXAS_PADRAO;
    var lista = CATS.filter(function (c) { return c.id !== 'outros'; }).map(function (c) { return Object.assign({}, c); });
    (p.proprias || []).forEach(function (c) { lista.push({ id: c.id, nome: c.nome, slot: c.slot, propria: true }); });
    lista.push(Object.assign({}, CAT_BY.outros));
    return lista.map(function (c) {
      return Object.assign(c, { padrao: c.propria ? c.nome : CAT_BY[c.id].nome, nome: (!c.propria && nomes[c.id] && nomeExibido('cat', c.id, nomes[c.id], tr)) || c.nome,
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
    if (!nome) throw erroCod('categoria.semNome', {}, 'a categoria precisa de um nome');
    var livres = slotsLivres(plan);
    if (!livres.length) throw erroCod('categoria.semCor', { max: MAX_CORES }, 'as ' + MAX_CORES + ' cores estão em uso: esconda uma categoria para liberar a cor dela');
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
  /* leitores próprios de banco (parsers/<banco>.js, carregados antes deste arquivo; contrato no começo de
     parsers/revolut.js). Banco sem leitor usa o importador genérico */
  var LEITORES = { revolut: LEITOR_REVOLUT({ cents: cents, isoDate: isoDate }), btg: LEITOR_BTG({ cents: cents, interpretarCSV: interpretarCSV }),
    itau: LEITOR_ITAU({ interpretarCSV: interpretarCSV, lerData: lerData, lerNumero: lerNumero }) };
  /* Pix para o titular depois da importação (carteira do Itaú): a chave de cada um como em over (saída: a descrição;
     entrada: "+" e a descrição) e o que a sugestão grava (saída: Envios para outra conta sua; entrada: Entre contas
     suas). Ficam de fora os que já têm escolha manual; os que a sugestão marcou voltam em "aplicados". */
  function chavePix(t) { var k = String(t[1]).toUpperCase().replace(/\s+/g, ' ').trim(); return t[3] > 0 ? '+' + k : k; }
  function marcaPix(chave) { return chave.charAt(0) === '+' ? '_ignore' : 'brasil'; }
  function pixParaTitular(months, over, titular, aplicados) {
    var ap = {}, pend = [], vistos = {};
    over = over || {};
    (aplicados || []).forEach(function (k) { if (over[k] === marcaPix(k)) ap[k] = 1; });
    Object.keys(months || {}).sort().forEach(function (m) {
      (months[m] || []).forEach(function (t) {
        if (!LEITORES.itau.pixDoTitular(t[1], titular)) return;
        var k = chavePix(t);
        if (ap[k] || over[k] || vistos[k]) return;
        vistos[k] = 1; pend.push({ data: t[0], desc: t[1], valor: t[3], chave: k });
      });
    });
    return { pendentes: pend, aplicados: Object.keys(ap) };
  }
  function aplicarPixTitular(over, aplicados, chaves) {
    var o = Object.assign({}, over || {}), a = (aplicados || []).slice();
    chaves.forEach(function (k) { o[k] = marcaPix(k); if (a.indexOf(k) < 0) a.push(k); });
    return { over: o, aplicados: a };
  }
  /* só desfaz o que ainda está como a sugestão gravou: escolha feita depois, à mão, fica */
  function desfazerPixTitular(over, aplicados) {
    var o = Object.assign({}, over || {});
    (aplicados || []).forEach(function (k) { if (o[k] === marcaPix(k)) delete o[k]; });
    return { over: o, aplicados: [] };
  }
  /* o banco pelo conteúdo do arquivo (cabeçalho), ou null */
  function detectarBanco(rows) {
    var ks = Object.keys(LEITORES);
    for (var i = 0; i < ks.length; i++) if (LEITORES[ks[i]].reconhece(rows)) return ks[i];
    return null;
  }
  var extractTx = LEITORES.revolut.extractTx, moedasNoExtrato = LEITORES.revolut.moedasNoExtrato, extractSummary = LEITORES.revolut.extractSummary;
  /* com meses salvos, a moeda da configuração não muda: os valores estão na moeda da conta e não seriam
     convertidos, só passariam a aparecer com outro símbolo */
  function moedaTravada(months) {
    return Object.keys(months || {}).some(function (k) { return Array.isArray(months[k]) && months[k].length > 0; });
  }
  function txKey(t) { return t[0] + '|' + t[1] + '|' + t[3] + '|' + t[4]; }

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
    /* tipos que um leitor de banco já sabe (parsers/btg.js): investimento (saída é aplicação, entrada é resgate)
       e pagamento de fatura do cartão (sempre "Pessoas, taxas e outros", sem regra de comerciante) */
    if (rc === 'Invest') kind = 'invest';
    else if (rc === 'Fatura' && a < 0) { kind = 'gasto'; cat = 'outros'; }
    /* parsers/itau.js: rendimento (dividendos, JSCP, rendimento de aplicação) é "Outras entradas"; o estorno de um
       débito automático volta como devolução na mesma categoria que o débito teria (as mesmas regras) */
    else if (rc === 'Rendimento' && a > 0) kind = 'outras';
    else if (rc === 'Estorno' && a > 0) { kind = 'gasto'; cat = byRule(D, a, 'Others', pais); }
    else if (a > 0) {
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
    if (!months || typeof months !== 'object' || Array.isArray(months)) throw erroCod('dados.mesesFormato', {}, 'meses em formato errado');
    Object.keys(months).forEach(function (m) {
      if (!/^\d{4}-\d{2}$/.test(m) || !Array.isArray(months[m])) throw erroCod('dados.mesFormato', { mes: m }, 'mês ' + m + ' em formato errado');
    });
    return months;
  }
  /* v1, v2 ou v3 → v3 (o passo antigo, mantido para a migração e para o teste de ida e volta) */
  function migrarAteV3(x, titularAntigo) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw erroCod('dados.naoSaoDados', {}, 'não são dados do painel');
    var v = x.v == null ? 1 : x.v;
    if (v !== 1 && v !== 2 && v !== 3) throw erroCod('dados.versaoDesconhecida', { versao: String(v) }, 'versão ' + v + ' desconhecida');
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
    if (!Array.isArray(ps) || ps.some(function (p) { return !p || !ISO.test(p.de) || !ISO.test(p.ate); })) throw erroCod('dados.periodosFormato', { carteira: id }, 'períodos em formato errado na carteira ' + id);
    return juntarPeriodos(ps);
  }
  /* transf: { id do movimento: { c: carteira da outra ponta, id: movimento dela, lado: 's' | 'e', marca } };
     sugDispensadas: chaves de par (texto JSON de [carteira e movimento da saída, carteira e movimento da entrada]) */
  function checarTransf(w) {
    var t = w.transf, erro = 'transferências em formato errado na carteira ' + w.id;
    if (typeof t !== 'object' || Array.isArray(t)) throw erroCod('dados.transfFormato', { carteira: w.id }, erro);
    Object.keys(t).forEach(function (k) {
      var r = t[k];
      if (!r || typeof r.c !== 'string' || typeof r.id !== 'string' || (r.lado !== 's' && r.lado !== 'e') || typeof r.marca !== 'boolean') throw erroCod('dados.transfItemFormato', { carteira: w.id }, erro);
    });
    if (!Array.isArray(w.sugDispensadas) || w.sugDispensadas.some(function (k) {
      try { var a = JSON.parse(k); return !Array.isArray(a) || a.length !== 4 || a.some(function (v) { return typeof v !== 'string'; }); } catch (e) { return true; }
    })) throw erroCod('dados.dispensadasFormato', { carteira: w.id }, 'sugestões dispensadas em formato errado na carteira ' + w.id);
  }
  /* pixTitular: as chaves (como em over) que a sugestão de Pix para o titular marcou; "Desfazer" só tira essas */
  function checarPixTitular(l, id) {
    if (l == null) return l;
    if (!Array.isArray(l) || l.some(function (k) { return typeof k !== 'string'; })) throw erroCod('dados.pixTitularFormato', { carteira: id }, 'Pix marcados como seus em formato errado na carteira ' + id);
    return l;
  }
  /* importacao: { código do cabeçalho: { sep, data, desc, valor, ... } }, as colunas lembradas do importador */
  function checarImportacao(imp, id) {
    var erro = 'colunas do importador em formato errado na carteira ' + id;
    if (imp == null) return imp;
    if (typeof imp !== 'object' || Array.isArray(imp)) throw erroCod('dados.colunasFormato', { carteira: id }, erro);
    Object.keys(imp).forEach(function (k) {
      var m = imp[k];
      if (!m || typeof m !== 'object' || typeof m.sep !== 'string' || !(m.data >= 0) || !(m.desc >= 0) || !m.valor || typeof m.valor !== 'object') throw erroCod('dados.colunasItemFormato', { carteira: id }, erro);
    });
    return imp;
  }
  /* cambios: { moeda: { rate, data } }, quantos dessa moeda valem 1 da principal e quando a pessoa informou */
  function checarCambios(cs) {
    if (cs == null) return {};
    if (typeof cs !== 'object' || Array.isArray(cs)) throw erroCod('dados.cambioFormato', {}, 'câmbio em formato errado');
    Object.keys(cs).forEach(function (m) {
      var c = cs[m];
      if (!/^[A-Z]{3}$/.test(m) || !c || typeof c !== 'object' || !isFinite(+c.rate) || +c.rate < 0 || (c.data != null && !ISO.test(c.data))) throw erroCod('dados.cambioMoedaFormato', { moeda: m }, 'câmbio de ' + m + ' em formato errado');
    });
    return cs;
  }
  function semCarteira(transf, ids) {
    var o = {}; Object.keys(transf).forEach(function (k) { if (ids[transf[k].c]) o[k] = transf[k]; }); return o;
  }
  /* confere e completa uma v4; devolve uma cópia (nunca a mesma referência de cima) */
  function validarV4(x) {
    if (!Array.isArray(x.carteiras) || !x.carteiras.length) throw erroCod('dados.nenhumaCarteira', {}, 'nenhuma carteira');
    if (x.carteiras.length > MAX_CARTEIRAS) throw erroCod('dados.carteirasDemais', { max: MAX_CARTEIRAS }, 'mais de ' + MAX_CARTEIRAS + ' carteiras');
    var ids = {};
    var carteiras = x.carteiras.map(function (c) {
      if (!c || typeof c !== 'object') throw erroCod('dados.carteiraFormato', {}, 'carteira em formato errado');
      if (typeof c.id !== 'string' || !c.id) throw erroCod('dados.carteiraSemId', {}, 'carteira sem id');
      if (ids[c.id]) throw erroCod('dados.carteiraRepetida', { carteira: c.id }, 'carteira ' + c.id + ' repetida');
      ids[c.id] = 1;
      if (!/^[A-Z]{3}$/.test(c.moeda || '')) throw erroCod('dados.moedaInvalida', { moeda: String(c.moeda), carteira: c.id }, 'moeda ' + c.moeda + ' inválida na carteira ' + c.id);
      var w = Object.assign({}, c, { nome: String(c.nome || 'Carteira'), pais: c.pais || 'IE', banco: c.banco || 'revolut', months: checarMeses(c.months || {}),
        over: c.over || {}, summary: c.summary || null, metas: c.metas || {}, transf: c.transf || {}, sugDispensadas: c.sugDispensadas || [] });
      w.periodos = c.periodos === undefined ? periodosMigrados(w) : checarPeriodos(c.periodos, c.id);
      checarTransf(w);
      checarImportacao(w.importacao, c.id);
      checarPixTitular(w.pixTitular, c.id);
      if (w.envios != null && w.envios !== 'gasto' && w.envios !== 'movido') throw erroCod('dados.enviosFormato', { carteira: c.id }, 'opção de envios em formato errado na carteira ' + c.id);
      if (w.enviosDecidido != null && typeof w.enviosDecidido !== 'boolean') throw erroCod('dados.avisoEnviosFormato', { carteira: c.id }, 'resposta do aviso de envios em formato errado na carteira ' + c.id);
      return w;
    });
    /* transferência com uma carteira que não existe mais (backup antigo): sai, e a ponta volta ao que era */
    carteiras.forEach(function (w) { w.transf = semCarteira(w.transf, ids); w.sugDispensadas = w.sugDispensadas.filter(function (k) { return ids[JSON.parse(k)[0]] && ids[JSON.parse(k)[2]]; }); });
    var config = Object.assign({}, x.config || {});
    if (!config.moedaPrincipal) config.moedaPrincipal = carteiras[0].moeda;
    return { v: 4, config: config, carteiras: carteiras, ativa: ids[x.ativa] ? x.ativa : carteiras[0].id, cambios: checarCambios(x.cambios), div: x.div || null };
  }
  function migrate(x, titularAntigo) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw erroCod('dados.naoSaoDados', {}, 'não são dados do painel');
    if (x.v === 4) return validarV4(x);
    return paraV4(migrarAteV3(x, titularAntigo));
  }
  /* v4 → v3, só com uma carteira: para voltar atrás e para provar que a migração não perde nada */
  function paraV3(x) {
    if (x.carteiras.length > 1) throw erroCod('interno.v3UmaCarteira', {}, 'mais de uma carteira: não cabe na v3');
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
  var BANCOS = [['revolut', 'Revolut'], ['aib', 'AIB'], ['boi', 'Bank of Ireland'], ['wise', 'Wise'], ['nubank', 'Nubank'], ['btg', 'BTG Pactual'], ['itau', 'Itaú'], ['outro', 'Outro banco']];
  var COM_LEITOR = Object.keys(LEITORES);
  function temLeitor(banco) { return COM_LEITOR.indexOf(banco) >= 0; }
  function acharCarteira(x, id) {
    var c = x.carteiras.filter(function (w) { return w.id === id; })[0];
    if (!c) throw erroCod('interno.carteiraNaoExiste', { carteira: id }, 'a carteira ' + id + ' não existe');
    return c;
  }
  function nomeCarteira(x, nome, id) {
    nome = String(nome || '').trim().slice(0, 40);
    if (!nome) throw erroCod('carteira.semNome', {}, 'a carteira precisa de um nome');
    var igual = x.carteiras.filter(function (w) { return w.id !== id && w.nome.toLowerCase() === nome.toLowerCase(); })[0];
    if (igual) throw erroCod('carteira.nomeRepetido', { nome: igual.nome }, 'já existe uma carteira chamada ' + igual.nome);
    return nome;
  }
  /* países do cadastro da carteira, com a moeda de cada um: os 27 que usam o euro (os 21 da zona do euro, mais
     Andorra, Mônaco, San Marino, Vaticano, Montenegro e Kosovo), o Brasil e o Reino Unido. Nomes por enquanto fixos
     em português; o código é o ISO (Kosovo: XK). Escolher a moeda põe os países dela no topo; escolher o país preenche a moeda. */
  var PAISES_MOEDA = [
    ['DE', 'Alemanha', 'EUR'], ['AD', 'Andorra', 'EUR'], ['AT', 'Áustria', 'EUR'], ['BE', 'Bélgica', 'EUR'], ['BR', 'Brasil', 'BRL'],
    ['BG', 'Bulgária', 'EUR'], ['CY', 'Chipre', 'EUR'], ['HR', 'Croácia', 'EUR'], ['SK', 'Eslováquia', 'EUR'], ['SI', 'Eslovênia', 'EUR'],
    ['ES', 'Espanha', 'EUR'], ['EE', 'Estônia', 'EUR'], ['FI', 'Finlândia', 'EUR'], ['FR', 'França', 'EUR'], ['GR', 'Grécia', 'EUR'],
    ['IE', 'Irlanda', 'EUR'], ['IT', 'Itália', 'EUR'], ['XK', 'Kosovo', 'EUR'], ['LV', 'Letônia', 'EUR'], ['LT', 'Lituânia', 'EUR'],
    ['LU', 'Luxemburgo', 'EUR'], ['MT', 'Malta', 'EUR'], ['MC', 'Mônaco', 'EUR'], ['ME', 'Montenegro', 'EUR'], ['NL', 'Países Baixos', 'EUR'],
    ['PT', 'Portugal', 'EUR'], ['GB', 'Reino Unido', 'GBP'], ['SM', 'San Marino', 'EUR'], ['VA', 'Vaticano', 'EUR']
  ];
  /* moeda sem país na lista (ex.: USD): todos os países */
  function paisesDaMoeda(m) { var l = PAISES_MOEDA.filter(function (p) { return p[2] === m; }); return l.length ? l : PAISES_MOEDA.slice(); }
  function moedaDoPais(p) { var x = PAISES_MOEDA.filter(function (q) { return q[0] === p; })[0]; return x ? x[2] : null; }
  /* o país que entra quando a moeda muda e o país atual não usa essa moeda: no euro, a Irlanda (tem regras de lojas) */
  function paisPadraoDaMoeda(m) { var l = paisesDaMoeda(m); return l.some(function (p) { return p[0] === 'IE'; }) ? 'IE' : l[0][0]; }
  /* "Adicionar carteira": o banco sugere moeda e país, só enquanto a pessoa não mexeu em nenhum dos dois.
     Wise e "Outro banco" não sugerem nada (a Wise tem conta em várias moedas). Carteira existente nunca passa por aqui. */
  var BANCO_MOEDA_PAIS = { btg: ['BRL', 'BR'], itau: ['BRL', 'BR'], nubank: ['BRL', 'BR'], revolut: ['EUR', 'IE'], aib: ['EUR', 'IE'], boi: ['EUR', 'IE'] };
  function preenchimentoDoBanco(banco, mexeu) { var b = BANCO_MOEDA_PAIS[banco]; return b && !mexeu ? { moeda: b[0], pais: b[1] } : null; }
  function conferirMoeda(m) { if (!/^[A-Z]{3}$/.test(m || '')) throw erroCod('carteira.moedaInvalida', { moeda: String(m) }, 'moeda ' + m + ' inválida'); return m; }
  function conferirBanco(b) { if (!BANCOS.some(function (o) { return o[0] === b; })) throw erroCod('carteira.bancoDesconhecido', { banco: String(b) }, 'tipo de extrato ' + b + ' desconhecido'); return b; }
  /* a principal é a primeira; se a moeda dela mudou, o câmbio digitado deixa de valer */
  function comPrincipal(x, carteiras, ativa) {
    var mp = carteiras.length === 1 ? carteiras[0].moeda : x.config.moedaPrincipal, config = Object.assign({}, x.config, { moedaPrincipal: mp });
    return Object.assign({}, x, { config: config, carteiras: carteiras, ativa: ativa, cambios: mp === x.config.moedaPrincipal ? x.cambios : {} });
  }
  function novaCarteira(x, d) {
    if (x.carteiras.length >= MAX_CARTEIRAS) throw erroCod('carteira.limite', { max: MAX_CARTEIRAS }, 'já há ' + MAX_CARTEIRAS + ' carteiras: exclua uma para criar outra');
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
      if (travada) throw erroCod('carteira.moedaTravada', {}, 'a moeda não muda depois que há extratos salvos: crie outra carteira');
      c.moeda = conferirMoeda(d.moeda);
    }
    if (d.banco && d.banco !== c0.banco) {
      if (travada) throw erroCod('carteira.bancoTravado', {}, 'o tipo de extrato não muda depois que há extratos salvos: crie outra carteira');
      c.banco = conferirBanco(d.banco);
    }
    /* envios para outra conta sua: gasto (padrão, sem o campo) ou dinheiro movido; muda a qualquer hora */
    if (d.envios != null && d.envios !== 'gasto' && d.envios !== 'movido') throw erroCod('carteira.enviosDesconhecido', { opcao: String(d.envios) }, 'opção de envios desconhecida: ' + d.envios);
    /* mudar a opção em Configurações também responde o aviso dos envios (ele não volta) */
    if (d.envios && d.envios !== (c0.envios === 'movido' ? 'movido' : 'gasto')) c.enviosDecidido = true;
    if (d.envios === 'movido') c.envios = 'movido';
    else if (d.envios === 'gasto') delete c.envios;
    return comPrincipal(x, x.carteiras.map(function (w) { return w.id === id ? c : w; }), x.ativa);
  }
  function excluirCarteira(x, id) {
    acharCarteira(x, id);
    if (x.carteiras.length === 1) throw erroCod('interno.unicaCarteira', {}, 'a única carteira não se exclui: use Apagar meus dados');
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
    try { x = JSON.parse(texto); } catch (e) { throw erroCod('dados.jsonInvalido', {}, 'o conteúdo não é JSON válido'); }
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
        trechos: ps.length, colunas: Object.keys(c.importacao || {}).length, envios: c.envios === 'movido' ? 'movido' : 'gasto' };
    });
    return { carteiras: cs, moedaPrincipal: x.config.moedaPrincipal, titular: x.config.titular || '',
      cambios: Object.keys(x.cambios || {}).sort().map(function (m) { return { moeda: m, rate: +x.cambios[m].rate, data: x.cambios[m].data || null }; }),
      transf: transf, dispensadas: Object.keys(disp).length };
  }
  /* aviso dos envios: no período todo da carteira (não mês a mês), quando os envios para outra conta sua que
     contam como gasto passam de 50% do Gastou, com pelo menos 3 envios. Só a conta: quem decide é a pessoa. */
  var AVISO_ENVIOS = { minimo: 3, fracao: 0.5 };
  function avisoEnvios(model) {
    var n = 0, soma = 0, gasto = 0;
    model.rows.forEach(function (r) { if (r.kind === 'gasto' && r.cat === 'brasil' && r.a < 0) { n++; soma -= r.a; } });
    model.keys.forEach(function (k) { gasto += model.by[k].gasto; });
    return n >= AVISO_ENVIOS.minimo && gasto > 0 && soma > AVISO_ENVIOS.fracao * gasto ? { n: n, soma: soma, gasto: gasto, fracao: soma / gasto } : null;
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
  /* opcoes.envios === 'movido': "Envios para outra conta sua" desta carteira é dinheiro movido, não gasto (a
     categoria fica, para mostrar). movido do mês = o que saiu líquido para outras contas suas: os "Entre contas
     suas" e, nesse modo, os envios; assim entrou − gastou − guardou − movido é a variação do saldo da conta. */
  function buildModel(months, over, titular, pais, cats, saldos, transf, opcoes) {
    var movidos = !!(opcoes && opcoes.envios === 'movido');
    var rows = [], by = {}, txs = [], vistos = {};
    cats = cats || montarCats(null);
    Object.keys(months).sort().forEach(function (m) { months[m].forEach(function (t) {
      var k = txKey(t), r = classify(t, over, titular, pais, cats), tf;
      vistos[k] = (vistos[k] || 0) + 1; r.id = k + '#' + vistos[k];
      if (transf && (tf = transf[r.id])) { r.transf = tf; if (tf.marca) { r.kind = 'interno'; r.cat = null; } }
      if (movidos && r.kind === 'gasto' && r.cat === 'brasil') r.kind = 'movido';
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
      var g = by[r.m] || (by[r.m] = { m: r.m, renda: 0, outras: 0, flex: 0, inv: 0, interno: 0, mov: 0, spend: {}, n: 0 });
      g.n++;
      if (r.kind === 'renda') g.renda += r.a;
      else if (r.kind === 'outras') g.outras += r.a;
      else if (r.kind === 'flex') g.flex += r.a;
      else if (r.kind === 'invest') g.inv += r.a;
      else if (r.kind === 'interno') g.interno += r.a;
      else if (r.kind === 'movido') g.mov += r.a;
      else g.spend[r.cat] = (g.spend[r.cat] || 0) - r.a;
    });
    var keys = Object.keys(by).sort();
    keys.forEach(function (m) {
      var g = by[m]; g.entrou = g.renda + g.outras; g.gasto = 0;
      Object.keys(g.spend).forEach(function (id) { g.gasto += g.spend[id]; });
      g.saved = -(g.flex + g.inv) || 0; /* sem nada guardado, 0 (e não −0) */
      g.movido = -(g.interno + g.mov) || 0;
      g.envios = (g.spend.brasil || 0) - g.mov; /* envios para outra conta sua, sejam gasto ou dinheiro movido */
      g.saldo = g.entrou - g.gasto - g.saved - g.movido;
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
      catch (e) { if (cod === 'utf-8') throw erroCod('arquivo.naoUtf8', {}, 'o arquivo não é UTF-8 válido'); }
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
  /* aplica o mapeamento: { tx, linhas (número da linha no arquivo de cada tx), ignoradas: [{ n, cod, motivo, celulas }] (cod para a tela traduzir; motivo, a frase pt-BR de reserva),
     de, ate, entradas, saidas, saldos: { data: centavos }, nSaldo } (centavos).
     O saldo é do fim do dia e vale para a data, nunca para a linha: vem de uma coluna (m.saldo) ou de linhas
     próprias (m.saldoLinhas, a descrição dessas linhas, ex.: "Saldo Diário"). Ele nunca vira movimento, e o
     movimento guarda null no lugar do saldo (a chave de reimportação não depende dele). */
  function normDesc(s) { return String(s || '').trim().replace(/\s+/g, ' ').toUpperCase(); }
  function interpretarCSV(rows, m) {
    var tx = [], ns = [], ign = [], sal = [], v = m.valor, fmtN = m.fmtNum || 'ponto', rotulo = m.saldoLinhas ? normDesc(m.saldoLinhas) : null;
    linhasDeDados(rows, m).forEach(function (x) {
      var r = x.r, d = lerData(r[m.data], m.fmtData), a;
      if (!d) { ign.push({ n: x.n, cod: 'semData', motivo: 'sem data válida', celulas: r }); return; }
      /* linha de saldo (ex.: "Saldo Diário"): o valor dela é o saldo do fim do dia */
      if (rotulo && normDesc(r[m.desc]) === rotulo) {
        var vs = v.modo === 'duas' ? null : lerNumero(r[v.col], fmtN);
        if (vs != null && !isNaN(vs)) sal.push([d, vs]); else ign.push({ n: x.n, cod: 'saldoSemValor', motivo: 'linha de saldo sem valor', celulas: r });
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
      if (a == null || isNaN(a)) { ign.push({ n: x.n, cod: 'valorRuim', motivo: 'valor não entendido', celulas: r }); return; }
      if (!a) { ign.push({ n: x.n, cod: 'valorZero', motivo: 'valor zero', celulas: r }); return; }
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
  var ARREDONDAMENTO = 5;
  function conferirSaldos(tx, saldos, ancora) {
    var ks = Object.keys(saldos || {}).sort(), div = [], i, cmp = null;
    for (i = 1; i < ks.length; i++) {
      var soma = 0;
      tx.forEach(function (t) { if (t[0] > ks[i - 1] && t[0] <= ks[i]) soma += t[3]; });
      var dif = saldos[ks[i]] - (saldos[ks[i - 1]] + soma);
      var dias = Math.round((Date.parse(ks[i]) - Date.parse(ks[i - 1])) / 864e5);
      /* até R$ 0,05 (5 centavos) é arredondamento do banco: nem alerta, nem nota de rendimento */
      if (Math.abs(dif) > ARREDONDAMENTO) div.push({ de: ks[i - 1], ate: ks[i], dif: dif, tipo: dif > 0 && dif <= RENDIMENTO_DIA * dias ? 'rendimento' : 'falta' });
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
    if (R.e.r + 1 > LIMITE_LINHAS) throw erroCod('arquivo.linhasDemais', { max: LIMITE_LINHAS }, 'a planilha passa de ' + LIMITE_LINHAS.toLocaleString('pt-BR') + ' linhas');
    for (r = 0; r <= R.e.r; r++) {
      row = [];
      for (c = 0; c <= R.e.c; c++) row.push(textoCelula(X, ws[X.utils.encode_cell({ r: r, c: c })], d1904));
      rows.push(row);
    }
    return rows;
  }
  /* as abas com algum conteúdo; fórmulas não são calculadas (vale o valor que o arquivo já traz) */
  function lerPlanilha(X, bytes, tipo) {
    if (bytes.length > LIMITE_PLANILHA) throw erroCod('arquivo.planilhaGrande', { mb: 15 }, 'o arquivo passa de 15 MB');
    var op = { cellNF: true, cellDates: false, cellFormula: false, sheetRows: LIMITE_LINHAS + 1, raw: true }, wb;
    try { wb = tipo === 'html' || tipo === 'xml' ? X.read(decodificar(bytes).texto, Object.assign({ type: 'string' }, op)) : X.read(bytes, Object.assign({ type: 'array' }, op)); }
    catch (e) { throw /password|encrypt/i.test(e && e.message) ? erroCod('arquivo.planilhaSenha', {}, SENHA) : erroCod('arquivo.planilhaDanificada', {}, 'a planilha está danificada ou incompleta'); }
    var d1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
    var abas = (wb.SheetNames || []).map(function (n) { return { nome: String(n), rows: linhasDaAba(X, wb.Sheets[n], d1904) }; })
      .filter(function (a) { return linhasCheias(a.rows).length; });
    if (!abas.length) throw erroCod('arquivo.planilhaVazia', {}, 'a planilha não tem nenhuma tabela');
    return abas;
  }
  /* ---------- PDF (extrato do Itaú) ----------
     O pdf.js (vendor/pdfjs) entra como parâmetro, como o SheetJS; o núcleo não sabe de onde ele vem nem usa DOM.
     lerPdf devolve, de cada página, os trechos de texto com a posição (x da esquerda, y a partir do topo, largura);
     tabelaDoPdf monta as linhas da tabela pelas colunas do cabeçalho. */
  var LIMITE_PDF = 10 * 1024 * 1024, LIMITE_PAGINAS_PDF = 50;
  var SENHA_PDF = 'o PDF está protegido por senha. Abra e salve sem senha, ou baixe o extrato de novo pelo app do banco';
  function lerPdf(pdfjs, bytes) {
    if (bytes.length > LIMITE_PDF) return Promise.reject(erroCod('arquivo.pdfGrande', { mb: 10 }, 'o PDF passa de 10 MB'));
    /* uma cópia dos bytes: o pdf.js fica com o buffer que recebe */
    var tarefa = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
    return tarefa.promise.then(function (d) {
      if (d.numPages > LIMITE_PAGINAS_PDF) throw erroCod('arquivo.pdfPaginas', { max: LIMITE_PAGINAS_PDF }, 'o PDF passa de ' + LIMITE_PAGINAS_PDF + ' páginas');
      var n = [];
      for (var i = 1; i <= d.numPages; i++) n.push(i);
      return n.reduce(function (acc, k) { return acc.then(function (ps) { return paginaPdf(d, k).then(function (p) { ps.push(p); return ps; }); }); }, Promise.resolve([]));
    }).then(function (ps) { tarefa.destroy(); return ps; }, function (e) {
      tarefa.destroy();
      if (e && e.name === 'PasswordException') throw erroCod('arquivo.pdfSenha', {}, SENHA_PDF);
      if (e && e.codigo === 'arquivo.pdfPaginas') throw e;
      throw erroCod('arquivo.pdfDanificado', {}, 'o PDF está danificado ou incompleto');
    });
  }
  /* o texto pelo stream, lido à mão (o atalho getTextContent falha no WebKit) */
  function paginaPdf(doc, k) {
    return doc.getPage(k).then(function (pg) {
      var alt = pg.getViewport({ scale: 1 }).height, rd = pg.streamTextContent().getReader(), itens = [];
      var ler = function () {
        return rd.read().then(function (r) {
          if (r.done) return { altura: alt, itens: itens };
          r.value.items.forEach(function (i) { if (i.str && i.str.trim()) itens.push({ s: i.str, x: i.transform[4], y: alt - i.transform[5], w: i.width }); });
          return ler();
        });
      };
      return ler();
    });
  }
  /* trechos na mesma altura (até 2 pt) formam uma linha, da esquerda para a direita */
  function linhasPdf(itens) {
    var ls = [];
    itens.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; }).forEach(function (i) {
      var l = ls.filter(function (z) { return Math.abs(z.y - i.y) <= 2; })[0];
      if (l) l.itens.push(i); else ls.push({ y: i.y, itens: [i] });
    });
    ls.forEach(function (l) { l.itens.sort(function (a, b) { return a.x - b.x; }); });
    return ls;
  }
  /* o pdf.js parte o texto em trechos do jeito dele ("valor" e "(R$)" podem vir separados): trechos a menos de 6 pt
     um do outro viram um bloco só, com espaço quando há folga e colados quando encostam (o banco cola palavras,
     como "FATURAAZUL"). As colunas do extrato ficam bem mais longe umas das outras (a menor folga é de 17 pt). */
  function blocosPdf(its) {
    var bs = [];
    its.forEach(function (i) {
      var b = bs[bs.length - 1], folga = b ? i.x - (b.x + b.w) : Infinity;
      if (folga < 6) { b.s += (folga > 1 ? ' ' : '') + i.s.trim(); b.w = i.x + i.w - b.x; }
      else bs.push({ s: i.s.trim(), x: i.x, y: i.y, w: i.w });
    });
    bs.forEach(function (b) { b.s = b.s.replace(/\s+/g, ' ').trim(); });
    return bs;
  }
  var CAB_PDF = 'DATA|LANCAMENTOS|VALOR (R$)|SALDO (R$)', TOL_PDF = 6;
  /* linhas [data, lançamentos, valor, saldo]. As colunas vêm do cabeçalho (só a primeira página do Itaú tem; as
     outras usam o último visto); número vai para a coluna cuja borda direita está mais perto (são alinhados à
     direita). Antes do primeiro cabeçalho, só a linha do período é copiada (dados pessoais e o quadro de saldos
     nunca); fora da tabela, linha vazia, para os números de linha continuarem os do arquivo. */
  function tabelaDoPdf(paginas) {
    var rows = [], col = null, comTexto = 0;
    paginas.forEach(function (p) {
      if (p.itens.length) comTexto++;
      linhasPdf(p.itens).forEach(function (l) {
        var its = blocosPdf(l.itens), chave = its.map(function (i) { return semAcento(normDesc(i.s)); }).join('|');
        if (chave === CAB_PDF) {
          col = { data: its[0].x, valor: its[2].x + its[2].w, saldo: its[3].x + its[3].w };
          rows.push(its.map(function (i) { return i.s.trim(); }));
          return;
        }
        if (!col) { var t = its.map(function (b) { return b.s; }).join(' '); rows.push(/^PERIODO\b/.test(semAcento(normDesc(t))) ? [t] : []); return; }
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(its[0].s.trim()) || Math.abs(its[0].x - col.data) > TOL_PDF) { rows.push([]); return; }
        var desc = [], valor = '', saldo = '';
        its.slice(1).forEach(function (i) {
          var v = i.s.trim(), dir = i.x + i.w, dv = Math.abs(dir - col.valor), ds = Math.abs(dir - col.saldo);
          if (/^-?[\d.]+,\d{2}$/.test(v) && Math.min(dv, ds) <= TOL_PDF) { if (dv <= ds) valor = v; else saldo = v; }
          else desc.push(i);
        });
        rows.push([its[0].s.trim(), desc.map(function (b) { return b.s; }).join(' '), valor, saldo]);
      });
    });
    return { linhas: rows, paginas: paginas.length, comTexto: comTexto };
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
    return function (id) { if (id === 'brasil' && c.envios === 'movido') return 0; var v = def[id]; return v != null && v !== '' && !isNaN(v) ? +v : (sug ? sug.cats[id] || 0 : 0); };
  }
  /* cada carteira com o modelo dela, o período importado ("dados até") e o saldo atual (só o da conta).
     faltaCambio: moedas de carteiras com extrato que não têm câmbio; sem elas, nenhum total sai. */
  function resumir(x) {
    var mp = x.config.moedaPrincipal, ws = x.carteiras.map(function (c) {
      var cats = montarCats(juntarPlan(x.config, c)), M = buildModel(c.months, c.over, x.config.titular, c.pais, cats, { dia: c.saldosDia, ancora: c.ancora }, c.transf, { envios: c.envios });
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
      total = { entrou: 0, gasto: 0, saved: 0, movido: 0, saldo: 0, spend: {} };
      por.forEach(function (p) {
        if (!p.g) return;
        var cv = function (v) { return paraPrincipal(v, p.w.moeda, x); };
        ['entrou', 'gasto', 'saved', 'movido', 'saldo'].forEach(function (k) { total[k] += cv(p.g[k]); });
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
        var M2 = buildModel(w.c.months, w.c.over, x.config.titular, w.c.pais, w.cats, { dia: w.c.saldosDia, ancora: w.c.ancora }, comPendentes(w.c.transf, rs), { envios: w.c.envios });
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
  function saidaCandidata(r) { return r.a < 0 && !r.transf && (r.kind === 'interno' || r.kind === 'movido' || (r.kind === 'gasto' && (r.cat === 'brasil' || r.cat === 'outros'))); }
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
    if (par.s.c === par.e.c) throw erroCod('interno.mesmaCarteira', {}, 'as duas pontas estão na mesma carteira');
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
  /* o que "Apagar meus dados" apaga: só as chaves do painel (cortex-financas.*); nora.prefs (idioma e tema) fica */
  function chavesParaApagar(chaves) { return chaves.filter(function (k) { return !!k && k.indexOf('cortex-financas.') === 0; }); }
  /*CORE-END*/

  /* textos da tela (passo d da Fase 3): tt(chave, vars) para texto puro (toast, textContent, atributo com esc());
     tth(chave, vars) para dentro de HTML: escapa o texto do dicionário e cada variável, menos a embrulhada em
     cru('<b>' + esc(x) + '</b>'). Texto da pessoa só entra como variável. A função global t não serve aqui: muitas funções deste
     arquivo têm o parâmetro t (o movimento), que esconde a função global. */
  var tt = NORA_I18N.t, tth = NORA_I18N.th, cru = NORA_I18N.cru;
  /* a mensagem de um erro (do núcleo, de um leitor ou da própria tela), no idioma da tela quando ele tem código */
  function textoErro(e) { return NORA_I18N.textoErro(e, function (v) { return nn.format(v); }); }
  NORA_I18N.aplicarTextosFixos(document);

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
  function enviosMovidos() { var c = cartAtual(); return !!(c && c.envios === 'movido'); }
  /* em "dinheiro movido", envios para outra conta sua não são gasto: a meta deles não entra na meta do mês */
  function planCat(id) { if (id === 'brasil' && enviosMovidos()) return 0; var v = metaDefinida(id); return v != null ? v : (SUG ? SUG.cats[id] : 0); }
  function planPoupar() { var v = pouparDefinido(); return v != null ? v : (SUG ? SUG.poupar : 0); }
  function catPor(id) { return CPOR[id] || CPOR.outros; }
  function catNome(c) { return CPOR[c.id] ? CPOR[c.id].nome : c.nome; }
  function planTotal() { var t = 0; CATSV.forEach(function (c) { t += planCat(c.id); }); return t; }
  /* campos de metas (usados em "Editar metas" e na configuração); pre separa os ids dos dois formulários */
  /* campo em branco = seguir a sugestão (ou ficar sem meta, sem extrato) */
  function metaCampo(id, rotulo, v, sug) {
    return '<label>' + esc(rotulo) + '<input id="' + id + '" type="number" min="0" step="5" inputmode="decimal" value="' + (v != null ? v : '') + '" placeholder="' + (sug != null ? tth('metas.sugestao', { valor: sug }) : tth('painel.semMeta')) + '"></label>';
  }
  function metasCampos(pre) {
    var h = '';
    CATSV.forEach(function (c) { h += metaCampo('fin-' + pre + '-' + c.id, (c.id === 'brasil' && enviosMovidos() ? tt('metas.rotuloMovido', { nome: catNome(c) }) : catNome(c)), metaDefinida(c.id), SUG ? SUG.cats[c.id] : null); });
    return h + metaCampo('fin-' + pre + '-poupar', tt('metas.guardarPorMes'), pouparDefinido(), SUG ? SUG.poupar : null);
  }
  function lerMeta(id) { var v = $(id).value.trim(); return v === '' || isNaN(v) ? null : Math.max(0, +v); }
  function lerMetas(pre) {
    var o = { cats: {}, poupar: lerMeta('#fin-' + pre + '-poupar') };
    CATSV.forEach(function (c) { var v = lerMeta('#fin-' + pre + '-' + c.id); if (v != null) o.cats[c.id] = v; });
    return o;
  }

  function toast(msg, erro, aviso) { if (window.__cortexToast) window.__cortexToast(msg, erro, erro ? 9000 : 6000, aviso); }

  /* ---------- números do período ---------- */
  function avgKeys() { return M.complete.length ? M.complete : M.keys; }
  function periodKeys() { return S.sel === 'all' ? avgKeys() : (M.by[S.sel] ? [S.sel] : []); }
  function periodStats() {
    var ks = periodKeys(), n = ks.length || 1, o = { entrou: 0, gasto: 0, saved: 0, movido: 0, saldo: 0, spend: {}, n: ks.length };
    ks.forEach(function (k) {
      var g = M.by[k]; o.entrou += g.entrou; o.gasto += g.gasto; o.saved += g.saved; o.movido += g.movido; o.saldo += g.saldo;
      CATSV.forEach(function (c) { o.spend[c.id] = (o.spend[c.id] || 0) + (g.spend[c.id] || 0); });
    });
    if (S.sel === 'all') {
      o.entrou /= n; o.gasto /= n; o.saved /= n; o.movido /= n; o.saldo /= n;
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
  /* base: 'media', 'orcamento' (meta de gasto) ou 'objetivo' (meta de poupança); em pt-BR as duas metas dizem "da meta" */
  function dl(v, ref, goodHigh, base) {
    var k = { media: ['painel.igualMedia', 'painel.acimaMedia', 'painel.abaixoMedia'], orcamento: ['painel.igualOrcamento', 'painel.acimaOrcamento', 'painel.abaixoOrcamento'],
      objetivo: ['painel.igualObjetivo', 'painel.acimaObjetivo', 'painel.abaixoObjetivo'] }[base], d = v - ref;
    if (Math.abs(d) < 0.5) return '<span class="d ok">' + tth(k[0]) + '</span>';
    var up = d > 0;
    return '<span class="d ' + (up === goodHigh ? 'good' : 'bad') + '">' + tth(up ? k[1] : k[2], { valor: f0(Math.abs(d)) }) + '</span>';
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
      if (!S.semEspaco) toast(tt('msg.semEspacoSalvar'), true);
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
      S.bloqueado = { erro: e, bruto: raw };
    }
  }
  function apagarTudo() {
    try {
      var ks = [];
      for (var i = 0; i < localStorage.length; i++) ks.push(localStorage.key(i));
      chavesParaApagar(ks).forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { }
    S.dados = null; S.months = {}; S.over = {}; S.plan = null; S.summary = null; S.div = null; S.bloqueado = null; S.setupOpen = false;
  }
  var chain = Promise.resolve();
  function enqueue(fn) {
    chain = chain.then(fn).catch(function (e) { toast(tt('msg.naoSalvou', { erro: textoErro(e) }), true); });
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
    M = buildModel(S.months, S.over, S.plan && S.plan.titular, S.plan && S.plan.pais, CATST, cw ? { dia: cw.saldosDia, ancora: cw.ancora } : null, cw && cw.transf, cw && { envios: cw.envios });
    SUG = sugerirMetas(M, CATST);
    RECS = detectarRecorrentes(M);
    if (S.sel !== 'all' && !M.by[S.sel]) S.sel = M.complete.length ? M.complete[M.complete.length - 1] : (M.keys.length ? M.keys[M.keys.length - 1] : null);
  }

  /* ---------- importação ---------- */
  function handleFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) return Promise.resolve();
    if (S.bloqueado) { toast(tt('importar.resolvaBloqueio'), true); return Promise.resolve(); }
    if (!temLeitor(bancoAtual()) || LEITORES[bancoAtual()].previa) return abrirGenerico(files);
    var incoming = {}, bad = [], dup = 0, added = 0, months = 0, best = null, outras = {}, periodos = [];
    return files.reduce(function (p, f) {
      return p.then(function () { return f.text(); }).then(function (txt) {
        var rws = parseCSV(txt), lido = LEITORES[bancoAtual()].ler(rws, moeda()), tx = lido.tx, sm = lido.saldos;
        if (!tx.length) { bad.push(f.name); lido.moedas.forEach(function (c) { outras[c] = 1; }); return; }
        if (sm) {
          var asOf = tx.reduce(function (a, t) { return t[0] > a ? t[0] : a; }, '');
          if (!best || asOf >= best.asOf) { sm.asOf = asOf; best = sm; }
        }
        tx.forEach(function (t) { var m = t[0].slice(0, 7); (incoming[m] = incoming[m] || []).push(t); });
        periodos.push(lido.periodo || periodoDasDatas(tx.map(function (t) { return t[0]; })));
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
      if (added) toast(tt('importar.adicionou', { n: added, meses: tt('importar.meses', { n: months }) }) + '.' + (dup ? ' ' + tt('importar.jaSalvas', { n: dup }) : '') + (bad.length ? ' ' + tt('importar.naoLi', { arquivos: bad.join(', ') }) : ''));
      else if (bad.length && Object.keys(outras).length) toast(tt('importar.semConta', { moeda: moeda(), arquivos: bad.join(', '), outras: Object.keys(outras).join(', ') }), true);
      else if (bad.length) toast(tt('importar.semMovimentos', { arquivos: bad.join(', ') }), true);
      else toast(tt('importar.nadaNovo', { n: dup }), false, 'importar.nadaNovo');
    });
  }

  /* ---------- peças da página ---------- */
  function header() {
    var st = '';
    if (M.keys.length) {
      var n = 0; M.keys.forEach(function (k) { n += M.by[k].n; });
      st = tt('casca.resumoCarteira', { n: n, de: mShort(M.keys[0]) + ' ' + M.keys[0].slice(0, 4), ate: mShort(M.keys[M.keys.length - 1]) + ' ' + M.keys[M.keys.length - 1].slice(0, 4), data: dFull(M.lastDate) });
    } else st = tt('casca.contaEm', { origem: origem(), moeda: nomeMoeda() });
    if (M.keys.length) st = origem() + ' · ' + st;
    if (emResumo() && RES) st = tt('casca.resumoTopo', { n: S.dados.carteiras.length, moeda: nomeMoeda(moedaP()) }) + (RES.ref ? ' · ' + tt('casca.dadosAte', { data: dFull(RES.ref) }) : '');
    return '<div class="view-top"><div><h1 class="marca"><img src="logo.svg" alt="Nora" width="134" height="44"></h1><span class="vt-l"><span class="mono sm">' + esc(st) + '</span></span></div>' +
      (configurado() ? '<div class="grupo"><button class="pill" type="button" data-fin-setup aria-pressed="' + S.setupOpen + '">' + tth('comum.configuracoes') + '</button><button class="pill primario" type="button" data-fin-add>' + tth('comum.adicionarExtrato') + '</button></div>' : '') + '</div>' +
      avisoEspaco() +
      (configurado() && !suportado() && !S.setupOpen && !RES ? '<p class="aviso">' + avisoSuporte() + '</p>' : '');
  }
  /* acima de 4 MB (somando a v3 guardada e a v4), sugere backup; se a gravação falhou, avisa como erro */
  function avisoEspaco() {
    if (S.semEspaco) return '<div class="aviso erro pergunta"><p>' + tth('casca.semEspaco') + '</p><button class="btn sm" type="button" data-backup="baixar">' + tth('comum.baixarBackup') + '</button></div>';
    if (S.espaco <= ESPACO_AVISO) return '';
    return '<div class="aviso pergunta"><p>' + tth('casca.espacoPerto', { mb: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(S.espaco / 1048576) }) + '</p>' +
      '<button class="btn sm" type="button" data-backup="baixar">' + tth('comum.baixarBackup') + '</button></div>';
  }
  /* ---------- carteiras ---------- */
  /* função, não constante: o texto acompanha o idioma de cada renderização */
  function genericoTxt() { return tth('config.semLeitor'); }
  function cartAtual() { return S.dados ? carteiraAtiva(S.dados) : null; }
  function bancoAtual() { var c = cartAtual(); return c ? c.banco : 'revolut'; }
  function nomeBanco(b) { var o = BANCOS.filter(function (x) { return x[0] === b; })[0]; return !o ? b : b === 'outro' ? tt('carteiras.outroBanco') : o[1]; }
  /* a lista de bancos dos seletores, com os nomes de nomeBanco */
  function bancosTela() { return BANCOS.map(function (o) { return [o[0], nomeBanco(o[0])]; }); }
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
      if (!rt) info = tth('cambio.semTaxa', { moeda: c });
      else info = '1 ' + esc(simbolo(c)) + ' ≈ ' + esc(simbolo(mp)) + ' ' + esc(nr.format(1 / rt)) + (idade == null ? '' : idade > CAMBIO_ANTIGO
        ? ' · <span class="velho">' + tth('cambio.informadoHa', { n: idade, data: dFull(cb.data) }) + '</span>' : ' · ' + tth('cambio.informadoEm', { data: dFull(cb.data) }));
      return '<label class="camb"><span class="cr"><span>1 ' + esc(simbolo(mp)) + ' =</span><input id="fin-' + attr + '-' + esc(c) + '" data-' + attr + '="' + esc(c) + '" type="text" inputmode="decimal" autocomplete="off" placeholder="' + tth('cambio.taxa') + '" value="' + (rt ? esc(nr.format(rt)) : '') + '" aria-label="' + tth('cambio.quantosAria', { moeda: c, principal: mp }) + '"><span>' + esc(c) + '</span></span><small>' + info + '</small></label>';
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
    return tth('cambio.resumo', { taxas: cru(t) }) + (velho ? ' · <span class="velho">' + tth('cambio.velho', { n: CAMBIO_ANTIGO }) + '</span>' : '');
  }
  /* com duas ou mais carteiras, a primeira aba é o Resumo (abre nele); Em observação e as metas de poupança, que
     valem para todas, ficam lá. Com uma carteira, nada de abas e tudo fica no painel. */
  function emResumo() { return !!S.resumo && variasCarteiras(); }
  function abas() {
    if (!variasCarteiras()) return '';
    var r = emResumo();
    return '<nav class="abas" aria-label="' + tth('abas.rotulo') + '"><button type="button" data-carteira="resumo"' + (r ? ' aria-current="true"' : '') + '>' + tth('abas.resumo') + ' <small>' + esc(moedaP()) + '</small></button>' + S.dados.carteiras.map(function (c) {
      return '<button type="button" data-carteira="' + esc(c.id) + '"' + (!r && c.id === S.dados.ativa ? ' aria-current="true"' : '') + '>' + esc(c.nome) + ' <small>' + esc(c.moeda) + '</small></button>';
    }).join('') + '</nav>';
  }
  function notaResumo() {
    return '<p class="passo">' + tth('casca.notaResumo', { resumo: cru('<b>' + tth('abas.resumo') + '</b>') }) + '</p>';
  }
  /* ---------- Resumo ---------- */
  /* valor na moeda de uma carteira (sem casas) */
  function fW(v, cod) { return fmtDe(cod, 0).format(Math.round(v)).replace('-', '−'); }
  function trecho(f) { return f.de === f.ate ? dFull(f.de) : tt('comum.periodo', { de: f.de.slice(0, 7) === f.ate.slice(0, 7) ? +f.de.slice(8) : dFull(f.de), ate: dFull(f.ate) }); }
  /* as moedas das carteiras com extrato que entram nas somas por câmbio */
  function moedasConvertidas(R) { var o = {}; R.ws.forEach(function (w) { if (w.temDados && w.moeda !== R.mp) o[w.moeda] = 1; }); return Object.keys(o).sort(); }
  function avisoCambioResumo(R) {
    if (R.faltaCambio.length) return '<div class="aviso pergunta" id="fin-rfalta"><p>' + R.faltaCambio.map(function (f) {
      return tth('resumo.faltaCambio', { n: f.nomes.length, moeda: cru('<b>' + esc(f.moeda) + '</b>'), nomes: cru('<b>' + esc(listaE(f.nomes)) + '</b>') });
    }).join(' ') + ' ' + tth('resumo.semCambio', { n: R.faltaCambio.length }) + '</p><div class="grupo">' +
      R.faltaCambio.map(function (f) { return '<button class="btn sm pri" type="button" data-rcamb="' + esc(f.moeda) + '">' + tth('resumo.definirCambio', { moeda: f.moeda }) + '</button>'; }).join('') + '</div></div>';
    var ms = moedasConvertidas(R), C = divState().cambios, hoje = todayIso();
    if (!ms.length) return '';
    return '<div class="aviso pergunta" id="fin-restima"><p>' + tth('resumo.somasEstimadas', { moeda: nomeMoeda(R.mp), taxas: cru(ms.map(function (c) {
      var cb = C[c], id = cb.data ? diasDesde(cb.data, hoje) : null;
      return '<b>1 ' + esc(simbolo(R.mp)) + ' = ' + esc(nr.format(+cb.rate)) + ' ' + esc(simbolo(c)) + '</b>' + (id == null ? '' : id > CAMBIO_ANTIGO ? ' <span class="velho">' + tth('resumo.taxaDeHa', { data: dFull(cb.data), n: id }) + '</span>' : ' ' + tth('resumo.taxaDe', { data: dFull(cb.data) }));
    }).join(' · ')) }) + '</p><button class="btn sm" type="button" data-rcamb="">' + tth('resumo.atualizarCambio') + '</button></div>';
  }
  function saldoCarteiras(R) {
    var x = S.dados, tot = 0, fora = [], semExtrato = [], h = '';
    R.ws.forEach(function (w) {
      var v = '';
      if (!w.temDados) { v = '<small>' + tth('carteiras.semExtrato') + '</small>'; semExtrato.push(w.nome); }
      else if (!w.saldo) { v = '<small>' + tth('resumo.semSaldoFora') + '</small>'; fora.push(w.nome); }
      else {
        var p = w.moeda === R.mp ? w.saldo.v : paraPrincipal(w.saldo.v, w.moeda, x);
        if (p != null) tot += p;
        v = '<b class="num">' + fW(w.saldo.v, w.moeda) + '</b>' + (w.moeda !== R.mp && p != null && !R.faltaCambio.length ? '<small>≈ ' + fP0(p) + '</small>' : '') + (w.saldo.fonte === 'estimado' ? '<small>' + tth('resumo.estimado') + '</small>' : '');
      }
      h += '<div class="rs"><span class="rn">' + esc(w.nome) + '<small>' + (w.ate ? tth('casca.dadosAte', { data: dFull(w.ate) }) : tth('resumo.nenhumImportado')) + '</small></span><span class="rv">' + v + '</span></div>';
    });
    var conv = R.ws.some(function (w) { return w.saldo && w.moeda !== R.mp; }), nenhum = !R.ws.some(function (w) { return w.saldo; });
    var semTot = (fora.length ? [tt('resumo.semSaldoItem', { nomes: listaE(fora) })] : []).concat(semExtrato.length ? [tt('resumo.semExtratoItem', { nomes: listaE(semExtrato) })] : []), tl = R.faltaCambio.length ? '<small>' + tth('resumo.semTotal', { moedas: listaE(R.faltaCambio.map(function (f) { return f.moeda; })) }) + '</small>'
      : nenhum ? '<small>' + tth('resumo.nenhumSaldo') + '</small>' : '<b class="num">' + (conv ? '≈ ' : '') + fP0(tot) + '</b>';
    h += '<div class="rs tot"><span class="rn">' + tth(semTot.length && !nenhum ? 'resumo.totalParcial' : 'comum.total') + (semTot.length && !nenhum ? '<small>' + tth('resumo.sem', { lista: listaE(semTot) }) + '</small>' : '') + '</span><span class="rv">' + tl + '</span></div>';
    return '<section class="sec"><div class="sec-top"><h2>' + tth('resumo.saldoTitulo') + '</h2><span class="hint">' + tth('resumo.saldoDica') + '</span></div><div class="card rsal">' + h + '</div></section>';
  }
  function mesesResumo(R) {
    return '<div class="rmeses" role="group" aria-label="' + tth('resumo.escolherMes') + '">' + R.meses.map(function (k) {
      return '<button type="button" class="btn sm" data-rmes="' + k + '" aria-pressed="' + (S.rMes === k) + '" aria-label="' + (R.partial === k ? tth('resumo.mesAndamentoAria', { mes: mLabel(k) }) : esc(mLabel(k))) + '">' + mShort(k) + ' ' + k.slice(2, 4) + (R.partial === k ? '*' : '') + '</button>';
    }).join('') + '</div>';
  }
  function avisoCobertura(R, Q) {
    if (!Q.semCobertura.length) return '';
    var nm = MES[+Q.m.slice(5) - 1];
    return '<div class="aviso" id="fin-rcob"><p>' + tth(R.partial === Q.m ? 'resumo.coberturaAte' : 'resumo.cobertura', { mes: nm, data: dFull(R.ref) }) + '</p><ul class="imp-ign">' + Q.semCobertura.map(function (p) {
      var nome = cru('<b>' + esc(p.w.nome) + '</b>');
      return '<li>' + (p.cob.nada ? tth('resumo.coberturaNada', { nome: nome, mes: nm }) : tth('resumo.coberturaFaltas', { nome: nome, trechos: p.cob.faltas.map(trecho).reduce(function (a, b) { return tt('resumo.trechoEDe', { a: a, b: b }); }) })) + '</li>';
    }).join('') + '</ul></div>';
  }
  function tabelaPorCarteira(Q) {
    var h = '<div class="tw"><table class="rpor"><thead><tr><th>' + tth('carteiras.titulo') + '</th><th>' + tth('comum.entrou') + '</th><th>' + tth('comum.gastou') + '</th><th>' + tth('comum.guardou') + '</th><th>' + tth('comum.saldoMes') + '</th></tr></thead><tbody>';
    Q.por.forEach(function (p) {
      var g = p.g, c = p.w.moeda;
      h += '<tr><td>' + esc(p.w.nome) + ' <small>' + esc(c) + '</small></td>' + (g ? '<td>' + fW(g.entrou, c) + '</td><td>' + fW(g.gasto, c) + '</td><td>' + fW(g.saved, c) + '</td><td>' + sgn(g.saldo, function (v) { return fW(v, c); }) + '</td>' : '<td colspan="4" class="sem">' + tth(p.w.temDados ? 'resumo.semMovMes' : 'carteiras.semExtrato') + '</td>') + '</tr>';
    });
    return h + '</tbody></table></div>';
  }
  function foraDasSomas(Q) {
    var nm = MES[+Q.m.slice(5) - 1], com = Q.por.filter(function (p) { return p.interno.n; }), n = 0;
    com.forEach(function (p) { n += p.interno.n; });
    if (!n) return '<p class="passo rfora">' + tth('resumo.foraNenhum', { mes: nm }) + '</p>';
    var partes = com.map(function (p) {
      var it = p.interno, c = p.w.moeda;
      var v = it.saiu && it.entrou ? tt('resumo.foraSaiuEntrou', { saiu: fW(it.saiu, c), entrou: fW(it.entrou, c) }) : it.saiu ? tt('resumo.foraSaiu', { valor: fW(it.saiu, c) }) : it.entrou ? tt('resumo.foraEntrou', { valor: fW(it.entrou, c) }) : '';
      return tt('resumo.foraParte', { nome: p.w.nome, n: it.n, valores: v });
    });
    var lista = '';
    Q.por.forEach(function (p) { p.w.M.rows.forEach(function (r) { if (r.m === Q.m && r.kind === 'interno') lista += '<li>' + esc(dFmt(r.date)) + ' · ' + esc(p.w.nome) + ' · ' + esc(r.desc) + ': ' + (r.a > 0 ? '+' : '−') + esc(fmtDe(p.w.moeda, 2).format(Math.abs(r.a))) + '</li>'; }); });
    /* as partes ligadas por "e" uma a uma, como antes (com três carteiras: "A e B e C") */
    return '<div class="rfora"><p class="passo">' + tth('resumo.foraTexto', { n: n, mes: nm, partes: partes.reduce(function (a, b) { return tt('resumo.foraPartesE', { a: a, b: b }); }) }) + '</p>' +
      '<details class="metas" id="fin-rfd"' + (S.rFora ? ' open' : '') + '><summary>' + tth('resumo.verQuais') + '</summary><ul class="imp-ign">' + lista + '</ul><p class="passo">' + tth('resumo.foraAjuda') + '</p></details></div>';
  }
  function categoriasResumo(Q, conv) {
    var list = [], mx = 0, h = '';
    CATSV.forEach(function (c) { var v = Q.total.spend[c.id] || 0; if (Math.abs(v) >= 0.5) { list.push({ c: c, v: v }); mx = Math.max(mx, v); } });
    list.sort(function (a, b) { return b.v - a.v; });
    if (!list.length) h = '<p class="vazio">' + tth('resumo.semGastos') + '</p>';
    list.forEach(function (x) {
      h += '<div class="cat"><i class="sw" style="background:' + colorOf(x.c) + '"></i><span class="nm">' + esc(catNome(x.c)) + '</span><span class="val">' + (conv ? '≈ ' : '') + fP0(x.v) + '</span>' +
        '<span class="track"><i style="width:' + (mx ? Math.max(0, x.v) / mx * 100 : 0).toFixed(1) + '%;background:' + colorOf(x.c) + '"></i></span></div>';
    });
    return '<div class="sec-top"><h3>' + tth('resumo.gastoCategoria') + '</h3><span class="hint">' + tth('resumo.somaCarteiras') + '</span></div><div class="rcats">' + h + '</div>';
  }
  function mesResumoTela(R) {
    var x = S.dados, Q = mesResumo(R, x, S.rMes), T = Q.total, conv = Q.por.some(function (p) { return p.g && p.w.moeda !== R.mp; }), ap = conv ? '≈ ' : '';
    var lab = mLabel(S.rMes), h = '<section class="sec" id="fin-rmes"><div class="sec-top"><h2>' + esc(lab.charAt(0).toUpperCase() + lab.slice(1)) + (R.partial === S.rMes ? ' <small class="hint">' + tth('resumo.ate', { data: dFull(R.ref) }) + '</small>' : '') + '</h2>' +
      '<span class="hint">' + tth('resumo.somaCarteiras') + (R.partial ? ' · ' + tth('plano.mesEmAndamento') : '') + '</span></div>' + mesesResumo(R) + avisoCobertura(R, Q);
    if (T) {
      var n = Q.por.filter(function (p) { return p.g; }).length, sub = n === 1 ? tth('resumo.so', { nome: Q.por.filter(function (p) { return p.g; })[0].w.nome }) : tth('resumo.somaDe', { n: n });
      h += '<div class="kpis">' + [[tth('comum.entrou'), T.entrou, 0, 'entrou'], [tth('comum.gastou'), T.gasto, 0, 'gastou'], [tth('comum.guardou'), T.saved, 0, 'guardou'], [tth('comum.saldoMes'), T.saldo, 1, 'saldo']].map(function (t) {
        return '<div class="kpi" data-kpi="' + t[3] + '"><span class="l">' + t[0] + '</span><span class="v">' + ap + (t[2] ? sgn(t[1], fP0) : fP0(t[1])) + '</span>' + (t[3] === 'gastou' ? notaEnvios(T.spend.brasil || 0, function (v) { return ap + fP0(v); }) : '') + '<span class="s">' + (t[2] ? (Math.abs(T.movido) >= 0.5 ? tth('painel.formulaMovido') + '<br>' + fraseMovido(T.movido, function (v) { return ap + fP0(v); }) : tth('painel.formula')) : sub) + '</span></div>';
      }).join('') + '</div>' +
        '<details class="metas" id="fin-rpor"' + (S.rPor ? ' open' : '') + '><summary>' + tth('resumo.porCarteira') + '</summary>' + tabelaPorCarteira(Q) + '</details>';
    } else h += '<p class="passo">' + tth('resumo.semTotalCambio') + '</p>' + tabelaPorCarteira(Q);
    h += foraDasSomas(Q);
    h += '<div class="card">' + (T ? categoriasResumo(Q, conv) : '<h3>' + tth('resumo.gastoCategoria') + '</h3><p class="passo">' + tth('resumo.depoisCambio', { moedas: listaE(R.faltaCambio.map(function (f) { return f.moeda; })) }) + '</p>') + '</div>';
    return h + '</section>';
  }
  /* o aviso de transferência a confirmar aparece no número da previsão e na linha de status */
  function statusPrevisao(dif, pend, fmt) {
    if (Math.abs(dif) < 0.5) return '<span class="d ok">' + tth('previsao.fechaNaMeta') + '</span>';
    if (dif < 0) return '<span class="d good">' + tth('previsao.fechaAbaixo', { valor: fmt(-dif) }) + '</span>';
    return '<span class="d ' + (passaMesmo(dif, pend) ? 'bad' : 'ok') + '">' + tth('previsao.passa', { valor: fmt(dif) }) + '</span>';
  }
  /* quanto do Gastou é "Envios para outra conta sua": só mostra, não muda nenhum cálculo */
  function nomeEnvios() {
    var c = CATST.filter(function (x) { return x.id === 'brasil'; })[0], nome = c ? catNome(c) : 'Envios para outra conta sua';
    return nome === 'Envios para outra conta sua' ? 'envios para outra conta sua' : '"' + nome + '"';
  }
  /* movido > 0: saiu mais para outras contas suas do que entrou delas (mesma convenção do "Guardou") */
  function fraseMovido(v, fmt) { return v > 0 ? tth('painel.saiuMovido', { valor: fmt(v) }) : tth('painel.entrouMovido', { valor: fmt(-v) }); }
  function notaEnvios(v, fmt, media) { return !(v >= 0.5) ? '' : '<p class="pend" data-nota="envios">' + tth(media ? 'painel.incluiMedia' : 'painel.inclui', { valor: fmt(v), nome: nomeEnvios() }) + '</p>'; }
  function pendNum(pend, fmt) { return pend < 0.5 ? '' : '<p class="pend">' + tth('previsao.incluiConfirmar', { valor: fmt(pend) }) + '</p>'; }
  function pendFrase(pend, n, fmt) {
    return pend < 0.5 ? '' : ', ' + tth('previsao.pendFrase', { valor: fmt(pend), n: n });
  }
  function pendBotao(pend) { return pend < 0.5 ? '' : '<p class="pendb"><button class="btn sm" type="button" data-irtransf>' + tth('previsao.verTransf') + '</button></p>'; }
  /* envios para outra conta sua no mês em andamento, somando as carteiras, na moeda principal */
  function envResumo(R) { var Q = mesResumo(R, S.dados, R.partial); return Q.total && Q.total.spend ? Q.total.spend.brasil || 0 : 0; }
  function previsaoResumoTela(R) {
    var h = '<section class="sec" id="fin-rprev"><div class="sec-top"><h2>' + (R.partial ? tth('resumo.previsaoDe', { mes: MES[+R.partial.slice(5) - 1] }) : tth('previsao.titulo')) + '</h2>';
    if (!R.partial) return h + '</div><div class="card"><p class="passo">' + tth('resumo.ultimoFecha', { mes: mLabel(R.meses[R.meses.length - 1]) }) + '</p></div></section>';
    if (R.faltaCambio.length) return h + '</div><div class="card"><p class="passo">' + tth('resumo.depoisCambio', { moedas: listaE(R.faltaCambio.map(function (f) { return f.moeda; })) }) + '</p></div></section>';
    var P = previsaoResumo(R, S.dados, TR && TR.S), conv = P.por.some(function (q) { return q.w.moeda !== R.mp; }), ap = conv ? '≈ ' : '';
    if (!P.por.length) return h + '</div><div class="card"><p class="passo">' + tth('resumo.nenhumaMov', { mes: MES[+R.partial.slice(5) - 1] }) + '</p></div></section>';
    var dif = P.proj - P.meta, mx = Math.max(P.proj, P.meta, P.gasto, 1), fp = function (v) { return ap + fP0(v); }, st = statusPrevisao(dif, P.pend, fp), over = passaMesmo(dif, P.pend);
    var cedo = P.por.filter(function (q) { return q.cedo; });
    return h + '<span class="hint">' + tth('resumo.ate', { data: dFull(R.ref) }) + ' · ' + tth('resumo.somaPrevisoes') + '</span></div><div class="card prv">' +
      '<div class="prv-n"><div><p class="l mono">' + tth('previsao.gastoAteAgora') + '</p><p class="v num">' + ap + fP0(P.gasto) + '</p>' + notaEnvios(envResumo(R), fp) + '</div><div><p class="l mono">' + tth('previsao.previsaoPara', { mes: MES[+R.partial.slice(5) - 1] }) + '</p><p class="v num">' + ap + fP0(P.proj) + '</p>' + pendNum(P.pend, fp) + '</div><div><p class="l mono">' + tth('previsao.metaGasto') + '</p><p class="v num">' + ap + fP0(P.meta) + '</p></div></div>' +
      '<div class="ptrack" role="img" aria-label="' + tth('previsao.trackAria', { gasto: fP0(P.gasto), proj: fP0(P.proj), meta: fP0(P.meta) }) + '"><i class="pj' + (over ? ' over' : '') + '" style="width:' + (P.proj / mx * 100).toFixed(1) + '%"></i><i class="sp" style="width:' + (P.gasto / mx * 100).toFixed(1) + '%"></i><b style="left:calc(' + (P.meta / mx * 100).toFixed(1) + '% - 1px)"></b></div>' +
      '<div class="legend"><span><i class="sw" style="background:var(--accent)"></i>' + tth('previsao.legGasto') + '</span><span><i class="sw" style="background:color-mix(in srgb, var(--accent) 35%, var(--raised))"></i>' + tth('previsao.legPrevisao') + '</span><span><i class="sw line"></i>' + tth('previsao.legMeta') + '</span></div>' +
      '<p class="s">' + st + pendFrase(P.pend, P.nPend, fp) + '. ' + P.por.map(function (q) { var a = q.w.moeda === R.mp ? '' : '≈ '; return tth('resumo.previsaoCarteira', { nome: q.w.nome, proj: a + fP0(q.proj), meta: a + fP0(q.meta) }); }).join(' · ') + '.</p>' + pendBotao(P.pend) +
      (cedo.length ? '<p class="aviso">' + tth('resumo.cedo', { n: cedo.length, lista: cru(cedo.map(function (q) { return tth('resumo.cedoItem', { nome: cru('<b>' + esc(q.w.nome) + '</b>'), data: dFull(q.w.ate || q.w.M.lastDate) }); }).join('; ')) }) + '</p>' : '') +
      (P.fora.length ? '<p class="aviso">' + tth('resumo.foraPrevisao', { n: P.fora.length, nomes: listaE(P.fora.map(function (w) { return w.nome; })), mes: MES[+R.partial.slice(5) - 1] }) + '</p>' : '') + '</div></section>';
  }
  function cambioResumo(R) {
    var ms = {}; R.ws.forEach(function (w) { if (w.moeda !== R.mp) ms[w.moeda] = 1; });
    ms = Object.keys(ms).sort();
    if (!ms.length) return '';
    return '<section class="sec"><details class="metas" id="fin-rcamb"' + (S.rCamb ? ' open' : '') + '><summary>' + tth('resumo.cambioCarteiras', { moedas: ms.join(', ') }) + '</summary><form id="fin-frcamb">' +
      '<p class="passo">' + tth('resumo.cambioDigitado') + '</p><div class="mgrid">' + camposCambio(ms, 'cambr') + '</div>' +
      '<button class="btn sm pri" type="submit">' + tth('resumo.salvarCambio') + '</button></form></details></section>';
  }
  /* "Adicionar extrato" no Resumo: cada importação vai para uma carteira só; a última usada (a ativa) vem marcada,
     ou a do banco reconhecido no arquivo arrastado */
  function escolherTela() {
    var F = S.escolher.files, sug = S.escolher.sugerida, marcada = sug || S.dados.ativa;
    return '<section class="sec" id="fin-escolher"><div class="card ggrid"><h2>' + tth('resumo.escolherTitulo') + '</h2><p class="passo">' + (!F ? tth('resumo.escolherSo') : F.length > 1 ? tth('resumo.escolherArquivos', { arquivo: F[0].name, n: F.length - 1 }) : tth('resumo.escolherArquivo', { arquivo: F[0].name })) + '</p>' +
      (sug ? '<p class="aviso">' + tth('resumo.pareceBanco', { banco: LEITORES[S.escolher.banco].nome }) + '</p>' : '') +
      '<div class="radios">' + S.dados.carteiras.map(function (c) {
        var r = resumoDados(c);
        return '<label class="chk"><input type="radio" name="fin-ecart" value="' + esc(c.id) + '"' + (c.id === marcada ? ' checked' : '') + '><span>' + esc(c.nome) + ' <small class="hint">' + esc(nomeBanco(c.banco)) + ' · ' + esc(c.moeda) + (r.meses ? '' : ' · ' + tth('carteiras.semExtrato')) + '</small></span></label>';
      }).join('') + '</div><div class="grupo"><button class="btn pri" type="button" data-escolher="ok">' + tth(F ? 'resumo.importarNesta' : 'casca.escolherArquivo') + '</button><button class="btn" type="button" data-escolher="cancelar">' + tth('comum.cancelar') + '</button></div></div></section>';
  }
  /* arquivo arrastado no Resumo: lê o começo dele e, se o banco for reconhecido, marca a carteira desse banco */
  function sugerirCarteira(E) {
    var f = E.files && E.files[0];
    if (!f) return;
    linhasDoArquivo(f).then(function (rows) {
      var lb = detectarBanco(rows), c = lb && S.dados.carteiras.filter(function (w) { return w.banco === lb; })[0];
      if (!c || S.escolher !== E) return;
      E.sugerida = c.id; E.banco = lb; render();
    }).catch(function () { /* sem sugestão: a pessoa escolhe */ });
  }
  function telaResumo(R) {
    var h = S.escolher ? escolherTela() : '';
    if (!R.meses.length) return h + '<section class="vazio-grande"><p class="eyebrow">' + tth('abas.resumo') + '</p><h2>' + tth('resumo.vazioTitulo') + '</h2><p class="passo">' + tth('resumo.vazioDica') + '</p>' +
      '<button class="btn pri" type="button" data-fin-add>' + tth('comum.adicionarExtrato') + '</button></section>' + dividas() + metasPoup() + cambioResumo(R);
    return h + avisoCambioResumo(R) + transfSecao() + saldoCarteiras(R) + mesResumoTela(R) + previsaoResumoTela(R) + dividas() + metasPoup() + cambioResumo(R);
  }
  /* ---------- transferências entre carteiras (Resumo e Revisar categorias) ---------- */
  function valorMov(r, cod) { return (r.a < 0 ? '−' : '+') + fmtDe(cod, 2).format(Math.abs(r.a)); }
  var n1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  function difPar(p) {
    var d = p.dias === 0 ? tt('transf.mesmoDia') : tt('transf.diasDif', { n: p.dias }), v;
    if (p.dif < 0.0005) v = p.moedas.length ? tt('transf.valoresIguais') : tt('transf.mesmoValor');
    else v = tt('transf.valorDif', { pct: n1.format(p.dif * 100) });
    if (p.moedas.length === 1) {
      var cb = (S.dados.cambios || {})[p.moedas[0]] || {};
      v = cb.data ? tt('transf.pelaTaxaEm', { valor: v, data: dFmt(cb.data) }) : tt('transf.pelaTaxa', { valor: v });
    } else if (p.moedas.length) v = tt('transf.pelasTaxas', { valor: v });
    return d + ' · ' + v;
  }
  function ladoPar(rot, w, r) {
    return '<div class="tl"><span class="tlr">' + tth(rot) + ' · ' + esc(w.nome) + '</span>' + (r ? '<span class="td">' + esc(dFmt(r.date)) + ' · ' + esc(r.desc) + '</span><b class="num">' + valorMov(r, w.moeda) + '</b>'
      : '<span class="td">' + tth('transf.movSumiu') + '</span>') + '</div>';
  }
  function parTela(p) {
    var nome = tth('transf.parAria', { nomeSaida: p.s.w.nome, dataSaida: dFmt(p.s.r.date), valorSaida: valorMov(p.s.r, p.s.w.moeda), nomeEntrada: p.e.w.nome, dataEntrada: dFmt(p.e.r.date), valorEntrada: valorMov(p.e.r, p.e.w.moeda) });
    var ja = p.ja === 's' ? tth('transf.jaSaida', { nome: p.s.w.nome })
      : p.ja === 'e' ? tth('transf.jaEntrada', { nome: p.e.w.nome }) : '';
    return '<div class="tpar" role="group" aria-label="' + nome + '">' + ladoPar('transf.saiu', p.s.w, p.s.r) + '<span class="tseta" aria-hidden="true">→</span>' + ladoPar('transf.entrou', p.e.w, p.e.r) +
      '<p class="tm">' + esc(difPar(p)) + (ja ? '<span class="tja">' + ja + '</span>' : '') + '</p>' +
      '<div class="grupo"><button class="btn sm pri" type="button" data-tconf="' + esc(p.chave) + '">' + tth('transf.mesma') + '</button><button class="btn sm" type="button" data-tdisp="' + esc(p.chave) + '">' + tth('transf.naoSao') + '</button></div></div>';
  }
  function confirmadasTela(C) {
    if (!C.length) return '';
    return '<details class="metas" id="fin-tconf"' + (S.tConf ? ' open' : '') + '><summary>' + tth('transf.confirmadas', { n: C.length }) + '</summary><ul class="tconf">' + C.map(function (t) {
      var lado = function (l) { return l.r ? esc(dFmt(l.r.date)) + ' · ' + esc(l.w.nome) + ' · ' + esc(l.r.desc) + ' <b class="num">' + valorMov(l.r, l.w.moeda) + '</b>' : esc(l.w.nome) + ' · ' + tth('transf.movSumiu'); };
      return '<li><span>' + lado(t.s) + ' → ' + lado(t.e) + '</span><button class="btn sm" type="button" data-tdesf="' + esc(t.s.w.id) + '" data-tmov="' + esc(t.s.id) + '">' + tth('comum.desfazer') + '</button></li>';
    }).join('') + '</ul><p class="passo">' + tth('transf.desfazerDica') + '</p></details>';
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
    return '<section class="sec" id="fin-transf"><div class="sec-top"><h2 tabindex="-1">' + tth(n ? 'transf.sugeridas' : 'transf.entreCarteiras') + '</h2><span class="hint">' +
      tth(n ? 'transf.pares' : 'transf.nenhumaNova', { n: n }) + '</span></div>' +
      (n ? '<div class="card tlist">' + TR.S.pares.map(parTela).join('') + '</div>' : '') + confirmadasTela(TR.C) + '</section>';
  }
  /* em Revisar categorias: os pares que envolvem a carteira */
  function transfBloco(wid) {
    if (!TR) return '';
    var ps = TR.S.pares.filter(function (p) { return p.s.w.id === wid || p.e.w.id === wid; }), C = TR.C.filter(function (t) { return t.s.w.id === wid || t.e.w.id === wid; }), sc = semCambioTransf(wid);
    if (!ps.length && !C.length && !sc.length) return '';
    return '<div class="rtransf" id="fin-transf"><h3 class="rvt" tabindex="-1">' + tth(ps.length ? 'transf.sugeridas' : 'transf.entreCarteiras') + '</h3>' +
      (ps.length ? '<p class="passo">' + tth('transf.blocoDica') + '</p><div class="tlist">' + ps.map(parTela).join('') + '</div>' : '') +
      (sc.length ? '<p class="passo">' + sc.map(function (w) { return tth('transf.definaCambio', { moeda: w.moeda, nome: w.nome }); }).join(' ') + '</p>' : '') + confirmadasTela(C) + '</div>';
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
  var PAISES = PAISES_MOEDA.map(function (p) { return [p[0], p[1]]; });
  /* todos os países, em dois grupos: primeiro os que usam a moeda escolhida, depois os outros (para escolher o país
     antes e a moeda vir junto). País fora da lista (veio de um backup) continua na escolha: nada muda sozinho */
  function opcoesPais(moedaSel, sel) {
    var da = PAISES_MOEDA.filter(function (p) { return p[2] === moedaSel; }), resto = PAISES_MOEDA.filter(function (p) { return p[2] !== moedaSel; });
    var par = function (p) { return [p[0], p[1]]; }, extra = sel && !PAISES_MOEDA.some(function (p) { return p[0] === sel; }) ? [[sel, sel]] : [];
    if (!da.length) return opcoes(PAISES.concat(extra), sel);
    var nomeM = (MOEDAS.filter(function (m) { return m[0] === moedaSel; })[0] || [0, moedaSel])[1];
    return '<optgroup label="' + tth('pais.usamMoeda', { moeda: nomeM.charAt(0).toLowerCase() + nomeM.slice(1) }) + '">' + opcoes(da.map(par), sel) + '</optgroup>' +
      '<optgroup label="' + tth('pais.outros') + '">' + opcoes(resto.map(par).concat(extra), sel) + '</optgroup>';
  }
  function notaRegrasPais() { return tth('pais.notaRegras', { paises: listaE(PAISES_COM_REGRAS.map(nomePais)) }); }
  function configurado() { return !!(S.plan && S.plan.configurado); }
  function temRegras(pais) { return PAISES_COM_REGRAS.indexOf(pais || 'IE') >= 0; }
  function suportado() { return !S.plan || temRegras(S.plan.pais); }
  function nomePais(cod) { var p = PAISES.filter(function (x) { return x[0] === cod; })[0]; return p ? p[1] : cod; }
  function avisoSuporte(pais) {
    pais = pais || (S.plan && S.plan.pais);
    return tth('pais.avisoSuporte', { pais: cru('<b>' + esc(nomePais(pais)) + '</b>'), paises: PAISES_COM_REGRAS.map(nomePais).join(', ') });
  }
  function opcoes(lista, sel) {
    return lista.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('');
  }
  function setup() {
    var p = S.plan || {}, primeira = !configurado();
    return '<section class="sec" id="fin-setup"><div class="sec-top"><h2>' + tth(primeira ? 'config.antesDeComecar' : 'comum.configuracoes') + '</h2>' +
      '<span class="hint">' + tth('config.soNesteNavegador') + '</span></div><div class="card"><form id="fin-fsetup" class="ggrid">' +
      '<fieldset><legend>' + tth('config.voce') + '</legend><div class="mgrid">' +
      '<label>' + tth('config.seuNome') + '<input id="fin-s-titular" type="text" autocomplete="off" spellcheck="false" placeholder="' + tth('config.nomeExemplo') + '" value="' + esc(p.titular || '') + '">' +
      '<small>' + tth('config.nomeDica') + '</small></label>' +
      '</div></fieldset>' + carteirasCampos() + categoriasCampos() +
      '<fieldset><legend>' + (variasCarteiras() ? tth('config.metasTituloCarteira', { carteira: cartAtual().nome, simbolo: simbolo() }) : tth('config.metasTitulo', { simbolo: simbolo() })) + '</legend><p class="passo">' + tth(SUG ? 'config.metasSug' : 'config.metasSemSug') + '</p>' +
      '<div class="mgrid">' + metasCampos('s') + '</div></fieldset>' + secaoDados() +
      '<div class="grupo"><button class="btn pri" type="submit">' + tth(primeira ? 'config.salvarComecar' : 'config.salvar') + '</button>' +
      (primeira ? '' : '<button class="btn" type="button" data-fin-setup>' + tth('comum.cancelar') + '</button>') + '</div>' +
      '</form></div></section>';
  }
  /* as moedas da lista, mais a da carteira se ela não estiver na lista (veio de um backup) */
  function opcoesMoeda(sel) { return opcoes(MOEDAS.some(function (o) { return o[0] === sel; }) ? MOEDAS : MOEDAS.concat([[sel, sel]]), sel); }
  /* cada carteira: nome, tipo de extrato (banco), moeda e país; com extrato salvo, banco e moeda travam */
  function carteirasCampos() {
    var x = dadosAtuais(), h = '', varias = x.carteiras.length > 1;
    x.carteiras.forEach(function (c, i) {
      var k = 'fin-w-' + c.id, trava = moedaTravada(c.months), r = resumoDados(c), desc = trava ? ' disabled aria-describedby="' + k + '-trava"' : '';
      h += '<div class="wcart">' + (varias ? '<div class="wtop"><b>' + esc(c.nome) + '</b><small>' + (i === 0 ? tth('carteiras.principal') + ' · ' : '') +
        (r.meses ? tth('importar.meses', { n: r.meses }) + ', ' + tth('carteiras.nMov', { n: r.mov }) : tth('carteiras.semExtrato')) + '</small>' +
        '<button class="btn sm" type="button" data-wexcluir="' + esc(c.id) + '">' + tth('carteiras.excluir') + '</button></div>' : '') +
        '<div class="mgrid"><label>' + tth('carteiras.nome') + '<input id="' + k + '-nome" type="text" autocomplete="off" maxlength="40" value="' + esc(c.nome) + '"></label>' +
        '<label>' + tth('carteiras.extrato') + '<select id="' + k + '-banco"' + desc + '>' + opcoes(bancosTela(), c.banco) + '</select>' +
        '<small id="' + k + '-leitor"' + (temLeitor(c.banco) ? ' hidden' : '') + '>' + genericoTxt() + '</small></label>' +
        '<label>' + tth('carteiras.moedaConta') + '<select id="' + k + '-moeda"' + desc + '>' + opcoesMoeda(c.moeda) + '</select>' +
        (trava ? '' : '<small>' + tth('carteiras.moedaDica') + '</small>') + '</label>' +
        '<label>' + tth('carteiras.pais') + '<select id="' + k + '-pais">' + opcoesPais(c.moeda, c.pais) + '</select></label>' +
        '<label>' + esc(catNome(catPor('brasil'))) + '<select id="' + k + '-envios">' + opcoes([['gasto', tt('carteiras.enviosGasto')], ['movido', tt('carteiras.enviosMovido')]], c.envios === 'movido' ? 'movido' : 'gasto') + '</select><small>' + tth('carteiras.enviosDica') + '</small></label></div>' +
        (trava ? '<p class="passo" id="' + k + '-trava">' + tth('carteiras.trava', { moeda: nomeMoeda(c.moeda) }) + '</p>' : '') +
        '<p class="aviso" id="' + k + '-aviso"' + (temRegras(c.pais) ? ' hidden' : '') + '>' + avisoSuporte(c.pais) + '</p></div>';
    });
    var nova = x.carteiras.length >= MAX_CARTEIRAS
      ? '<p class="passo">' + tth('carteiras.maximo', { n: MAX_CARTEIRAS }) + '</p>'
      : '<details class="metas" id="fin-wnova"' + (S.wOpen ? ' open' : '') + '><summary>' + tth('carteiras.adicionar') + '</summary>' +
        '<p class="passo">' + tth('carteiras.novaDica', { n: MAX_CARTEIRAS }) + '</p>' +
        '<div class="mgrid"><label>' + tth('carteiras.nome') + '<input id="fin-wn-nome" type="text" autocomplete="off" maxlength="40" placeholder="' + tth('carteiras.nomeExemplo') + '"></label>' +
        '<label>' + tth('carteiras.extrato') + '<select id="fin-wn-banco">' + opcoes(bancosTela(), 'revolut') + '</select><small id="fin-wn-leitor" hidden>' + genericoTxt() + '</small></label>' +
        '<label>' + tth('carteiras.moedaConta') + '<select id="fin-wn-moeda">' + opcoes(MOEDAS, x.config.moedaPrincipal) + '</select></label>' +
        '<label>' + tth('carteiras.pais') + '<select id="fin-wn-pais">' + opcoesPais(x.config.moedaPrincipal, moedaDoPais(carteiraAtiva(x).pais) === x.config.moedaPrincipal ? carteiraAtiva(x).pais : paisPadraoDaMoeda(x.config.moedaPrincipal)) + '</select><small data-nota="regras">' + notaRegrasPais() + '</small></label></div>' +
        '<p class="aviso" id="fin-wn-aviso"' + (temRegras(carteiraAtiva(x).pais) ? ' hidden' : '') + '>' + avisoSuporte(carteiraAtiva(x).pais) + '</p></details>';
    var mp = '';
    if (varias) {
      var mpv = x.config.moedaPrincipal, precisa = moedasSemPrincipal(x);
      mp = '<div class="wcart"><div class="mgrid"><label>' + tth('carteiras.moedaPrincipal') + '<select id="fin-w-mp">' + opcoesMoeda(mpv) + '</select>' +
        '<small>' + tth('carteiras.moedaPrincipalDica') + '</small></label></div>' +
        (precisa.length ? '<div id="fin-cambc-w"><p class="passo">' + tth('cambio.digitado') + '</p><div class="mgrid">' + camposCambio(precisa, 'cambc') + '</div></div>' +
          '<p class="aviso" id="fin-cambc-troca" hidden>' + tth('carteiras.trocaPrincipal') + '</p>' : '') + '</div>';
    }
    return '<fieldset><legend>' + tth(varias ? 'carteiras.titulos' : 'carteiras.titulo') + '</legend>' + h + mp + nova + '</fieldset>';
  }
  function lerCarteira(id) {
    var k = '#fin-w-' + id, mo = $(k + '-moeda'), bc = $(k + '-banco');
    return { nome: $(k + '-nome').value, pais: $(k + '-pais').value, moeda: mo.disabled ? undefined : mo.value, banco: bc.disabled ? undefined : bc.value, envios: $(k + '-envios') ? $(k + '-envios').value : undefined };
  }
  /* ---------- importador genérico: prévia e perguntas ---------- */
  /* cada escolha na tela refaz a prévia; trocar codificação ou separador relê o arquivo e refaz as sugestões */
  function mudarImportacao(t) {
    var I = S.importar, m = I.mapa, k = t.getAttribute('data-imp-campo'), v = t.value, n = +v, foco = t.id;
    if (k === 'aba') {
      try { Object.assign(I, prepararPlanilha(window.XLSX, I.bytes, I.tipo, null, n)); }
      catch (er) { toast(tt('importar.abaIlegivel', { erro: textoErro(er) }), true); }
    } else if (k === 'cod' || k === 'sep') {
      try { Object.assign(I, prepararImportacao(I.bytes, null, k === 'cod' ? v : I.cod, k === 'sep' ? v : I.sep)); }
      catch (er) { toast(tt('importar.assimIlegivel', { erro: textoErro(er) }), true); }
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
    return '<div id="fin-i-conf">' + confSaldo(I, r) + '</div><div class="mgrid"><label>' + tth('importar.saldoBanco', { data: dFull(r.ate) }) + '<input id="fin-i-ancora" type="text" inputmode="decimal" autocomplete="off" placeholder="' + tth('comum.exemplo', { exemplo: '1.234,56' }) + '" value="' + esc(I.ancoraTxt || '') + '">' +
      '<small>' + tth(ks.length ? 'importar.saldoConferir' : 'importar.saldoEstimar') + '</small></label></div>';
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
    return !p ? tt('importar.importar') : p.novos ? tt('importar.importarN', { n: p.novos }) : podeSalvar(I) ? tt('importar.soSaldo') : tt('importar.nadaParaImportar');
  }
  function confSaldo(I, r) {
    var h = '', an = ancoraDigitada(I), ks = Object.keys(r.saldos).sort(), m = I.mapa;
    if (ks.length) {
      var ult = ks[ks.length - 1], c = conferirSaldos(r.tx, r.saldos, an != null ? { data: r.ate, valor: an } : null), dv = c.divergencias;
      h += '<p class="passo">' + tth(m.saldoLinhas ? 'conf.saldoLinhas' : 'conf.saldoColuna', { n: ks.length, rotulo: m.saldoLinhas, coluna: m.saldoLinhas ? '' : nomeColuna(I, m.saldo), valor: cru('<b>' + esc(f2(r.saldos[ult] / 100)) + '</b>'), data: dFull(ult) }) + '</p>';
      var rend = dv.filter(function (x) { return x.tipo === 'rendimento'; }), falta = dv.filter(function (x) { return x.tipo === 'falta'; });
      var lista = function (xs) { return '<ul class="imp-ign">' + xs.slice(0, 6).map(function (x) { return '<li>' + tth('conf.entre', { de: dFull(x.de), ate: dFull(x.ate), dif: sgn(x.dif / 100, f2) }) + '</li>'; }).join('') + (xs.length > 6 ? '<li>' + tth('conf.eMais', { n: xs.length - 6 }) + '</li>' : '') + '</ul>'; };
      if (rend.length) {
        var tr = 0; rend.forEach(function (x) { tr += x.dif; });
        h += '<details class="metas"><summary>' + tth('conf.rendimento', { valor: sgn(tr / 100, f2), n: rend.length }) + '</summary>' +
          '<p class="passo">' + tth('conf.rendimentoDica', { valor: f2(RENDIMENTO_DIA / 100) }) + '</p>' + lista(rend) + '</details>';
      }
      if (falta.length) h += '<div class="aviso"><p>' + tth('conf.falta', { n: falta.length }) + '</p>' + lista(falta) + '</div>';
      if (c.ancora) h += c.ancora.dif
        ? '<p class="aviso erro">' + tth('conf.ancoraDifere', { informado: f2(an / 100), data: dFull(r.ate), extrato: f2(c.ancora.extrato / 100), dif: sgn(c.ancora.dif / 100, f2), ultimo: dFull(ult) }) + '</p>'
        : '<p class="passo">' + tth('conf.ancoraBate', { data: dFull(r.ate) }) + '</p>';
    } else if (an != null) h += '<p class="passo">' + tth('conf.semSaldoExtrato') + '</p>';
    return h;
  }
  function confirmarImportacao() {
    var I = S.importar, r = interpretarCSV(I.rows, I.mapa), porMes = {}, novos = 0, rep = 0, meses = 0;
    if (I.leitor) r.tx = I.lido.tx;
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
      var n = Object.assign({}, c, { periodos: juntarPeriodos(c.periodos, r.periodo) });
      if (!I.leitor) n.importacao = lembrarMapa(c.importacao, I.rows, I.mapa);
      if (I.leitor && I.sugTitular && I.lido.sugestoes) {
        var ap = aplicarPixTitular(c.over, c.pixTitular, I.lido.sugestoes.map(function (k) { return chavePix(I.lido.tx[k]); }));
        n.over = ap.over; n.pixTitular = ap.aplicados;
      }
      if (Object.keys(r.saldos).length) n.saldosDia = Object.assign({}, c.saldosDia || {}, r.saldos);
      if (an != null) { n.ancora = { data: r.ate, valor: an, informadoEm: todayIso() }; delete n.ancoraDispensada; }
      return n;
    }) });
    S.importar = null;
    return enqueue(function () { usarDados(x); localSave(); }).then(function () {
      recompute(); render(); window.scrollTo(0, 0);
      toast(!novos && rep === 0 ? tt('importar.saldoSalvo') : novos ? tt('importar.adicionou', { n: novos, meses: tt('importar.meses', { n: meses }) }) + '.' + (rep ? ' ' + tt('importar.jaSalvas', { n: rep }) : '')
        : tt('importar.nadaNovo', { n: rep }), false, !novos && rep === 0 ? 'importar.saldoSalvo' : novos ? 'importar.adicionou' : 'importar.nadaNovo');
    });
  }
  function abrirGenerico(files) {
    if (files.length > 1) toast(tt('importar.umPorVez', { arquivo: files[0].name }));
    var f = files[0];
    return f.arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf), c = cartAtual(), tipo = tipoArquivo(b), lem = c && c.importacao;
      if (tipo === 'pdf') return abrirPdf(f.name, b);
      if (tipo === 'zip') throw new Error(tt('importar.compactado'));
      if (tipo === 'senha') throw erroCod('arquivo.planilhaSenha', {}, SENHA);
      if (tipo === 'vazio') throw new Error(tt('importar.vazio'));
      if (!ehPlanilha(tipo)) return Object.assign({ nome: f.name, bytes: b }, prepararImportacao(b, lem));
      return carregarLeitorPlanilhas().then(function (X) { return Object.assign({ nome: f.name, bytes: b, tipo: tipo }, prepararPlanilha(X, b, tipo, lem)); });
    }).then(function (I) {
      S.importar = comLeitor(I); render(); window.scrollTo(0, 0);
    }).catch(function (e) { toast(tt('importar.naoLeu', { arquivo: f.name, erro: textoErro(e) }), true, e.aviso || 'importar.naoLeu'); });
  }
  /* banco reconhecido pelo conteúdo (hoje, o BTG): o leitor dele define colunas, formatos e o tipo de cada movimento,
     e a prévia é a mesma, sem perguntas */
  function comLeitor(I) {
    var lb = detectarBanco(I.rows);
    if (!lb || !LEITORES[lb].previa) return I;
    var L = LEITORES[lb].ler(I.rows, moeda(), { titular: S.plan && S.plan.titular });
    if (!L.tx.length && L.moedas.length && L.moedas.indexOf(moeda()) < 0) throw new Error(tt('importar.outraMoeda', { banco: LEITORES[lb].nome, moeda: nomeMoeda(L.moedas[0]), moedaCarteira: nomeMoeda() }));
    return Object.assign(I, { leitor: lb, lido: L, rows: L.previa.rows, mapa: L.previa.mapa, lembrado: false });
  }
  /* o arquivo virado em linhas, para reconhecer o banco antes de escolher a carteira (planilha carrega o leitor) */
  function linhasDoArquivo(f) {
    return f.arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf), tipo = tipoArquivo(b);
      if (ehPlanilha(tipo)) return carregarLeitorPlanilhas().then(function (X) { return prepararPlanilha(X, b, tipo).rows; });
      if (tipo === 'pdf') return location.protocol === 'file:' ? [] : carregarPdfjs().then(function (pdfjs) { return lerPdf(pdfjs, b); }).then(function (ps) { return tabelaDoPdf(ps).linhas; });
      if (tipo !== 'texto') return [];
      return prepararImportacao(b).rows;
    });
  }
  /* PDF: só o extrato do Itaú, e só com o painel servido (aberto do disco, o navegador não carrega o pdf.js) */
  function abrirPdf(nome, b) {
    if (location.protocol === 'file:') { var ed = new Error(tt('importar.pdfDoDisco')); ed.aviso = 'importar.pdfDoDisco'; return Promise.reject(ed); }
    return carregarPdfjs().then(function (pdfjs) { return lerPdf(pdfjs, b); }).then(function (ps) {
      var t = tabelaDoPdf(ps), lb = detectarBanco(t.linhas);
      if (!t.comTexto) throw new Error(tt('importar.pdfImagem'));
      if (!lb || !LEITORES[lb].previa) throw new Error(tt('importar.pdfDesconhecido'));
      return { nome: nome, bytes: b, tipo: 'pdf', cod: null, sep: 'pdf', rows: t.linhas, mapa: { cab: -1 }, lembrado: false };
    });
  }
  /* o pdf.js (vendor/pdfjs, 1,8 MB) só entra quando a pessoa escolhe um PDF; sem worker: o código dele roda na
     própria página (window.pdfjsWorker), sob a CSP dela */
  var leitorPdf = null;
  function carregarPdfjs() {
    if (leitorPdf) return leitorPdf;
    leitorPdf = import('./vendor/pdfjs/pdf.min.mjs').then(function (pdfjs) {
      return import('./vendor/pdfjs/pdf.worker.min.mjs').then(function (w) { window.pdfjsWorker = w; return pdfjs; });
    }).catch(function () { leitorPdf = null; throw new Error(tt('importar.leitorPdf')); });
    return leitorPdf;
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
      s.onerror = function () { leitorPlanilhas = null; s.remove(); falhou(new Error(tt('importar.leitorPlanilhas'))); };
      document.head.appendChild(s);
    });
    return leitorPlanilhas;
  }
  function nomeFmtData(f) { return { dmy: tt('importar.fmtDmy'), mdy: tt('importar.fmtMdy'), ymd: tt('importar.fmtYmd'), texto: tt('importar.fmtTexto') }[f]; }
  /* o nome do formato do número é a própria notação, igual em todo idioma */
  function nomeFmtNum(f) { return { virgula: '1.234,56', ponto: '1,234.56' }[f]; }
  /* os separadores do núcleo (SEPARADORES), com o nome no idioma da tela, pelo próprio caractere */
  function separadoresTela() {
    var nome = { ';': tt('importar.sepPontoVirgula'), ',': tt('importar.sepVirgula'), '\t': tt('importar.sepTab'), '|': tt('importar.sepBarra') };
    return SEPARADORES.map(function (o) { return [o[0], nome[o[0]] || o[1]]; });
  }
  function nomeColuna(I, i) { var c = String(I.rows[I.mapa.cab][i] || '').trim(); return c || tt('importar.colunaN', { n: i + 1 }); }
  function opColunas(I, sel, vazio) {
    return '<option value="-1"' + (sel < 0 ? ' selected' : '') + '>' + esc(vazio) + '</option>' + I.rows[I.mapa.cab].map(function (c, i) {
      return '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + esc(nomeColuna(I, i)) + '</option>';
    }).join('');
  }
  /* papel do saldo: nenhum, uma coluna, ou linhas próprias com uma descrição (ex.: "Saldo Diário") */
  function opSaldo(I) {
    var m = I.mapa, rot = m.saldoLinhas || detectarLinhasSaldo(I.rows, m), o = '<option value="-1"' + (m.saldo < 0 && !m.saldoLinhas ? ' selected' : '') + '>' + tth('importar.semSaldo') + '</option>';
    if (rot) o += '<option value="l"' + (m.saldoLinhas ? ' selected' : '') + '>' + tth('importar.linhasRotulo', { rotulo: rot }) + '</option>';
    return o + I.rows[m.cab].map(function (c, i) {
      return '<option value="c' + i + '"' + (i === m.saldo ? ' selected' : '') + '>' + tth('importar.colunaNome', { coluna: nomeColuna(I, i) }) + '</option>';
    }).join('');
  }
  function radios(nome, ops, sel) {
    return '<div class="radios">' + ops.map(function (o) {
      return '<label class="chk"><input type="radio" name="' + nome + '" value="' + o[0] + '" data-imp-campo="' + nome + '"' + (o[0] === sel ? ' checked' : '') + '>' + o[1] + '</label>';
    }).join('') + '</div>';
  }
  function avisoLeitor(I) {
    var L = I.lido, ks = Object.keys(L.saldosDia || {}).sort(), ult = ks[ks.length - 1], h = '<p class="aviso">' + tth('importar.reconheci', { banco: LEITORES[I.leitor].nome }) + '</p>';
    /* Pix cujo nome cortado é o começo do nome do titular: só sugestão, a pessoa marca se quiser */
    if (L.sugestoes && L.sugestoes.length) {
      var ns = L.sugestoes.length;
      h += '<div class="radios"><label class="chk"><input type="checkbox" id="fin-i-titular"' + (I.sugTitular ? ' checked' : '') + '><span>' + tth('importar.pixTitular', { n: ns, titular: S.plan.titular }) + '</span></label></div>';
    }
    /* saldo atual com data depois do período (Itaú): só informação, a diferença vem de movimentos depois dele */
    if (L.saldoAtual != null && ult && L.saldoAtualData && L.saldoAtualData > ult) {
      h += '<p class="passo">' + tth(Math.abs(L.saldoAtual - L.saldosDia[ult]) <= ARREDONDAMENTO ? 'importar.saldoDepoisIgual' : 'importar.saldoDepoisDifere',
        { data: dFull(L.saldoAtualData), valor: f2(L.saldoAtual / 100), valorUltimo: f2(L.saldosDia[ult] / 100), ultimo: dFull(ult) }) + '</p>';
    } else if (L.saldoAtual != null && ult) {
      var dif = L.saldoAtual - L.saldosDia[ult];
      h += Math.abs(dif) <= ARREDONDAMENTO
        ? '<p class="passo">' + tth('importar.saldoAtualBate', { valor: f2(L.saldoAtual / 100), data: dFull(ult) }) + '</p>'
        : '<p class="aviso erro">' + tth('importar.saldoAtualDifere', { valor: f2(L.saldoAtual / 100), valorUltimo: f2(L.saldosDia[ult] / 100), data: dFull(ult), dif: sgn(dif / 100, f2) }) + '</p>';
    }
    return h;
  }
  function celulas(r) { return r.map(function (c) { return String(c).trim(); }).filter(Boolean).join(' · ').slice(0, 90); }
  /* o motivo de uma linha ignorada pelo código do núcleo; sem código conhecido, a frase pt-BR que veio com ela */
  function motivoIgnorada(x) {
    var k = { semData: 'importar.motivo.semData', saldoSemValor: 'importar.motivo.saldoSemValor', valorRuim: 'importar.motivo.valorRuim', valorZero: 'importar.motivo.valorZero' }[x.cod];
    return k ? tt(k) : x.motivo;
  }
  function telaImportar() {
    var I = S.importar, m = I.mapa, c = cartAtual(), h = '';
    var cabs = [], ix = 0;
    I.rows.slice(0, 40).forEach(function (r, i) { if (r.some(function (x) { return String(x).trim(); }) && ix++ < 25) cabs.push([String(i), tt('importar.linhaCab', { n: i + 1, celulas: celulas(r).slice(0, 60) })]); });
    if (I.leitor) h += avisoLeitor(I);
    else h += (I.lembrado ? '<p class="aviso">' + tth('importar.lembrado') + '</p>'
      : '<p class="passo">' + tth('importar.digaColunas') + '</p>') +
      '<fieldset><legend>' + tth('importar.arquivo') + '</legend><div class="mgrid">' + (I.tipo
        ? (I.abas.length > 1 ? '<label>' + tth('importar.aba') + '<select id="fin-i-aba" data-imp-campo="aba">' + opcoes(I.abas.map(function (a, i) { return [String(i), a]; }), String(I.aba)) + '</select><small>' + tth('importar.nAbas', { n: I.abas.length }) + '</small></label>' : '')
        : '<label>' + tth('importar.codificacao') + '<select id="fin-i-cod" data-imp-campo="cod">' + opcoes([['utf-8', 'UTF-8'], ['latin1', 'Latin-1 (Windows)']], I.cod) + '</select><small>' + tth('importar.letrasTrocadas') + '</small></label>' +
          '<label>' + tth('importar.separador') + '<select id="fin-i-sep" data-imp-campo="sep">' + opcoes(separadoresTela(), I.sep) + '</select></label>') +
      '<label>' + tth('importar.linhaCabecalho') + '<select id="fin-i-cab" data-imp-campo="cab"><option value="-1"' + (m.cab < 0 ? ' selected' : '') + '>' + tth('importar.escolhaLinha') + '</option>' + opcoes(cabs, String(m.cab)) + '</select></label></div></fieldset>';
    var q = m.cab < 0 ? [{ id: 'cab' }] : perguntasImportacao(I.rows, m);
    if (m.cab >= 0 && !I.leitor) {
      var v = m.valor;
      var escolha = tt('importar.escolha');
      h += '<fieldset><legend>' + tth('importar.colunas') + '</legend><div class="mgrid">' +
        '<label>' + tth('importar.colData') + '<select id="fin-i-data" data-imp-campo="data">' + opColunas(I, m.data, escolha) + '</select></label>' +
        '<label>' + tth('importar.colDescricao') + '<select id="fin-i-desc" data-imp-campo="desc">' + opColunas(I, m.desc, escolha) + '</select></label>' +
        '<label>' + tth('importar.valorEm') + '<select id="fin-i-modo" data-imp-campo="modo">' + opcoes([['uma', tt('importar.umaColuna')], ['duas', tt('importar.duasColunas')]], v.modo) + '</select></label>' +
        (v.modo === 'duas'
          ? '<label>' + tth('importar.saidasDebitos') + '<select id="fin-i-saida" data-imp-campo="saida">' + opColunas(I, v.saida, escolha) + '</select></label>' +
            '<label>' + tth('importar.entradasCreditos') + '<select id="fin-i-entrada" data-imp-campo="entrada">' + opColunas(I, v.entrada, escolha) + '</select></label>'
          : '<label>' + tth('comum.valor') + '<select id="fin-i-col" data-imp-campo="col">' + opColunas(I, v.col, escolha) + '</select></label>') +
        '<label>' + tth('importar.saldoFimDia') + '<select id="fin-i-saldo" data-imp-campo="saldo">' + opSaldo(I) + '</select><small>' + tth('importar.saldoOpcional') + '</small></label>' +
        '</div></fieldset>';
      var perg = '';
      q.forEach(function (x) {
        if (x.id === 'fmtData' && x.erro) perg += '<p class="aviso erro">' + tth('importar.semFormatoData', { coluna: nomeColuna(I, m.data) }) + '</p>';
        else if (x.id === 'fmtData') perg += '<fieldset><legend>' + tth('importar.fmtDataTitulo') + '</legend><p class="passo">' + tth('importar.fmtDataPergunta', { exemplo: cru('<b>' + esc(x.exemplo) + '</b>') }) + '</p>' +
          radios('fmtData', x.opcoes.map(function (f) { return [f, esc(nomeFmtData(f)) + ': ' + esc(dFull(lerData(x.exemplo, f)))]; }), m.fmtData) + '</fieldset>';
        else if (x.id === 'saldoValor') perg += '<p class="aviso erro">' + tth('importar.saldoIgualValor') + '</p>';
        else if (x.id === 'fmtNum' && x.erro) perg += '<p class="aviso erro">' + tth('importar.naoNumero') + '</p>';
        else if (x.id === 'fmtNum') perg += '<fieldset><legend>' + tth('importar.fmtNumTitulo') + '</legend><p class="passo">' + tth('importar.fmtNumPergunta', { exemplo: cru('<b>' + esc(x.exemplo) + '</b>') }) + '</p>' +
          radios('fmtNum', x.opcoes.map(function (f) { return [f, esc(nomeFmtNum(f)) + ': ' + esc(x.exemplo) + ' = ' + esc(f2(lerNumero(x.exemplo, f) / 100))]; }), m.fmtNum) + '</fieldset>';
        else if (x.id === 'sinal') perg += '<fieldset><legend>' + tth('importar.saidas') + '</legend><p class="passo">' + tth('importar.sinalPergunta', { coluna: nomeColuna(I, v.col), positivos: tt('importar.nPositivos', { n: x.pos }), negativos: tt('importar.nNegativos', { n: x.neg }) }) + '</p>' +
          radios('sinal', [['negativas', tth('importar.sinalNegativas', { exemplo: '−50,00' })], ['positivas', tth('importar.sinalPositivas', { exemplo: '50,00' })]], v.saidas) + '</fieldset>';
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
      h += '<fieldset><legend>' + tth('importar.previa') + '</legend>' + (r.tx.length
        ? '<p class="passo">' + tth(m.fmtNum ? 'importar.lidoComoNum' : 'importar.lidoComo', { datas: nomeFmtData(m.fmtData), numeros: nomeFmtNum(m.fmtNum), moeda: nomeMoeda() }) + '</p>' +
          '<div class="imp-tot"><div><span>' + tth('importar.periodoExtrato') + '</span><b>' + tth('comum.periodo', { de: dFull(r.periodo.de), ate: dFull(r.periodo.ate) }) + '</b>' +
          (r.periodo.fonte === 'arquivo' ? '<small>' + (r.periodo.de !== r.de || r.periodo.ate !== r.ate ? tth('importar.comoArquivoMov', { de: dFmt(r.de), ate: dFmt(r.ate) }) : tth('importar.comoArquivo')) + '</small>' : '<small>' + tth('importar.primeiraUltima') + '</small>') + '</div><div><span>' + tth('importar.movimentos') + '</span><b>' + r.tx.length + '</b></div>' +
          '<div><span>' + tth('importar.entradas') + '</span><b class="num pos">+' + f2(r.entradas / 100) + '</b></div><div><span>' + tth('importar.saidas') + '</span><b class="num neg">−' + f2(-r.saidas / 100) + '</b></div></div>' +
          '<div class="tw"><table class="imp"><thead><tr><th>' + tth('importar.colLinha') + '</th><th>' + tth('importar.colData') + '</th><th>' + tth('importar.colDescricao') + '</th><th>' + tth('comum.valor') + '</th></tr></thead><tbody>' +
          r.tx.slice(0, 5).map(function (t, i) {
            var n = r.linhas[i];
            return '<tr><td>' + n + '</td><td>' + esc(dFull(t[0])) + '</td><td class="ds">' + esc(t[1]) + '<small>' + tth('importar.noArquivo', { celulas: celulas(I.rows[n - 1]) }) + '</small></td><td class="num ' + (t[3] < 0 ? 'neg' : 'pos') + '">' + (t[3] < 0 ? '−' : '+') + f2(Math.abs(t[3]) / 100) + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          (r.ignoradas.length ? '<details class="metas"><summary>' + tth('importar.ignoradas', { n: r.ignoradas.length }) + '</summary><ul class="imp-ign">' +
            r.ignoradas.slice(0, 20).map(function (x) { return '<li>' + tth('importar.linhaIgnorada', { n: x.n, motivo: motivoIgnorada(x), celulas: celulas(x.celulas) }) + '</li>'; }).join('') + '</ul></details>' : '') +
          (rep ? '<p class="aviso" data-aviso="importar.repetidos" data-n="' + rep + '">' + tth('importar.repetidos', { n: rep }) + '</p>' : '') +
          previaSaldo(I, r)
        : '<p class="aviso erro">' + tth('importar.nenhumEntendido') + '</p>') + '</fieldset>';
    }
    return '<section class="sec" id="fin-imp"><div class="sec-top"><h2>' + tth('importar.titulo') + '</h2><span class="hint">' + esc(I.nome) + ' · ' + esc(c ? c.nome : '') + '</span></div>' +
      '<div class="card"><form id="fin-fimp" class="ggrid">' + h +
      '<div class="grupo"><button class="btn pri" type="submit"' + (pend || !r || !podeSalvar(I) ? ' disabled aria-describedby="fin-i-falta"' : '') + '>' +
      (pend || !r ? tth('importar.importar') : esc(textoBotao(I))) + '</button>' +
      '<button class="btn" type="button" data-imp="cancelar">' + tth('comum.cancelar') + '</button></div>' +
      (pend ? '<p class="passo" id="fin-i-falta">' + tth('importar.respondaFalta') + '</p>' : '') + '</form></div></section>';
  }
  function telaExcluirCarteira() {
    var x = dadosAtuais(), c = x.carteiras.filter(function (w) { return w.id === S.excluir; })[0], r = resumoDados(c);
    var prox = x.carteiras[0].id === c.id ? x.carteiras[1] : null;
    var oQue = r.meses ? tt('excluir.oQue', { meses: tt('importar.meses', { n: r.meses }), mov: tt('carteiras.nMov', { n: r.mov }), periodo: r.meses === 1 ? mLabel(r.de) : tt('comum.periodo', { de: mLabel(r.de), ate: mLabel(r.ate) }) }) : tt('excluir.semExtrato');
    return '<section class="sec"><div class="sec-top"><h2>' + tth('excluir.titulo', { nome: c.nome }) + '</h2></div><div class="card ggrid">' +
      '<p class="aviso erro">' + tth('excluir.aviso', { oQue: oQue }) + '</p>' +
      '<p>' + tth('excluir.ficam') + '</p>' +
      (contarTransferencias(c) ? '<p class="aviso">' + tth('excluir.transf', { n: contarTransferencias(c) }) + '</p>' : '') +
      (prox ? '<p class="aviso">' + tth(prox.moeda !== c.moeda ? 'excluir.proxPrincipalMoeda' : 'excluir.proxPrincipal', { nome: prox.nome, moeda: nomeMoeda(prox.moeda) }) + '</p>' : '') +
      '<div class="grupo"><button class="pill perigo" type="button" data-excluir="confirmar">' + tth('carteiras.excluir') + '</button>' +
      '<button class="btn" type="button" data-backup="baixar">' + tth('excluir.backupAntes') + '</button>' +
      '<button class="btn" type="button" data-excluir="cancelar">' + tth('comum.cancelar') + '</button></div></div></section>';
  }
  /* renomear, marcar como conta fixa, esconder, excluir (só as criadas) e criar categorias */
  function categoriasCampos() {
    var cont = {}, livres = slotsLivres(S.plan), h = '';
    M.rows.forEach(function (r) { if (r.kind === 'gasto') cont[r.cat] = (cont[r.cat] || 0) + 1; });
    CATST.forEach(function (c) {
      var k = 'fin-k-' + c.id, n = cont[c.id] || 0, outros = c.id === 'outros';
      h += '<div class="crow' + (c.oculta ? ' oculta' : '') + '"><i class="sw" style="background:' + colorOf(c) + '"></i>' +
        '<label class="cnome"><span class="vh">' + tth('categorias.nomeDe', { nome: c.padrao }) + '</span><input id="' + k + '-nome" type="text" autocomplete="off" maxlength="40" placeholder="' + esc(c.padrao) + '" value="' + esc(c.propria || c.nome !== c.padrao ? c.nome : '') + '"></label>' +
        '<label class="chk"><input id="' + k + '-fixa" type="checkbox"' + (c.fixa ? ' checked' : '') + '>' + tth('categorias.contaFixa') + '</label>' +
        (outros ? '<span></span>' : '<label class="chk"><input id="' + k + '-oculta" type="checkbox"' + (c.oculta ? ' checked' : '') + '>' + tth('categorias.esconder') + '</label>') +
        (c.propria ? '<label class="chk"><input id="' + k + '-excluir" type="checkbox">' + tth('categorias.excluir') + '</label>' : '<span></span>') +
        '<small>' + tth(c.oculta ? 'categorias.escondida' : 'categorias.nMov', { n: n }) + '</small></div>';
    });
    return '<fieldset><legend>' + tth('categorias.titulo') + '</legend><details class="metas" id="fin-kedit"' + (S.kOpen ? ' open' : '') + '><summary>' + tth('categorias.editar') + '</summary>' +
      '<p class="passo">' + tth('categorias.dica', { outros: catPor('outros').nome }) + '</p>' +
      '<div class="clista">' + h + '</div>' +
      '<div class="mgrid"><label>' + tth('categorias.nova') + '<input id="fin-k-nova" type="text" autocomplete="off" maxlength="40" placeholder="' + tth('categorias.novaExemplo') + '"' + (livres.length ? '' : ' aria-describedby="fin-k-nova-d"') + '>' +
      '<small id="fin-k-nova-d">' + (livres.length ? tth('categorias.coresLivres', { n: livres.length }) : tth('categorias.semCor', { n: MAX_CORES })) + '</small></label></div>' +
      '</details></fieldset>';
  }
  /* lê o editor de categorias para dentro de um plan novo; devolve { plan, erro, tirar } (erro só ao criar sem cor livre;
     tirar = categorias criadas que a pessoa excluiu) */
  function lerCategorias(p) {
    var nomes = {}, ocultas = [], fixas = [], proprias = [], tirar = [];
    CATST.forEach(function (c) {
      var k = '#fin-k-' + c.id, nm = c.propria ? $(k + '-nome').value.trim() : nomeParaGravar('cat', c.id, $(k + '-nome').value.trim()), oc = $(k + '-oculta'), ex = $(k + '-excluir');
      if (ex && ex.checked) { tirar.push(c.id); return; }
      if (c.propria) proprias.push({ id: c.id, nome: nm || c.nome, slot: c.slot });
      else if (nm && nm !== c.padrao) nomes[c.id] = nm;
      if (oc && oc.checked) ocultas.push(c.id);
      if ($(k + '-fixa').checked) fixas.push(c.id);
    });
    var np = Object.assign({}, p, { nomes: nomes, ocultas: ocultas, fixas: fixas, proprias: proprias }), nova = $('#fin-k-nova').value.trim(), erro = null;
    if (nova) { try { np = criarCategoria(np, nova); } catch (e) { erro = tt('msg.naoCrieiCategoria', { nome: nova, erro: textoErro(e) }); } }
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
    }).catch(function (e) { toast(tt('msg.naoEBackup', { erro: textoErro(e) }), true); });
  }
  function resumoTxt(x) {
    var r = resumoDados(x);
    if (!r.meses) return tt('dados.nenhumExtrato');
    return tt(r.meses === 1 ? 'dados.resumoUmMes' : 'dados.resumoMeses', { meses: tt('importar.meses', { n: r.meses }), de: mLabel(r.de), ate: mLabel(r.ate), mov: tt('carteiras.nMov', { n: r.mov }) });
  }
  function temDados() { return !!(Object.keys(S.months).length || S.plan); }
  function secaoDados() {
    return '<fieldset><legend>' + tth('dados.titulo') + '</legend><p class="passo">' + tth(temDados() ? 'dados.soNesteNavegador' : 'dados.outroNavegador') + '</p><div class="grupo">' +
      (temDados() ? '<button class="btn" type="button" data-backup="baixar">' + tth('comum.baixarBackup') + '</button>' : '') +
      '<button class="btn" type="button" data-backup="restaurar">' + tth('dados.restaurar') + '</button>' +
      (temDados() ? '<button class="pill perigo" type="button" data-apagar="pedir">' + tth('dados.apagar') + '</button>' : '') +
      '</div></fieldset>';
  }
  function telaRestaurar() {
    var R = S.restaurar, B = resumoBackup(R.dados), ag = dadosAtuais(), nAg = ag.carteiras.length;
    var atual = S.bloqueado ? tt('dados.ilegiveis') : (temDados() ? (nAg > 1 ? tt('restaurar.tudoVarias', { n: nAg, nomes: listaE(ag.carteiras.map(function (c) { return c.nome; })), resumo: resumoTxt(ag) }) : tt('restaurar.tudo', { resumo: resumoTxt(ag) })) : '');
    var mp = B.moedaPrincipal, extra = [];
    if (B.cambios.length) extra.push(tth('restaurar.cambio', { taxas: cru(B.cambios.map(function (c) {
      return '1 ' + esc(simbolo(mp)) + ' = ' + esc(nr.format(c.rate)) + ' ' + esc(simbolo(c.moeda)) + (c.data ? ' (' + tth('cambio.informadoEm', { data: dFull(c.data) }) + ')' : '');
    }).join(' · ')) }));
    if (B.transf || B.dispensadas) extra.push(esc(listaE([B.transf ? tt('restaurar.transf', { n: B.transf }) : '',
      B.dispensadas ? tt('restaurar.dispensadas', { n: B.dispensadas }) : ''].filter(Boolean))) + '.');
    var col = B.carteiras.filter(function (c) { return c.colunas; });
    var mv = B.carteiras.filter(function (c) { return c.envios === 'movido'; });
    if (mv.length) extra.push(tth('restaurar.movido', { nomes: listaE(mv.map(function (c) { return c.nome; })) }));
    if (col.length) extra.push(tth('restaurar.colunas', { nomes: listaE(col.map(function (c) { return c.nome; })) }));
    return '<section class="sec"><div class="sec-top"><h2>' + tth('dados.restaurar') + '</h2><span class="hint">' + esc(R.nome) + '</span></div><div class="card ggrid">' +
      '<p>' + tth(B.titular ? 'restaurar.noArquivoTitular' : 'restaurar.noArquivo', { carteiras: cru('<b>' + tth('restaurar.nCarteiras', { n: B.carteiras.length }) + '</b>'), moeda: nomeMoeda(mp), titular: B.titular }) + '</p>' +
      '<div class="tw"><table class="rpor rbk"><thead><tr><th>' + tth('carteiras.titulo') + '</th><th>' + tth('comum.moeda') + '</th><th>' + tth('restaurar.colMeses') + '</th><th>' + tth('restaurar.colPeriodo') + '</th><th>' + tth('restaurar.colMovimentos') + '</th></tr></thead><tbody>' +
      B.carteiras.map(function (c) {
        return '<tr><td>' + esc(c.nome) + '</td><td data-l="' + tth('comum.moeda') + '">' + esc(c.moeda) + '</td>' + (c.mov ? '<td data-l="' + tth('restaurar.colMeses') + '">' + c.meses + '</td><td data-l="' + tth('restaurar.periodo') + '">' + (c.de ? tth('comum.periodo', { de: dFull(c.de), ate: dFull(c.ate) }) + (c.trechos > 1 ? ' <small>' + tth('restaurar.trechos', { n: c.trechos }) + '</small>' : '') : '–') + '</td><td data-l="' + tth('restaurar.colMovimentos') + '">' + c.mov + '</td>' : '<td colspan="3" class="sem">' + tth('carteiras.semExtrato') + '</td>') + '</tr>';
      }).join('') + '</tbody></table></div>' +
      (extra.length ? '<ul class="bkx">' + extra.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>' : '') +
      (atual ? '<p class="aviso">' + tth('restaurar.aviso', { atual: atual }) + '</p>' : '') +
      '<div class="grupo"><button class="btn pri" type="button" data-restaurar="confirmar">' + tth(atual ? 'restaurar.substituir' : 'restaurar.restaurar') + '</button>' +
      (temDados() && !S.bloqueado ? '<button class="btn" type="button" data-backup="baixar">' + tth('restaurar.backupAntes') + '</button>' : '') +
      '<button class="btn" type="button" data-restaurar="cancelar">' + tth('comum.cancelar') + '</button></div></div></section>';
  }
  function telaApagar() {
    var o = S.bloqueado ? tt('dados.ilegiveis') : tt('apagar.oQue', { resumo: resumoTxt(dadosAtuais()) });
    return '<section class="sec"><div class="sec-top"><h2>' + tth('dados.apagar') + '</h2></div><div class="card ggrid">' +
      '<p class="aviso erro">' + tth('apagar.aviso', { oQue: o }) + '</p>' +
      '<div class="grupo"><button class="pill perigo" type="button" data-apagar="confirmar">' + tth('apagar.tudo') + '</button>' +
      (S.bloqueado ? '<button class="btn" type="button" data-backup="copia">' + tth('apagar.copiaAntes') + '</button>' : '<button class="btn" type="button" data-backup="baixar">' + tth('excluir.backupAntes') + '</button>') +
      '<button class="btn" type="button" data-apagar="cancelar">' + tth('comum.cancelar') + '</button></div></div></section>';
  }
  function telaBloqueio() {
    return '<section class="sec"><div class="sec-top"><h2>' + tth('bloqueio.titulo') + '</h2></div><div class="card ggrid">' +
      '<p class="aviso erro">' + tth('bloqueio.aviso', { motivo: textoErro(S.bloqueado.erro) }) + '</p>' +
      '<p class="passo">' + tth('bloqueio.dica') + '</p>' +
      '<div class="grupo"><button class="btn pri" type="button" data-backup="copia">' + tth('bloqueio.copia') + '</button>' +
      '<button class="btn" type="button" data-backup="restaurar">' + tth('dados.restaurar') + '</button>' +
      '<button class="pill perigo" type="button" data-apagar="pedir">' + tth('bloqueio.apagar') + '</button></div></div></section>';
  }
  function emptyState() {
    if (!temLeitor(bancoAtual())) return '<section class="vazio-grande"><p class="eyebrow">' + tth('casca.primeiroExtrato') + '</p><h2>' + tth('casca.nenhumExtrato') + '</h2>' +
      '<ol><li>' + tth(bancoAtual() === 'itau' ? 'casca.baixePdf' : 'casca.baixePlanilha', { origem: origem() }) + '</li><li>' + tth('casca.toqueAdicionar') + '</li>' +
      '<li>' + tth('casca.primeiraVezColunas') + '</li></ol>' +
      '<button class="btn pri" type="button" data-fin-add>' + tth('casca.escolherArquivo') + '</button></section>';
    return '<section class="vazio-grande"><p class="eyebrow">' + tth('casca.primeiroExtrato') + '</p><h2>' + tth('casca.nenhumExtrato') + '</h2>' +
      '<ol><li>' + tth('casca.revolutPasso1') + '</li><li>' + tth('casca.revolutPasso2') + '</li><li>' + tth('casca.toqueAdicionar') + '</li></ol>' +
      '<button class="btn pri" type="button" data-fin-add>' + tth('casca.escolherCsv') + '</button></section>';
  }
  function kpis() {
    var s = periodStats(), all = S.sel === 'all';
    var aE = avgOf(function (g) { return g.entrou; }, function (g) { return g.entrou > 0; });
    var aG = avgOf(function (g) { return g.gasto; }, function (g) { return g.gasto > 0; });
    var aS = avgOf(function (g) { return g.saved; });
    var pt = planTotal(), pp = planPoupar();
    var lab = all ? tt('painel.mediaPorMes') : M.partial === S.sel ? tt('painel.mesAteDia', { mes: mLabel(S.sel), dia: +M.lastDate.slice(8) }) : mLabel(S.sel);
    var tiles = [
      /* o 5º campo identifica o cartão (o rótulo muda com o idioma) */
      [tth('comum.entrou'), s.entrou, all ? (aE == null ? '' : tth('painel.soMesesRenda')) : (aE == null ? '' : dl(s.entrou, aE, true, 'media') + '<br>' + tth('painel.mediaValor', { valor: f0(aE) })), '', 'entrou'],
      [tth('comum.gastou'), s.gasto, (all ? '' : (aG == null ? '' : dl(s.gasto, aG, false, 'media') + '<br>')) + dl(s.gasto, pt, false, 'orcamento') + ' ' + tth('painel.deValor', { valor: f0(pt) }), '', 'gastou'],
      [tth('comum.guardou'), s.saved, dl(s.saved, pp, true, 'objetivo') + ' ' + tth('painel.deValor', { valor: f0(pp) }) + '<br>' + tth('painel.reservaInvest'), '', 'guardou'],
      [tth('comum.saldoMes'), s.saldo, Math.abs(s.movido) >= 0.5 ? tth('painel.formulaMovido') + '<br>' + fraseMovido(s.movido, f0) : tth('painel.formula'), 'sg', 'saldo']
    ];
    var h = '<section class="sec"><div class="sec-top"><h2>' + esc(lab.charAt(0).toUpperCase() + lab.slice(1)) + '</h2><button class="btn sm" type="button" data-all aria-pressed="' + all + '">' + tth(all ? 'painel.voltarMes' : 'painel.verMedia') + '</button></div><div class="kpis">';
    tiles.forEach(function (t) {
      var v = t[3] ? sgn(t[1]) : f0(t[1]);
      h += '<div class="kpi" data-kpi="' + t[4] + '"><span class="l">' + t[0] + '</span><span class="v">' + v + '</span>' + (t[4] === 'gastou' ? notaEnvios(s.spend.brasil || 0, f0, all) : '') + '<span class="s">' + t[2] + '</span></div>';
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
      cols += '<button type="button" class="mcol' + (M.partial === k ? ' parc' : '') + '" data-sel="' + k + '" data-tip="' + k + '" aria-pressed="' + (S.sel === k) + '" aria-label="' + tth(M.partial === k ? 'painel.barraAriaParcial' : 'painel.barraAria', { mes: mLabel(k), gasto: f0(g.gasto), entrou: f0(g.entrou) }) + '">' +
        '<span class="bars"><span class="stack" style="height:' + (tot / top * 100).toFixed(2) + '%">' + segs + '</span>' +
        (g.entrou > 0 ? '<b class="inc" style="bottom:' + Math.min(100, g.entrou / top * 100).toFixed(2) + '%"></b>' : '') + '</span>' +
        '<span class="xl"><b>' + mShort(k) + (M.partial === k ? '*' : '') + '</b>' + (showYr ? '<span>' + yr + '</span>' : '') + '</span></button>';
    });
    var leg = '';
    CATSV.forEach(function (c) { leg += '<span><i class="sw" style="background:' + colorOf(c) + '"></i>' + esc(catNome(c)) + '</span>'; });
    leg += '<span><i class="sw line"></i>' + tth('painel.entrouNoMes') + '</span>';
    return '<section class="sec"><div class="sec-top"><h2>' + tth('painel.gastosPorMes') + '</h2><span class="hint">' + tth(M.partial ? 'painel.toqueBarraParcial' : 'painel.toqueBarra') + '</span></div><div class="card">' +
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
    var h = '<div><div class="sec-top"><h2>' + tth('painel.categorias') + '</h2><span class="hint">' + tth(all ? 'painel.dicaCategoriasMedia' : 'painel.dicaCategoriasMes') + '</span></div><div class="card" style="margin-top:12px">';
    if (!list.length) h += '<p class="vazio">' + tth('painel.semGastos') + '</p>';
    list.forEach(function (x) {
      var over = x.v - x.g, w = mx ? Math.max(0, x.v) / mx * 100 : 0, gp = mx ? x.g / mx * 100 : 0, st;
      if (x.g <= 0) st = x.v > 0.5 ? tth('painel.semMeta') : '';
      else if (Math.abs(over) <= 0.5) st = tth('painel.naMeta', { destaque: cru('<span class="d ok">' + tth('painel.naMetaDestaque') + '</span>'), meta: f0(x.g) });
      else if (over > 0.5) st = tth('painel.daMeta', { destaque: cru('<span class="d bad">' + tth('painel.acimaDestaque', { valor: f0(over) }) + '</span>'), meta: f0(x.g) });
      else st = tth('painel.daMeta', { destaque: cru('<span class="d good">' + tth('painel.abaixoDestaque', { valor: f0(-over) }) + '</span>'), meta: f0(x.g) });
      h += '<button type="button" class="cat" data-f="' + x.c.id + '" aria-pressed="' + (S.f.indexOf(x.c.id) >= 0) + '"><i class="sw" style="background:' + colorOf(x.c) + '"></i><span class="nm">' + esc(catNome(x.c)) + '</span><span class="val">' + f0(x.v) + '</span>' +
        '<span class="track"><i style="width:' + w.toFixed(1) + '%;background:' + colorOf(x.c) + '"></i>' + (x.g > 0 ? '<b class="goal" style="left:calc(' + gp.toFixed(1) + '% - 1px)"></b>' : '') + '</span><span class="st">' + st + '</span></button>';
    });
    h += '<details class="metas" id="fin-metas"' + (S.metasOpen ? ' open' : '') + '><summary>' + tth('painel.editarMetas') + '</summary><form id="fin-fmetas"><div class="mgrid">' +
      metasCampos('m') + '</div><button class="btn sm pri" type="submit">' + tth('painel.salvarMetas') + '</button></form></details></div></div>';
    return h;
  }
  function tagOf(r) {
    if (r.kind === 'gasto') { var c = catPor(r.cat); return '<i class="sw" style="background:' + colorOf(c) + '"></i>' + esc(catNome(c)); }
    var t = tth({ renda: 'revisar.entradaRenda', outras: 'painel.outraEntrada', flex: 'painel.reservaFlexible', invest: 'revisar.investimento', interno: 'comum.entreContas', movido: 'painel.movidoOutraConta' }[r.kind]);
    return '<i class="sw" style="background:var(--muted)"></i>' + t;
  }
  /* filtro de várias escolhas: sem nada marcado mostra tudo; com marcas, mostra o que casa com qualquer uma */
  function filterMatch(r) {
    var f = S.f, i;
    if (!f.length) return true;
    for (i = 0; i < f.length; i++) {
      if (f[i] === '_in' ? (r.kind === 'renda' || r.kind === 'outras') : f[i] === '_sav' ? (r.kind === 'flex' || r.kind === 'invest') : ((r.kind === 'gasto' || r.kind === 'movido') && r.cat === f[i])) return true;
    }
    return false;
  }
  function movPanel() {
    var all = S.sel === 'all';
    var rows = M.rows.filter(function (r) { return all || r.m === S.sel; });
    var fl = [['_in', tt('painel.filtroEntradas'), 'var(--muted)'], ['_sav', tt('painel.filtroReserva'), 'var(--muted)']];
    CATSV.forEach(function (c) { fl.push([c.id, catNome(c), colorOf(c)]); });
    var hdr = '<div class="sec-top"><h2>' + tth('painel.movimentos') + '</h2><span class="rt"><span class="hint">' + tth(all ? 'painel.nMovTodos' : 'painel.nMovMes', { n: rows.length }) + '</span><button type="button" class="btn sm" data-movtoggle aria-expanded="' + S.movOpen + '">' + tth(S.movOpen ? 'painel.minimizar' : 'painel.mostrar') + '</button></span></div>';
    if (!S.movOpen) return '<div>' + hdr + '</div>';
    var ns = S.f.length, nomes = fl.filter(function (x) { return S.f.indexOf(x[0]) >= 0; }).map(function (x) { return x[1]; });
    var h = '<div>' + hdr + '<div class="card" style="margin-top:12px"><div class="fmenu"><button type="button" class="btn sm fbtn" data-fopen aria-expanded="' + S.fOpen + '" aria-controls="fin-fpanel"><span>' + tth('painel.filtrar') + '</span>' + (ns ? '<b class="fn">' + ns + '</b>' : '') + '</button>' +
      (ns ? '<button type="button" class="btn sm" data-fclear>' + tth('comum.limpar') + '</button><span class="fres">' + esc(nomes.join(', ')) + '</span>' : '');
    if (S.fOpen) h += '<div class="fpanel" id="fin-fpanel" role="group" aria-label="' + tth('painel.filtrarAria') + '">' + fl.map(function (x) {
      var on = S.f.indexOf(x[0]) >= 0;
      return '<button type="button" class="fopt" role="checkbox" aria-checked="' + on + '" data-f="' + x[0] + '"><i class="bx"></i><i class="sw" style="background:' + x[2] + '"></i><span>' + esc(x[1]) + '</span></button>';
    }).join('') + '</div>';
    h += '</div>';
    var sh = rows.filter(filterMatch).reverse();
    if (!sh.length) h += '<p class="vazio">' + tth('painel.nadaFiltro') + '</p>';
    sh.slice(0, S.more).forEach(function (r) {
      var d = r.kind === 'renda' ? r.desc.replace(/^Payment from /i, '') : r.desc;
      h += '<div class="mov"><span class="dt">' + dFmt(r.date) + '</span><span class="ds">' + esc(d) + '</span><span class="am num' + (r.a > 0 ? ' in' : '') + '">' + (r.a > 0 ? '+' : '−') + f2(Math.abs(r.a)) + '</span><span class="tg">' + tagOf(r) + '</span></div>';
    });
    if (sh.length > S.more) h += '<div style="padding-top:12px"><button class="btn sm" type="button" data-more>' + tth('painel.mostrarMais', { n: Math.min(30, sh.length - S.more), total: sh.length - S.more }) + '</button></div>';
    return h + '</div></div>';
  }
  function table() {
    var ks = M.keys, comp = avgKeys(), n = comp.length || 1, h = '<section class="sec"><div class="sec-top"><h2>' + tth('painel.mesAMes') + '</h2><span class="hint">' + tth('painel.mediaCompletos') + '</span></div><div class="tw"><table><thead><tr><th>' + tth('painel.categoria') + '</th>';
    ks.forEach(function (k) { h += '<th class="' + (S.sel === k ? 'selc' : '') + '">' + mShort(k) + (M.partial === k ? '*' : '') + '</th>'; });
    h += '<th class="avg">' + tth('painel.media') + '</th></tr></thead><tbody>';
    CATSV.forEach(function (c) {
      var vals = ks.map(function (k) { return M.by[k].spend[c.id] || 0; }), mxv = Math.max.apply(null, vals.concat([1]));
      if (!vals.some(function (v) { return Math.abs(v) >= .5; })) return;
      var avg = 0; comp.forEach(function (k) { avg += M.by[k].spend[c.id] || 0; });
      h += '<tr><td><span class="rowsw"><i class="sw" style="background:' + colorOf(c) + '"></i>' + esc(catNome(c)) + '</span></td>';
      ks.forEach(function (k, i) { h += '<td class="h' + (S.sel === k ? ' selc' : '') + '" style="--i:' + Math.max(0, vals[i] / mxv).toFixed(2) + '">' + (Math.abs(vals[i]) < .5 ? '–' : nn.format(vals[i])) + '</td>'; });
      h += '<td class="avg">' + nn.format(avg / n) + '</td></tr>';
    });
    function line(lbl, fn, cls, id) {
      var a = 0; comp.forEach(function (k) { a += fn(M.by[k]); });
      var r = '<tr class="tot' + (cls || '') + '"' + (id ? ' data-linha="' + id + '"' : '') + '><td>' + lbl + '</td>';
      ks.forEach(function (k) { r += '<td class="' + (S.sel === k ? 'selc' : '') + '">' + nn.format(fn(M.by[k])) + '</td>'; });
      return r + '<td class="avg">' + nn.format(a / n) + '</td></tr>';
    }
    h += line(tth('comum.gastou'), function (g) { return g.gasto; });
    if (ks.some(function (k) { return (M.by[k].spend.brasil || 0) >= 0.5; })) h += line(tth('painel.dosQuais', { nome: nomeEnvios() }), function (g) { return g.spend.brasil || 0; }, ' sub', 'envios');
    h += line(tth('comum.entrou'), function (g) { return g.entrou; });
    h += line(tth('comum.guardou'), function (g) { return g.saved; });
    if (ks.some(function (k) { return Math.abs(M.by[k].movido) >= 0.5; })) h += line(tth('painel.movidoOutras'), function (g) { return g.movido; });
    h += line(tth('comum.saldoMes'), function (g) { return g.saldo; });
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
  /* nome de cada tipo de entrada; função, não constante, para acompanhar o idioma */
  function nomeEntrada(e) { return tt({ _renda: 'revisar.entradaRenda', _outras: 'comum.outrasEntradas', _ignore: 'comum.entreContas', _invest: 'revisar.resgateInvest' }[e]); }
  function optionsEntrada(sel, volta) {
    var o = sel === '' ? '<option value="" selected disabled>' + tth('revisar.maisDeUmTipo') + '</option>' : '';
    if (volta) o += '<option value="_auto">' + tth('revisar.voltarAuto') + '</option>';
    ['_renda', '_outras', '_ignore', '_invest'].forEach(function (x) {
      o += '<option value="' + x + '"' + (sel === x ? ' selected' : '') + '>' + esc(nomeEntrada(x)) + '</option>';
    });
    return o;
  }
  function effNome(e) { return e === '_invest' ? tt('revisar.investimento') : e === '_ignore' ? tt('comum.entreContas') : (CPOR[e] ? CPOR[e].nome : e); }
  function optionsFor(sel, volta) {
    var o = sel === '' ? '<option value="" selected disabled>' + tth('revisar.maisDeUmaCategoria') + '</option>' : '';
    if (volta) o += '<option value="_auto">' + tth('revisar.voltarAuto') + '</option>';
    CATSV.forEach(function (c) { o += '<option value="' + c.id + '"' + (sel === c.id ? ' selected' : '') + '>' + esc(catNome(c)) + '</option>'; });
    o += '<option value="_invest"' + (sel === '_invest' ? ' selected' : '') + '>' + tth('revisar.investimentoNaoGasto') + '</option>';
    o += '<option value="_ignore"' + (sel === '_ignore' ? ' selected' : '') + '>' + tth('comum.entreContas') + '</option>';
    return o;
  }
  function revList() {
    var q = S.q.trim().toUpperCase(), all = merchants().filter(function (x) { return !q || x.key.indexOf(q) >= 0; }), h = '';
    var ent = entradas().filter(function (x) { return !q || x.key.indexOf(q) >= 0; });
    if (!all.length && !ent.length) return '<p class="vazio">' + tth('revisar.nadaEncontrado') + '</p>';
    if (all.length) h += '<h3 class="rvt">' + tth('revisar.saidas') + '</h3>';
    all.slice(0, 40).forEach(function (x) {
      h += '<div class="rrow"><div class="n">' + esc(x.desc) + '<small>' + tth('revisar.movimentos', { n: x.n, valor: f2(x.total) }) + (S.over[x.key] ? ' · ' + tth('revisar.categoriaSua') : '') + (x.eff === '' ? ' · ' + tth('revisar.divididoCategoria', { lista: Object.keys(x.effs).map(function (e) { return tt('revisar.itemContagem', { nome: effNome(e), n: x.effs[e] }); }).join(', ') }) : '') + '</small></div>' +
        '<select data-ov="' + esc(x.key) + '" aria-label="' + tth('revisar.categoriaDe', { desc: x.desc }) + '">' + optionsFor(x.eff, !!S.over[x.key] && Object.keys(x.autos).length > 1) + '</select></div>';
    });
    if (all.length > 40) h += '<p class="passo" style="padding-top:12px">' + tth('revisar.mostrandoSaidas', { mostrando: 40, total: all.length }) + '</p>';
    if (ent.length) h += '<h3 class="rvt">' + tth('revisar.entradas') + '</h3>';
    ent.slice(0, 40).forEach(function (x) {
      h += '<div class="rrow"><div class="n">' + esc(x.desc) + '<small>' + tth('revisar.movimentosEntrada', { n: x.n, valor: f2(x.total) }) + (S.over[x.key] ? ' · ' + tth('revisar.escolhaSua') : '') +
        (x.eff === '' ? ' · ' + tth('revisar.divididoTipo', { lista: Object.keys(x.effs).map(function (e) { return tt('revisar.itemContagem', { nome: nomeEntrada(e), n: x.effs[e] }); }).join(', ') }) : '') + '</small></div>' +
        '<select data-ov="' + esc(x.key) + '" aria-label="' + tth('revisar.tipoEntradaDe', { desc: x.desc }) + '">' + optionsEntrada(x.eff, !!S.over[x.key] && Object.keys(x.autos).length > 1) + '</select></div>';
    });
    if (ent.length > 40) h += '<p class="passo" style="padding-top:12px">' + tth('revisar.mostrandoEntradas', { mostrando: 40, total: ent.length }) + '</p>';
    return h;
  }
  /* Pix para o titular, em carteira do Itaú com titular configurado: caixas desmarcadas, "Aplicar aos marcados",
     e "Desfazer" para o que a sugestão marcou */
  function pixTitularBloco(cw) {
    var tit = S.plan && S.plan.titular;
    if (!cw || cw.banco !== 'itau' || !tit) return { n: 0, h: '' };
    var P = pixParaTitular(S.months, S.over, tit, cw.pixTitular);
    if (!P.pendentes.length && !P.aplicados.length) return { n: 0, h: '' };
    var mes = {}, h = '<div class="card ggrid" id="fin-pixtit" tabindex="-1"><h3 class="rvt">' + tth('revisar.pixTitulo') + '</h3>';
    P.pendentes.forEach(function (x) { var m = mes[x.data.slice(0, 7)] = mes[x.data.slice(0, 7)] || { s: 0, vs: 0, e: 0, ve: 0 }; if (x.valor < 0) { m.s++; m.vs -= x.valor; } else { m.e++; m.ve += x.valor; } });
    if (P.pendentes.length) {
      h += '<p class="passo">' + tth('revisar.pixExplica', { titular: tit }) + '</p>' +
        '<p class="passo">' + Object.keys(mes).sort().map(function (m) { var x = mes[m]; return tth('revisar.pixMes', { mes: mLabel(m), resumo: [x.s ? tt('revisar.pixSaidas', { n: x.s, valor: f2(x.vs / 100) }) : '', x.e ? tt('revisar.pixEntradas', { n: x.e, valor: f2(x.ve / 100) }) : ''].filter(Boolean).join(', ') }); }).join(' · ') + '</p>' +
        /* "Marcar todos" e "Marcar todos de <mês>" só marcam as caixas: quem confirma é o "Aplicar aos marcados" */
        '<div class="grupo"><button class="btn sm" type="button" data-pixtit-marcar="">' + tth('revisar.marcarTodos') + '</button>' + Object.keys(mes).sort().map(function (m) {
          return '<button class="btn sm" type="button" data-pixtit-marcar="' + m + '">' + tth('revisar.marcarTodosMes', { mes: mLabel(m) }) + '</button>';
        }).join('') + '</div>' +
        '<div class="radios">' + P.pendentes.map(function (x) {
          return '<label class="chk"><input type="checkbox" data-pixtit="' + esc(x.chave) + '" data-mes="' + x.data.slice(0, 7) + '"><span>' + esc(dFull(x.data)) + ' · ' + esc(x.desc) + ' · ' + (x.valor > 0 ? '+' : '−') + esc(f2(Math.abs(x.valor) / 100)) + '</span></label>';
        }).join('') + '</div><div class="grupo"><button class="btn pri" type="button" data-pixtit-aplicar>' + tth('revisar.aplicarMarcados') + '</button></div>';
    }
    if (P.aplicados.length) h += '<p class="passo">' + tth('revisar.pixAplicados', { n: P.aplicados.length }) + '</p><div class="grupo"><button class="btn" type="button" data-pixtit-desfazer>' + tth('comum.desfazer') + '</button></div>';
    return { n: P.pendentes.length, h: h + '</div>' };
  }
  /* grava over e a lista do que a sugestão marcou, na carteira ativa */
  function salvarPixTitular(r, msg) {
    S.over = r.over;
    var x = dadosAtuais();
    usarDados(Object.assign({}, x, { carteiras: x.carteiras.map(function (c) { return c.id !== x.ativa ? c : Object.assign({}, c, { pixTitular: r.aplicados }); }) }));
    enqueue(saveOver).then(function () { recompute(); render(); toast(msg); var b = $('#fin-pixtit'); if (b) b.focus(); });
  }
  function review() {
    var nc = merchants().length, ne = entradas().length, cw = cartAtual(), np = TR ? TR.S.pares.filter(function (p) { return p.s.w.id === cw.id || p.e.w.id === cw.id; }).length : 0;
    var pt = pixTitularBloco(cw);
    return '<section class="sec rev"><details class="revd" id="fin-revd"' + (S.revOpen ? ' open' : '') + '><summary><h2>' + tth('revisar.titulo') + '</h2><span class="hint">' + tth('revisar.resumoLista', { comerciantes: tt('revisar.nComerciantes', { n: nc }), entradas: tt('revisar.nEntradas', { n: ne }),
      extras: (np ? ' · ' + tt('revisar.nTransfSugeridas', { n: np }) : '') + (pt.n ? ' · ' + tt('revisar.nPixParecem', { n: pt.n }) : '') }) + '</span></summary><div class="rv-c">' + transfBloco(cw.id) + pt.h + '<p class="passo">' + tth('revisar.explica') + '</p>' +
      '<div class="fbusca"><label class="vh" for="fin-q">' + tth('revisar.buscar') + '</label><input id="fin-q" type="search" placeholder="' + tth('revisar.buscar') + '" value="' + esc(S.q) + '" autocomplete="off"></div><div class="card" id="fin-revlist">' + revList() + '</div></div></details></section>';
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
    var sm = S.summary, pts = balSeries(), lp = pts[pts.length - 1], last = rows[rows.length - 1], pmin = pts[0], nt = [], parts = tt('saldo.partesConta', { conta: f0(lp.c) });
    pts.forEach(function (p) { if (p.b < pmin.b) pmin = p; });
    if (sm) {
      parts = tt('saldo.partesTotal', { conta: f0(lp.c), flex: f0((sm.flex || 0) / 100), invest: f0((sm.invest || 0) / 100), cripto: f0((sm.cripto || 0) / 100) });
      if (sm.asOf && sm.asOf < last.date) nt.push(tt('saldo.flexCriptoDe', { data: dFull(sm.asOf) }));
      if (sm.investAsOf && sm.investAsOf < last.date) nt.push(tt('saldo.investimentosDe', { data: dFull(sm.investAsOf) }));
    }
    var est = M.fonteSaldo === 'estimado', an = est && cartAtual().ancora;
    return '<section class="sec"><div class="card cfm"><div><p class="l mono">' + (sm ? tth('saldo.tituloTotal') : bancoAtual() === 'revolut' ? tth('saldo.tituloRevolut') : tth(est ? 'saldo.tituloEstimado' : 'saldo.tituloAtual', { origem: origem() })) + '</p><p class="big num">' + f0(lp.b) + '</p>' +
      '<p class="s">' + esc(parts) + '</p>' +
      '<p class="s">' + tth('saldo.linhaData', { data: dFull(last.date), notas: nt.length ? ' · ' + nt.join(' · ') : '', media: f0(avgBal(pts)), minimo: f2(pmin.b) }) + '</p></div>' +
      '<div><div id="fin-bal" class="bal spark"></div><div class="axl mono"><span>' + esc(dFull(pts[0].d)) + '</span><span>' + esc(dFull(pts[pts.length - 1].d)) + '</span></div>' +
      (sm ? '<p class="s">' + tth('saldo.notaTotal') + '</p>' : '') +
      (est ? '<p class="s">' + tth('saldo.notaEstimado', { data: dFull(an.data), valor: f2(an.valor / 100) }) + '</p>' : '') +
      (!sm && bancoAtual() !== 'revolut' && !est ? '<p class="s">' + tth('saldo.notaExtrato') + '</p>' : '') + '</div></div></section>';
  }
  /* sem saldo no extrato: pergunta uma vez o saldo segundo o banco, na data do último movimento */
  function perguntaSaldo() {
    var c = cartAtual();
    if (c && c.ancoraDispensada) return '<section class="sec"><div class="aviso pergunta"><p>' + tth('saldo.semSaldoDispensado', { origem: origem() }) + '</p>' +
      '<button class="btn sm" type="button" data-saldo="perguntar">' + tth('saldo.informar') + '</button></div></section>';
    return '<section class="sec"><form class="aviso pergunta" id="fin-fancora"><p>' + tth('saldo.semSaldoPergunta', { origem: origem(), data: cru('<b>' + esc(dFull(M.lastDate)) + '</b>') }) + '</p>' +
      '<div class="grupo"><label class="vh" for="fin-ancora">' + tth('saldo.saldoEm', { data: dFull(M.lastDate) }) + '</label><input id="fin-ancora" type="text" inputmode="decimal" autocomplete="off" placeholder="' + tth('saldo.exValor') + '">' +
      '<button class="btn sm pri" type="submit">' + tth('comum.salvar') + '</button><button class="btn sm" type="button" data-saldo="dispensar">' + tth('comum.agoraNao') + '</button></div></form></section>';
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
    var T = { renda: 0, outras: 0, interno: 0, movido: 0, flex: 0, invest: 0, gasto: 0 }, cat = {};
    rows.forEach(function (r) {
      if (r.kind === 'gasto') { T.gasto -= r.a; cat[r.cat] = (cat[r.cat] || 0) - r.a; } else T[r.kind] += r.a;
    });
    var items = (M.semSaldo ? [] : [{ c: 'base', l: tt(M.fonteSaldo === 'estimado' ? 'saldo.inicialEstimado' : 'saldo.inicial', { data: dFull(first.date) }), v: open }]).concat([
      { l: tt('saldo.renda'), v: T.renda },
      { l: tt('comum.outrasEntradas'), v: T.outras }
    ]);
    if (Math.abs(T.interno) >= .5) items.push({ l: tt('comum.entreContas'), v: T.interno });
    if (Math.abs(T.movido) >= .5) items.push({ l: tt('saldo.movido'), v: T.movido });
    items.push({ l: tt(T.flex <= 0 ? 'saldo.flexEnviado' : 'saldo.flexRetirado'), v: T.flex });
    items.push({ l: tt('saldo.investLiquido'), v: T.invest });
    items.push({ l: tt('saldo.gastos'), v: -T.gasto, cats: true });
    if (!M.semSaldo) items.push({ c: 'end', l: tt(M.fonteSaldo === 'estimado' ? 'saldo.atualEstimado' : 'saldo.atualConta'), v: cur });
    var mx = 1; items.forEach(function (x) { mx = Math.max(mx, Math.abs(x.v)); });
    var br = '';
    items.forEach(function (x, i) {
      var cls = x.c || '', sign = x.c ? '' : (x.v >= 0 ? '+' : '−'), tone = x.c ? '' : (x.v >= 0 ? 'pos' : 'neg');
      var col = x.c ? 'var(--accent)' : (x.v >= 0 ? 'var(--pos)' : 'var(--neg)');
      var inner = '<span class="bl">' + esc(x.l) + '</span><b class="num ' + tone + '">' + sign + f0(Math.abs(x.v)) + '</b><span class="bt"><i style="width:' + (Math.abs(x.v) / mx * 100).toFixed(1) + '%;background:' + col + '"></i></span>';
      if (x.cats) {
        var sub = '';
        CATSV.forEach(function (c) { if (Math.abs(cat[c.id] || 0) >= .5) sub += '<div><span>' + esc(catNome(c)) + '</span><b>' + f0(cat[c.id]) + '</b></div>'; });
        br += '<details class="brd"' + (S.cfOpen ? ' open' : '') + ' id="fin-cfd"><summary class="br">' + inner + '<span class="sub" style="grid-column:1/3">' + tth('saldo.verPorCategoria') + '</span></summary><div class="brsub">' + sub + '</div></details>';
      } else br += '<div class="br ' + cls + (i === 0 ? ' first' : '') + '">' + inner + '</div>';
    });
    return '<section class="sec"><div class="sec-top"><h2>' + tth('saldo.deOndeVeio') + '</h2><span class="hint">' + tth('comum.periodo', { de: dFull(first.date), ate: dFull(last.date) }) + '</span></div>' +
      '<div class="card cfb"><h3>' + tth('saldo.tudoQueEntrou') + '</h3>' + br + '</div></section>';
  }

  /* ---------- dívidas em observação ---------- */
  var nr = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  function todayIso() { var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function diasAte(iso) { return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(todayIso() + 'T00:00:00Z')) / 86400000); }
  function vencTxt(iso) {
    var n = diasAte(iso);
    return n === 0 ? tt('obs.venceHoje') : n === 1 ? tt('obs.venceAmanha') : n > 1 ? tt('obs.venceEm', { n: n }) : n === -1 ? tt('obs.venceuOntem') : tt('obs.venceuHa', { n: -n });
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
    var h = '<section class="sec" id="fin-dividas"><div class="sec-top"><h2>' + tth('obs.titulo') + '</h2><span class="hint">' + tth('obs.subtitulo') + '</span></div><div class="card dv">';
    if (!open.length) h += '<p class="vazio dvv">' + tth('obs.vazio') + '</p>';
    open.forEach(function (it) {
      var cod = it.moeda || BASE, rt = taxa(cod), eur = rt ? it.valor / rt : null, partes = [];
      porMoeda[cod] = (porMoeda[cod] || 0) + it.valor;
      if (cod !== BASE && fora.indexOf(cod) < 0) fora.push(cod);
      if (eur == null) { if (falta.indexOf(cod) < 0) falta.push(cod); } else { te += eur; tr += cod === BASE ? eur : eur * (1 + mg / 100); }
      if (cod !== BASE) partes.push(fMoeda(it.valor, cod));
      partes.push(it.venc ? '<span class="' + (diasAte(it.venc) <= 7 ? 'urg' : '') + '">' + tth('obs.vencimentoData', { quando: vencTxt(it.venc), data: dFull(it.venc) }) + '</span>' : (it.criada ? tth('obs.anotadaEm', { data: dFull(it.criada) }) : ''));
      h += '<div class="dvr"><div class="n">' + esc(it.nome) + '<small>' + partes.filter(Boolean).join(' · ') + '</small>' + (it.desc ? '<small>' + esc(it.desc) + '</small>' : '') + '</div>' +
        '<div class="v">' + (cod === BASE ? '<b class="num">' + f0(eur) + '</b><small>' + tth('obs.pagoEmMoeda', { moeda: nomeMoeda(BASE) }) + '</small>' : eur != null ? '<b class="num">≈ ' + f0(eur) + '</b><small>' + tth('obs.reservarComMargem', { valor: f0(eur * (1 + mg / 100)), margem: nn.format(mg) }) + '</small>' : '<small>' + tth('obs.definaCambio', { moeda: cod }) + '</small>') + '</div>' +
        '<div class="act"><button type="button" class="btn sm" data-dpay="' + esc(it.id) + '" aria-label="' + tth('obs.marcarPaga', { nome: it.nome }) + '">' + tth('obs.paguei') + '</button><button type="button" class="btn sm" data-ddel="' + esc(it.id) + '" aria-label="' + tth('comum.removerNome', { nome: it.nome }) + '">' + tth('comum.remover') + '</button></div></div>';
    });
    if (open.length > 1) h += '<div class="dvr dvt"><div class="n">' + tth('comum.total') + '<small>' + Object.keys(porMoeda).map(function (c) { return c === BASE ? tth('obs.valorEmMoeda', { valor: f0(porMoeda[c]), moeda: nomeMoeda(BASE) }) : fMoeda(porMoeda[c], c); }).join(' · ') + '</small></div><div class="v">' + (!falta.length ? '<b class="num">' + (fora.length ? '≈ ' : '') + f0(te) + '</b><small>' + tth('obs.reservar', { valor: f0(tr) }) + '</small>' : '') + '</div></div>';
    /* o saldo da conta só se compara quando está na mesma moeda */
    if (open.length && !falta.length && moeda() === BASE && !emResumo()) {
      var cur = M.rows.length && !M.semSaldo ? M.rows[M.rows.length - 1].bal : null, sm = S.summary, flex = sm && sm.flex ? sm.flex / 100 : 0, pos = sm && sm.asOf ? ' ' + tt('obs.posicao', { data: dFmt(sm.asOf) }) : '';
      if (cur != null) {
        var msg;
        if (cur >= tr) msg = tth('obs.saldoCobre', { saldo: f0(cur), pos: pos });
        else if (flex > 0 && Math.round(cur) + Math.round(flex) >= Math.round(tr)) msg = tth('obs.flexCobre', { saldo: f0(cur), falta: f0(Math.round(tr) - Math.round(cur)), flex: f0(flex), pos: pos });
        else if (flex > 0) msg = tth('obs.contaEFlexFaltam', { saldo: f0(cur), flex: f0(flex), soma: f0(Math.round(cur) + Math.round(flex)), falta: f0(Math.round(tr) - Math.round(cur) - Math.round(flex)), pos: pos });
        else msg = tth('obs.faltam', { saldo: f0(cur), falta: f0(Math.round(tr) - Math.round(cur)), pos: pos });
        h += '<p class="dvn">' + msg + '</p>';
      }
    }
    /* câmbio só das moedas dos pagamentos em aberto; nada é buscado na internet */
    if (fora.length) {
      h += '<details class="metas" id="fin-dcamb"' + (S.dCamb ? ' open' : '') + '><summary>' + (falta.length ? tth('obs.definirCambio', { moedas: falta.join(', ') }) : resumoCambio(fora)) + '</summary>' +
        '<form id="fin-fcamb"><div class="mgrid">' + camposCambio(fora, 'camb') +
        '<label>' + tth('obs.margem') + '<input id="fin-c-mg" type="text" inputmode="decimal" value="' + esc(String(mg).replace('.', ',')) + '"></label></div><button class="btn sm pri" type="submit">' + tth('obs.atualizarCambio') + '</button></form></details>';
    }
    h += '<details class="metas" id="fin-dadd"' + (S.dAdd ? ' open' : '') + '><summary>' + tth('obs.adicionarPagamento') + '</summary><form id="fin-fdiv"><div class="mgrid"><label>' + tth('comum.nome') + '<input id="fin-d-nome" type="text" placeholder="' + tth('obs.exNome') + '" autocomplete="off"></label>' +
      '<label>' + tth('comum.valor') + '<input id="fin-d-valor" type="text" inputmode="decimal" placeholder="3.700,00" autocomplete="off"></label>' +
      '<label>' + tth('comum.moeda') + '<select id="fin-d-cur">' + opcoes(MOEDAS, BASE) + '<option value="outra">' + tth('obs.outraMoeda') + '</option></select></label>' +
      '<label id="fin-d-outra-l" hidden>' + tth('obs.codigoMoeda') + '<input id="fin-d-outra" type="text" maxlength="3" placeholder="' + tth('obs.exCodigo') + '" autocomplete="off" autocapitalize="characters"></label>' +
      '<label>' + tth('obs.vencimentoOpcional') + '<input id="fin-d-venc" type="date"></label>' +
      '<label>' + tth('obs.descricaoOpcional') + '<input id="fin-d-desc" type="text" placeholder="' + tth('obs.exDescricao') + '" autocomplete="off"></label></div><button class="btn sm pri" type="submit">' + tth('comum.adicionar') + '</button></form></details>';
    if (paid.length) {
      h += '<details class="metas" id="fin-dpaid"' + (S.dPaid ? ' open' : '') + '><summary>' + tth('obs.pagas', { n: paid.length }) + '</summary>';
      paid.forEach(function (it) {
        h += '<div class="dvr paga"><div class="n">' + esc(it.nome) + '<small>' + ((it.moeda || BASE) === BASE ? f0(it.valor || 0) : fMoeda(it.valor, it.moeda)) + (it.pagaEm ? ' · ' + tth('obs.pagaEm', { data: dFull(it.pagaEm) }) : '') + '</small></div><div></div><div class="act"><button type="button" class="btn sm" data-ddel="' + esc(it.id) + '" aria-label="' + tth('comum.removerNome', { nome: it.nome }) + '">' + tth('comum.remover') + '</button></div></div>';
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
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + tth(S.summary ? 'saldo.graficoTotal' : 'saldo.graficoConta', { de: dFull(pts[0].d), ate: dFull(lastp.d), media: f0(avg), atual: f0(lastp.b) }) + '">' +
      '<path d="' + area + '" fill="var(--accent)" fill-opacity=".13"/><path d="' + dd + '" fill="none" stroke="var(--accent)" stroke-width="1.75" stroke-linejoin="round"/>' +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ya + '" y2="' + ya + '" stroke="var(--muted)" stroke-dasharray="4 4"/>' +
      '<text x="' + (W - R - 2) + '" y="' + (+ya - 6) + '" text-anchor="end" class="a">' + tth('saldo.mediaGrafico', { valor: nn.format(avg) }) + '</text>' +
      '<circle cx="' + X(lastp.d).toFixed(1) + '" cy="' + Y(lastp.b).toFixed(1) + '" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>' +
      '<line id="fin-xh" y1="' + Tp + '" y2="' + (Tp + ih) + '" stroke="var(--muted)" visibility="hidden"/><circle id="fin-xd" r="4" fill="var(--fg)" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>' +
      '<rect id="fin-xr" x="' + L + '" y="0" width="' + iw + '" height="' + H + '" fill="transparent"/></svg>';
    var rect = $('#fin-xr'), xh = $('#fin-xh'), xd = $('#fin-xd');
    function at(e) {
      var box = rect.getBoundingClientRect(), fx = (e.clientX - box.left) / box.width * iw + L, best = pts[0], bd = 1e9;
      pts.forEach(function (p) { var dx = Math.abs(X(p.d) - fx); if (dx < bd) { bd = dx; best = p; } });
      xh.setAttribute('x1', X(best.d)); xh.setAttribute('x2', X(best.d)); xh.setAttribute('visibility', 'visible');
      xd.setAttribute('cx', X(best.d)); xd.setAttribute('cy', Y(best.b)); xd.setAttribute('visibility', 'visible');
      placeTip('<h3>' + esc(dFull(best.d)) + '</h3><div class="r"><span>' + tth(S.summary ? 'saldo.totalFimDia' : 'saldo.saldoFimDia') + '</span><b>' + f2(best.b) + '</b></div>' + (S.summary ? '<div class="r"><span>' + tth('saldo.naConta') + '</span><b>' + f2(best.c) + '</b></div><div class="r"><span>' + tth('saldo.foraConta') + '</span><b>' + f2(best.g) + '</b></div>' : ''), e.clientX, e.clientY);
    }
    rect.addEventListener('pointermove', at);
    rect.addEventListener('pointerdown', at);
    rect.addEventListener('pointerleave', function () { xh.setAttribute('visibility', 'hidden'); xd.setAttribute('visibility', 'hidden'); hideTip(); });
  }
  /* ---------- blocos de planejamento: previsão, metas de poupança, contas fixas, envios a outra conta e taxa de poupança ---------- */
  /* de onde vem o valor de uma meta de poupança; funções, não constantes, para acompanhar o idioma */
  function origensMeta() { return [['', tt('metas.origemDigitado')], ['flex', tt('metas.origemFlex')], ['invest', tt('metas.origemInvest')]]; }
  function deOrigemMeta(src) { return tth(src === 'flex' ? 'metas.deOrigemFlex' : 'metas.deOrigemInvest'); }
  function metasPoupanca() { return listaMetasPoupanca(S.plan); }
  /* nome da meta na tela: o de fábrica traduzido, o da pessoa como está */
  function nomeMeta(g) { return nomeExibido('meta', g.id, g.nome, NORA_I18N.t); }
  function pct(v) { return nn.format(v) + '%'; }
  /* "a, b e c": o último item ligado pelo "e" do idioma */
  function listaE(l) { return l.length < 2 ? l.join('') : tt('comum.listaE', { inicio: l.slice(0, -1).join(', '), fim: l[l.length - 1] }); }
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
        else { buildModel(c.months, c.over, S.plan && S.plan.titular, c.pais, CATST, null, null, { envios: c.envios }).rows.forEach(function (r) { if (r.kind === g.src) v -= r.a; }); v = Math.max(0, v); }
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
    var f0 = fP0, h = '<section class="sec" id="fin-goals"><div class="sec-top"><h2>' + tth('metas.titulo') + '</h2><span class="hint">' + tth('metas.dica') + '</span></div><div class="gl4">';
    metasPoupanca().forEach(function (g) {
      var c = goalCfg(g.id), alvo = +c.alvo || 0, tem = goalHas(g), semCambio = tem == null ? goalFalta : null, ml = mesesAte(c.prazo), st;
      if (semCambio) tem = 0;
      var falta = Math.max(0, alvo - tem), pc = alvo ? Math.min(100, tem / alvo * 100) : 0;
      if (semCambio) st = tth('metas.definaCambio', { moeda: semCambio });
      else if (!alvo) st = tth('metas.definaValor');
      else if (falta < 0.5) st = '<span class="d good">' + tth('metas.batida') + '</span>';
      else st = tth('metas.faltam', { valor: f0(falta) }) + '<br>' + (ml ? tth('metas.porMesAte', { valor: f0(falta / ml), prazo: mesAno(c.prazo) }) : tth('metas.semPrazo'));
      h += '<div class="kpi goal"><span class="l">' + esc(nomeMeta(g)) + '</span><span class="v">' + f0(tem) + (alvo ? ' <small>' + tth('painel.deValor', { valor: f0(alvo) }) + '</small>' : '') + '</span>' +
        '<span class="gbar" role="img" aria-label="' + (alvo ? tth('metas.pctDaMeta', { pct: nn.format(pc) }) : tth('metas.semMeta')) + '"><i style="width:' + pc.toFixed(1) + '%"></i></span>' +
        '<span class="s">' + st + (g.src ? '<br><span class="src">' + tth('metas.valorAtual', { origem: cru(deOrigemMeta(g.src)) }) + '</span>' : '') + '</span></div>';
    });
    h += '</div><details class="metas" id="fin-gedit"' + (S.gOpen ? ' open' : '') + '><summary>' + tth('metas.editar') + '</summary><form id="fin-fgoals"><div class="ggrid">';
    var lista = metasPoupanca();
    lista.forEach(function (g) {
      var c = goalCfg(g.id), k = 'fin-g-' + g.id;
      h += '<fieldset><legend>' + esc(nomeMeta(g)) + '</legend><div class="mgrid">' +
        '<label>' + tth('comum.nome') + '<input id="' + k + '-nome" type="text" autocomplete="off" maxlength="40" value="' + esc(nomeMeta(g)) + '"></label>' +
        '<label>' + tth('metas.origem') + '<select id="' + k + '-src">' + opcoes(origensMeta(), g.src || '') + '</select></label>' +
        '<label>' + tth('metas.metaSimbolo', { simbolo: simbolo(moedaP()) }) + '<input id="' + k + '-alvo" type="number" min="0" step="50" inputmode="decimal" value="' + (+c.alvo || '') + '"></label>' +
        '<label>' + tth('metas.prazo') + '<input id="' + k + '-prazo" type="month" value="' + esc(c.prazo || '') + '"></label>' +
        '<label>' + tth('metas.jaGuardado', { simbolo: simbolo(moedaP()) }) + '<input id="' + k + '-tem" type="number" min="0" step="10" inputmode="decimal" value="' + (+c.tem || '') + '"><small>' + tth('metas.soDigitado') + '</small></label>' +
        '<label class="chk"><input id="' + k + '-excluir" type="checkbox">' + tth('metas.excluir') + '</label></div></fieldset>';
    });
    if (lista.length < MAX_METAS_POUP) h += '<fieldset><legend>' + tth('metas.nova') + '</legend><div class="mgrid"><label>' + tth('comum.nome') + '<input id="fin-g-nova" type="text" autocomplete="off" maxlength="40" placeholder="' + tth('metas.exNome') + '"><small>' + tth('metas.ate', { n: MAX_METAS_POUP }) + '</small></label></div></fieldset>';
    return h + '</div><button class="btn sm pri" type="submit">' + tth('metas.salvar') + '</button></form></details></section>';
  }
  function previsao() {
    var cur = M.partial, h = '<section class="sec"><div class="sec-top"><h2>' + tth('previsao.titulo') + '</h2>';
    if (!cur) return h + '</div><div class="card"><p class="passo">' + tth('previsao.semMesAtual', { mes: mLabel(M.keys[M.keys.length - 1]) }) + '</p></div></section>';
    var P = preverMes(M, planCat, CATST), g = M.by[cur], p = cur.split('-').map(Number), dim = P.dim, day = P.day, left = Math.max(1, dim - day);
    var proj = P.proj, falFix = P.falFix, meta = planTotal(), sobra = meta - g.gasto - falFix, porDia = sobra / left, dif = proj - meta;
    var mx = Math.max(proj, meta, g.gasto, 1), cw = cartAtual(), rs = TR && cw ? saidasPendentes(TR.S, cw.id, cur) : [], pend = 0;
    if (rs.length) pend = Math.max(0, proj - preverMes(buildModel(S.months, S.over, S.plan && S.plan.titular, S.plan && S.plan.pais, CATST, { dia: cw.saldosDia, ancora: cw.ancora }, comPendentes(cw.transf, rs), { envios: cw.envios }), planCat, CATST).proj);
    var st = statusPrevisao(dif, pend, f0);
    return h + '<span class="hint">' + tth('previsao.dica', { dia: day, dim: dim, n: left }) + '</span></div><div class="card prv">' +
      '<div class="prv-n"><div><p class="l mono">' + tth('previsao.gastoAteAgora') + '</p><p class="v num">' + f0(g.gasto) + '</p>' + notaEnvios(g.spend.brasil || 0, f0) + '</div><div><p class="l mono">' + tth('previsao.previsaoPara', { mes: MES[p[1] - 1] }) + '</p><p class="v num">' + f0(proj) + '</p>' + pendNum(pend, f0) + '</div><div><p class="l mono">' + tth('previsao.metaGasto') + '</p><p class="v num">' + f0(meta) + '</p></div></div>' +
      '<div class="ptrack" role="img" aria-label="' + tth('previsao.trackAria', { gasto: f0(g.gasto), proj: f0(proj), meta: f0(meta) }) + '"><i class="pj' + (passaMesmo(dif, pend) ? ' over' : '') + '" style="width:' + (proj / mx * 100).toFixed(1) + '%"></i><i class="sp" style="width:' + (g.gasto / mx * 100).toFixed(1) + '%"></i><b style="left:calc(' + (meta / mx * 100).toFixed(1) + '% - 1px)"></b></div>' +
      '<div class="legend"><span><i class="sw" style="background:var(--accent)"></i>' + tth('previsao.legGasto') + '</span><span><i class="sw" style="background:color-mix(in srgb, var(--accent) 35%, var(--raised))"></i>' + tth('previsao.legPrevisao') + '</span><span><i class="sw line"></i>' + tth('previsao.legMeta') + '</span></div>' +
      '<p class="s">' + st + pendFrase(pend, rs.length, f0) + '. ' + (porDia > 0 ? tth(falFix > 0.5 ? 'previsao.cabeDiaFixas' : 'previsao.cabeDia', { destaque: cru('<b>' + tth('previsao.porDiaValor', { valor: f0(porDia) }) + '</b>'), fixas: f0(falFix) }) :
        tth(falFix > 0.5 ? 'previsao.metaUsadaFixas' : 'previsao.metaUsada', { fixas: f0(falFix) })) +
      ' ' + tth('previsao.entramValor', { lista: listaE(CATSV.filter(function (c) { return c.fixa; }).map(function (c) { return c.nome; }).concat([tt('previsao.contasDetectadas')])), dia: day }) + '</p>' + pendBotao(pend) +
      (P.semBase.length ? '<p class="aviso">' + tth('previsao.semBase', { n: P.semBase.length, lista: cru(P.semBase.map(function (id) { return '<b>' + esc(catPor(id).nome) + '</b>'; }).join(', ')) }) + '</p>' : '') + '</div></section>';
  }
  /* a pessoa nova não sabe que o aluguel por transferência cai em "outros": pergunta uma vez */
  function aluguelSugerido() { return CPOR.aluguel && !CPOR.aluguel.oculta ? sugerirAluguel(RECS, S.plan && S.plan.naoAluguel) : null; }
  function perguntaAluguel() {
    var o = aluguelSugerido();
    if (!o) return '';
    return '<div class="aviso pergunta"><p>' + tth('plano.aluguelPergunta', { dia: o.dia, valor: f2(o.v), desc: cru('<b>' + esc(o.last.desc) + '</b>'), categoria: catPor(o.last.cat).nome, pergunta: cru('<b>' + tth('plano.ehAluguel') + '</b>') }) + '</p>' +
      '<div class="grupo"><button class="btn sm pri" type="button" data-aluguel="sim">' + tth('plano.simAluguel') + '</button><button class="btn sm" type="button" data-aluguel="nao">' + tth('plano.naoE') + '</button></div></div>';
  }
  /* o aviso dos envios, uma vez por carteira: some depois de qualquer resposta (aqui ou em Configurações) */
  function perguntaEnvios() {
    var cw = cartAtual(), A = cw && !cw.envios && !cw.enviosDecidido ? avisoEnvios(M) : null;
    if (!A) return '';
    return '<div class="aviso pergunta" id="fin-avenvios"><p>' + tth('plano.enviosPergunta', { soma: cru('<b>' + esc(f0(A.soma)) + '</b>'), gasto: f0(A.gasto), pct: Math.round(A.fracao * 100), nome: nomeEnvios(), n: A.n, pergunta: cru('<b>' + tth('plano.enviosSaoGasto') + '</b>') }) + '</p>' +
      '<div class="grupo"><button class="btn sm pri" type="button" data-envios="movido">' + tth('plano.contarMovido') + '</button><button class="btn sm" type="button" data-envios="gasto">' + tth('plano.continuaGasto') + '</button></div>' +
      '<p class="passo">' + tth('plano.mudarDepois') + '</p></div>';
  }
  function recorrentes() {
    var nk = Math.min(3, M.keys.length), list = RECS, tot = 0;
    if (nk < 2) return '';
    list.forEach(function (o) { tot += o.v; });
    var h = '<section class="sec"><div class="sec-top"><h2>' + tth('plano.recorrentesTitulo') + '</h2><span class="hint">' + tth('plano.recorrentesDica') + '</span></div><div class="card">';
    if (!list.length) return h + '<p class="vazio">' + tth('plano.recorrentesVazio') + '</p></div></section>';
    list.forEach(function (o, i) {
      var c = catPor(o.last.cat);
      h += '<div class="rec' + (i ? '' : ' first') + '"><i class="sw" style="background:' + colorOf(c) + '"></i><span class="rn">' + esc(o.last.desc) + '<small>' + esc(catNome(c)) + ' · ' + tth('plano.dosUltimos', { n: Object.keys(o.m).length, total: nk }) + '</small></span><span class="rd">' + tth('plano.dia', { dia: o.dia }) + (o.atrasada ? '<small class="atraso">' + tth('plano.atrasada', { dia: o.dia }) + '</small>' : '<small>' + tth('plano.proxima', { data: dFmt(addMonth(o.last.date)) }) + '</small>') + '</span><b class="num">' + f2(o.v) + '</b></div>';
    });
    return h + '<div class="rec tot"><span></span><span class="rn">' + tth('plano.totalFixo') + '</span><span></span><b class="num">' + f2(tot) + '</b></div></div></section>';
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
    M.keys.forEach(function (k) { var v = M.by[k].envios || 0; if (k.slice(0, 4) === ano) totAno += v; if (k !== M.partial) { sAvg += v; nAvg++; } });
    var items = ks.map(function (k) { return { k: k, v: M.by[k].envios || 0, at: k === ks[ks.length - 1], parc: k === M.partial }; });
    return '<section class="sec"><div class="sec-top"><h2>' + esc(catPor('brasil').nome) + '</h2><span class="hint">' + tth('plano.enviosDica') + '</span></div><div class="card">' + vbars(items, f0) +
      '<div class="tri3"><div><b class="num">' + f0(nAvg ? sAvg / nAvg : 0) + '</b><span>' + tth('plano.mediaPorMes') + '</span></div><div><b class="num">' + f0(totAno) + '</b><span>' + tth('plano.emAno', { ano: ano }) + '</span></div><div><b class="num">' + f0(planCat('brasil')) + '</b><span>' + tth('plano.metaMensal') + '</span></div></div>' +
      (M.partial ? '<p class="s">' + tth('plano.mesEmAndamento') + '</p>' : '') + '</div></section>';
  }
  function taxaPoup() {
    var ks = M.keys.slice(-6), rate = function (k) { var g = M.by[k]; return g.entrou > 0 ? g.saved / g.entrou * 100 : null; };
    var comp = M.complete.map(rate).filter(function (v) { return v != null; }), avg = comp.length ? comp.reduce(function (a, b) { return a + b; }, 0) / comp.length : null;
    var l3 = comp.slice(-3), p3 = comp.slice(-6, -3), tr = '';
    if (l3.length && p3.length) {
      var a1 = l3.reduce(function (a, b) { return a + b; }, 0) / l3.length, a0 = p3.reduce(function (a, b) { return a + b; }, 0) / p3.length, d = a1 - a0;
      tr = Math.abs(d) < 1 ? '<span class="d ok">' + tth('plano.estavel') + '</span>' : d > 0 ? '<span class="d good">' + tth('plano.subiuPontos', { n: nn.format(d) }) + '</span>' : '<span class="d bad">' + tth('plano.caiuPontos', { n: nn.format(-d) }) + '</span>';
    }
    var items = ks.map(function (k) { return { k: k, v: rate(k), at: k === ks[ks.length - 1], parc: k === M.partial }; });
    var alvo = 0, nE = 0; M.complete.forEach(function (k) { if (M.by[k].entrou > 0) { alvo += M.by[k].entrou; nE++; } });
    alvo = nE ? planPoupar() / (alvo / nE) * 100 : null;
    return '<section class="sec"><div class="sec-top"><h2>' + tth('plano.taxaTitulo') + '</h2><span class="hint">' + tth('plano.taxaDica') + '</span></div><div class="card">' + vbars(items, pct) +
      '<div class="tri3"><div><b class="num">' + (avg == null ? '–' : pct(avg)) + '</b><span>' + tth('plano.mediaCompletos') + '</span></div><div><b>' + (tr || '–') + '</b><span>' + tth('plano.ultimos3') + '</span></div><div><b class="num">' + (alvo == null ? '–' : pct(alvo)) + '</b><span>' + tth('plano.metaGuardar', { valor: f0(planPoupar()) }) + '</span></div></div>' +
      (M.partial ? '<p class="s">' + tth('plano.mesEmAndamento') + '</p>' : '') + '</div></section>';
  }
  document.addEventListener('toggle', function (e) {
    if (e.target && e.target.id === 'fin-gedit') S.gOpen = e.target.open;
    if (e.target && e.target.id === 'fin-kedit') S.kOpen = e.target.open;
  }, true);

  /* os campos de arquivo escondidos (inseridos uma vez, no fim deste arquivo) ganham o rótulo a cada renderização */
  function rotularArquivos() {
    var a = $('#fin-csv'), b = $('#fin-json');
    if (a) a.setAttribute('aria-label', tt('casca.escolherExtrato'));
    if (b) b.setAttribute('aria-label', tt('casca.escolherBackup'));
  }
  function render() {
    var root = $('#fin-app'), sc = $('.fin .cscroll'), keep = sc ? sc.scrollLeft : null;
    if (!root) return;
    rotularArquivos();
    RES = null;
    if (!S.ready) { root.innerHTML = header() + '<p class="passo">' + tth('casca.carregandoDados') + '</p>'; return; }
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
    root.innerHTML = header() + abas() + perguntaAluguel() + perguntaEnvios() + cashSummary() + (uma ? dividas() : notaResumo()) + kpis() + previsao() + (uma ? metasPoup() : '') + chart() +
      '<section class="sec"><div class="detail' + (S.movOpen ? '' : ' solo') + '">' + catPanel() + movPanel() + '</div></section>' + recorrentes() +
      (CPOR.brasil.oculta ? taxaPoup() : '<div class="two">' + enviosBrasil() + taxaPoup() + '</div>') + table() + review() +
      '<p class="passo">' + tth(bancoAtual() === 'revolut' ? 'casca.fimMesRevolut' : bancoAtual() === 'itau' ? 'casca.fimMesPdf' : 'casca.fimMesPlanilha', { origem: origem() }) + '</p>' + cashBridge();
    var s2 = $('.fin .cscroll');
    if (s2) s2.scrollLeft = keep != null ? keep : s2.scrollWidth;
    drawBal();
  }

  /* ---------- dica sobre a barra ---------- */
  function tipHtml(k) {
    var g = M.by[k], h = '<h3>' + (M.partial === k ? tth('dica.mesEmAndamento', { mes: mLabel(k) }) : esc(mLabel(k))) + '</h3>';
    CATSV.forEach(function (c) {
      var v = g.spend[c.id] || 0;
      if (Math.abs(v) >= .5) h += '<div class="r"><i class="sw" style="background:' + colorOf(c) + '"></i><span>' + esc(catNome(c)) + '</span><b>' + f0(v) + '</b></div>';
    });
    h += '<div class="r t"><i class="sw" style="background:transparent"></i><span>' + tth('comum.gastou') + '</span><b>' + f0(g.gasto) + '</b></div>';
    h += '<div class="r"><i class="sw line"></i><span>' + tth('comum.entrou') + '</span><b>' + f0(g.entrou) + '</b></div>';
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
    var t = e.target.closest && e.target.closest('[data-envios],[data-pixtit-marcar],[data-pixtit-aplicar],[data-pixtit-desfazer],[data-irtransf],[data-tconf],[data-tdisp],[data-tdesf],[data-rmes],[data-rcamb],[data-escolher],[data-sel],[data-f],[data-fopen],[data-fclear],[data-more],[data-all],[data-movtoggle],[data-fin-add],[data-fin-setup],[data-aluguel],[data-backup],[data-restaurar],[data-apagar],[data-dpay],[data-ddel],[data-carteira],[data-wexcluir],[data-excluir],[data-imp],[data-saldo]');
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
      var pp = pq.p, quem = pp.ja === 's' ? tt('msg.quemEntrada', { carteira: pp.e.w.nome }) : pp.ja === 'e' ? tt('msg.quemSaida', { carteira: pp.s.w.nome }) : tt('msg.quemPar', { origem: pp.s.w.nome, dataOrigem: dFmt(pp.s.r.date), destino: pp.e.w.nome, dataDestino: dFmt(pp.e.r.date) });
      if (tc) mudarTransf(function (x) { return confirmarTransferencia(x, pq); }, tt('msg.transfConfirmada', { quem: quem }));
      else mudarTransf(function (x) { return dispensarSugestao(x, pq); }, tt('msg.sugestaoDispensada'));
      return;
    }
    if (t.hasAttribute('data-tdesf')) {
      var tw = t.getAttribute('data-tdesf'), tm = t.getAttribute('data-tmov');
      S.tConf = true;
      mudarTransf(function (x) { return desfazerTransferencia(x, tw, tm); }, tt('msg.transfDesfeita'));
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
      if (bk === 'baixar') { baixarBackup(); toast(tt('msg.backupBaixado')); }
      else if (bk === 'copia') { baixarCopiaIlegivel(); toast(tt('msg.copiaBaixada')); }
      else $('#fin-json').click();
      return;
    }
    if (t.hasAttribute('data-restaurar')) {
      if (t.getAttribute('data-restaurar') === 'confirmar') {
        var x = S.restaurar.dados;
        usarDados(x);
        S.bloqueado = null; S.restaurar = null; S.setupOpen = false; S.resumo = true; localSave(); recompute(); render();
        toast(tt('msg.backupRestaurado', { resumo: resumoTxt(x) }));
      } else { S.restaurar = null; render(); }
      return;
    }
    if (t.hasAttribute('data-apagar')) {
      var ap = t.getAttribute('data-apagar');
      if (ap === 'confirmar') { apagarTudo(); S.apagar = false; recompute(); render(); toast(tt('msg.dadosApagados')); }
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
        toast(tt('msg.carteiraExcluida', { nome: ex.nome }) + (semCambio ? ' ' + tt('msg.principalMudouMoeda') : ''));
      } else { S.excluir = null; render(); }
      return;
    }
    if (t.hasAttribute('data-envios')) {
      var mov = t.getAttribute('data-envios') === 'movido';
      mudarCarteira(function (c) { c.enviosDecidido = true; if (mov) c.envios = 'movido'; return c; });
      toast(tt(mov ? 'msg.enviosMovido' : 'msg.enviosGasto') + ' ' + tt('msg.mudarEmConfig'));
      return;
    }
    if (t.hasAttribute('data-aluguel')) {
      var al = aluguelSugerido();
      if (!al) return;
      if (t.getAttribute('data-aluguel') === 'sim') {
        al.keys.forEach(function (k) { S.over[k] = 'aluguel'; });
        enqueue(saveOver).then(function () { recompute(); render(); toast(tt('msg.agoraAluguel', { desc: al.last.desc })); });
      } else {
        var pn = Object.assign({}, S.plan || {}, { naoAluguel: ((S.plan && S.plan.naoAluguel) || []).concat(al.id) });
        enqueue(function () { return savePlan(pn); }).then(function () { render(); });
      }
      return;
    }
    if (t.hasAttribute('data-pixtit-aplicar')) {
      var ks = Array.prototype.map.call(document.querySelectorAll('#fin-pixtit [data-pixtit]:checked'), function (i) { return i.getAttribute('data-pixtit'); });
      if (!ks.length) { toast(tt('msg.marquePix')); return; }
      salvarPixTitular(aplicarPixTitular(S.over, cartAtual().pixTitular, ks), tt('msg.pixMarcados', { n: ks.length }));
      return;
    }
    if (t.hasAttribute('data-pixtit-marcar')) {
      var mm = t.getAttribute('data-pixtit-marcar');
      Array.prototype.forEach.call(document.querySelectorAll('#fin-pixtit [data-pixtit]'), function (i) { if (!mm || i.getAttribute('data-mes') === mm) i.checked = true; });
      return;
    }
    if (t.hasAttribute('data-pixtit-desfazer')) { salvarPixTitular(desfazerPixTitular(S.over, cartAtual().pixTitular), tt('msg.pixDesfeito')); return; }
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
      divMut(function (d) { d.items.forEach(function (i) { if (i.id === pid) { i.status = 'paga'; i.pagaEm = todayIso(); } }); }).then(function () { toast(tt('msg.marcadaPaga')); });
      return;
    }
    if (t.hasAttribute('data-ddel')) {
      var rid = t.getAttribute('data-ddel');
      divMut(function (d) { d.items = d.items.filter(function (i) { return i.id !== rid; }); }).then(function () { toast(tt('msg.removida')); });
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
    if (t.id === 'fin-i-titular' && S.importar) { S.importar.sugTitular = t.checked; return; }
    if (t.hasAttribute && t.hasAttribute('data-imp-campo') && S.importar) { mudarImportacao(t); return; }
    if (t.id === 'fin-csv') { var fl = t.files; handleFiles(fl).then(function () { t.value = ''; }); return; }
    if (t.id === 'fin-d-cur') { $('#fin-d-outra-l').hidden = t.value !== 'outra'; return; }
    var wm = /^(fin-w-.+|fin-wn)-(pais|banco|moeda)$/.exec(t.id || '');
    /* no formulário novo, quem escolheu moeda ou país já decidiu: o banco não sobrescreve mais */
    if (wm && wm[1] === 'fin-wn' && wm[2] !== 'banco') $('#fin-wnova').setAttribute('data-mexeu', '1');
    if (wm && wm[1] === 'fin-wn' && wm[2] === 'banco') {
      var pb = preenchimentoDoBanco(t.value, $('#fin-wnova').hasAttribute('data-mexeu'));
      if (pb) {
        var mb = $('#fin-wn-moeda'), pbs = $('#fin-wn-pais'); mb.value = pb.moeda; pbs.innerHTML = opcoesPais(pb.moeda, pb.pais); pbs.value = pb.pais;
        var avb = $('#fin-wn-aviso'); avb.innerHTML = avisoSuporte(pb.pais); avb.hidden = temRegras(pb.pais);
      }
    }
    if (wm && wm[2] === 'moeda') {
      var ps = $('#' + wm[1] + '-pais'), atual = ps.value, novo = moedaDoPais(atual) === t.value || !PAISES_MOEDA.some(function (p) { return p[2] === t.value; }) ? atual : paisPadraoDaMoeda(t.value);
      ps.innerHTML = opcoesPais(t.value, novo); ps.value = novo;
      var av0 = $('#' + wm[1] + '-aviso'); if (av0) { av0.innerHTML = avisoSuporte(ps.value); av0.hidden = temRegras(ps.value); }
      return;
    }
    if (t.id === 'fin-w-mp') {
      var tr0 = t.value !== S.dados.config.moedaPrincipal, cw = $('#fin-cambc-w'), ct = $('#fin-cambc-troca');
      if (cw) cw.hidden = tr0; if (ct) ct.hidden = !tr0; return;
    }
    if (wm && wm[2] === 'pais') {
      var mo = $('#' + wm[1] + '-moeda'), mp = moedaDoPais(t.value);
      if (mo && !mo.disabled && mp && mp !== mo.value) { mo.value = mp; var ps2 = $('#' + wm[1] + '-pais'), sel2 = t.value; ps2.innerHTML = opcoesPais(mp, sel2); ps2.value = sel2; }
      var av = $('#' + wm[1] + '-aviso'); av.innerHTML = avisoSuporte(t.value); av.hidden = temRegras(t.value); return;
    }
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
      if (isNaN(va)) { toast(tt('msg.informeSaldo'), true); return; }
      mudarCarteira(function (c) { c.ancora = { data: M.lastDate, valor: Math.round(va * 100), informadoEm: todayIso() }; delete c.ancoraDispensada; return c; });
      toast(tt('msg.saldoSalvo'));
      return;
    }
    if (fid === 'fin-fimp') { e.preventDefault(); if (S.importar && podeSalvar(S.importar)) confirmarImportacao(); return; }
    if (fid === 'fin-fdiv') {
      e.preventDefault();
      var nome = $('#fin-d-nome').value.trim(), valor = parseNum($('#fin-d-valor').value);
      if (!nome || !(valor > 0)) { toast(tt('msg.informeNomeValor'), true); return; }
      var venc = $('#fin-d-venc').value, desc = $('#fin-d-desc').value.trim(), cod = $('#fin-d-cur').value;
      if (cod === 'outra') cod = $('#fin-d-outra').value.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(cod)) { toast(tt('msg.codigoMoeda'), true); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) venc = '';
      S.dAdd = false;
      divMut(function (d) { var it = { id: 'd' + Date.now().toString(36), nome: nome, status: 'aberta', criada: todayIso(), valor: Math.round(valor * 100) / 100, moeda: cod }; if (venc) it.venc = venc; if (desc) it.desc = desc.slice(0, 120); d.items.push(it); }).then(function () { toast(tt('msg.pagamentoAnotado')); });
      return;
    }
    if (fid === 'fin-frcamb') {
      e.preventDefault();
      var lr = lerCambios('cambr');
      if (lr.ruim) { toast(tt('msg.informeCambio', { moeda: lr.ruim, principal: nomeMoeda(moedaP()), exemplo: '0,86' }), true); return; }
      S.rCamb = false;
      divMut(function (d) { d.cambios = Object.assign({}, d.cambios || {}, lr.novos); }).then(function () { toast(tt(Object.keys(lr.novos).length ? 'msg.cambioSalvo' : 'msg.cambioNadaMudou')); });
      return;
    }
    if (fid === 'fin-fcamb') {
      e.preventDefault();
      var mg = parseNum($('#fin-c-mg').value), lc = lerCambios('camb'), novos = lc.novos;
      if (lc.ruim) { toast(tt('msg.informeCambio', { moeda: lc.ruim, principal: nomeMoeda(moedaP()), exemplo: '1,08' }), true); return; }
      if (isNaN(mg) || mg < 0 || mg > 20) mg = 2;
      S.dCamb = false;
      divMut(function (d) { d.cambios = Object.assign({}, d.cambios || {}, novos); d.margem = mg; }).then(function () { toast(tt('msg.cambioAtualizado')); });
      return;
    }
    if (fid === 'fin-fsetup') {
      e.preventDefault();
      /* 1) carteiras (nome, banco, moeda, país); 2) você, categorias e metas da carteira ativa; 3) carteira nova, que vira a ativa */
      var x = dadosAtuais(), erros = [], tinhaCambio = Object.keys(x.cambios || {}).length > 0, mp0 = x.config.moedaPrincipal;
      x.carteiras.forEach(function (c) {
        try { x = editarCarteira(x, c.id, lerCarteira(c.id)); } catch (er) { erros.push(tt('msg.erroCarteira', { nome: c.nome, erro: textoErro(er) })); }
      });
      /* moeda principal (com várias carteiras) e câmbio; trocar a moeda apaga as taxas, e as digitadas não valem */
      var mpSel = $('#fin-w-mp'), trocouMP = false;
      if (mpSel && mpSel.value !== x.config.moedaPrincipal) { x = trocarMoedaPrincipal(x, mpSel.value); trocouMP = true; }
      else if (mpSel) {
        var lc = lerCambios('cambc');
        if (lc.ruim) erros.push(tt('msg.cambioInvalido', { moeda: lc.ruim, principal: x.config.moedaPrincipal, exemplo: '0,86' }));
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
        catch (er) { erros.push(tt('msg.naoCrieiCarteira', { nome: wn.value.trim(), erro: textoErro(er) })); }
      }
      S.setupOpen = false; S.wOpen = false;
      if (criada) { S.sel = null; S.f = []; S.q = ''; S.resumo = false; }
      enqueue(function () { usarDados(x); localSave(); }).then(function () {
        recompute(); render();
        var msg = tt('msg.configSalva') + (criada ? ' ' + tt('msg.carteiraCriada', { nome: criada.nome }) : '') +
          (trocouMP ? ' ' + tt('msg.principalAgora', { moeda: nomeMoeda(x.config.moedaPrincipal) }) :
            mudouPrincipal && tinhaCambio ? ' ' + tt('msg.principalMudou') : '');
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
        lm.push({ id: g.id, nome: nomeParaGravar('meta', g.id, $(k + '-nome').value.trim() || g.nome), src: $(k + '-src').value || null });
      });
      var ng = $('#fin-g-nova'), nn2 = ng ? ng.value.trim() : '';
      if (nn2 && lm.length < MAX_METAS_POUP) {
        var gi = 1; while (lm.some(function (g) { return g.id === 'm' + gi; }) || gs['m' + gi]) gi++;
        lm.push({ id: 'm' + gi, nome: nn2.slice(0, 40), src: null }); gs['m' + gi] = { alvo: 0, tem: 0 };
      }
      var pg = Object.assign({}, S.plan || {}, { goals: gs, metasPoupanca: lm });
      S.gOpen = false;
      enqueue(function () { return savePlan(pg); }).then(function () { render(); toast(tt('msg.metasPoupancaSalvas')); });
      return;
    }
    if (fid !== 'fin-fmetas') return;
    e.preventDefault();
    var p = Object.assign({}, S.plan || {}, lerMetas('m'));
    S.metasOpen = true;
    enqueue(function () { return savePlan(p); }).then(function () { render(); toast(tt('msg.metasSalvas')); });
  });
  document.addEventListener('toggle', function (e) { if (e.target.id === 'fin-metas') S.metasOpen = e.target.open; if (e.target.id === 'fin-cfd') S.cfOpen = e.target.open; if (e.target.id === 'fin-revd') S.revOpen = e.target.open; if (e.target.id === 'fin-dadd') S.dAdd = e.target.open; if (e.target.id === 'fin-dcamb') S.dCamb = e.target.open; if (e.target.id === 'fin-dpaid') S.dPaid = e.target.open; if (e.target.id === 'fin-wnova') S.wOpen = e.target.open; if (e.target.id === 'fin-rcamb') S.rCamb = e.target.open; if (e.target.id === 'fin-rpor') S.rPor = e.target.open; if (e.target.id === 'fin-rfd') S.rFora = e.target.open; if (e.target.id === 'fin-tconf') S.tConf = e.target.open; }, true);
  /* arrastar um extrato só vale com a aba Finanças aberta */
  window.addEventListener('dragover', function (e) { var r = $('#fin-app'); if (!r) return; e.preventDefault(); r.classList.add('arrasta'); });
  window.addEventListener('dragleave', function (e) { var r = $('#fin-app'); if (r && !e.relatedTarget) r.classList.remove('arrasta'); });
  window.addEventListener('drop', function (e) { var r = $('#fin-app'); if (!r) return; e.preventDefault(); r.classList.remove('arrasta');
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    /* no Resumo, pergunta antes para qual carteira vai o arquivo */
    if (emResumo() && !S.importar) { S.escolher = { files: Array.prototype.slice.call(e.dataTransfer.files) }; render(); window.scrollTo(0, 0); sugerirCarteira(S.escolher); return; }
    handleFiles(e.dataTransfer.files); });

  var rsz; window.addEventListener('resize', function () { clearTimeout(rsz); rsz = setTimeout(drawBal, 150); });

  /* ---------- início ---------- */
  /* o cartão de Finanças no mapa: quanto saiu no mês e as barras dos últimos seis meses */
  function cartao() {
    var el = document.getElementById('cartao-fin');
    if (!el || !S.ready) return;
    var tag = '<span class="tag">' + tth('casca.financas') + '</span>';
    if (!M.keys.length) { el.innerHTML = tag + '<span class="txt">' + tth('casca.cartaoVazio') + '</span><span class="pe">' + tth('casca.cartaoAdicione') + '</span>'; return; }
    var ks = M.keys.slice(-6), cur = ks[ks.length - 1], mx = 1;
    ks.forEach(function (k) { mx = Math.max(mx, M.by[k].gasto || 0); });
    var bars = ks.map(function (k) { return '<i' + (k === cur ? ' class="at"' : '') + ' style="height:' + Math.max(8, (M.by[k].gasto || 0) / mx * 100).toFixed(0) + '%"></i>'; }).join('');
    el.title = tt(M.partial === cur ? 'casca.cartaoTituloParcial' : 'casca.cartaoTitulo', { mes: mLabel(cur) });
    el.innerHTML = tag + '<span class="fin-l"><span class="txt">' + f0(M.by[cur].gasto || 0) + ' <small>' + tth('casca.cartaoMes', { mes: mShort(cur) }) + '</small></span><span class="mini" aria-hidden="true">' + bars + '</span></span><span class="pe">' + tth('casca.cartaoMeta', { valor: f0(planTotal()) }) + '</span>';
  }
  function start() {
    localLoad(); S.ready = true; S.resumo = true; recompute(); render(); cartao();
  }
  /* peças fixas: o seletor de arquivo e a dica dos gráficos */
  document.body.insertAdjacentHTML('beforeend', '<input id="fin-csv" class="vh" type="file" accept=".csv,.txt,.xls,.xlsx,.pdf,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf" multiple tabindex="-1"><input id="fin-json" class="vh" type="file" accept=".json,application/json" tabindex="-1"><div id="fin-tip" class="fin-tip" hidden></div>');
  window.__cortexFin = { montar: function () { render(); }, cartao: cartao };
  render();
  start();
})();
