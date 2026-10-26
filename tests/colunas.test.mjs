import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../parsers/colunas.js', import.meta.url), 'utf8');
const contexto = {};
vm.runInNewContext(fonte, contexto, { filename: 'parsers/colunas.js' });
const { detectarColunas, paraCentavos } = contexto.NORA_COLUNAS;
const valorNativo = valor => JSON.parse(JSON.stringify(valor));

test('detecta cabeçalhos em português com valor e saldo', () => {
  const cabecalho = ['Data', 'Descrição', 'Valor', 'Saldo'];
  const linhas = [
    ['21/10/2026', 'Mercado inventado', '1.234,56', '2.000,00'],
    ['22/10/2026', 'Café inventado', '-12,50', '1.987,50'],
  ];
  assert.deepEqual(valorNativo(detectarColunas(cabecalho, linhas)), { data: 0, descricao: 1, valor: 2, saldo: 3 });
});

test('detecta cabeçalhos em inglês com débito e crédito separados', () => {
  const cabecalho = ['Date', 'Description', 'Debit', 'Credit', 'Balance'];
  const linhas = [
    ['2026-10-21', 'Invented rent', '900.00', '', '1,100.00'],
    ['2026-10-22', 'Invented refund', '', '25.50', '1,125.50'],
  ];
  assert.deepEqual(valorNativo(detectarColunas(cabecalho, linhas)), { data: 0, descricao: 1, debito: 2, credito: 3, saldo: 4 });
});

test('detecta cabeçalhos em espanhol', () => {
  const cabecalho = ['Fecha', 'Concepto', 'Importe', 'Saldo'];
  const linhas = [['21/10/2026', 'Compra inventada', '15,75', '84,25']];
  assert.deepEqual(valorNativo(detectarColunas(cabecalho, linhas)), { data: 0, descricao: 1, valor: 2, saldo: 3 });
});

test('amostras escolhem entre cabeçalhos repetidos e campos sem equivalência devolvem null', () => {
  const cabecalho = ['Date', 'Description', 'Amount', 'Amount', 'Balance'];
  const linhas = [['2026-10-21', 'Item inventado', 'sem valor', '12.34', '20.00']];
  assert.deepEqual(valorNativo(detectarColunas(cabecalho, linhas)), { data: 0, descricao: 1, valor: 3, saldo: 4 });
  assert.equal(detectarColunas(['Date', 'Description'], [['2026-10-21', 'Sem valor']]), null);
});

test('prioriza débito/crédito sobre Amount e não confunde Value Date com valor', () => {
  assert.deepEqual(valorNativo(detectarColunas(
    ['Posted Transactions Date', 'Description', 'Debit Amount', 'Credit Amount', 'Balance'],
    [['14/02/2026', 'Compra fictícia', '12.50', '', '100.00'], ['15/02/2026', 'Crédito fictício', '', '1,000.00', '1,100.00']]
  )), { data: 0, descricao: 1, debito: 2, credito: 3, saldo: 4 });

  assert.deepEqual(valorNativo(detectarColunas(
    ['Date', 'Value Date', 'Description', 'Debit', 'Credit'],
    [['14/02/2026', '13/02/2026', 'Compra fictícia', '12.50', ''], ['15/02/2026', '14/02/2026', 'Crédito fictício', '', '2.00']]
  )), { data: 0, descricao: 2, debito: 3, credito: 4, saldo: null });
});

test('valor só é escolhido quando distinto dos outros papéis e válido na amostra', () => {
  assert.deepEqual(valorNativo(detectarColunas(
    ['Date', 'Description', 'Amount'],
    [['14/02/2026', 'Compra fictícia', '100.00 USD'], ['15/02/2026', 'Crédito fictício', '5.00 EUR']]
  )), { data: 0, descricao: 1, valor: 2, saldo: null });
  assert.deepEqual(valorNativo(detectarColunas(
    ['Date', 'Description', 'Value Date'],
    [['14/02/2026', 'Compra fictícia', '13/02/2026']]
  )), null);
});

test('converte valores textuais para centavos inteiros sem ponto flutuante', () => {
  assert.equal(paraCentavos('1.234,56'), 123456);
  assert.equal(paraCentavos('1,234.56'), 123456);
  assert.equal(paraCentavos('R$ 12,5'), 1250);
  assert.equal(paraCentavos('(£ 9.99)'), -999);
  assert.equal(paraCentavos('1 234,00'), 123400);
  assert.equal(paraCentavos('12,345'), 1234500);
  assert.equal(paraCentavos('inválido'), null);
  assert.equal(paraCentavos(12.34), null);
});
