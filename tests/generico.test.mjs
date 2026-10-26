import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonteColunas = readFileSync(new URL('../parsers/colunas.js', import.meta.url), 'utf8');
const fonteGenerico = readFileSync(new URL('../parsers/generico.js', import.meta.url), 'utf8');
const contexto = {};
vm.runInNewContext(fonteColunas, contexto, { filename: 'parsers/colunas.js' });
vm.runInNewContext(fonteGenerico, contexto, { filename: 'parsers/generico.js' });
const leitor = contexto.LEITOR_GENERICO();
const nativo = valor => JSON.parse(JSON.stringify(valor));

test('banco irlandês inventado: data local e colunas de débito/crédito', () => {
  const linhas = [
    ['Extrato fictício de conta corrente'],
    ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
    ['14/02/2026', 'Compra inventada', '12.50', '', '500.00'],
    ['15/02/2026', 'Reembolso inventado', '', '2.00', '502.00'],
    ['', 'Opening balance', '', '', '510.50'],
    ['', 'Total', '', '', '14.50'],
    ['', 'Closing balance', '', '', '502.00'],
    ['', '', '', '', ''],
  ];
  assert.equal(leitor.reconhece(linhas), true);
  const resultado = nativo(leitor.ler(linhas));
  assert.deepEqual(resultado.tx, [
    ['2026-02-14', 'Compra inventada', 'Others', -1250, 50000],
    ['2026-02-15', 'Reembolso inventado', 'Others', 200, 50200],
  ]);
  assert.deepEqual(resultado.relatorio.colunasUsadas, { data: 'Date', descricao: 'Description', saldo: 'Balance', debito: 'Debit', credito: 'Credit' });
  assert.equal(resultado.relatorio.linhasIgnoradas, 5);
  assert.doesNotMatch(JSON.stringify(resultado.relatorio), /Compra inventada|Reembolso inventado/);
});

test('banco digital europeu inventado: ISO, sinal na coluna única e saldo', () => {
  const linhas = [
    ['Date', 'Description', 'Amount', 'Balance'],
    ['2026-03-13', 'Pagamento inventado', '-1.234,56', '2.000,00'],
    ['2026-03-14', 'Crédito inventado', '0,10', '2.000,10'],
  ];
  const resultado = nativo(leitor.ler(linhas));
  assert.deepEqual(resultado.tx, [
    ['2026-03-13', 'Pagamento inventado', 'Others', -123456, 200000],
    ['2026-03-14', 'Crédito inventado', 'Others', 10, 200010],
  ]);
  assert.deepEqual(resultado.relatorio.avisos, []);
});

test('banco brasileiro inventado: separador ;, aspas, decimal brasileiro e sufixos D/C', () => {
  const csv = [
    'Data;Histórico;Valor;Saldo',
    '10/05/2026;"Mercado inventado; filial 2";1.234,56D;2.000,00',
    '11/05/2026;Crédito fictício;0,10C;2.000,10',
    '12/05/2026;Despesa fictícia;1.000,00;1.000,10',
    '13/05/2026;Débito com sufixo;10,00DB;990,10',
    '14/05/2026;Crédito com sufixo;2,50CR;992,60',
  ].join('\n');
  const resultado = nativo(leitor.ler(csv));
  assert.deepEqual(resultado.tx, [
    ['2026-05-10', 'Mercado inventado; filial 2', 'Others', -123456, 200000],
    ['2026-05-11', 'Crédito fictício', 'Others', 10, 200010],
    ['2026-05-12', 'Despesa fictícia', 'Others', 100000, 100010],
    ['2026-05-13', 'Débito com sufixo', 'Others', -1000, 99010],
    ['2026-05-14', 'Crédito com sufixo', 'Others', 250, 99260],
  ]);
  assert.deepEqual(resultado.relatorio.colunasUsadas, { data: 'Data', descricao: 'Histórico', saldo: 'Saldo', valor: 'Valor' });
});

test('banco americano inventado: mm/dd inferido por dias acima de 12 e valor entre parênteses', () => {
  const csv = [
    'Date,Description,Amount,Balance',
    '04/21/2026,"Invented shop, branch 2","(1,000.00)","2,000.00"',
    '05/22/2026,"Invented refund",25.50,"2,025.50"',
  ].join('\n');
  const resultado = nativo(leitor.ler(csv));
  assert.deepEqual(resultado.tx, [
    ['2026-04-21', 'Invented shop, branch 2', 'Others', -100000, 200000],
    ['2026-05-22', 'Invented refund', 'Others', 2550, 202550],
  ]);
  assert.deepEqual(resultado.relatorio.avisos, []);
});

test('datas ambíguas avisam, usam dd/mm por padrão e aceitam ordemData', () => {
  const linhas = [
    ['Date', 'Description', 'Amount'],
    ['03/04/2026', 'Primeira compra inventada', '0,10'],
    ['05/06/2026', 'Segunda compra inventada', '1.000,00'],
  ];
  const padrao = nativo(leitor.ler(linhas));
  assert.deepEqual(padrao.tx.map(tx => tx[0]), ['2026-04-03', '2026-06-05']);
  assert.match(padrao.relatorio.avisos.join(' '), /ambígua/);
  assert.deepEqual(padrao.tx.map(tx => tx[3]), [10, 100000]);
  const forcada = nativo(leitor.ler(linhas, { ordemData: 'mm/dd' }));
  assert.deepEqual(forcada.tx.map(tx => tx[0]), ['2026-03-04', '2026-05-06']);
  assert.deepEqual(forcada.relatorio.avisos, []);
});

