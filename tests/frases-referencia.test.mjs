// Passo d da Fase 3: o português exato que cada trecho do app.js montava antes da extração, para as frases que nem
// toda tela mostra (estados raros, avisos, plurais). Cada caso: [função, chave, vars, texto esperado (o de antes)].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ler = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
function i18n() {
  const ctx = { Intl }; vm.createContext(ctx);
  for (const f of ['i18n/pt-BR.js', 'i18n/en-GB.js', 'i18n.js']) vm.runInContext(ler(f), ctx);
  return vm.runInContext('NORA_I18N', ctx);
}
const I = i18n();

// área: index.html e dicas do gráfico
const DICAS = [
  ['tt', 'casca.carregando', undefined, 'Carregando…'],
  ['tt', 'casca.financas', undefined, 'Finanças'],
  ['tth', 'dica.mesEmAndamento', { mes: 'outubro de 2026' }, 'outubro de 2026 · em andamento'],
  ['tth', 'dica.mesEmAndamento', { mes: 'a<b>' }, 'a&lt;b&gt; · em andamento'],
  ['tth', 'comum.gastou', undefined, 'Gastou'],
  ['tth', 'comum.entrou', undefined, 'Entrou'],
];

for (const [area, casos] of Object.entries({ 'index.html e dicas do gráfico': DICAS }))
  test(`frases de referência em pt-BR: ${area}`, () => {
    for (const [f, k, vars, esperado] of casos) assert.equal(f === 'tth' ? I.th(k, vars) : I.t(k, vars), esperado, `${k} ${JSON.stringify(vars)}`);
    assert.deepEqual([...I.faltando], []);
  });
