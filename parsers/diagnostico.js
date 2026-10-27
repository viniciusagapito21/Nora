/* Diagnóstico de formato sem conteúdo de extrato, DOM, rede ou armazenamento. */
var NORA_DIAGNOSTICO = (function () {
  var AVISOS_FIXOS = [
    'Não encontrei colunas reconhecíveis de data, descrição e valor.',
    'As datas indicam ordens inconsistentes; considerei dd/mm/aaaa nas datas ambíguas.',
    'A ordem das datas é ambígua; considerei dd/mm/aaaa. Use ordemData para forçar mm/dd/aaaa.',
    'Uma ou mais linhas foram ignoradas porque a data ou o valor não pôde ser interpretado.',
    '1 movimento foi ignorado porque a data ou o valor não pôde ser lido.',
    'Não encontrei movimentos válidos no arquivo.'
  ];
  var PAPEIS = {
    data: 'Data', descricao: 'Descrição', valor: 'Valor',
    debito: 'Débito', credito: 'Crédito', saldo: 'Saldo'
  };
  var EXTENSOES = ['csv', 'tsv', 'xls', 'xlsx', 'xlsm', 'ods', 'ofx', 'qfx', 'pdf', 'txt'];
  var LEITORES = {
    generico: 'genérico', genérico: 'genérico', 'leitor_generico': 'genérico',
    revolut: 'Revolut', btg: 'BTG', itau: 'Itaú', itaú: 'Itaú', ofx: 'OFX',
    nenhum: 'nenhum', 'não informado': 'não informado'
  };

  function textoSeguro(valor) { return String(valor == null ? '' : valor).trim(); }

  function lerCsv(texto, separador) {
    var linhas = [], linha = [], campo = '', aspas = false;
    for (var i = 0; i < texto.length; i++) {
      var caractere = texto[i];
      if (aspas) {
        if (caractere === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (caractere === '"') aspas = false;
        else campo += caractere;
      } else if (caractere === '"' && campo.trim() === '') aspas = true;
      else if (caractere === separador) { linha.push(campo); campo = ''; }
      else if (caractere === '\n' || caractere === '\r') {
        if (caractere === '\r' && texto[i + 1] === '\n') i++;
        linha.push(campo); linhas.push(linha); linha = []; campo = '';
      } else campo += caractere;
    }
    if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas;
  }

  function detectarSeparador(texto) {
    var opcoes = [',', ';', '\t'], melhor = null, melhorNota = 0;
    opcoes.forEach(function (separador) {
      var linhas = lerCsv(texto, separador).slice(0, 30), frequencias = {}, largura = 1;
      linhas.forEach(function (linha) {
        if (linha.length > 1) {
          frequencias[linha.length] = (frequencias[linha.length] || 0) + 1;
          largura = Math.max(largura, linha.length);
        }
      });
      var repeticoes = Object.keys(frequencias).reduce(function (maximo, chave) {
        return Math.max(maximo, frequencias[chave]);
      }, 0);
      var nota = repeticoes * 100 + largura;
      if (repeticoes && nota > melhorNota) { melhor = separador; melhorNota = nota; }
    });
    return melhor;
  }

  function extrair(entrada) {
    var fonte = entrada, relatorio = null;
    if (entrada && typeof entrada === 'object' && !Array.isArray(entrada)) {
      if (entrada.resultado && entrada.resultado.relatorio) relatorio = entrada.resultado.relatorio;
      else if (entrada.relatorio) relatorio = entrada.relatorio;
      else if (entrada.resultado && Array.isArray(entrada.resultado.avisos)) relatorio = entrada.resultado;
      if (typeof entrada.texto === 'string') fonte = entrada.texto;
      else if (typeof entrada.conteudo === 'string') fonte = entrada.conteudo;
      else if (Array.isArray(entrada.linhas)) fonte = entrada.linhas;
      else if (Array.isArray(entrada.rows)) fonte = entrada.rows;
      else fonte = [];
    }

    if (typeof fonte === 'string') {
      var limpo = fonte.replace(/^\uFEFF/, '');
      var separador = detectarSeparador(limpo);
      return { linhas: separador ? lerCsv(limpo, separador) : lerCsv(limpo, '\u0000'), separador: separador, planilha: false };
    }
    if (Array.isArray(fonte)) {
      if (fonte.every(function (linha) { return Array.isArray(linha); })) {
        return { linhas: fonte.map(function (linha) { return linha.slice(); }), separador: null, planilha: true };
      }
      if (fonte.every(function (linha) { return typeof linha === 'string'; })) {
        var texto = fonte.join('\n').replace(/^\uFEFF/, '');
        var delimitador = detectarSeparador(texto);
        return { linhas: delimitador ? lerCsv(texto, delimitador) : lerCsv(texto, '\u0000'), separador: delimitador, planilha: false };
      }
    }
    return { linhas: [], separador: null, planilha: false };
  }

  function naoVazia(linha) {
    return Array.isArray(linha) && linha.some(function (celula) { return textoSeguro(celula) !== ''; });
  }

  function papeisDaLinha(linha) {
    var papeis = new Set();
    linha.forEach(function (celula) {
      var papel = NORA_COLUNAS.campoConhecido(celula);
      if (papel) papeis.add(papel);
    });
    return papeis;
  }

  function eCabecalho(linha) {
    return papeisDaLinha(linha).size >= 2;
  }

  function localizarCabecalho(linhas) {
    for (var i = 0; i < linhas.length; i++) {
      if (naoVazia(linhas[i]) && eCabecalho(linhas[i])) return i;
    }
    return -1;
  }

  function mascara(valor) {
    var resultado = textoSeguro(valor)
      .replace(/\p{N}/gu, '9')
      .replace(/\p{L}/gu, 'A')
      .replace(/A{13,}/g, 'A…A')
      .replace(/9{13,}/g, '9…9');
    return Array.from(resultado).slice(0, 30).join('');
  }

  function pareceData(valor) {
    var texto = textoSeguro(valor);
    return /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T\s].*)?$/.test(texto)
      || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}(?:[T\s].*)?$/.test(texto)
      || /^\d{1,2}\s+[A-Za-zÀ-ÿ]+\s+\d{4}(?:[T\s].*)?$/u.test(texto);
  }

  function pareceNumero(valor) {
    var texto = textoSeguro(valor), sufixo = texto.match(/(CR|DB|D|C)\s*$/i);
    if (sufixo) {
      var prefixo = texto.slice(0, sufixo.index);
      if (/(?:\s|\d|\))$/.test(prefixo)) texto = prefixo.trim();
    }
    return NORA_COLUNAS.paraCentavos(texto) !== null;
  }

  function tipoDaColuna(amostras) {
    var valores = amostras.map(textoSeguro).filter(Boolean);
    if (!valores.length) return 'vazia';
    if (valores.every(pareceData)) return 'data';
    if (valores.every(pareceNumero)) return 'número';
    return 'texto';
  }

  function nomeDaColuna(cabecalho, indice, amostras) {
    if (cabecalho) {
      var papel = NORA_COLUNAS.campoConhecido(cabecalho[indice]);
      if (papel) return PAPEIS[papel];
    }
    return 'coluna ' + (indice + 1) + ' (' + tipoDaColuna(amostras) + ')';
  }

  function versao(valor) {
    var texto = textoSeguro(valor);
    return /^(?:v)?\d+(?:\.\d+){0,3}(?:[-+][A-Za-z0-9.-]{1,12})?$/i.test(texto) ? texto : 'não informada';
  }

  function extensao(valor) {
    var texto = textoSeguro(valor).replace(/^\./, '').toLowerCase();
    return EXTENSOES.indexOf(texto) >= 0 ? '.' + texto : 'não informada';
  }

  function leitor(valor) {
    var texto = textoSeguro(valor).toLowerCase();
    return LEITORES[texto] || 'não informado';
  }

  function avisosDo(relatorio) {
    if (!relatorio || !Array.isArray(relatorio.avisos)) return [];
    return relatorio.avisos.filter(function (aviso) {
      return typeof aviso === 'string' && (AVISOS_FIXOS.indexOf(aviso) >= 0
        || /^(?:[2-9]|[1-9]\d+) movimentos foram ignorados porque a data ou o valor não pôde ser lido\.$/.test(aviso));
    });
  }

  function gerar(entrada, opcoes) {
    opcoes = opcoes || {};
    var extraido = extrair(entrada), linhas = extraido.linhas;
    var linhasValidas = linhas.filter(naoVazia);
    var cabecalhoIndice = localizarCabecalho(linhas);
    var cabecalho = cabecalhoIndice >= 0 ? linhas[cabecalhoIndice] : null;
    var largura = linhas.reduce(function (maior, linha) {
      return Math.max(maior, Array.isArray(linha) ? linha.length : 0);
    }, 0);
    var dados = cabecalhoIndice >= 0
      ? linhas.slice(cabecalhoIndice + 1).filter(function (linha) { return naoVazia(linha) && !eCabecalho(linha); })
      : linhas.filter(naoVazia);
    var amostras = dados.slice(0, 3), separador = extraido.separador;
    var nomeSeparador = separador === ',' ? 'vírgula'
      : separador === ';' ? 'ponto e vírgula'
        : separador === '\t' ? 'tabulação'
          : extraido.planilha ? 'linhas de planilha' : 'nenhum';
    var saida = [
      'Diagnóstico anônimo do Nora — nenhum valor, nome ou descrição do seu extrato está neste texto.',
      '',
      'Versão do app: ' + versao(opcoes.versaoApp),
      'Extensão: ' + extensao(opcoes.extensao),
      'Leitor tentado: ' + leitor(opcoes.leitorTentado),
      'Arquivo: ' + linhasValidas.length + ' linhas, ' + largura + ' colunas; separador: ' + nomeSeparador + '.',
      '',
      'Formas mascaradas (até 3 linhas de dados por coluna):'
    ];

    for (var coluna = 0; coluna < largura; coluna++) {
      var valores = amostras.map(function (linha) { return linha[coluna]; });
      var formas = valores.length
        ? valores.map(function (valor) { return textoSeguro(valor) ? mascara(valor) : '∅'; })
        : ['—'];
      saida.push('- ' + nomeDaColuna(cabecalho, coluna, valores) + ': ' + formas.join(' · '));
    }

    var avisos = avisosDo(entrada && entrada.resultado && entrada.resultado.relatorio
      ? entrada.resultado.relatorio
      : entrada && entrada.relatorio
        ? entrada.relatorio
        : entrada && entrada.resultado && Array.isArray(entrada.resultado.avisos)
          ? entrada.resultado
          : null);
    saida.push('', 'Avisos do leitor:');
    if (avisos.length) avisos.forEach(function (aviso) { saida.push('- ' + aviso); });
    else saida.push('- nenhum');
    return saida.join('\n');
  }

  return { gerar: gerar };
})();
