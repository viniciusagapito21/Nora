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

test('docs/painel-previa.html tem a mesma CSP e política de referrer do index.html', () => {
  const html = ler('docs/painel-previa.html');
  const index = ler('index.html');
  assert.deepEqual(diretivasCsp(html, 'docs/painel-previa.html'), diretivasCsp(index, 'index.html'));
  assert.match(html, /<meta\s+name="referrer"\s+content="no-referrer"\s*>/i);
});

test('docs/painel-previa.html é estático: sem script, sem estilo inline, sem eventos inline e sem URLs externas', () => {
  const html = ler('docs/painel-previa.html');
  assert.doesNotMatch(html, /<script\b/i, 'não deve ter elemento <script>');
  assert.doesNotMatch(html, /<style\b/i, 'não deve ter bloco <style>');
  assert.doesNotMatch(html, /\sstyle\s*=/i, 'não deve ter atributo style inline');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'não deve ter manipulador de evento inline (onclick etc.)');
  assert.doesNotMatch(html, /\bhttps?:\/\/|\/\/[a-z0-9]/i, 'não deve apontar para CDN nem recurso externo');
  assert.match(html, /<link\s+rel="stylesheet"\s+href="\.\.\/styles\.css"\s*>/i, 'deve usar link relativo para ../styles.css');
  assert.match(html, /<link\s+rel="stylesheet"\s+href="painel-previa\.css"\s*>/i, 'deve carregar painel-previa.css local');
});

test('nenhuma cor hexadecimal fora do espelho de [data-tema="escuro"], validado contra o styles.css', () => {
  const html = ler('docs/painel-previa.html');
  const cssPrevia = ler('docs/painel-previa.css');
  const cssPrincipal = ler('styles.css');

  assert.doesNotMatch(html, /#[0-9a-f]{3,8}\b/i, 'HTML não deve conter nenhuma cor hexadecimal');

  const marcador = '/* FIM-ESPELHO-ESCURO */';
  const posMarcador = cssPrevia.indexOf(marcador);
  assert.ok(posMarcador > 0, 'painel-previa.css deve delimitar o fim do espelho do tema escuro');

  const topoEspelho = cssPrevia.slice(0, posMarcador);
  const restoCss = cssPrevia.slice(posMarcador + marcador.length);

  const blocoStyles = cssPrincipal.match(/:root\[data-tema="escuro"\]\s*\{([\s\S]*?)\}/);
  const blocoPrevia = topoEspelho.match(/\[data-tema="escuro"\]\s*\{([\s\S]*?)\}/);
  assert.ok(blocoStyles, 'styles.css deve conter :root[data-tema="escuro"]');
  assert.ok(blocoPrevia, 'painel-previa.css deve conter o espelho [data-tema="escuro"]');
  assert.deepEqual(
    extrairDeclaracoesBloco(blocoPrevia[1]),
    extrairDeclaracoesBloco(blocoStyles[1]),
    'o bloco [data-tema="escuro"] da prévia deve ser idêntico ao do styles.css'
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

test('mostra P1, P2 e P3 em dois estados e nos dois temas, com valores Intl em euro e alertas com ícone + texto', () => {
  const html = ler('docs/painel-previa.html');
  const cssPrevia = ler('docs/painel-previa.css');

  const palavraProibida = 'parse' + 'Float';
  assert.equal(html.includes(palavraProibida), false, 'HTML não deve mencionar parseFloat');
  assert.equal(cssPrevia.includes(palavraProibida), false, 'CSS não deve mencionar parseFloat');

  const fmtEur0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtPct0 = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const eur = centavos => fmtEur0.format(Math.trunc(Math.abs(centavos) / 100));
  const pct = pb => fmtPct0.format(pb / 10000);

  for (const idIdeia of ['ideia-p1', 'ideia-p2', 'ideia-p3']) {
    const reSecao = new RegExp(`<section[^>]*\\bid="${idIdeia}"[^>]*>([\\s\\S]*?)<\\/section>`, 'i');
    const sec = html.match(reSecao);
    assert.ok(sec, `seção #${idIdeia} presente`);
    const estados = [...sec[1].matchAll(/<div class="bloco-estado">/g)];
    assert.equal(estados.length, 2, `#${idIdeia} deve exibir dois estados`);
    const quadrosClaros = [...sec[1].matchAll(/<article class="tema-quadro"\s+aria-label=/g)];
    const quadrosEscuros = [...sec[1].matchAll(/<article class="tema-quadro"\s+data-tema="escuro"/g)];
    assert.equal(quadrosClaros.length, 2, `#${idIdeia} deve exibir 2 quadros claros`);
    assert.equal(quadrosEscuros.length, 2, `#${idIdeia} deve exibir 2 quadros escuros`);
  }

  /* P1: cota diária positiva (€ 20 / dia, € 300 livres) e estouro ("Meta usada, € 100 acima") */
  assert.ok(html.includes(`${eur(2000)} <small>por dia</small>`), 'P1 mostra a cota diária formatada com Intl');
  assert.ok(html.includes(`${eur(30000)} livres para gastar`), 'P1 mostra o livre para gastar');
  assert.ok(html.includes(`Meta usada, ${eur(10000)} acima`), 'P1 mostra "Meta usada, € X acima" quando livre < 0');

  /* P2: taxa positiva (18% do que entrou) e caso negativo ("Retirou € 220 da reserva", sem percentual negativo) */
  assert.ok(html.includes(`${pct(1800)} do que entrou`), 'P2 mostra a taxa de poupança em %');
  assert.ok(html.includes(`Retirou ${eur(22000)} da reserva`), 'P2 mostra "Retirou € X da reserva" quando guardou < 0');
  assert.doesNotMatch(html, /[−-]\s*\d+\s*%/, 'P2 nunca mostra percentual negativo');

  /* P3: alertas em 80%, 85%, 100% e acima de 100% */
  assert.ok(html.includes(`Atenção · ${pct(8000)} da meta`), 'P3 mostra alerta na entrada de 80%');
  assert.ok(html.includes(`Atenção · ${pct(8500)} da meta`), 'P3 mostra alerta na faixa de 85%');
  assert.ok(html.includes(`No limite · ${pct(10000)} da meta`), 'P3 mostra o limite de 100%');
  assert.ok(html.includes(`Estouro · ${eur(4000)} acima da meta`), 'P3 mostra alerta de estouro acima de 100%');

  /* Alerta nunca só por cor: todo selo/alerta traz um <svg> + texto não vazio */
  const alertas = [
    ...html.matchAll(/<span class="(?:selo-estado|alerta-inline|kpi-retirada-valor)[^"]*">([\s\S]*?)<\/span>\s*(?=<\/div>|<span|<\/p>)/g)
  ];
  assert.ok(alertas.length >= 16, 'deve haver selos e alertas visíveis nos dois temas');
  for (const [trecho, interior] of alertas) {
    assert.match(interior, /<svg\b[^>]*aria-hidden="true"/i, `alerta precisa de ícone SVG: ${trecho}`);
    const textoVisivel = interior.replace(/<[^>]+>/g, '').trim();
    assert.ok(textoVisivel.length >= 4, `alerta precisa de texto explícito além da cor: ${trecho}`);
  }
});
