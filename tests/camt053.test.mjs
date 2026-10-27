import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const fonte = readFileSync(new URL('../parsers/camt053.js', import.meta.url), 'utf8');
const contexto = { Array, BigInt, Date, Number, RegExp, Set, String };
vm.runInNewContext(fonte, contexto, { filename: 'parsers/camt053.js' });
const leitor = contexto.LEITOR_CAMT053();
const exemplo = readFileSync(new URL('../exemplo/extrato-camt053-inventado.xml', import.meta.url), 'utf8');
const nativo = valor => JSON.parse(JSON.stringify(valor));

test('camt.053: débitos, créditos, estorno, detalhes, descrições, moeda e saldos', () => {
  assert.equal(leitor.reconhece(exemplo), true);
  const resultado = nativo(leitor.ler(exemplo));
  assert.deepEqual(resultado, {
    tx: [
      ['2026-04-01', 'Compra fictícia · Loja inventada', 'Others', -1250, 0],
      ['2026-04-02', 'Estorno inventado', 'Others', -500, 0],
      ['2026-04-03', 'Crédito de dez centavos', 'Others', 10, 0],
      ['2026-04-03', 'Crédito de mil euros', 'Others', 100000, 0],
      ['2026-04-04', 'LOJA FICTÍCIA CENTRAL', 'Others', 10, 0],
      ['2026-04-05', 'Ajuste escrito inventado', 'Others', 10, 0],
    ],
    moedas: ['EUR'],
    saldos: { '2026-03-31': 100000, '2026-04-30': 198280 },
    periodo: null,
    avisos: [],
  });
  assert.doesNotMatch(JSON.stringify(resultado), /IE00FAKE0000000000000|MARIA SILVA INVENTADA/);
});

test('camt.053: aceita namespaces, entidades XML seguras e usa valor de entrada sem detalhamento', () => {
  const xml = '<c:Document xmlns:c="urn:exemplo"><c:Stmt><c:Acct><c:Ccy>GBP</c:Ccy></c:Acct>' +
    '<c:Ntry><c:Amt Ccy="GBP">0.10</c:Amt><c:CdtDbtInd>CRDT</c:CdtDbtInd>' +
    '<c:BookgDt><c:Dt>2026-05-01</c:Dt></c:BookgDt><c:AddtlNtryInf>Crédito &amp; ajuste</c:AddtlNtryInf></c:Ntry></c:Stmt></c:Document>';
  const resultado = nativo(leitor.ler(xml));
  assert.deepEqual(resultado.tx, [['2026-05-01', 'Crédito & ajuste', 'Others', 10, 0]]);
  assert.deepEqual(resultado.moedas, ['GBP']);
  assert.deepEqual(resultado.avisos, []);
});

test('camt.053 vazio, inválido ou truncado devolve erro claro sem lançar', () => {
  for (const xml of ['', '<Document><Stmt>', '<Document><Stmt></Document>']) {
    assert.doesNotThrow(() => leitor.ler(xml));
    assert.match(leitor.ler(xml).erro, /vazio|truncado|não correspondem/i);
  }
  assert.equal(leitor.reconhece(''), false);
});

test('camt.053 informa Ntry malformado sem conteúdo e erra se todas falharem', () => {
  const xml = '<Document><Stmt>' +
    '<Ntry><Amt Ccy="EUR">1.25</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-05-01</Dt></BookgDt><AddtlNtryInf>Compra inventada</AddtlNtryInf></Ntry>' +
    '<Ntry><Amt Ccy="EUR">valor privado inventado</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-05-02</Dt></BookgDt></Ntry>' +
    '<Ntry><Amt Ccy="EUR">2.50</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-05-03</Dt></BookgDt><AddtlNtryInf>Crédito inventado</AddtlNtryInf></Ntry>' +
    '</Stmt></Document>';
  const resultado = nativo(leitor.ler(xml));
  assert.deepEqual(resultado.tx, [
    ['2026-05-01', 'Compra inventada', 'Others', -125, 0],
    ['2026-05-03', 'Crédito inventado', 'Others', 250, 0],
  ]);
  assert.deepEqual(resultado.avisos, [
    '1 movimento foi ignorado porque a data ou o valor não pôde ser lido.',
  ]);
  assert.doesNotMatch(JSON.stringify(resultado), /valor privado inventado/);

  const invalidos = leitor.ler('<Document><Stmt><Ntry><CdtDbtInd>CRDT</CdtDbtInd></Ntry></Stmt></Document>');
  assert.match(invalidos.erro, /não contém movimentos válidos/i);
  assert.deepEqual(nativo(invalidos.avisos), [
    '1 movimento foi ignorado porque a data ou o valor não pôde ser lido.',
  ]);
});

test('camt.053 lê XML válido de 3 MiB e rejeita claramente arquivo de 9 MiB', { timeout: 5000 }, () => {
  const pequeno = '<Document><Stmt><Ntry><Amt Ccy="EUR">0.10</Amt><CdtDbtInd>CRDT</CdtDbtInd>' +
    '<BookgDt><Dt>2026-05-01</Dt></BookgDt></Ntry></Stmt></Document>';
  const xml3MiB = pequeno + ' '.repeat(3 * 1024 * 1024);
  const valido = leitor.ler(xml3MiB);
  assert.equal(valido.erro, undefined);
  assert.deepEqual(nativo(valido.tx), [['2026-05-01', '', 'Others', 10, 0]]);

  const xml9MiB = ' '.repeat(9 * 1024 * 1024);
  assert.match(leitor.ler(xml9MiB).erro, /tamanho máximo de 8 MiB/i);
});

test('camt.053 rejeita DTD, entidades externas, profundidade e volume fora dos limites rapidamente', { timeout: 5000 }, () => {
  const hostis = [
    ['<!DOCTYPE Document [<!ENTITY xxe SYSTEM "file:///fora.xml">]><Document><Stmt>&xxe;</Stmt></Document>', /DOCTYPE|entidades externas/i],
    ['<Document>' + '<N>'.repeat(100000) + '</N>'.repeat(100000) + '</Document>', /profundidade máxima/i],
    ['<Document><Stmt>', /truncado/i],
    ['x'.repeat(9 * 1024 * 1024), /tamanho máximo/i],
  ];
  const inicio = performance.now();
  for (const [xml, mensagem] of hostis) {
    assert.doesNotThrow(() => leitor.ler(xml));
    assert.match(leitor.ler(xml).erro, mensagem);
    assert.equal(leitor.reconhece(xml), false);
  }

  const muitasEntradas = '<Document><Stmt>' + '<Ntry/>' .repeat(200000) + '</Stmt></Document>';
  assert.match(leitor.ler(muitasEntradas).erro, /limite de entradas/i);
  assert.match(leitor.ler('<Document><Stmt>' + '<Ntry/>' .repeat(5001) + '</Stmt></Document>').erro, /limite de entradas/i);
  assert.ok(performance.now() - inicio < 3000, 'as entradas hostis devem terminar dentro do limite temporal');
});
