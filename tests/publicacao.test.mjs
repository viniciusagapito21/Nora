import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');

execFileSync(process.execPath, ['scripts/publicar.mjs'], { cwd: raiz, stdio: 'pipe' });

test('dist publica _headers e index.html na raiz', () => {
  assert.ok(existsSync(join(dist, '_headers')));
  assert.ok(existsSync(join(dist, 'index.html')));
  assert.ok(!existsSync(join(dist, 'parsers', '_modelo.js')), 'o leitor modelo não deve ser publicado');
});

test('dist não inclui arquivos de desenvolvimento nem dados locais', () => {
  const proibidos = ['tests', 'scripts', 'docs', 'CLAUDE.md', 'AGENTS.md', 'node_modules', 'capturas', 'telas', 'exemplo'];
  for (const item of proibidos) assert.ok(!existsSync(join(dist, item)), `${item} não deve estar em dist/`);

  const esperados = ['_headers', 'app.js', 'fonts', 'icon.svg', 'index.html', 'logo.svg', 'parsers', 'privacidade.css', 'privacidade.html', 'rules', 'styles.css', 'vendor'];
  for (const opcional of ['prefs.js', 'i18n']) {
    if (existsSync(join(raiz, opcional))) esperados.push(opcional);
  }
  assert.deepEqual(readdirSync(dist).sort(), esperados.sort(), 'dist contém apenas os arquivos e diretórios de publicação');
});

test('referências locais de HTML e CSS publicadas existem em dist', () => {
  const fontes = ['index.html', 'privacidade.html', 'styles.css'];
  const referencias = [];
  for (const fonte of fontes) {
    const conteudo = readFileSync(join(raiz, fonte), 'utf8');
    const atributos = /\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi;
    const urlsCss = /url\(\s*(?:(["'])(.*?)\1|([^)'"\s]+))\s*\)/gi;
    for (const m of conteudo.matchAll(atributos)) referencias.push([fonte, m[2]]);
    if (fonte.endsWith('.css')) {
      for (const m of conteudo.matchAll(urlsCss)) referencias.push([fonte, m[2] ?? m[3]]);
    }
  }

  for (const [fonte, url] of referencias) {
    if (!url || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) continue;
    const resolvida = new URL(url, `https://nora.invalid/${fonte}`);
    if (resolvida.origin !== 'https://nora.invalid') continue;
    const relativo = decodeURIComponent(resolvida.pathname.slice(1));
    const caminho = posix.normalize(posix.join(posix.dirname(fonte), relativo));
    assert.ok(caminho !== '..' && !caminho.startsWith('../'), `${fonte} aponta para fora do site: ${url}`);
    assert.ok(existsSync(join(dist, caminho)), `${fonte} referencia ${url}, ausente em dist/${caminho}`);
  }
});
