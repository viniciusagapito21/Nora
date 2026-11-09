import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));
const saida = join(raiz, '..', 'dist');
const arquivos = [
  'index.html',
  'privacidade.html',
  'app.js',
  'styles.css',
  'privacidade.css',
  'logo.svg',
  'icon.svg',
];
const diretorios = ['fonts', 'rules', 'vendor'];
const arquivosParsersDist = ['revolut.js', 'btg.js', 'itau.js', 'ofx.js', 'colunas.js', 'generico.js', 'diagnostico.js', 'mt940.js', 'camt053.js'];

rmSync(saida, { recursive: true, force: true });
mkdirSync(saida, { recursive: true });

for (const arquivo of arquivos) {
  const origem = join(raiz, '..', arquivo);
  if (!existsSync(origem)) throw new Error(`Arquivo necessário para publicação ausente: ${arquivo}`);
  cpSync(origem, join(saida, arquivo));
}

for (const diretorio of diretorios) {
  const origem = join(raiz, '..', diretorio);
  if (!existsSync(origem)) throw new Error(`Diretório necessário para publicação ausente: ${diretorio}/`);
  cpSync(origem, join(saida, diretorio), { recursive: true });
}

const parsers = join(raiz, '..', 'parsers');
if (!existsSync(parsers)) throw new Error('Diretório necessário para publicação ausente: parsers/');
mkdirSync(join(saida, 'parsers'), { recursive: true });
for (const arquivo of arquivosParsersDist) {
  const origem = join(parsers, arquivo);
  if (!existsSync(origem)) throw new Error(`Arquivo necessário para publicação ausente: parsers/${arquivo}`);
  cpSync(origem, join(saida, 'parsers', arquivo));
}

for (const opcional of ['prefs.js', 'i18n.js', 'i18n', 'formato.js', 'painel-calculos.js']) {
  const origem = join(raiz, '..', opcional);
  if (existsSync(origem)) cpSync(origem, join(saida, opcional), { recursive: true });
}

const cabecalhos = join(raiz, '..', 'publicar', '_headers');
if (!existsSync(cabecalhos)) throw new Error('Arquivo necessário para publicação ausente: publicar/_headers');
cpSync(cabecalhos, join(saida, '_headers'));

console.log('Publicação pronta em dist/.');