test('datas ISO não são tratadas como parte de um conjunto em que todas são ambíguas', () => {
  const linhas = [
    ['Date', 'Description', 'Amount'],
    ['2026-04-03', 'Movimento ISO inventado', '1.00'],
    ['05/06/2026', 'Movimento local inventado', '2.00'],
  ];
  const resultado = nativo(leitor.ler(linhas));
  assert.deepEqual(resultado.tx.map(tx => tx[0]), ['2026-04-03', '2026-06-05']);
  assert.deepEqual(resultado.relatorio.avisos, []);
});

test('datas com mês abreviado e horário são interpretadas sem inventar datas', () => {
  const linhas = [
    ['Fecha', 'Concepto', 'Importe'],
    ['14 abr 2026 09:30', 'Operación ficticia', '2,50'],
    ['15 oct 2026T18:45', 'Compra ficticia', '3,00'],
    ['31/02/2026', 'Fecha inválida', '4,00'],
  ];
  const resultado = nativo(leitor.ler(linhas));
  assert.deepEqual(resultado.tx.map(tx => tx[0]), ['2026-04-14', '2026-10-15']);
  assert.equal(resultado.relatorio.linhasIgnoradas, 1);
  assert.match(resultado.relatorio.avisos.join(' '), /ignoradas/);
  assert.doesNotMatch(JSON.stringify(resultado.relatorio), /Operación ficticia|Compra ficticia|Fecha inválida/);
});

test('tab é detectado e arquivo sem colunas reconhecíveis retorna aviso sem lançar exceção', () => {
  const csv = 'Date\tDescription\tAmount\n2026-07-11\tInvented entry\t0.10';
  assert.equal(leitor.reconhece(csv), true);
  assert.equal(nativo(leitor.ler(csv)).tx[0][3], 10);

  const semCabecalho = [['Conta', 'Titular', 'Código'], ['fictícia', 'Pessoa Exemplo', 'XYZ-123']];
  assert.doesNotThrow(() => leitor.ler(semCabecalho));
  assert.equal(leitor.reconhece(semCabecalho), false);
  const resultado = nativo(leitor.ler(semCabecalho));
  assert.deepEqual(resultado.tx, []);
  assert.match(resultado.relatorio.avisos[0], /Não encontrei colunas reconhecíveis/);
  assert.doesNotMatch(JSON.stringify(resultado.relatorio), /Pessoa Exemplo|XYZ-123/);
});

test('Debit Amount e Credit Amount usam colunas separadas e aplicam o sinal do débito', () => {
  const linhas = [
    ['Posted Transactions Date', 'Description', 'Debit Amount', 'Credit Amount', 'Balance'],
    ['14/02/2026', 'Compra inventada', '12.50', '', '100.00'],
    ['15/02/2026', 'Crédito inventado', '', '1,000.00', '1,100.00'],
  ];
  const resultado = nativo(leitor.ler(linhas));
  assert.deepEqual(resultado.tx, [
    ['2026-02-14', 'Compra inventada', 'Others', -1250, 10000],
    ['2026-02-15', 'Crédito inventado', 'Others', 100000, 110000],
  ]);
  assert.deepEqual(resultado.relatorio.colunasUsadas, {
    data: 'Posted Transactions Date', descricao: 'Description', saldo: 'Balance',
    debito: 'Debit Amount', credito: 'Credit Amount',
  });
});

test('Value Date não toma o papel de valor quando Date e débito/crédito também existem', () => {
  const linhas = [
    ['Date', 'Value Date', 'Description', 'Debit', 'Credit'],
    ['14/02/2026', '13/02/2026', 'Compra inventada', '12.50', ''],
    ['15/02/2026', '14/02/2026', 'Crédito inventado', '', '2.00'],
  ];
  const resultado = nativo(leitor.ler(linhas));
  assert.equal(resultado.tx.length, 2);
  assert.deepEqual(resultado.tx.map(movimento => movimento.slice(3, 4)), [[-1250], [200]]);
});

test('códigos USD, CAD e AUD não são tratados como sufixos de sinal', () => {
  const linhas = [
    ['Date', 'Description', 'Amount'],
    ['2026-02-14', 'Compra em USD inventada', '100.00 USD'],
    ['2026-02-15', 'Compra em CAD inventada', '-5.00 CAD'],
    ['2026-02-16', 'Compra em AUD inventada', '5.00 AUD'],
  ];
  const resultado = nativo(leitor.ler(linhas));
  assert.deepEqual(resultado.tx.map(movimento => movimento[3]), [10000, -500, 500]);
  assert.deepEqual(resultado.relatorio.avisos, []);
});

test('débito já negativo mantém sinal negativo sem inverter ou duplicar o sinal', () => {
  const linhas = [
    ['Date', 'Description', 'Debit', 'Credit'],
    ['14/02/2026', 'Débito negativo inventado', '-12.50', ''],
    ['15/02/2026', 'Crédito inventado', '', '1.00'],
  ];
  assert.deepEqual(nativo(leitor.ler(linhas)).tx.map(movimento => movimento[3]), [-1250, 100]);
});

test('Amount isolado é reconhecido como coluna de valor', () => {
  const resultado = nativo(leitor.ler([
    ['Date', 'Description', 'Amount'],
    ['2026-04-12', 'Movimento inventado', '1.000,00'],
  ]));
  assert.equal(resultado.tx.length, 1);
  assert.equal(resultado.tx[0][3], 100000);
  assert.deepEqual(resultado.relatorio.colunasUsadas, {
    data: 'Date', descricao: 'Description', saldo: null, valor: 'Amount',
  });
});
