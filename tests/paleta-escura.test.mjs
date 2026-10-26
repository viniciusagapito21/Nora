// Paleta escura (styles.css e docs/paleta-escura-previa.html): tokens, contraste WCAG AA e distinção para daltonismo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = caminho => readFileSync(new URL('../' + caminho, import.meta.url), 'utf8');

function extrairBloco(css, seletorRe) {
  const m = seletorRe.exec(css);
  assert.ok(m, `bloco não encontrado: ${seletorRe}`);
  const ini = css.indexOf('{', m.index);
  let nivel = 0;
  for (let i = ini; i < css.length; i++) {
    if (css[i] === '{') nivel++;
    else if (css[i] === '}') {
      nivel--;
      if (nivel === 0) return css.slice(ini + 1, i);
    }
  }
  assert.fail(`chave não fechada em ${seletorRe}`);
}

function extrairVars(bloco) {
  const semComentarios = bloco.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  for (const [, nome, valor] of semComentarios.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    vars[nome] = valor.trim();
  }
  return vars;
}

function resolverTokens(escuro, base) {
  const resolvido = {};
  const resolver = (nome, pilha = []) => {
    if (nome in resolvido) return resolvido[nome];
    assert.ok(!pilha.includes(nome), `referência circular em ${nome}`);
    const bruto = nome in escuro ? escuro[nome] : base[nome];
    assert.ok(bruto !== undefined, `token ausente: ${nome}`);
    const m = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(bruto);
    const val = m ? resolver(m[1], [...pilha, nome]) : bruto;
    resolvido[nome] = val;
    return val;
  };
  for (const k of Object.keys(escuro)) resolver(k);
  return resolvido;
}

// ---------- matemática de cor: luminância WCAG 2.1, CIELAB, CIEDE2000 e dicromacia ----------
function hexRgb(cor) {
  assert.match(cor, /^#[0-9a-f]{6}$/i, `esperado hex de 6 dígitos, veio ${cor}`);
  const h = cor.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const linear = v => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const srgb8 = v => { const c = Math.min(1, Math.max(0, v)); return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * (c ** (1 / 2.4)) - 0.055) * 255); };
const luminancia = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

function contraste(hexA, hexB) {
  const a = luminancia(hexRgb(hexA)), b = luminancia(hexRgb(hexB));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Simulação de protanopia e deuteranopia severidade 1,0 em sRGB linear (Machado, Oliveira & Fernandes, 2009)
const MATRIZ_CVD = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]]
};

function simularDaltonismo([r, g, b], tipo) {
  if (!tipo) return [r, g, b];
  const R = linear(r), G = linear(g), B = linear(b);
  return MATRIZ_CVD[tipo].map(([m0, m1, m2]) => srgb8(m0 * R + m1 * G + m2 * B));
}

function rgbParaLab([r, g, b]) {
  const R = linear(r), G = linear(g), B = linear(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

function deltaE76(rgbA, rgbB) {
  const [L1, a1, b1] = rgbParaLab(rgbA), [L2, a2, b2] = rgbParaLab(rgbB);
  return Math.hypot(L1 - L2, a1 - a2, b1 - b2);
}

function deltaE00(rgbA, rgbB) {
  const [L1, a1, b1] = rgbParaLab(rgbA), [L2, a2, b2] = rgbParaLab(rgbB);
  const avgL = (L1 + L2) / 2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), avgC = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt((avgC ** 7) / ((avgC ** 7) + (25 ** 7))));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2), avgCp = (C1p + C2p) / 2;
  const ang = (ap, b) => { if (ap === 0 && b === 0) return 0; const d = Math.atan2(b, ap) * 180 / Math.PI; return d < 0 ? d + 360 : d; };
  const h1p = ang(a1p, b1), h2p = ang(a2p, b2);
  let dhp = 0;
  if (C1p * C2p !== 0) {
    if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
    else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
    else dhp = h2p - h1p + 360;
  }
  const dLp = L2 - L1, dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * Math.PI / 180);
  let avgHp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) avgHp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) avgHp = (h1p + h2p + 360) / 2;
    else avgHp = (h1p + h2p - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos((avgHp - 30) * Math.PI / 180) + 0.24 * Math.cos((2 * avgHp) * Math.PI / 180)
    + 0.32 * Math.cos((3 * avgHp + 6) * Math.PI / 180) - 0.20 * Math.cos((4 * avgHp - 63) * Math.PI / 180);
  const SL = 1 + (0.015 * ((avgL - 50) ** 2)) / Math.sqrt(20 + ((avgL - 50) ** 2));
  const SC = 1 + 0.045 * avgCp;
  const SH = 1 + 0.015 * avgCp * T;
  const RT = -2 * Math.sqrt((avgCp ** 7) / ((avgCp ** 7) + (25 ** 7))) * Math.sin((60 * Math.exp(-(((avgHp - 275) / 25) ** 2))) * Math.PI / 180);
  return Math.sqrt(((dLp / SL) ** 2) + ((dCp / SC) ** 2) + ((dHp / SH) ** 2) + RT * (dCp / SC) * (dHp / SH));
}

