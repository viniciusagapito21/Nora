// Roda num processo à parte com o fuso que o teste escolher (TZ=…): lê planilhas inventadas com datas perto
// da meia-noite, nos calendários de 1900 e de 1904, e imprime as datas que o importador entende.
import { carregarNucleo, carregarXLSX, xlsxAMao, gravarComBiblioteca } from './planilhas.mjs';

const api = carregarNucleo(['prepararPlanilha', 'interpretarCSV']), X = carregarXLSX();
const linhas = [
  ['Data', 'Descrição', 'Valor'],
  [{ data: '2026-03-29', hora: '00:30' }, 'Padaria madrugada', -12.5],
  [{ data: '2026-03-29', hora: '23:30' }, 'Restaurante noite', -80],
  [{ data: '2026-10-25' }, 'Mudança de horário', -10],
  [{ data: '2026-12-31', hora: '23:59' }, 'Réveillon', -250],
  [{ data: '2027-01-01' }, 'Salário', 5000]
];
const datas = bytes => {
  const p = api.prepararPlanilha(X, bytes, 'xlsx');
  return api.interpretarCSV(p.rows, p.mapa).tx.map(t => t[0]);
};
console.log(JSON.stringify({
  fuso: Intl.DateTimeFormat().resolvedOptions().timeZone,
  d1900: datas(xlsxAMao([{ nome: 'Extrato', linhas }])),
  d1904: datas(xlsxAMao([{ nome: 'Extrato', linhas }], { d1904: true })),
  biblioteca: datas(gravarComBiblioteca(X, linhas, 'xlsx'))
}));
