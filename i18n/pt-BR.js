/* Dicionário em português do Brasil: o idioma base (quando falta uma chave em outro idioma, vale esta).
   Chaves planas "area.item"; {nome} é trocado pelo valor em t(chave, { nome }); um valor { one, other } é plural,
   escolhido por Intl.PluralRules com vars.n. O en-GB tem exatamente as mesmas chaves e os mesmos {placeholders}. */
var NORA_DICIONARIOS = typeof NORA_DICIONARIOS !== 'undefined' ? NORA_DICIONARIOS : {};
NORA_DICIONARIOS['pt-BR'] = {
  'abas.rotulo': 'Carteiras',
  'abas.resumo': 'Resumo',
  'abas.abrir': 'Abrir {nome}',
  'tema.rotulo': 'Tema',
  'tema.auto': 'Automático',
  'tema.claro': 'Claro',
  'tema.escuro': 'Escuro',
  'idioma.rotulo': 'Idioma',
  'idioma.auto': 'Automático (do navegador)',
  'idioma.pt-BR': 'Português (Brasil)',
  'idioma.en-GB': 'English (UK)',
  'importar.adicionou': { one: 'Adicionei {n} movimentação em {meses}', other: 'Adicionei {n} movimentações em {meses}' },
  'importar.meses': { one: '{n} mês', other: '{n} meses' }
};
