import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../parsers/ofx.js', import.meta.url), 'utf8');
const contexto = { Number, Date, Array, String, RegExp };
vm.runInNewContext(fonte, contexto, { filename: 'parsers/ofx.js' });
const leitor = contexto.LEITOR_OFX({ isoDate: data => data });
const exemplo = nome => readFileSync(new URL(`../exemplo/${nome}`, import.meta.url), 'utf8');
const valorNativo = valor => JSON.parse(JSON.stringify(valor));

test('OFX 1.x SGML: lê movimentos, vírgula decimal, moeda, saldo e período', () => {
  const sgml = exemplo('extrato-ofx-sgml-inventado.ofx');
  assert.equal(leitor.reconhece(sgml), true);
  assert.deepEqual(valorNativo(leitor.ler(sgml, 'BRL')), {
    tx: [
      ['2026-04-03', 'Café da Praça · Almoço inventado', 'DEBIT', -1572, 0],
      ['2026-04-05', 'Crédito de exemplo', 'CREDIT', 25000, 0]
    ],
    moedas: ['BRL'],
    saldos: { '2026-04-30': 123428 },
    periodo: { de: '2026-04-01', ate: '2026-04-30', fonte: 'arquivo' }
  });
});

test('OFX 2.x XML: lê ponto decimal e texto Latin-1 sem guardar identificadores de conta', () => {
  const latin1 = readFileSync(new URL('../exemplo/extrato-ofx-xml-inventado.ofx', import.meta.url)).toString('latin1');
  assert.equal(leitor.reconhece(latin1), true);
  const resultado = valorNativo(leitor.ler(latin1, 'GBP'));
  assert.deepEqual(resultado, {
    tx: [
      ['2026-05-08', 'Café fictif · Transaction inventée', 'DEBIT', -840, 0],
      ['2026-05-15', 'Crédito fictício', 'CREDIT', 2005, 0]
    ],
    moedas: ['GBP'],
    saldos: { '2026-05-31': 8565 },
    periodo: { de: '2026-05-01', ate: '2026-05-31', fonte: 'arquivo' }
  });
  assert.doesNotMatch(JSON.stringify(resultado), /BANK-FAKE|ACCOUNT-FAKE|ACCTID|BANKID/);
});

test('OFX: não lê movimento quando a moeda pedida difere e ignora datas ou valores inválidos', () => {
  const sgml = exemplo('extrato-ofx-sgml-inventado.ofx');
  assert.deepEqual(valorNativo(leitor.ler(sgml, 'USD').tx), []);
  assert.equal(leitor.reconhece('TRNTYPE>DEBIT<DTPOSTED>20260401<TRNAMT>1.00'), false);
  const invalido = sgml.replace('<DTPOSTED>20260403101500[-3:BRT]', '<DTPOSTED>20260431')
    .replace('<TRNAMT>-15,72', '<TRNAMT>-15.729');
  assert.deepEqual(valorNativo(leitor.ler(invalido, 'BRL').tx), [['2026-04-05', 'Crédito de exemplo', 'CREDIT', 25000, 0]]);
});
