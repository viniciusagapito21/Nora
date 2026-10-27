var NORA_COLUNAS = (function () {
const SINONIMOS = {
  data: ['data', 'date', 'fecha', 'transaction date', 'posting date', 'posted date', 'posted transactions date', 'value date', 'data lancamento', 'data transacao', 'fecha operacion'],
  descricao: ['descricao', 'description', 'concept', 'concepto', 'historico', 'historial', 'detalhe', 'detail', 'details', 'memo', 'narrative', 'movement description'],
  valor: ['valor', 'amount', 'importe'],
  debito: ['debito', 'debit', 'cargo', 'debe'],
  credito: ['credito', 'credit', 'abono', 'haber'],
  saldo: ['saldo', 'balance'],
};

function normalizarCabecalho(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pontuarCabecalho(cabecalho, sinonimos) {
  const texto = normalizarCabecalho(cabecalho);
  let melhor = 0;
  for (const sinonimo of sinonimos) {
    const alias = normalizarCabecalho(sinonimo);
    if (texto === alias) melhor = Math.max(melhor, 3);
    else if (texto.startsWith(`${alias} `) || texto.endsWith(` ${alias}`)) melhor = Math.max(melhor, 2);
    else if (` ${texto} `.includes(` ${alias} `)) melhor = Math.max(melhor, 1);
  }
  return melhor;
}

function campoConhecido(cabecalho) {
  const papeis = ['data', 'descricao', 'saldo', 'debito', 'credito', 'valor'];
  let melhor = null;
  let melhorNota = 0;
  for (const campo of papeis) {
    const pontuacao = campo === 'valor'
      ? pontuarValor(cabecalho)
      : pontuarCabecalho(cabecalho, SINONIMOS[campo]);
    if (pontuacao > melhorNota) {
      melhor = campo;
      melhorNota = pontuacao;
    }
  }
  return melhor;
}

function pareceData(valor) {
  const texto = String(valor ?? '').trim();
  return /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T\s].*)?$/.test(texto)
    || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(texto);
}

function melhorColuna(cabecalho, amostra, campo, valida, excluidas = new Set()) {
  let melhor = null;
  let melhorNota = -1;
  for (let indice = 0; indice < cabecalho.length; indice++) {
    if (excluidas.has(indice)) continue;
    const pontuacao = pontuarCabecalho(cabecalho[indice], SINONIMOS[campo]);
    if (!pontuacao) continue;
    let validas = 0;
    for (const linha of amostra) {
      if (Array.isArray(linha) && valida(linha[indice])) validas++;
    }
    const nota = pontuacao * 1000 + validas;
    if (nota > melhorNota) {
      melhor = indice;
      melhorNota = nota;
    }
  }
  return melhor;
}

function pontuarValor(cabecalho) {
  const texto = normalizarCabecalho(cabecalho);
  if (texto === 'value' || texto === 'amount value') return 3;
  return pontuarCabecalho(cabecalho, SINONIMOS.valor);
}

function melhorColunaValor(cabecalho, amostra, excluidas) {
  let melhor = null;
  let melhorNota = -1;
  for (let indice = 0; indice < cabecalho.length; indice++) {
    if (excluidas.has(indice)) continue;
    const pontuacao = pontuarValor(cabecalho[indice]);
    if (!pontuacao) continue;
    let validas = 0;
    for (const linha of amostra) {
      if (Array.isArray(linha) && centavosDeTexto(String(linha[indice] ?? '')) !== null) validas++;
    }
    if (amostra.length && validas === 0) continue;
    const nota = pontuacao * 1000 + validas;
    if (nota > melhorNota) {
      melhor = indice;
      melhorNota = nota;
    }
  }
  return melhor;
}

function centavosDeTexto(valor) {
  if (typeof valor !== 'string') return null;
  let texto = valor.trim();
  if (!texto) return null;

  let negativo = false;
  if (/^\(.*\)$/.test(texto)) {
    negativo = true;
    texto = texto.slice(1, -1).trim();
  }
  texto = texto
    .replace(/\b[A-Z]{3}\b/gi, '')
    .replace(/R\$/gi, '')
    .replace(/[\p{Sc}]/gu, '')
    .trim();
  if (texto.startsWith('-')) {
    negativo = !negativo;
    texto = texto.slice(1);
  } else if (texto.startsWith('+')) texto = texto.slice(1);
  texto = texto.replace(/[\s'’]/g, '');
  if (!/^\d[\d.,]*$/.test(texto)) return null;

  const ultimaVirgula = texto.lastIndexOf(',');
  const ultimoPonto = texto.lastIndexOf('.');
  let inteiro = texto;
  let fracao = '';
  const temVirgula = ultimaVirgula >= 0;
  const temPonto = ultimoPonto >= 0;

  if (temVirgula && temPonto) {
    const decimal = Math.max(ultimaVirgula, ultimoPonto);
    const separadorDecimal = texto[decimal];
    fracao = texto.slice(decimal + 1);
    const parteInteira = texto.slice(0, decimal);
    const separadorGrupo = separadorDecimal === ',' ? '.' : ',';
    if (!/^\d{1,3}(?:[.,]\d{3})+$/.test(parteInteira) && !/^\d+$/.test(parteInteira)) return null;
    if (parteInteira.includes(separadorDecimal)) return null;
    inteiro = parteInteira.replaceAll(separadorGrupo, '');
    if (parteInteira.includes(separadorGrupo)) {
      const grupos = parteInteira.split(separadorGrupo);
      if (!/^\d{1,3}$/.test(grupos[0]) || grupos.slice(1).some(grupo => !/^\d{3}$/.test(grupo))) return null;
    }
  } else if (temVirgula || temPonto) {
    const separador = temVirgula ? ',' : '.';
    const grupos = texto.split(separador);
    if (grupos.length === 2 && grupos[1].length >= 1 && grupos[1].length <= 2) {
      [inteiro, fracao] = grupos;
    } else if (grupos.length > 1 && /^\d{1,3}$/.test(grupos[0]) && grupos.slice(1).every(grupo => /^\d{3}$/.test(grupo))) {
      inteiro = grupos.join('');
    } else return null;
  }

  if (!/^\d+$/.test(inteiro) || (fracao && !/^\d{1,2}$/.test(fracao))) return null;
  const valorCentavos = BigInt(inteiro) * 100n + BigInt((fracao || '').padEnd(2, '0') || '0');
  const assinado = negativo ? -valorCentavos : valorCentavos;
  const numero = Number(assinado);
  return Number.isSafeInteger(numero) ? numero : null;
}

/** Detecta os índices das colunas a partir de um cabeçalho e linhas de amostra. */
function detectarColunas(cabecalho, amostra = []) {
  if (!Array.isArray(cabecalho)) return null;
  const linhas = Array.isArray(amostra) ? amostra : [];
  const data = melhorColuna(cabecalho, linhas, 'data', pareceData);
  if (data === null) return null;
  const usadas = new Set([data]);
  const descricao = melhorColuna(cabecalho, linhas, 'descricao', valor => String(valor ?? '').trim() !== '', usadas);

  if (descricao === null) return null;
  usadas.add(descricao);
  const saldo = melhorColuna(cabecalho, linhas, 'saldo', valor => centavosDeTexto(String(valor ?? '')) !== null, usadas);
  if (saldo !== null) usadas.add(saldo);

  const debito = melhorColuna(cabecalho, linhas, 'debito', item => centavosDeTexto(String(item ?? '')) !== null, usadas);
  const credito = melhorColuna(cabecalho, linhas, 'credito', item => centavosDeTexto(String(item ?? '')) !== null, usadas);
  if (debito !== null && credito !== null && debito !== credito
      && pontuarCabecalho(cabecalho[debito], SINONIMOS.debito) >= 2
      && pontuarCabecalho(cabecalho[credito], SINONIMOS.credito) >= 2
      && !usadas.has(debito) && !usadas.has(credito)) {
    return { data, descricao, debito, credito, saldo };
  }

  if (debito !== null) usadas.add(debito);
  if (credito !== null) usadas.add(credito);
  const valor = melhorColunaValor(cabecalho, linhas, usadas);
  if (valor !== null) return { data, descricao, valor, saldo };

  return null;
}

/** Converte texto monetário para centavos exatos; retorna null se o texto for inválido. */
function paraCentavos(valor) {
  return centavosDeTexto(valor);
}

return { detectarColunas: detectarColunas, paraCentavos: paraCentavos, campoConhecido: campoConhecido };
})();