const css = ler('styles.css');
const blocoClaro = extrairBloco(css, /(?:^|\n):root\s*\{/);
const blocoEscuro = extrairBloco(css, /:root\[data-tema="escuro"\]\s*\{/);
const varsClaro = extrairVars(blocoClaro);
const varsEscuro = extrairVars(blocoEscuro);
const T = resolverTokens(varsEscuro, varsClaro);

const CONSTANTES_MARCA = new Set(['--deep-fjord', '--nora-teal', '--pale-mint', '--warm-paper', '--apricot']);
const ESCALA_E_FONTES = /^--(display|ui|mono|fs-|sp-|r-)/;

test('tema escuro: redefine todos os tokens semânticos de cor e sombra em :root[data-tema="escuro"], sem prefers-color-scheme', () => {
  assert.doesNotMatch(css, /prefers-color-scheme/i, 'quem liga o tema é o prefs.js, não prefers-color-scheme');
  assert.match(blocoEscuro, /\bcolor-scheme\s*:\s*dark\s*;/);
  assert.equal([...css.matchAll(/color-mix\(/g)].length, 5, 'os 5 color-mix existentes continuam intactos');

  const esperados = Object.keys(varsClaro).filter(k => !CONSTANTES_MARCA.has(k) && !ESCALA_E_FONTES.test(k)).sort();
  assert.deepEqual(Object.keys(varsEscuro).sort(), esperados, 'todos os tokens de cor e sombra do claro (e só eles) são redefinidos');
  for (const c of CONSTANTES_MARCA) assert.ok(!(c in varsEscuro), `${c} é constante da marca: continua herdada de :root`);
  for (const [k, v] of Object.entries(T)) {
    if (k === '--elev' || k === '--shadow') assert.match(v, /^0\s.*rgba\(/, k);
    else assert.match(v, /^#[0-9a-f]{6}$/i, `${k}: ${v}`);
  }
});

test('tema escuro: textos e estados cumprem WCAG AA (≥ 4,5:1) sobre todas as superfícies', () => {
  const superficies = ['--bg', '--panel', '--surface', '--raised', '--field'];
  const textos = [
    '--fg', '--body', '--soft', '--muted', '--dim', '--placeholder',
    '--accent', '--accent-hover', '--accent-ink', '--accent-strong',
    '--green', '--pos', '--danger', '--neg', '--amber', '--warn'
  ];
  for (const s of superficies) {
    for (const t of textos) {
      const r = contraste(T[t], T[s]);
      assert.ok(r >= 4.5, `${t} (${T[t]}) sobre ${s} (${T[s]}): ${r.toFixed(2)}:1 < 4,5:1`);
    }
  }
});

test('tema escuro: botões, abas, selos e ::selection cumprem WCAG AA (≥ 4,5:1)', () => {
  const sel = extrairBloco(css, /:root\[data-tema="escuro"\]\s*::selection\s*\{/);
  const bgSel = /background\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)/i.exec(sel);
  const fgSel = /color\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)/i.exec(sel);
  assert.ok(bgSel && fgSel, '::selection escuro usa variáveis de fundo e texto');
  assert.equal(bgSel[1], '--accent-soft');
  assert.equal(fgSel[1], '--fg');

  const pares = [
    [fgSel[1], bgSel[1], '::selection / botão pressionado'],
    ['--on-cta', '--cta', 'botão primário / aba ativa'],
    ['--on-cta', '--cta-hover', 'botão primário (hover)'],
    ['--on-accent', '--accent', 'sobre --accent'],
    ['--on-accent', '--accent-hover', 'sobre --accent-hover'],
    ['--on-accent', '--accent-strong', 'selo contador .fn / caixa marcada .bx'],
    ['--muted', '--raised', 'botão desativado']
  ];
  for (const [fg, bg, rotulo] of pares) {
    const r = contraste(T[fg], T[bg]);
    assert.ok(r >= 4.5, `${rotulo} (${fg} ${T[fg]} sobre ${bg} ${T[bg]}): ${r.toFixed(2)}:1 < 4,5:1`);
  }
});

test('tema escuro: contornos de campo, foco e barras cumprem WCAG AA gráfico (≥ 3:1)', () => {
  const paresGraficos = [
    ['--field-line', '--field'],
    ['--field-line', '--surface'],
    ['--field-line', '--raised'],
    ['--field-line', '--bg'],
    ['--line-hover', '--bg'],
    ['--line-hover', '--surface'],
    ['--line-hover', '--raised'],
    ['--accent', '--bg'],
    ['--accent', '--surface'],
    ['--accent', '--raised'],
    ['--accent', '--accent-soft']
  ];
  for (const [fg, bg] of paresGraficos) {
    const r = contraste(T[fg], T[bg]);
    assert.ok(r >= 3, `${fg} (${T[fg]}) sobre ${bg} (${T[bg]}): ${r.toFixed(2)}:1 < 3:1`);
  }
});

test('tema escuro: as 8 categorias e "outros" têm ≥ 3:1 sobre --surface e --raised e são distinguíveis em daltonismo', () => {
  const cats = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8'];
  const todas = [...cats, '--other'];

  for (const c of todas) {
    for (const s of ['--surface', '--raised', '--bg']) {
      const r = contraste(T[c], T[s]);
      assert.ok(r >= 3, `${c} (${T[c]}) sobre ${s} (${T[s]}): ${r.toFixed(2)}:1 < 3:1`);
    }
  }

  // Categorias vizinhas na pilha (--c1 a --c8): bem separadas em visão comum, protanopia e deuteranopia
  for (let i = 0; i < cats.length - 1; i++) {
    const a = hexRgb(T[cats[i]]), b = hexRgb(T[cats[i + 1]]);
    for (const [visao, minE00, minE76] of [[null, 15, 25], ['protanopia', 15, 25], ['deuteranopia', 15, 25]]) {
      const ca = simularDaltonismo(a, visao), cb = simularDaltonismo(b, visao);
      const e00 = deltaE00(ca, cb), e76 = deltaE76(ca, cb);
      const nome = `${cats[i]}×${cats[i + 1]} (${visao || 'visão comum'})`;
      assert.ok(e00 >= minE00, `${nome}: CIEDE2000 ${e00.toFixed(2)} < ${minE00}`);
      assert.ok(e76 >= minE76, `${nome}: CIE76 ${e76.toFixed(2)} < ${minE76}`);
    }
  }

  // Todos os 36 pares entre as 8 categorias e --other: nenhum par colapsa, inclusive sob protanopia e deuteranopia
  for (let i = 0; i < todas.length; i++) {
    for (let j = i + 1; j < todas.length; j++) {
      const a = hexRgb(T[todas[i]]), b = hexRgb(T[todas[j]]);
      for (const [visao, minE00, minE76] of [[null, 19, 30], ['protanopia', 11, 14], ['deuteranopia', 11, 14]]) {
        const ca = simularDaltonismo(a, visao), cb = simularDaltonismo(b, visao);
        const e00 = deltaE00(ca, cb), e76 = deltaE76(ca, cb);
        const nome = `${todas[i]}×${todas[j]} (${visao || 'visão comum'})`;
        assert.ok(e00 >= minE00, `${nome}: CIEDE2000 ${e00.toFixed(2)} < ${minE00}`);
        assert.ok(e76 >= minE76, `${nome}: CIE76 ${e76.toFixed(2)} < ${minE76}`);
      }
    }
  }
});

test('prévia estática (docs/paleta-escura-previa.html): data-tema="escuro", CSP igual à do painel e sem inline proibido', () => {
  const html = ler('docs/paleta-escura-previa.html');
  const indexHtml = ler('index.html');
  const cspIndex = /<meta http-equiv="Content-Security-Policy" content="[^"]+">/.exec(indexHtml)[0];

  assert.match(html, /<html\b[^>]*\bdata-tema="escuro"[^>]*>/);
  const metas = [...html.matchAll(/<meta [^>]*>/g)].map(m => m[0]);
  assert.equal(metas[0], '<meta charset="utf-8">');
  assert.equal(metas[1], cspIndex, 'mesma política CSP do index.html');
  assert.equal(metas[2], '<meta name="referrer" content="no-referrer">');
  assert.match(html, /<link rel="stylesheet" href="\.\.\/styles\.css">/);
  assert.doesNotMatch(html, /<script\b/i, 'página estática, sem script');
  assert.doesNotMatch(html, /<style\b/i, 'sem bloco <style> inline');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'sem atributo on…=');
  assert.doesNotMatch(html, /(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i, 'nenhum endereço externo');
});
