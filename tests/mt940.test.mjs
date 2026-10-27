import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../parsers/mt940.js', import.meta.url), 'utf8');
const contexto = { Array, BigInt, Date, Number, Set, String, RegExp };
vm.runInNewContext(fonte, contexto, { filename: 'parsers/mt940.js' });
const leitor = contexto.LEITOR_MT940();
const exemplo = readFileSync(new URL('../exemplo/extrato-mt940-inventado.sta', import.meta.url), 'utf8');
const nativo = valor => JSON.parse(JSON.stringify(valor));

test('MT940: lê indicadores D/C/RD/RC, centavos exatos, linhas :86: e dois extratos', () => {
  assert.equal(leitor.reconhece(exemplo), true);
  const resultado = nativo(leitor.ler(exemplo));
  assert.deepEqual(resultado, {
    tx: [
      ['2026-01-02', 'Compra fictícia Loja inventada Detalhe comercial', 'Others', -1250, 0],
      ['2026-01-03', 'Crédito fictício', 'Others', 10, 0],
      ['2026-01-03', 'REF-SEM-DESCRICAO', 'Others', -100000, 0],
      ['2026-01-04', 'Estorno de débito inventado', 'Others', 500, 0],
      ['2026-01-05', 'Estorno de crédito inventado', 'Others', -200, 0],
      ['2026-02-01', 'Crédito de mil inventado', 'Others', 100000, 0],
    ],
    moedas: ['EUR', 'GBP'],
    saldos: { '2026-01-05': -940, '2026-02-01': 99000 },
    periodo: null,
    avisos: [],
  });
  assert.doesNotMatch(JSON.stringify(resultado), /IE00FAKE12345678901234|GB00FAKE98765432101234/);
});

test('MT940 aceita CRLF e marcador de fim no arquivo e converte anos com o corte 69/70', () => {
  const crlf = exemplo.replace(/\n/g, '\r\n');
  const resultado = nativo(leitor.ler(crlf));
  assert.equal(resultado.tx[0][0], '2026-01-02');
  assert.deepEqual(nativo(leitor.ler(':60F:C690101EUR0,10\n:61:690101C0,10NTRFREF-69\n:86:?20Teste\n:62F:C690101EUR0,10\n-').tx), [
    ['2069-01-01', 'Teste', 'Others', 10, 0],
  ]);
  assert.deepEqual(nativo(leitor.ler(':60F:C700101EUR0,10\n:61:700101C0,10NTRFREF-70\n:86:?20Teste\n:62F:C700101EUR0,10').tx), [
    ['1970-01-01', 'Teste', 'Others', 10, 0],
  ]);
});

test('MT940 vazio ou truncado devolve erro claro e nunca conserva :25:', () => {
  assert.equal(leitor.reconhece(''), false);
  assert.equal(leitor.ler('').erro, 'Arquivo MT940 vazio.');
  const truncado = leitor.ler(':20:INVENTADO\n:25:CONTA-FALSA-123456');
  assert.match(truncado.erro, /incompleto/);
  assert.doesNotMatch(JSON.stringify(truncado), /CONTA-FALSA-123456/);
});

test('MT940 informa movimentos malformados sem repetir o conteúdo e erra se todos falharem', () => {
  const misto = [
    ':60F:C260101EUR0,00',
    ':61:260102D12,50NTRFREF-BOA-1', ':86:Compra inventada',
    ':61:linha malformada com dado inventado',
    ':61:260104C1,00NTRFREF-BOA-2', ':86:Crédito inventado',
    ':62F:C260104EUR0,00',
  ].join('\n');
  const resultado = nativo(leitor.ler(misto));
  assert.equal(resultado.tx.length, 2);
  assert.deepEqual(resultado.avisos, [
    '1 movimento foi ignorado porque a data ou o valor não pôde ser lido.',
  ]);
  assert.doesNotMatch(JSON.stringify(resultado), /linha malformada com dado inventado/);

  const invalidos = leitor.ler(':60F:C260101EUR0,00\n:61:data impossível valor impossível\n:62F:C260101EUR0,00');
  assert.match(invalidos.erro, /não contém movimentos válidos/i);
  assert.deepEqual(nativo(invalidos.avisos), [
    '1 movimento foi ignorado porque a data ou o valor não pôde ser lido.',
  ]);
});
