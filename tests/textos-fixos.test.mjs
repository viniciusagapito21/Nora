// Passo d da Fase 3: nenhum texto visível fora dos dicionários nas áreas já extraídas, e dicionários limpos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { pedacosVisiveis, textosDoApp } from './textos-visiveis.mjs';

const ler = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const appJs = ler('app.js'), indexHtml = ler('index.html');
const ctx = {}; vm.createContext(ctx);
['i18n/pt-BR.js', 'i18n/en-GB.js'].forEach(f => vm.runInContext(ler(f), ctx));
const D = JSON.parse(JSON.stringify(vm.runInContext('NORA_DICIONARIOS', ctx)));

// funções do app.js cujas áreas já foram extraídas: cresce a cada commit do passo d; no fim, o arquivo todo
const AREAS_FEITAS = {
  'dicas do gráfico': ['tipHtml', 'showTip', 'placeTip', 'hideTip'],
  'em observação': ['vencTxt', 'divState', 'divMut', 'dividas'],
  'casca e abas': ['header', 'avisoEspaco', 'abas', 'notaResumo', 'emResumo', 'emptyState', 'render', 'start', 'cartao', 'variasCarteiras', 'origem', 'cartAtual', 'bancoAtual', 'nomeBanco', 'rotularArquivos', 'genericoTxt'],
  'saldo e caixa': ['dayN', 'balSeries', 'avgBal', 'cashSummary', 'perguntaSaldo', 'mudarCarteira', 'cashBridge', 'drawBal', 'origensMeta', 'deOrigemMeta'],
  'revisão de categorias e Pix': ['merchants', 'entradas', 'nomeEntrada', 'optionsEntrada', 'effNome', 'optionsFor', 'revList', 'pixTitularBloco', 'salvarPixTitular', 'review'],
  // (eventos) = o código de topo depois das funções (cliques, envios de formulário), como o analisador o chama
  'mensagens': ['(eventos)', 'localSave', 'enqueue'],
  'painel': ['kpis', 'niceStep', 'chart', 'catPanel', 'tagOf', 'filterMatch', 'movPanel', 'table', 'dl', 'fraseMovido', 'notaEnvios'],
  'metas, previsão e poupança': ['metaDefinida', 'pouparDefinido', 'enviosMovidos', 'planCat', 'planPoupar', 'catPor', 'catNome', 'planTotal', 'metaCampo', 'metasCampos', 'lerMeta', 'lerMetas',
    'metasPoupanca', 'nomeMeta', 'pct', 'listaE', 'goalCfg', 'goalHas', 'refMonth', 'mesesAte', 'mesAno', 'addMonth', 'metasPoup', 'previsao', 'aluguelSugerido', 'perguntaAluguel', 'perguntaEnvios',
    'recorrentes', 'vbars', 'enviosBrasil', 'taxaPoup', 'statusPrevisao', 'pendNum', 'pendFrase', 'pendBotao'],
  'configurações: carteiras, países, moedas e câmbio': ['camposCambio', 'lerCambios', 'resumoCambio', 'opcoesPais', 'notaRegrasPais', 'configurado', 'temRegras', 'suportado',
    'nomePais', 'avisoSuporte', 'opcoes', 'opcoesMoeda', 'carteirasCampos', 'lerCarteira', 'telaExcluirCarteira', 'bancosTela'],
  'configurações: formulário, categorias e seus dados': ['setup', 'categoriasCampos', 'lerCategorias', 'baixar', 'baixarBackup', 'baixarCopiaIlegivel', 'lerBackup', 'resumoTxt',
    'temDados', 'secaoDados', 'telaRestaurar', 'telaApagar', 'telaBloqueio'],
  'importação: prévia e resultado': ['previaSaldo', 'textoBotao', 'confirmarImportacao'],
  'importação: leitura, erros e avisos': ['handleFiles', 'mudarImportacao', 'abrirGenerico', 'comLeitor', 'linhasDoArquivo', 'abrirPdf', 'carregarPdfjs', 'confSaldo', 'avisoLeitor'],
  'importação: escolha de colunas': ['telaImportar', 'motivoIgnorada', 'carregarLeitorPlanilhas', 'opSaldo', 'nomeFmtData', 'nomeFmtNum', 'separadoresTela', 'nomeColuna', 'opColunas', 'radios', 'celulas',
    'ancoraDigitada', 'saldoNovo', 'podeSalvar', 'digitouAncora'],
  // Resumo e transferências em três partes (11a, 11b, 11c)
  'Resumo': ['fW', 'trecho', 'moedasConvertidas', 'avisoCambioResumo', 'saldoCarteiras', 'mesesResumo', 'avisoCobertura', 'tabelaPorCarteira', 'categoriasResumo',
    'mesResumoTela', 'envResumo', 'previsaoResumoTela', 'cambioResumo', 'telaResumo'],
  'transferências entre carteiras': ['valorMov', 'difPar', 'ladoPar', 'parTela', 'confirmadasTela', 'semCambioTransf', 'transfSecao', 'transfBloco', 'mudarTransf', 'parPorChave'],
  'Resumo: fora das somas e escolha da carteira': ['foraDasSomas', 'escolherTela', 'sugerirCarteira'],
};
// textos que aparecem na tela e não se traduzem (ou que o analisador confunde), sempre com o motivo
const PERMITIDOS = {
  'Nora': 'nome do produto',
  'Revolut': 'nome de banco',
  'Flexible Cash': 'nome de um produto do Revolut',
  'Pix': 'nome do sistema de pagamento do Brasil',
  'março': 'nome do mês na lista MES do app.js: os formatos de data mudam no passo e (formato.js)',
  'Escape': 'nome da tecla (e.key), não é texto da tela',
  '0 0;background:': 'CSS do gráfico (flex: … 0 0;background: …), não é texto da tela',
  'informado por você': 'valor gravado nos dados (cambios[moeda].fonte, em lerCambios), não é texto da tela',
  'Latin-1 (Windows)': 'nome técnico da codificação no seletor da importação, igual nos dois idiomas',
};
// chaves que ainda não têm uso no código, com o motivo
const RESERVADAS = {
  'tema.rotulo': 'seletor de tema (passo g)', 'tema.auto': 'seletor de tema (passo g)', 'tema.claro': 'seletor de tema (passo g)', 'tema.escuro': 'seletor de tema (passo g)',
  'idioma.rotulo': 'seletor de idioma (passo f)', 'idioma.auto': 'seletor de idioma (passo f)', 'idioma.pt-BR': 'seletor de idioma (passo f)', 'idioma.en-GB': 'seletor de idioma (passo f)',
};

