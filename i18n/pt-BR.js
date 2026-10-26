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
  'importar.meses': { one: '{n} mês', other: '{n} meses' },
  /* nomes padrão que ficam gravados nos dados (passo c): o texto pt-BR é o que se grava; veja nomeExibido no app.js */
  'metas.padrao.reserva': 'Reserva de emergência',
  'metas.padrao.invest': 'Investimentos',
  'metas.padrao.viagens': 'Viagens pequenas',
  'metas.padrao.viagem': 'Viagem grande do ano',
  'cats.brasil.antigo': 'Contas no Brasil',
  /* passo d: palavras repetidas em várias áreas */
  'comum.gastou': 'Gastou',
  'comum.entrou': 'Entrou',
  /* passo d: index.html */
  'casca.carregando': 'Carregando…',
  'casca.financas': 'Finanças',
  /* passo d: dicas do gráfico */
  'dica.mesEmAndamento': '{mes} · em andamento'
};
