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

// área: em observação (dívidas); o texto esperado é o que o código antigo montava, com os mesmos valores
const POS = ' (posição de 20/10)';
const OBS = [
  ['tth', 'obs.titulo', undefined, 'Em observação'],
  ['tth', 'obs.subtitulo', undefined, 'pagamentos para fazer'],
  ['tth', 'obs.vazio', undefined, 'Nenhum pagamento em observação.'],
  ['tt', 'obs.venceHoje', undefined, 'vence hoje'],
  ['tt', 'obs.venceAmanha', undefined, 'vence amanhã'],
  ['tt', 'obs.venceEm', { n: 2 }, 'vence em 2 dias'],
  ['tt', 'obs.venceEm', { n: 30 }, 'vence em 30 dias'],
  ['tt', 'obs.venceuOntem', undefined, 'venceu ontem'],
  ['tt', 'obs.venceuHa', { n: 2 }, 'venceu há 2 dias'],
  ['tth', 'obs.vencimentoData', { quando: 'vence hoje', data: '22 de outubro de 2026' }, 'vence hoje, 22 de outubro de 2026'],
  ['tth', 'obs.anotadaEm', { data: '1 de outubro de 2026' }, 'anotada em 1 de outubro de 2026'],
  ['tth', 'obs.pagoEmMoeda', { moeda: 'euro' }, 'pago em euro, sem câmbio'],
  ['tth', 'obs.reservarComMargem', { valor: '€ 1.030', margem: '2,5' }, 'reservar € 1.030 com 2,5% de margem'],
  ['tth', 'obs.definaCambio', { moeda: 'BRL' }, 'defina o câmbio de BRL abaixo'],
  ['tth', 'obs.marcarPaga', { nome: 'Escola "A" & <B>' }, 'Marcar Escola &quot;A&quot; &amp; &lt;B&gt; como paga'],
  ['tth', 'obs.paguei', undefined, 'Paguei'],
  ['tth', 'comum.removerNome', { nome: 'Banco' }, 'Remover Banco'],
  ['tth', 'comum.remover', undefined, 'Remover'],
  ['tth', 'comum.total', undefined, 'Total'],
  ['tth', 'obs.valorEmMoeda', { valor: '€ 3.700', moeda: 'euro' }, '€ 3.700 em euro'],
  ['tth', 'obs.reservar', { valor: '€ 3.800' }, 'reservar € 3.800'],
  ['tt', 'obs.posicao', { data: '20/10' }, '(posição de 20/10)'],
  ['tth', 'obs.saldoCobre', { saldo: '€ 5.000', pos: POS }, 'O saldo da conta (€ 5.000) já cobre o valor reservado (posição de 20/10).'],
  ['tth', 'obs.saldoCobre', { saldo: '€ 5.000', pos: '' }, 'O saldo da conta (€ 5.000) já cobre o valor reservado.'],
  ['tth', 'obs.flexCobre', { saldo: '€ 1.000', falta: '€ 500', flex: '€ 900', pos: POS },
    'A conta tem € 1.000 e faltam € 500 para cobrir o valor reservado. O Flexible Cash (€ 900) cobre a diferença (posição de 20/10).'],
  ['tth', 'obs.contaEFlexFaltam', { saldo: '€ 1.000', flex: '€ 200', soma: '€ 1.200', falta: '€ 300', pos: '' },
    'A conta (€ 1.000) e o Flexible Cash (€ 200) somam € 1.200; ainda faltam € 300 para cobrir tudo.'],
  ['tth', 'obs.faltam', { saldo: '€ 1.000', falta: '€ 500', pos: POS }, 'A conta tem € 1.000; faltam € 500 para cobrir o valor reservado (posição de 20/10).'],
  ['tth', 'obs.definirCambio', { moedas: 'BRL, CHF' }, 'Definir câmbio (BRL, CHF)'],
  ['tth', 'obs.margem', undefined, 'Margem para taxa e câmbio (%)'],
  ['tth', 'obs.atualizarCambio', undefined, 'Atualizar câmbio'],
  ['tth', 'obs.adicionarPagamento', undefined, 'Adicionar pagamento'],
  ['tth', 'comum.nome', undefined, 'Nome'],
  ['tth', 'obs.exNome', undefined, 'Ex.: banco ou escola'],
  ['tth', 'comum.valor', undefined, 'Valor'],
  ['tth', 'comum.moeda', undefined, 'Moeda'],
  ['tth', 'obs.outraMoeda', undefined, 'Outra…'],
  ['tth', 'obs.codigoMoeda', undefined, 'Código da moeda'],
  ['tth', 'obs.exCodigo', undefined, 'Ex.: CHF'],
  ['tth', 'obs.vencimentoOpcional', undefined, 'Vencimento (opcional)'],
  ['tth', 'obs.descricaoOpcional', undefined, 'Descrição (opcional)'],
  ['tth', 'obs.exDescricao', undefined, 'Ex.: Parcela 4/5'],
  ['tth', 'comum.adicionar', undefined, 'Adicionar'],
  ['tth', 'obs.pagas', { n: 3 }, 'Pagas (3)'],
  ['tth', 'obs.pagaEm', { data: '2 de outubro de 2026' }, 'paga em 2 de outubro de 2026'],
];

for (const [area, casos] of Object.entries({ 'index.html e dicas do gráfico': DICAS, 'em observação': OBS }))
  test(`frases de referência em pt-BR: ${area}`, () => {
    for (const [f, k, vars, esperado] of casos) assert.equal(f === 'tth' ? I.th(k, vars) : I.t(k, vars), esperado, `${k} ${JSON.stringify(vars)}`);
    assert.deepEqual([...I.faltando], []);
  });
