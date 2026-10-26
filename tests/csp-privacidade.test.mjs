import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raiz = new URL('../', import.meta.url);
const ler = arquivo => readFileSync(new URL(arquivo, raiz), 'utf8');

function metaCsp(html, arquivo) {
  const metas = [...html.matchAll(/<meta\b([^>]*?)>/gi)];
  const meta = metas.find(([tag]) => /\bhttp-equiv\s*=\s*(["'])Content-Security-Policy\1/i.test(tag));
  assert.ok(meta, `${arquivo} tem meta CSP`);
  const csp = meta[0].match(/\bcontent\s*=\s*(["'])(.*?)\1/i);
  assert.ok(csp, `${arquivo} define o conteúdo da CSP`);
  return csp[2].split(';').map(parte => parte.trim().replace(/\s+/g, ' ')).filter(Boolean).sort();
}

test('privacidade.html usa as mesmas diretivas CSP de index.html', () => {
  assert.deepEqual(metaCsp(ler('privacidade.html'), 'privacidade.html'), metaCsp(ler('index.html'), 'index.html'));
});

test('privacidade.html não tem script inline nem atributo onclick', () => {
  const html = ler('privacidade.html');
  assert.doesNotMatch(html, /\bonclick\s*=/i);
  for (const [, atributos, corpo] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    assert.match(atributos, /\bsrc\s*=/i, 'scripts devem vir de arquivo');
    assert.equal(corpo.trim(), '', 'o corpo de um elemento script deve ficar vazio');
  }
  assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc\s*=)[^>]*\/?\s*>/i, 'scripts inline não são permitidos');
});
