import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raiz = new URL('../', import.meta.url);
const ler = caminho => readFileSync(new URL(caminho, raiz), 'utf8');

function diretivas(csp) {
  return new Map(csp.split(';').map(parte => {
    const [nome, ...valores] = parte.trim().split(/\s+/);
    return [nome, valores.join(' ')];
  }));
}

test('cabeçalho HTTP publica a CSP do painel, diretiva por diretiva', () => {
  const html = ler('index.html');
  const meta = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  assert.ok(meta, 'a CSP da meta existe no index.html');

  const cabecalhos = ler('publicar/_headers');
  const regra = cabecalhos.match(/^\/\*\s*\n([\s\S]*?)(?=^\S|$(?![\s\S]))/m)?.[1];
  assert.ok(regra, 'existe uma regra global no formato de Cloudflare Pages e Netlify');
  const cspLinha = regra.split(/\r?\n/).find(linha => /^\s*Content-Security-Policy:/i.test(linha));
  assert.ok(cspLinha, 'o cabeçalho Content-Security-Policy está presente');

  const esperadas = diretivas(meta[1]);
  const publicadas = diretivas(cspLinha.replace(/^\s*Content-Security-Policy:\s*/i, ''));
  assert.equal(publicadas.size, esperadas.size + 1, 'só pode haver a diretiva adicional que a meta não aceita');
  for (const [nome, valor] of esperadas) {
    assert.equal(publicadas.get(nome), valor, `diretiva ${nome} igual à política da meta`);
  }
  assert.equal(publicadas.get('frame-ancestors'), "'none'", 'a única diretiva extra é frame-ancestors');
  assert.deepEqual([...publicadas.keys()].filter(nome => !esperadas.has(nome)), ['frame-ancestors']);
});

test('cabeçalhos complementares de privacidade e permissões estão publicados', () => {
  const cabecalhos = ler('publicar/_headers');
  assert.match(cabecalhos, /^\s+Referrer-Policy:\s*no-referrer\s*$/mi);
  assert.match(cabecalhos, /^\s+X-Content-Type-Options:\s*nosniff\s*$/mi);
  assert.match(cabecalhos, /^\s+Permissions-Policy:\s*camera=\(\),\s*microphone=\(\),\s*geolocation=\(\)\s*$/mi);
});
