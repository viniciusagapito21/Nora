import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../formato.js', import.meta.url), 'utf8');
const contexto = { Array, BigInt, Date, Intl, Math, Number, Object, RegExp, String };
vm.runInNewContext(fonte, contexto, { filename: 'formato.js' });

/* Referência copiada literalmente do app.js principal (MES/MS e formatadores, linhas 1476–1516;
   fP0/fW/valorMov/fMoeda/pct/mesAno nas linhas 1740, 1783, 1952, 2862, 2967 e 2998). */
function formatadoresDeReferencia(moedaAtual) {
  var MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var NOME_MOEDA = { EUR: 'euro', BRL: 'real', GBP: 'libra', USD: 'dólar' };
  function moeda() { return moedaAtual || 'EUR'; }
  var fmtCache = {};
  function fmtDe(cod, casas) {
    var k = cod + casas;
    if (!fmtCache[k]) {
      try { fmtCache[k] = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cod, minimumFractionDigits: casas, maximumFractionDigits: casas }); }
      catch (e) { fmtCache[k] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }); }
    }
    return fmtCache[k];
  }
  function nomeMoeda(cod) { cod = cod || moeda(); return NOME_MOEDA[cod] || cod; }
  function simbolo(cod) {
    cod = cod || moeda();
    var p = fmtDe(cod, 0).formatToParts(1).filter(function (x) { return x.type === 'currency'; })[0];
    return p ? p.value : cod;
  }
  var nn = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  var n2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function f2(v) { return fmtDe(moeda(), 2).format(v); }
  function f0(v) { return fmtDe(moeda(), 0).format(Math.round(v)).replace('-', '−'); }
  function sgn(v, fn) { return (v < 0 ? '−' : '+') + (fn || f0)(Math.abs(v)); }
  function mLabel(k) { var p = k.split('-'); return MES[+p[1] - 1] + ' de ' + p[0]; }
  function mShort(k) { return MS[+k.slice(5) - 1]; }
  function dFmt(d) { var p = d.split('-'); return +p[2] + ' ' + MS[+p[1] - 1]; }
  function dFull(d) { return dFmt(d) + ' ' + d.slice(0, 4); }
  function fP0(v) { return fmtDe(moeda(), 0).format(Math.round(v)).replace('-', '−'); }
  function fW(v, cod) { return fmtDe(cod, 0).format(Math.round(v)).replace('-', '−'); }
  function valorMov(r, cod) { return (r.a < 0 ? '−' : '+') + fmtDe(cod, 2).format(Math.abs(r.a)); }
  var fmtMoeda = {};
  function fMoeda(v, cod) {
    if (!(cod in fmtMoeda)) { try { fmtMoeda[cod] = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: cod }); } catch (e) { fmtMoeda[cod] = null; } }
    return fmtMoeda[cod] ? fmtMoeda[cod].format(v) : cod + ' ' + n2.format(v);
  }
  function pct(v) { return nn.format(v) + '%'; }
  var PAISES = [
    ['DE', 'Alemanha'], ['AD', 'Andorra'], ['AT', 'Áustria'], ['BE', 'Bélgica'], ['BR', 'Brasil'],
    ['BG', 'Bulgária'], ['CY', 'Chipre'], ['HR', 'Croácia'], ['SK', 'Eslováquia'], ['SI', 'Eslovênia'],
    ['ES', 'Espanha'], ['EE', 'Estônia'], ['FI', 'Finlândia'], ['FR', 'França'], ['GR', 'Grécia'],
    ['IE', 'Irlanda'], ['IT', 'Itália'], ['XK', 'Kosovo'], ['LV', 'Letônia'], ['LT', 'Lituânia'],
    ['LU', 'Luxemburgo'], ['MT', 'Malta'], ['MC', 'Mônaco'], ['ME', 'Montenegro'], ['NL', 'Países Baixos'],
    ['PT', 'Portugal'], ['GB', 'Reino Unido'], ['SM', 'San Marino'], ['VA', 'Vaticano']
  ];
  function nomePais(cod) { var p = PAISES.filter(function (x) { return x[0] === cod; })[0]; return p ? p[1] : cod; }
  function mesAno(pz) { var p = pz.split('-'); return MS[+p[1] - 1] + ' ' + p[0]; }
  return { nomeMoeda, simbolo, nn, n2, f2, f0, sgn, mLabel, mShort, dFmt, dFull, fP0, fW, valorMov, fMoeda, pct, nomePais, mesAno, paises: PAISES };
}

