import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raiz = new URL('../', import.meta.url);
const ler = caminho => readFileSync(new URL(caminho, raiz), 'utf8');

function diretivasCsp(html, nomeArquivo) {
  const metas = [...html.matchAll(/<meta\b([^>]*?)>/gi)];
  const meta = metas.find(([tag]) => /\bhttp-equiv\s*=\s*(["'])Content-Security-Policy\1/i.test(tag));
  assert.ok(meta, `${nomeArquivo} precisa ter <meta http-equiv="Content-Security-Policy">`);
  const conteudo = meta[0].match(/\bcontent\s*=\s*(["'])(.*?)\1/i);
  assert.ok(conteudo, `${nomeArquivo} precisa definir content na meta CSP`);
  return conteudo[2].split(';').map(d => d.trim().replace(/\s+/g, ' ')).filter(Boolean).sort();
}

function extrairDeclaracoesBloco(blocoCss) {
  const semComentarios = blocoCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const decls = {};
  for (const parte of semComentarios.split(';')) {
    const t = parte.trim();
    if (!t) continue;
    const idx = t.indexOf(':');
    assert.ok(idx > 0, `Declaração CSS inválida: ${t}`);
    const prop = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/\s+/g, ' ');
    decls[prop] = val;
  }
  return decls;
}

test('docs/painel-previa-2.html tem a mesma CSP e política de referrer do index.html', () => {
  const html = ler('docs/painel-previa-2.html');
  const index = ler('index.html');
  assert.deepEqual(diretivasCsp(html, 'docs/painel-previa-2.html'), diretivasCsp(index, 'index.html'));
  assert.match(html, /<meta\s+name="referrer"\s+content="no-referrer"\s*>/i);
});

test('docs/painel-previa-2.html é estático: sem script, sem estilo inline, sem eventos inline, sem URLs externas e com IDs únicos', () => {
  const html = ler('docs/painel-previa-2.html');
  assert.doesNotMatch(html, /<script\b/i, 'não deve ter elemento <script>');
  assert.doesNotMatch(html, /<style\b/i, 'não deve ter bloco <style>');
  assert.doesNotMatch(html, /\sstyle\s*=/i, 'não deve ter atributo style inline');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'não deve ter manipulador de evento inline (onclick etc.)');
  assert.doesNotMatch(html, /\bhttps?:\/\/|\/\/[a-z0-9]/i, 'não deve apontar para CDN nem recurso externo');
  assert.match(html, /<link\s+rel="stylesheet"\s+href="\.\.\/styles\.css"\s*>/i, 'deve usar link relativo para ../styles.css');
  assert.match(html, /<link\s+rel="stylesheet"\s+href="painel-previa-2\.css"\s*>/i, 'deve carregar painel-previa-2.css local');

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'todos os atributos id devem ser únicos na página');
});

test('nenhuma cor hexadecimal fora do espelho de [data-tema="escuro"], validado contra o styles.css', () => {
  const html = ler('docs/painel-previa-2.html');
  const cssPrevia = ler('docs/painel-previa-2.css');
  const cssPrincipal = ler('styles.css');

  assert.doesNotMatch(html, /#[0-9a-f]{3,8}\b/i, 'HTML não deve conter nenhuma cor hexadecimal');

  const marcador = '/* FIM-ESPELHO-ESCURO */';
  const posMarcador = cssPrevia.indexOf(marcador);
  assert.ok(posMarcador > 0, 'painel-previa-2.css deve delimitar o fim do espelho do tema escuro');

  const topoEspelho = cssPrevia.slice(0, posMarcador);
  const restoCss = cssPrevia.slice(posMarcador + marcador.length);

  const blocoStyles = cssPrincipal.match(/:root\[data-tema="escuro"\]\s*\{([\s\S]*?)\}/);
  const blocoPrevia = topoEspelho.match(/\[data-tema="escuro"\]\s*\{([\s\S]*?)\}/);
  assert.ok(blocoStyles, 'styles.css deve conter :root[data-tema="escuro"]');
  assert.ok(blocoPrevia, 'painel-previa-2.css deve conter o espelho [data-tema="escuro"]');
  assert.deepEqual(
    extrairDeclaracoesBloco(blocoPrevia[1]),
    extrairDeclaracoesBloco(blocoStyles[1]),
    'o bloco [data-tema="escuro"] da prévia 2 deve ser idêntico ao do styles.css'
  );

  const selStyles = cssPrincipal.match(/:root\[data-tema="escuro"\]\s*::selection\s*\{([\s\S]*?)\}/);
  const selPrevia = topoEspelho.match(/\[data-tema="escuro"\]\s*::selection\s*\{([\s\S]*?)\}/);
  assert.ok(selStyles && selPrevia, 'a regra ::selection escura também deve estar espelhada');
  assert.deepEqual(extrairDeclaracoesBloco(selPrevia[1]), extrairDeclaracoesBloco(selStyles[1]));

  assert.doesNotMatch(restoCss, /#[0-9a-f]{3,8}\b/i, 'nenhuma cor hexadecimal é permitida no resto do CSS');
  assert.doesNotMatch(restoCss, /\b(?:rgba?|hsla?)\s*\(/i, 'nenhum rgb()/hsl() literal é permitido no resto do CSS');
  assert.doesNotMatch(restoCss, /@import\b|url\s*\(/i, 'nenhum recurso externo ou url() extra no CSS da prévia');
  assert.match(restoCss, /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i, 'deve respeitar prefers-reduced-motion');
});

test('mostra P4 (4 estados), P4b (3 estados) e P5 (2 estados) nos dois temas, com Intl em euro e alertas com ícone + texto', () => {
  const html = ler('docs/painel-previa-2.html');
  const cssPrevia = ler('docs/painel-previa-2.css');

  const palavraProibida = 'parse' + 'Float';
  assert.equal(html.includes(palavraProibida), false, 'HTML não deve mencionar parseFloat');
  assert.equal(cssPrevia.includes(palavraProibida), false, 'CSS não deve mencionar parseFloat');

  const fmtEur2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtEur0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtPct0 = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const eur2 = centavos => fmtEur2.format(Math.abs(centavos) / 100);
  const eur0 = centavos => fmtEur0.format(Math.trunc(Math.abs(centavos) / 100));
  const pct = pb => fmtPct0.format(pb / 10000);

  const esperadoPorSecao = [
    ['ideia-p4', 4],
    ['ideia-p4b', 3],
    ['ideia-p5', 2],
  ];

  const secoes = {};
  for (const [idIdeia, qtdEstados] of esperadoPorSecao) {
    const reSecao = new RegExp(`<section[^>]*\\bid="${idIdeia}"[^>]*>([\\s\\S]*?)<\\/section>`, 'i');
    const sec = html.match(reSecao);
    assert.ok(sec, `seção #${idIdeia} presente`);
    secoes[idIdeia] = sec[1];

    const estados = [...sec[1].matchAll(/<div class="bloco-estado">/g)];
    assert.equal(estados.length, qtdEstados, `#${idIdeia} deve exibir ${qtdEstados} estados`);

    const quadrosClaros = [...sec[1].matchAll(/<article class="tema-quadro"\s+aria-label=/g)];
    const quadrosEscuros = [...sec[1].matchAll(/<article class="tema-quadro"\s+data-tema="escuro"/g)];
    assert.equal(quadrosClaros.length, qtdEstados, `#${idIdeia} deve exibir ${qtdEstados} quadros claros`);
    assert.equal(quadrosEscuros.length, qtdEstados, `#${idIdeia} deve exibir ${qtdEstados} quadros escuros`);
  }

  /* P4: 4 estados de conferência de saldo em linguagem simples */
  const secP4 = secoes['ideia-p4'];
  assert.ok(secP4.includes('Bateu com o banco') && secP4.includes(eur2(240000)), 'P4 estado 1: bateu');
  assert.ok(secP4.includes('Diferença pequena explicada') && secP4.includes(`+${eur2(1000)}`), 'P4 estado 2: diferença pequena explicada');
  assert.ok(secP4.includes('Diferença para conferir') && secP4.includes(`−${eur2(20000)}`), 'P4 estado 3: diferença que precisa de atenção');
  assert.match(secP4, /Onde vale olhar primeiro[\s\S]*?<ul>[\s\S]*?<li>/i, 'P4 estado 3 traz lista de onde olhar');
  assert.ok(secP4.includes('Não consigo conferir ainda'), 'P4 estado 4: não consigo conferir ainda (faltam dados)');

  /* P4b: botões ‹ › nos 3 estados, alvo >= 44 px e mês anunciável */
  const secP4b = secoes['ideia-p4b'];
  assert.match(cssPrevia, /\.previa-painel\s+\.btn-mes\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/, 'botões ‹ › têm pelo menos 44×44 px');
  const botoesAntDesab = [...secP4b.matchAll(/<button[^>]*class="btn btn-mes"[^>]*\bdisabled\b[^>]*><span aria-hidden="true">‹<\/span><\/button>/g)];
  const botoesProxDesab = [...secP4b.matchAll(/<button[^>]*class="btn btn-mes"[^>]*\bdisabled\b[^>]*><span aria-hidden="true">›<\/span><\/button>/g)];
  assert.equal(botoesAntDesab.length, 2, 'primeiro mês com dados tem ‹ desabilitado nos dois temas');
  assert.equal(botoesProxDesab.length, 2, 'mês em andamento tem › desabilitado nos dois temas');
  const titulosAnunciaveis = [...secP4b.matchAll(/<div class="mes-titulo"[^>]*aria-live="polite"[^>]*aria-label="Mês selecionado:[^"]+"/g)];
  assert.equal(titulosAnunciaveis.length, 6, 'nome do mês é anunciável nos 3 estados × 2 temas');

  /* P5: modo privacidade nos dois estados + exceções que não mascaram */
  const secP5 = secoes['ideia-p5'];
  const btnOcultar = [...secP5.matchAll(/<button[^>]*class="btn btn-privacidade"[^>]*aria-pressed="false"[^>]*>([\s\S]*?)<\/button>/g)];
  const btnMostrar = [...secP5.matchAll(/<button[^>]*class="btn btn-privacidade"[^>]*aria-pressed="true"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.equal(btnOcultar.length, 2, 'botão Ocultar valores presente nos dois temas');
  assert.equal(btnMostrar.length, 2, 'botão Mostrar valores presente nos dois temas');
  for (const [, interior] of btnOcultar) {
    assert.match(interior, /<svg\b[^>]*aria-hidden="true"/i);
    assert.match(interior, /Ocultar valores/);
  }
  for (const [, interior] of btnMostrar) {
    assert.match(interior, /<svg\b[^>]*aria-hidden="true"/i);
    assert.match(interior, /Mostrar valores/);
  }

  assert.ok(secP5.includes('Modo privacidade ativo'), 'indicação explícita de modo privacidade ativo');
  assert.ok(secP5.includes('€ ••••'), 'valores mascarados com € ••••');
  assert.ok(secP5.includes('aria-label="Saldo atual: valor oculto"'), 'aria-label anuncia valor oculto em vez do número');
  assert.ok(secP5.includes(`${pct(8500)} da meta · valor oculto`), 'porcentagens permanecem visíveis no modo privacidade');

  /* Nos quadros com modo privacidade ativo, formulários e prévia de importação mantêm valores reais */
  const blocosEstadoP5 = secP5.split('<div class="bloco-estado">').slice(1);
  assert.equal(blocosEstadoP5.length, 2);
  const estadoMascarado = blocosEstadoP5[1];
  assert.match(estadoMascarado, /<input[^>]*value="1\.000"[^>]*>/, 'formulário mantém valor real 1.000 no modo ativo');
  assert.match(estadoMascarado, /<input[^>]*value="200"[^>]*>/, 'formulário mantém valor real 200 no modo ativo');
  assert.ok(estadoMascarado.includes(`+${eur2(200000)}`) && estadoMascarado.includes(`−${eur2(6000)}`), 'prévia de importação mantém valores reais no modo ativo');

  /* Nunca depender só de cor: selos, alertas e faixa de privacidade têm <svg aria-hidden="true"> + texto */
  const alertas = [
    ...html.matchAll(/<(?:span|div|p)\s+class="(?:selo-estado|alerta-inline|faixa-privacidade|onde-olhar-titulo|aviso-painel)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|p)>/g),
  ];
  assert.ok(alertas.length >= 28, 'deve haver selos, alertas e faixas semânticas nos dois temas');
  for (const [trecho, interior] of alertas) {
    assert.match(interior, /<svg\b[^>]*aria-hidden="true"/i, `indicador precisa de ícone SVG: ${trecho}`);
    const textoVisivel = interior.replace(/<[^>]+>/g, '').trim();
    assert.ok(textoVisivel.length >= 4, `indicador precisa de texto explícito além da cor: ${trecho}`);
  }
});
