// Porta dos servidores locais (scripts/porta.mjs): dois servidores ao mesmo tempo não brigam pela mesma porta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { portaLivre, lerPorta, primeiraLivre, escolherPorta } from '../scripts/porta.mjs';

const H = '127.0.0.1';
const ocupar = porta => new Promise((r, f) => { const s = createServer(); s.once('error', f); s.listen(porta, H, () => r(s)); });
const fechar = s => new Promise(r => s.close(r));

test('porta ocupada não está livre; depois de fechar, está', async () => {
  const s = await ocupar(0), p = s.address().port;
  assert.equal(await portaLivre(p, H), false);
  await fechar(s);
  assert.equal(await portaLivre(p, H), true);
});

test('sem variável: pula a porta ocupada e pega a seguinte livre', async () => {
  const s = await ocupar(0), p = s.address().port;
  try {
    const escolhida = await escolherPorta({ env: {}, nome: 'PORTA', inicio: p, host: H });
    assert.ok(escolhida > p, `devia passar da ${p}, veio ${escolhida}`);
    assert.equal(await portaLivre(escolhida, H), true);
  } finally { await fechar(s); }
});

test('sem variável e porta inicial livre: usa a própria porta inicial', async () => {
  const s = await ocupar(0), p = s.address().port;
  await fechar(s);
  assert.equal(await primeiraLivre(p, H), p);
});

test('dois servidores: o segundo não recebe a porta do primeiro', async () => {
  const p1 = await escolherPorta({ env: {}, nome: 'PORTA', inicio: 3000, host: H });
  const s1 = await ocupar(p1);
  try {
    const p2 = await escolherPorta({ env: {}, nome: 'PORTA', inicio: 3000, host: H });
    assert.notEqual(p2, p1);
  } finally { await fechar(s1); }
});

test('com variável: usa exatamente essa porta, ou para se estiver ocupada', async () => {
  const s = await ocupar(0), p = s.address().port;
  await assert.rejects(escolherPorta({ env: { PORTA: String(p) }, nome: 'PORTA', inicio: 3000, host: H }), /ocupada/);
  await fechar(s);
  assert.equal(await escolherPorta({ env: { PORTA: String(p) }, nome: 'PORTA', inicio: 3000, host: H }), p);
});

test('variável vazia vale como ausente; valor inválido é recusado', async () => {
  assert.equal(typeof await escolherPorta({ env: { PORTA_TELAS: '' }, nome: 'PORTA_TELAS', inicio: 0, host: H }), 'number');
  for (const v of ['abc', '3000x', '-1', '0', '70000', '30.5']) assert.throws(() => lerPorta(v, 'PORTA'), /PORTA/, v);
  assert.equal(lerPorta(' 4100 ', 'PORTA'), 4100);
});

test('package.json: npm start passa pela escolha de porta', async () => {
  const { readFileSync } = await import('node:fs');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.start, 'node scripts/servir.mjs');
  assert.match(readFileSync(new URL('../scripts/servir.mjs', import.meta.url), 'utf8'), /escolherPorta\(\{ nome: 'PORTA', inicio: 3000 \}\)/);
  assert.match(readFileSync(new URL('../scripts/telas.mjs', import.meta.url), 'utf8'), /escolherPorta\(\{ nome: 'PORTA_TELAS'/);
});
