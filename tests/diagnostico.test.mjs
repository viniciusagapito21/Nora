import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonteColunas = readFileSync(new URL('../parsers/colunas.js', import.meta.url), 'utf8');
const fonteDiagnostico = readFileSync(new URL('../parsers/diagnostico.js', import.meta.url), 'utf8');
const contexto = {};
vm.runInNewContext(fonteColunas, contexto, { filename: 'parsers/colunas.js' });
vm.runInNewContext(fonteDiagnostico, contexto, { filename: 'parsers/diagnostico.js' });
const gerar = contexto.NORA_DIAGNOSTICO.gerar;
const opcoes = { versaoApp: '1.2.3', extensao: '.csv', leitorTentado: 'generico' };

const csvComMarcadores = [
  'Date;Description;Debit;Credit;Balance;Account holder;IBAN;Email;Phone',
  '14/02/2026;Mercado Central;6.780,06;;9.876,54;MARIA SILVA INVENTADA;IE00FAKE12345678901234;maria.inventada@example.test;+353-87-123-4567',
  '15/02/2026;Loja Aurora;0,10;;9.876,64;MARIA SILVA INVENTADA;IE00FAKE12345678901234;maria.inventada@example.test;+353-87-123-4567',
].join('\n');

test('gera texto curto e anônimo sem nomes, identificadores, descrições ou valores inventados', () => {
  const resultado = gerar({ texto: '\uFEFF' + csvComMarcadores }, opcoes);
  assert.match(resultado, /^Diagnóstico anônimo do Nora — nenhum valor, nome ou descrição do seu extrato está neste texto\./);
  assert.match(resultado, /Versão do app: 1\.2\.3/);
  assert.match(resultado, /Extensão: \.csv/);
  assert.match(resultado, /Leitor tentado: genérico/);
  assert.match(resultado, /Arquivo: 3 linhas, 9 colunas; separador: ponto e vírgula\./);
  assert.match(resultado, /- Data: 99\/99\/9999/);
  assert.match(resultado, /- Descrição: AAAAAAA AAAAAAA/);
  assert.match(resultado, /- Débito: 9\.999,99/);
  assert.match(resultado, /- Saldo: 9\.999,99/);

  for (const marcador of [
    'MARIA SILVA INVENTADA', 'IE00FAKE12345678901234', 'maria.inventada@example.test', '+353-87-123-4567',
    'Mercado Central', 'Loja Aurora', '6.780,06', '9.876,54', '9.876,64', '678006', '987654',
  ]) assert.ok(!resultado.includes(marcador), `o diagnóstico não deve conter ${marcador}`);

  const formas = resultado.split('\n').filter(linha => linha.startsWith('- ')).map(linha => linha.slice(linha.indexOf(':') + 2));
  for (const forma of formas) assert.doesNotMatch(forma, /[0-8]/, 'a amostra mascara todo dígito do arquivo');
  assert.match(resultado, /- coluna 6 \(texto\): AAAAA AAAAA AAAAAAAAA/);
  assert.match(resultado, /- coluna 7 \(texto\): AA99AAAA9…9/);
  assert.match(resultado, /- coluna 8 \(texto\): AAAAA\.AAAAAAAAA@AAAAAAA\.AAAA/);
});

test('mascara letras e dígitos, preserva sinais e encurta sequências longas', () => {
  const diagnostico = gerar([
    ['Data', 'Descrição', 'Valor', 'Observação'],
    ['15/01/2025', 'Mercado Central', '-1.234,56 EUR', 'abcdefghijklmnop 123456789012345'],
  ], opcoes);
  assert.match(diagnostico, /- Data: 99\/99\/9999/);
  assert.match(diagnostico, /- Descrição: AAAAAAA AAAAAAA/);
  assert.match(diagnostico, /- Valor: -9\.999,99 AAA/);
  assert.match(diagnostico, /A…A 9…9/);
  assert.doesNotMatch(diagnostico, /Mercado|Central|1\.234,56|EUR|abcdefghijklmnop/);
});

test('inclui aviso fixo do leitor, mas descarta aviso não confiável com conteúdo pessoal', () => {
  const linhas = [['Date', 'Description', 'Amount'], ['2026-02-14', 'Loja fictícia', '1.00']];
  const resultado = gerar({
    linhas,
    resultado: { relatorio: {
      colunasUsadas: { descricao: 'MARIA SILVA INVENTADA' },
      linhasIgnoradas: 0,
      avisos: [
        'Uma ou mais linhas foram ignoradas porque a data ou o valor não pôde ser interpretado.',
        '2 movimentos foram ignorados porque a data ou o valor não pôde ser lido.',
        'Aviso com IBAN IE00FAKE12345678901234 e maria.inventada@example.test',
      ],
    } },
  }, opcoes);
  assert.match(resultado, /Uma ou mais linhas foram ignoradas porque a data ou o valor não pôde ser interpretado\./);
  assert.match(resultado, /2 movimentos foram ignorados porque a data ou o valor não pôde ser lido\./);
  assert.doesNotMatch(resultado, /MARIA SILVA|IE00FAKE|maria\.inventada|Loja fictícia/);
});

test('entrada em texto, array de linhas CSV com BOM e chamada repetida são determinísticas', () => {
  const texto = '\uFEFFDate,Description,Amount\n2026-02-14,Compra inventada,0.10';
  const esperado = gerar(texto, opcoes);
  assert.equal(gerar(texto.split('\n'), opcoes), esperado);
  assert.equal(gerar(texto, opcoes), esperado);
  assert.match(esperado, /separador: vírgula/);
  assert.match(esperado, /- Valor: 9\.99/);
});

test('entrada sem linhas e arquivo só com cabeçalho não incluem conteúdo nem amostras inventadas', () => {
  const vazio = gerar([], opcoes);
  assert.match(vazio, /Arquivo: 0 linhas, 0 colunas; separador: linhas de planilha\./);
  assert.match(vazio, /Avisos do leitor:\n- nenhum/);

  const soCabecalho = gerar({ texto: 'Date,Description,Amount,Account holder\n' }, opcoes);
  assert.match(soCabecalho, /Arquivo: 1 linhas, 4 colunas; separador: vírgula\./);
  assert.match(soCabecalho, /- Data: —/);
  assert.match(soCabecalho, /- coluna 4 \(vazia\): —/);
  assert.doesNotMatch(soCabecalho, /Account holder/);
});

test('coluna vazia recebe forma vazia e nomes fora dos sinônimos nunca são repetidos', () => {
  const resultado = gerar([
    ['Date', 'Description', 'Amount', 'Private contact'],
    ['2026-02-14', 'Loja inventada', '5.00 EUR', ''],
  ], opcoes);
  assert.match(resultado, /- coluna 4 \(vazia\): ∅/);
  assert.doesNotMatch(resultado, /Private contact|Loja inventada|5\.00 EUR/);
});
