import test from 'node:test';
import assert from 'node:assert/strict';
import { detectarColunas, paraCentavos } from '../parsers/colunas.js';

test('detecta cabeçalhos em português com valor e saldo', () => {
  const cabecalho = ['Data', 'Descrição', 'Valor', 'Saldo'];
  const linhas = [
    ['21/10/2026', 'Mercado inventado', '1.234,56', '2.000,00'],
    ['22/10/2026', 'Café inventado', '-12,50', '1.987,50'],
  ];
  assert.deepEqual(detectarColunas(cabecalho, linhas), { data: 0, descricao: 1, valor: 2, saldo: 3 });
});

test('detecta cabeçalhos em inglês com débito e crédito separados', () => {
  const cabecalho = ['Date', 'Description', 'Debit', 'Credit', 'Balance'];
  const linhas = [
    ['2026-10-21', 'Invented rent', '900.00', '', '1,100.00'],
    ['2026-10-22', 'Invented refund', '', '25.50', '1,125.50'],
  ];
  assert.deepEqual(detectarColunas(cabecalho, linhas), { data: 0, descricao: 1, debito: 2, credito: 3, saldo: 4 });
});

test('detecta cabeçalhos em espanhol', () => {
  const cabecalho = ['Fecha', 'Concepto', 'Importe', 'Saldo'];
  const linhas = [['21/10/2026', 'Compra inventada', '15,75', '84,25']];
  assert.deepEqual(detectarColunas(cabecalho, linhas), { data: 0, descricao: 1, valor: 2, saldo: 3 });
});

test('amostras escolhem entre cabeçalhos repetidos e campos sem equivalência devolvem null', () => {
  const cabecalho = ['Date', 'Description', 'Amount', 'Amount', 'Balance'];
  const linhas = [['2026-10-21', 'Item inventado', 'sem valor', '12.34', '20.00']];
  assert.deepEqual(detectarColunas(cabecalho, linhas), { data: 0, descricao: 1, valor: 3, saldo: 4 });
  assert.equal(detectarColunas(['Date', 'Description'], [['2026-10-21', 'Sem valor']]), null);
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