const pt = contexto.NORA_FORMATO.para('pt-BR');
const en = contexto.NORA_FORMATO.para('en-GB');

test('pt-BR mantém exatamente as funções atuais do app para valores e moedas', () => {
  const valores = [0, 1, 99, 100, -1, -99, -100, 1234.56, -1234.56, 1000000, -1000000,
    0.5, 1.5, 2.5, -0.5, -1.5, -2.5, 0.105, 1000.995];
  const moedas = ['EUR', 'BRL', 'USD', 'GBP', 'CHF'];

  for (const moeda of moedas) {
    const referencia = formatadoresDeReferencia(moeda);
    for (const valor of valores) {
      assert.equal(pt.f0(valor, moeda), referencia.f0(valor), `f0 ${moeda} ${valor}`);
      assert.equal(pt.f2(valor, moeda), referencia.f2(valor), `f2 ${moeda} ${valor}`);
      assert.equal(pt.fP0(valor, moeda), referencia.fP0(valor), `fP0 ${moeda} ${valor}`);
      assert.equal(pt.fW(valor, moeda), referencia.fW(valor, moeda), `fW ${moeda} ${valor}`);
      assert.equal(pt.fMoeda(valor, moeda), referencia.fMoeda(valor, moeda), `fMoeda ${moeda} ${valor}`);
      assert.equal(pt.sgn(valor, v => pt.f0(v, moeda)), referencia.sgn(valor, v => referencia.f0(v)), `sgn ${moeda} ${valor}`);
    }
    assert.equal(pt.simbolo(moeda), referencia.simbolo(moeda));
  }

  const referencia = formatadoresDeReferencia('EUR');
  for (const valor of valores) {
    assert.equal(pt.nn(valor), referencia.nn.format(valor));
    assert.equal(pt.n2(valor), referencia.n2.format(valor));
    assert.equal(pt.pct(valor), referencia.pct(valor));
  }
  for (const moeda of ['EUR', 'BRL', 'GBP', 'USD']) {
    assert.equal(pt.nomeMoeda(moeda), referencia.nomeMoeda(moeda));
  }
  assert.equal(pt.nomeMoeda('CHF'), 'CHF');
  for (const [codigo] of referencia.paises) {
    assert.equal(pt.nomePais(codigo), referencia.nomePais(codigo));
  }
  assert.equal(pt.dinheiroCentavos(10, 'EUR'), '€ 0,10');
  assert.equal(pt.dinheiroCentavos(100000, 'EUR'), '€ 1.000,00');
  assert.equal(pt.dinheiroCentavos(-100000, 'EUR'), '-€ 1.000,00');
  assert.equal(pt.dinheiroCentavosSemSimbolo(100000), '1.000,00');
  assert.equal(pt.dinheiro(1234.56, 'EUR', 2), referencia.f2(1234.56));
  assert.equal(pt.dinheiroSemSimbolo(1234.56, 2), '1.234,56');
  assert.equal(pt.valorMov({ a: -12.5 }, 'EUR'), referencia.valorMov({ a: -12.5 }, 'EUR'));
});

test('pt-BR mantém datas e meses, inclusive viradas, fevereiro bissexto e meses longos', () => {
  const datas = ['2025-01-31', '2025-02-01', '2024-02-29', '2025-02-28', '2025-03-31',
    '2025-04-30', '2025-05-31', '2025-06-30', '2025-07-31', '2025-08-31', '2025-09-30',
    '2025-10-31', '2025-11-30', '2025-12-31', '2026-01-01'];
  const meses = [...new Set(datas.map(data => data.slice(0, 7)))];
  const referencia = formatadoresDeReferencia('EUR');
  for (const data of datas) {
    assert.equal(pt.dFmt(data), referencia.dFmt(data), `dFmt ${data}`);
    assert.equal(pt.dFull(data), referencia.dFull(data), `dFull ${data}`);
  }
  for (const mes of meses) {
    assert.equal(pt.mLabel(mes), referencia.mLabel(mes), `mLabel ${mes}`);
    assert.equal(pt.mShort(mes), referencia.mShort(mes), `mShort ${mes}`);
    assert.equal(pt.mesAno(mes), referencia.mesAno(mes), `mesAno ${mes}`);
  }
});