test('o analisador separa texto de tela de código', () => {
  const v = s => pedacosVisiveis(s).map(p => p.texto);
  assert.deepEqual(v('<h2>Resumo</h2>'), ['Resumo']);
  assert.deepEqual(v('<button class="btn sm" type="button" data-fin-add>Adicionar extrato</button>'), ['Adicionar extrato']);
  assert.deepEqual(v('<input placeholder="ex.: Wise libras" id="fin-x">'), ['ex.: Wise libras']);
  assert.deepEqual(v(' movimentações em '), ['movimentações em']);
  assert.deepEqual(v('fin-k-'), []); assert.deepEqual(v('#fin-tip'), []); assert.deepEqual(v('abas.resumo'), []);
  assert.deepEqual(v('cortex-financas.v4'), []); assert.deepEqual(v('0 3px,color-mix(in srgb'), []);
  assert.deepEqual(v('-nome" type="text" autocomplete="off" maxlength="40" value="'), []);
  assert.deepEqual(v('-x <b>Nome</b>'), ['Nome']);
  assert.deepEqual(v('<td data-l="Meses">'), ['Meses']); assert.deepEqual(v('<td data-label="x" data-title="Ab">'), []);
});

test('áreas já extraídas: nenhum texto visível fora do dicionário', () => {
  const funcoes = new Set(Object.values(AREAS_FEITAS).flat());
  const sobra = textosDoApp(appJs).filter(x => funcoes.has(x.funcao) && !(x.texto in PERMITIDOS));
  assert.deepEqual(sobra.map(x => `app.js:${x.linha} (${x.funcao}) "${x.texto}"`), [],
    'texto visível novo: ponha numa chave dos dois dicionários e use tt()/tth(), ou explique em PERMITIDOS');
});

// erros com código: erroCod('codigo', …) no app.js (núcleo e tela) e nos leitores precisa de 'erro.codigo' nos dois dicionários
const CODIGOS_ERRO = /\berroCod\(\s*'([^']+)'/g;
test('todo código de erro usado existe nos dois dicionários', () => {
  assert.deepEqual([...("erroCod('mesRuim', { m: m }, 'x'); erroCod( 'b', {})").matchAll(CODIGOS_ERRO)].map(m => m[1]), ['mesRuim', 'b'], 'autoteste da busca');
  const fontes = ['app.js', 'parsers/revolut.js', 'parsers/btg.js', 'parsers/itau.js'].map(ler).join('\n');
  const usados = [...new Set([...fontes.matchAll(CODIGOS_ERRO)].map(m => m[1]))];
  for (const c of usados) for (const idi of ['pt-BR', 'en-GB']) assert.ok(('erro.' + c) in D[idi], `erro.${c} falta em ${idi}`);
});

