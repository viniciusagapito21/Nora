import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../painel-calculos.js', import.meta.url), 'utf8');
const contexto = { BigInt, Date, Number };
vm.runInNewContext(fonte, contexto, { filename: 'painel-calculos.js' });
const calculos = contexto.NORA_PAINEL_CALCULOS;
const nativo = valor => JSON.parse(JSON.stringify(valor));

test('P1: cota diária usa meta menos gasto e contas fixas, sem descontar poupança de novo', () => {
  assert.deepEqual(nativo(calculos.cotaDiaria({
    metaGastoCents: 100000,
    gastoCents: 61000,
    fixasACairCents: 9000,
    ultimaDataISO: '2026-10-16',
    fimDoMesISO: '2026-10-31'
  })), {
    estado: 'dentro', livreCents: 30000, diasRestantes: 15, cotaCents: 2000, comprometidoCents: 70000
  });
});

test('P1: compromisso acima da meta fica fora e não produz cota negativa', () => {
  assert.deepEqual(nativo(calculos.cotaDiaria({
    metaGastoCents: 100000,
    gastoCents: 98000,
    fixasACairCents: 12000,
    ultimaDataISO: '2026-10-24',
    fimDoMesISO: '2026-10-31'
  })), {
    estado: 'fora', livreCents: -10000, diasRestantes: 7, cotaCents: null, comprometidoCents: 110000
  });
});

test('P1: meta zero, último dia, fevereiro bissexto e divisão da cota em centavos', () => {
  assert.deepEqual(nativo(calculos.cotaDiaria({
    metaGastoCents: 0, gastoCents: 0, fixasACairCents: 0,
    ultimaDataISO: '2026-10-30', fimDoMesISO: '2026-10-31'
  })), {
    estado: 'sem-meta', livreCents: 0, diasRestantes: 1, cotaCents: null, comprometidoCents: 0
  });

  const ultimoDia = calculos.cotaDiaria({
    metaGastoCents: 20000, gastoCents: 5000, fixasACairCents: 0,
    ultimaDataISO: '2026-10-31', fimDoMesISO: '2026-10-31'
  });
  assert.equal(ultimoDia.diasRestantes, 0);
  assert.equal(ultimoDia.cotaCents, null);
  assert.equal(ultimoDia.estado, 'dentro');

  const bissexto = calculos.cotaDiaria({
    metaGastoCents: 20000, gastoCents: 10000, fixasACairCents: 0,
    ultimaDataISO: '2024-02-28', fimDoMesISO: '2024-02-29'
  });
  assert.equal(bissexto.diasRestantes, 1);
  assert.equal(bissexto.cotaCents, 10000);

  assert.equal(calculos.cotaDiaria({
    metaGastoCents: 10000, gastoCents: 0, fixasACairCents: 0,
    ultimaDataISO: '2026-08-01', fimDoMesISO: '2026-08-04'
  }).cotaCents, 3333);
});

test('P1: um valor líquido negativo de gasto aumenta o livre sem perder sinal inteiro', () => {
  assert.deepEqual(nativo(calculos.cotaDiaria({
    metaGastoCents: 10000, gastoCents: -500, fixasACairCents: 0,
    ultimaDataISO: '2026-04-01', fimDoMesISO: '2026-04-06'
  })), {
    estado: 'dentro', livreCents: 10500, diasRestantes: 5, cotaCents: 2100, comprometidoCents: -500
  });
});

test('P2: taxa de poupança calcula pontos-base inteiros e retirada nunca vira taxa negativa', () => {
  assert.deepEqual(nativo(calculos.taxaPoupanca({
    entrouCents: 200000, aportesCents: 36000, resgatesCents: 0
  })), { tipo: 'taxa', pontosBase: 1800, retiradaCents: 0 });

  assert.deepEqual(nativo(calculos.taxaPoupanca({
    entrouCents: 200000, aportesCents: 8000, resgatesCents: 30000
  })), { tipo: 'retirada', pontosBase: 0, retiradaCents: 22000 });

  assert.deepEqual(nativo(calculos.taxaPoupanca({
    entrouCents: 0, aportesCents: 8000, resgatesCents: 30000
  })), { tipo: 'sem-entrada', pontosBase: 0, retiradaCents: 22000 });

  assert.equal(calculos.taxaPoupanca({
    entrouCents: 32, aportesCents: 1, resgatesCents: 0
  }).pontosBase, 313);
  assert.equal(calculos.taxaPoupanca({
    entrouCents: 6, aportesCents: 1, resgatesCents: 0
  }).pontosBase, 1667);
});

test('P3: níveis e pontos-base nos limites de 80% e 100% e acima da meta', () => {
  const casos = [
    [75000, 'ok', 7500, 25000, 0],
    [80000, 'atencao', 8000, 20000, 0],
    [85000, 'atencao', 8500, 15000, 0],
    [100000, 'limite', 10000, 0, 0],
    [120000, 'estouro', 12000, 0, 20000],
    [150000, 'estouro', 15000, 0, 50000]
  ];
  for (const [gastoCents, nivel, pontos, resta, acima] of casos) {
    assert.deepEqual(nativo(calculos.alertaMeta({ gastoCents, metaCents: 100000 })), {
      nivel, pontosBase: pontos, restaCents: resta, acimaCents: acima
    });
  }
});

test('P3: meta zero é sem-meta e gasto líquido negativo não cria alerta de estouro', () => {
  assert.deepEqual(nativo(calculos.alertaMeta({ gastoCents: 10, metaCents: 0 })), {
    nivel: 'sem-meta', pontosBase: 0, restaCents: 0, acimaCents: 0
  });
  assert.deepEqual(nativo(calculos.alertaMeta({ gastoCents: -5000, metaCents: 100000 })), {
    nivel: 'ok', pontosBase: -500, restaCents: 105000, acimaCents: 0
  });
});

test('P4: conferência distingue igualdade, diferença dentro da tolerância, atenção e falta de saldo', () => {
  assert.deepEqual(nativo(calculos.conferenciaSaldo({
    saldoAppCents: 240000, saldoBancoCents: 240000, toleranciaCents: 5
  })), { estado: 'bateu', diferencaCents: 0 });

  assert.deepEqual(nativo(calculos.conferenciaSaldo({
    saldoAppCents: 80000, saldoBancoCents: 81000, toleranciaCents: 1000
  })), { estado: 'diferenca-pequena', diferencaCents: 1000 });

  assert.deepEqual(nativo(calculos.conferenciaSaldo({
    saldoAppCents: 230000, saldoBancoCents: 210000, toleranciaCents: 1000
  })), { estado: 'atencao', diferencaCents: -20000 });

  assert.deepEqual(nativo(calculos.conferenciaSaldo({
    saldoAppCents: 240000, saldoBancoCents: null, toleranciaCents: 5
  })), { estado: 'sem-dados', diferencaCents: null });
});