test('en-GB usa Intl para números, moedas, datas, meses e nomes', () => {
  assert.equal(en.idioma, 'en-GB');
  assert.equal(en.f0(1234.56, 'EUR'), '€1,235');
  assert.equal(en.f2(1234.56, 'EUR'), '€1,234.56');
  assert.equal(en.fMoeda(1234.56, 'GBP'), '£1,234.56');
  assert.equal(en.fMoeda(1234.56, 'CHF'), 'CHF 1,234.56');
  assert.equal(en.dinheiroCentavos(10, 'EUR'), '€0.10');
  assert.equal(en.dinheiroSemSimbolo(1234.56, 2), '1,234.56');
  assert.equal(en.simbolo('USD'), 'US$');
  assert.equal(en.nomeMoeda('EUR'), new Intl.DisplayNames(['en-GB'], { type: 'currency' }).of('EUR'));
  assert.equal(en.nomeMoeda('CHF'), new Intl.DisplayNames(['en-GB'], { type: 'currency' }).of('CHF'));
  assert.equal(en.nomePais('IE'), 'Ireland');
  assert.equal(en.nomePais('GB'), 'United Kingdom');
  assert.equal(en.dFmt('2026-01-02'), '2 Jan');
  assert.equal(en.dFull('2026-01-02'), '2 Jan 2026');
  assert.equal(en.mShort('2026-01'), 'Jan');
  assert.equal(en.mLabel('2026-01'), 'January 2026');
  assert.equal(en.mesAno('2026-01'), 'Jan 2026');
  assert.equal(en.nn(1234.56), '1,235');
  assert.equal(en.n1(1234.56), '1,234.6');
  assert.equal(en.n2(1234.5), '1,234.50');
  assert.equal(en.nr(1.2), '1.20');
  assert.equal(en.pct(12.5), '13%');
});

test('Kosovo/XK tem nome fixo e valores inválidos retornam o neutro', () => {
  assert.equal(pt.nomePais('XK'), 'Kosovo');
  assert.equal(en.nomePais('XK'), 'Kosovo');
  const invalidos = [
    pt.dinheiro(NaN), pt.dinheiro(Infinity), pt.f0(undefined), pt.fMoeda('1.23', 'EUR'),
    pt.dinheiroCentavos(1.5, 'EUR'), pt.dinheiroCentavosSemSimbolo(null), pt.numero(NaN),
    pt.sgn(2, () => undefined), pt.valorMov({ a: 2 }, 'EU'),
    pt.dFull('2025-02-29'), pt.dFmt('texto'), pt.mLabel('2026-13'), pt.mShort('2026-00'),
    pt.mesAno(undefined), pt.nomeMoeda('x'), pt.nomePais('USA'), pt.simbolo('EU'), pt.pct(Infinity)
  ];
  assert.ok(invalidos.every(texto => texto === pt.neutro));
  assert.doesNotMatch(invalidos.join(' '), /NaN|undefined/);
});

test('lerNumero: o último sinal é o decimal; com um só, o idioma decide o separador de milhar', () => {
  const pt = contexto.NORA_FORMATO.para('pt-BR'), en = contexto.NORA_FORMATO.para('en-GB');
  for (const f of [pt, en]) {
    assert.equal(f.lerNumero('1.234,56'), 1234.56); assert.equal(f.lerNumero('1,234.56'), 1234.56);
    assert.equal(f.lerNumero('€ 20,630.00'), 20630); assert.equal(f.lerNumero('R$ 20.630,00'), 20630);
    assert.equal(f.lerNumero('−50,25'), -50.25); assert.equal(f.lerNumero('-1,234.5'), -1234.5);
    assert.ok(Number.isNaN(f.lerNumero(''))); assert.ok(Number.isNaN(f.lerNumero('abc'))); assert.ok(Number.isNaN(f.lerNumero('1.2.3,4.5')));
    assert.equal(f.lerNumero('0,86'), 0.86); assert.equal(f.lerNumero('12'), 12);
  }
  // pt-BR: igual ao parseNum antigo do app.js
  assert.equal(pt.lerNumero('1.234'), 1234); assert.equal(pt.lerNumero('12.5'), 12.5); assert.equal(pt.lerNumero('1,234'), 1.234);
  // en-GB
  assert.equal(en.lerNumero('1,234'), 1234); assert.equal(en.lerNumero('1.234'), 1.234); assert.equal(en.lerNumero('12,5'), 12.5);
  assert.equal(en.lerNumero('1,234,567'), 1234567);
});