// núcleo (passo d, parte 12): erro que chega à tela nasce por erroCod; cada grupo pronto sai de NUCLEO_PENDENTE
const NUCLEO_COM_CODIGO = {
  'A1, dados salvos e backup': ['checarMeses', 'migrarAteV3', 'checarPeriodos', 'checarTransf', 'checarPixTitular', 'checarImportacao', 'checarCambios', 'validarV4', 'migrate', 'lerSalvo'],
  'A2, carteiras e categorias': ['criarCategoria', 'nomeCarteira', 'conferirMoeda', 'conferirBanco', 'novaCarteira', 'editarCarteira'],
  'A3, leitura de arquivo': ['decodificar', 'linhasDaAba', 'lerPlanilha', 'lerPdf'],
  'A4, internos': ['paraV3', 'acharCarteira', 'excluirCarteira', 'confirmarTransferencia'],
};
const NUCLEO_PENDENTE = {
};
// { função do núcleo: quantos new Error( crus ela tem } (erroCod, que cria o Error, fica de fora)
function errosCrusDoNucleo(fonte) {
  const linhas = fonte.slice(0, fonte.indexOf('/*CORE-END*/')).split('\n'), o = {};
  let f = '(topo)';
  for (const l of linhas) {
    const m = l.match(/^ {2}function ([A-Za-z0-9_]+)\(/); if (m) f = m[1];
    if (/new Error\(/.test(l) && f !== 'erroCod') o[f] = (o[f] || 0) + (l.match(/new Error\(/g) || []).length;
  }
  return o;
}
test('núcleo: os grupos prontos só lançam erroCod; new Error cru só nos grupos pendentes', () => {
  assert.deepEqual(errosCrusDoNucleo("  /*CORE-START*/\n  function a() {\n    throw new Error('x');\n  }\n  function erroCod() { return new Error(1); }\n  /*CORE-END*/"), { a: 1 }, 'autoteste');
  const crus = errosCrusDoNucleo(appJs), prontas = new Set(Object.values(NUCLEO_COM_CODIGO).flat()), pendentes = new Set(Object.values(NUCLEO_PENDENTE).flat());
  for (const f of prontas) assert.ok(!crus[f], `${f} ainda tem new Error cru: use erroCod(código, vars, frase pt-BR)`);
  assert.deepEqual(Object.keys(crus).filter(f => !pendentes.has(f)), [], 'new Error cru fora dos grupos pendentes: use erroCod');
  for (const f of prontas) assert.ok(new RegExp('function ' + f + '\\(').test(appJs), `${f} não existe mais no app.js`);
});

test('nada de t(\'…\') no app.js (o parâmetro t esconde a tradução): use tt ou tth', () => {
  const ruins = appJs.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /(^|[^\w.$])t\(\s*['"]/.test(l));
  assert.deepEqual(ruins.map(([n]) => n), []);
});

test('toda chave usada no app.js e no index.html existe nos dois dicionários; nenhuma sobra sem motivo', () => {
  const usadas = new Set([
    ...[...appJs.matchAll(/\btth?\(\s*'([^']+)'/g)].map(m => m[1]),
    ...[...indexHtml.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g)].map(m => m[1]),
  ]);
  for (const k of usadas) for (const idi of ['pt-BR', 'en-GB']) assert.ok(k in D[idi], `${k} falta em ${idi}`);
  // chave citada como texto no app.js (ex.: a tabela NOMES_PADRAO) também conta como uso
  // e a chave erro.<codigo> conta como usada quando o código aparece num erroCod('<codigo>', …)
  const citada = k => usadas.has(k) || appJs.includes(`'${k}'`) || (k.startsWith('erro.') && appJs.includes(`erroCod('${k.slice(5)}'`));
  const semUso = Object.keys(D['pt-BR']).filter(k => !citada(k) && !(k in RESERVADAS));
  assert.deepEqual(semUso, [], 'chave sem uso: use, apague ou ponha em RESERVADAS com o motivo');
  for (const k of Object.keys(RESERVADAS)) assert.ok(k in D['pt-BR'], `RESERVADAS cita ${k}, que não existe`);
});

test('dicionários: sem tag, sem entidade, sem espaço nas pontas, em NFC', () => {
  for (const idi of ['pt-BR', 'en-GB']) for (const [k, v] of Object.entries(D[idi])) {
    for (const s of typeof v === 'string' ? [v] : Object.values(v)) {
      assert.doesNotMatch(s, /[<>]/, `${idi} ${k}: sem HTML (a marcação entra por cru() na variável)`);
      assert.doesNotMatch(s, /&/, `${idi} ${k}: sem entidade (escreva o caractere)`);
      assert.equal(s, s.trim(), `${idi} ${k}: espaço nas pontas (junte a frase inteira numa chave)`);
      assert.equal(s, s.normalize('NFC'), `${idi} ${k}: não está em NFC`);
    }
  }
});

test('PERMITIDOS e AREAS_FEITAS sempre com motivo e funções que existem', () => {
  for (const [t, m] of Object.entries(PERMITIDOS)) assert.ok(m.trim(), t);
  for (const f of Object.values(AREAS_FEITAS).flat().filter(f => f !== '(eventos)')) assert.match(appJs, new RegExp(`\\n  function ${f}\\(`), `função ${f} não existe`);
});

test('index.html: todo texto e aria-label do <body> tem data-i18n (o <title> "Nora" é o nome do produto)', () => {
  const corpo = indexHtml.slice(indexHtml.indexOf('<body>'));
  const semMarca = [];
  for (const m of corpo.matchAll(/<(\w+)([^>]*)>([^<]*)/g)) {
    const [, tag, atrs, texto] = m;
    if (/[A-Za-zÀ-ÿ]{2,}/.test(texto) && tag !== 'script' && !(texto.trim() in PERMITIDOS) && !/\bdata-i18n="/.test(atrs)) semMarca.push(`<${tag}> "${texto.trim()}"`);
    if (/\baria-label="/.test(atrs) && !/\bdata-i18n-aria-label="/.test(atrs)) semMarca.push(`<${tag}> aria-label`);
  }
  assert.deepEqual(semMarca, []);
  // o português fica no HTML e é o mesmo do dicionário
  for (const m of corpo.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) assert.equal(m[2], D['pt-BR'][m[1]], m[1]);
  for (const m of corpo.matchAll(/aria-label="([^"]+)" data-i18n-aria-label="([^"]+)"/g)) assert.equal(m[1], D['pt-BR'][m[2]], m[2]);
});

// texto de tela em constante de módulo ((módulo) no analisador): só os formatos que o passo e troca por NORA_FORMATO
const MODULO_PASSO_E = { 'março': 'MES', 'dólar': 'NOME_MOEDA', 'Euro (€)': 'MOEDAS', 'Real (R$)': 'MOEDAS', 'Libra (£)': 'MOEDAS', 'Dólar (US$)': 'MOEDAS' };
test('constantes de módulo: nenhum texto de tela além dos formatos do passo e', () => {
  const t = textosDoApp(appJs).filter(x => x.funcao === '(módulo)' && !(x.texto in MODULO_PASSO_E));
  assert.deepEqual(t.map(x => `app.js:${x.linha} "${x.texto}"`), [], 'texto de tela numa constante de módulo: troque por uma função que chama tt() na hora');
  // autoteste: a constante depois de uma função é do módulo, não dessa função
  const src = '  /*CORE-END*/\n  function f() {\n    return 1;\n  }\n  var L = [\'Texto da tela\'];\n  function g() { return \'<b>Outro texto</b>\'; }';
  assert.deepEqual(textosDoApp(src).map(x => [x.funcao, x.texto]), [['(módulo)', 'Texto da tela'], ['g', 'Outro texto']]);
});

test('nenhuma tradução no nível de módulo do app.js: o texto ficaria no idioma do carregamento', () => {
  // nível de módulo = comandos no recuo base do IIFE (2 espaços) que não são declaração de função
  const ruins = appJs.split('\n').map((l, i) => [i + 1, l])
    .filter(([, l]) => /^ {2}[^ /*}]/.test(l) && !/^ {2}function /.test(l) && /(\btth?\(|(^|[^\w.$])t\()/.test(l));
  assert.deepEqual(ruins.map(([n, l]) => `app.js:${n} ${l.trim().slice(0, 60)}`), [],
    'troque a constante por uma função (ex.: genericoTxt()) ou ponha o texto dentro da renderização');
});
