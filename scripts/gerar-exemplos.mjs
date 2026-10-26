// Grava os arquivos de exemplo gerados por código (exemplo/extrato-btg-exemplo.xls e exemplo/extrato-itau-exemplo.pdf,
// inventados, na estrutura dos arquivos do BTG e do Itaú). Rodar com: node scripts/gerar-exemplos.mjs. Um teste confere que o arquivo em exemplo/ é
// exatamente o que o gerador produz: não edite o .xls à mão.
import { writeFileSync } from 'node:fs';
import { carregarXLSX, extratoBtgExemplo, extratoItauExemplo } from '../tests/planilhas.mjs';

const destino = new URL('../exemplo/extrato-btg-exemplo.xls', import.meta.url);
writeFileSync(destino, extratoBtgExemplo(carregarXLSX()));
console.log('gravado: exemplo/extrato-btg-exemplo.xls');
writeFileSync(new URL('../exemplo/extrato-itau-exemplo.pdf', import.meta.url), extratoItauExemplo());
console.log('gravado: exemplo/extrato-itau-exemplo.pdf');
