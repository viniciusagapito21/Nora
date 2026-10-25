// Grava os arquivos de exemplo gerados por código (hoje: exemplo/extrato-btg-exemplo.xls, inventado, na estrutura
// do .xls do BTG). Rodar com: node scripts/gerar-exemplos.mjs. Um teste confere que o arquivo em exemplo/ é
// exatamente o que o gerador produz: não edite o .xls à mão.
import { writeFileSync } from 'node:fs';
import { carregarXLSX, extratoBtgExemplo } from '../tests/planilhas.mjs';

const destino = new URL('../exemplo/extrato-btg-exemplo.xls', import.meta.url);
writeFileSync(destino, extratoBtgExemplo(carregarXLSX()));
console.log('gravado: exemplo/extrato-btg-exemplo.xls');
