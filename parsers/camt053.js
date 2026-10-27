/* Nora: leitor ISO 20022 camt.053 puro, sem DOM e sem resolução de entidades externas. */
var LEITOR_CAMT053 = function () {
  var LIMITE_TEXTO = 8 * 1024 * 1024;
  var LIMITE_PROFUNDIDADE = 64;
  var LIMITE_NOS = 50000;
  var LIMITE_ENTRADAS = 5000;

  function avisoMovimentosIgnorados(quantidade) {
    if (!quantidade) return [];
    if (quantidade === 1) return ['1 movimento foi ignorado porque a data ou o valor não pôde ser lido.'];
    return [quantidade + ' movimentos foram ignorados porque a data ou o valor não pôde ser lido.'];
  }

  function erro(mensagem, quantidadeIgnorada) {
    return {
      tx: [], moedas: [], saldos: null, periodo: null,
      erro: mensagem, avisos: avisoMovimentosIgnorados(quantidadeIgnorada || 0)
    };
  }

  function fonteDe(texto) {
    if (typeof texto === 'string') return texto.replace(/^\uFEFF/, '');
    if (!Array.isArray(texto)) return '';
    return texto.map(function (linha) {
      return Array.isArray(linha) ? linha.join(' ') : String(linha == null ? '' : linha);
    }).join('\n');
  }

  function decodificar(valor) {
    var saida = '';
    for (var i = 0; i < valor.length; i++) {
      if (valor[i] !== '&') { saida += valor[i]; continue; }
      var fim = valor.indexOf(';', i + 1);
      if (fim < 0 || fim - i > 16) return { ok: false, texto: '' };
      var entidade = valor.slice(i + 1, fim), substituto;
      if (entidade === 'amp') substituto = '&';
      else if (entidade === 'lt') substituto = '<';
      else if (entidade === 'gt') substituto = '>';
      else if (entidade === 'quot') substituto = '"';
      else if (entidade === 'apos') substituto = "'";
      else if (/^#\d+$/.test(entidade)) substituto = String.fromCodePoint(Number(entidade.slice(1)));
      else if (/^#x[0-9a-f]+$/i.test(entidade)) substituto = String.fromCodePoint(parseInt(entidade.slice(2), 16));
      else return { ok: false, texto: '' };
      if (!substituto || substituto.codePointAt(0) > 0x10ffff) return { ok: false, texto: '' };
      saida += substituto;
      i = fim;
    }
    return { ok: true, texto: saida };
  }

  function nomeValido(caractere) {
    return /[A-Za-z0-9_:.-]/.test(caractere);
  }

  function analisarXml(fonte) {
    if (fonte.length > LIMITE_TEXTO) return { erro: 'Arquivo camt.053 excede o tamanho máximo de 8 MiB.' };
    if (!fonte.trim()) return { erro: 'Arquivo camt.053 vazio.' };
    var caixaAlta = fonte.toUpperCase();
    if (caixaAlta.indexOf('<!DOCTYPE') >= 0 || caixaAlta.indexOf('<!ENTITY') >= 0) {
      return { erro: 'DOCTYPE e declarações de entidades externas não são aceitos.' };
    }

    var raiz = { nome: '#documento', atributos: {}, filhos: [], texto: '' };
    var pilha = [raiz], posicao = 0, quantidadeNos = 0, quantidadeEntradas = 0;

    function acrescentarTexto(texto, cdata) {
      if (!texto) return null;
      if (cdata) pilha[pilha.length - 1].texto += texto;
      else {
        var decodificado = decodificar(texto);
        if (!decodificado.ok) return 'Entidade XML não reconhecida ou inválida.';
        pilha[pilha.length - 1].texto += decodificado.texto;
      }
      return null;
    }

    while (posicao < fonte.length) {
      if (fonte[posicao] !== '<') {
        var proximaTag = fonte.indexOf('<', posicao);
        if (proximaTag < 0) proximaTag = fonte.length;
        var erroTexto = acrescentarTexto(fonte.slice(posicao, proximaTag), false);
        if (erroTexto) return { erro: erroTexto };
        posicao = proximaTag;
        continue;
      }

      if (fonte.slice(posicao, posicao + 4) === '<!--') {
        var fimComentario = fonte.indexOf('-->', posicao + 4);
        if (fimComentario < 0) return { erro: 'Comentário XML sem fechamento.' };
        posicao = fimComentario + 3;
        continue;
      }
      if (fonte.slice(posicao, posicao + 9) === '<![CDATA[') {
        var fimCdata = fonte.indexOf(']]>', posicao + 9);
        if (fimCdata < 0) return { erro: 'Seção CDATA sem fechamento.' };
        var erroCdata = acrescentarTexto(fonte.slice(posicao + 9, fimCdata), true);
        if (erroCdata) return { erro: erroCdata };
        posicao = fimCdata + 3;
        continue;
      }
      if (fonte.slice(posicao, posicao + 2) === '<?') {
        var fimInstrucao = fonte.indexOf('?>', posicao + 2);
        if (fimInstrucao < 0) return { erro: 'Instrução XML sem fechamento.' };
        posicao = fimInstrucao + 2;
        continue;
      }
      if (fonte.slice(posicao, posicao + 2) === '<!') return { erro: 'Declaração XML não permitida.' };

      var inicio = posicao + 1, fechamento = fonte[inicio] === '/';
      if (fechamento) inicio++;
      while (inicio < fonte.length && /\s/.test(fonte[inicio])) inicio++;
      var fimNome = inicio;
      while (fimNome < fonte.length && nomeValido(fonte[fimNome])) fimNome++;
      if (fimNome === inicio) return { erro: 'Tag XML malformada.' };
      var nome = fonte.slice(inicio, fimNome);
      var cursor = fimNome;

      if (fechamento) {
        while (cursor < fonte.length && /\s/.test(fonte[cursor])) cursor++;
        if (fonte[cursor] !== '>') return { erro: 'Tag de fechamento XML malformada.' };
        if (pilha.length === 1 || pilha[pilha.length - 1].nome !== nome) return { erro: 'Tags XML não correspondem.' };
        pilha.pop();
        posicao = cursor + 1;
        continue;
      }

      var atributos = {}, autoFechamento = false, tagFechada = false;
      while (cursor < fonte.length) {
        while (cursor < fonte.length && /\s/.test(fonte[cursor])) cursor++;
        if (fonte[cursor] === '>') { tagFechada = true; cursor++; break; }
        if (fonte[cursor] === '/' && fonte[cursor + 1] === '>') { autoFechamento = true; tagFechada = true; cursor += 2; break; }
        var inicioAtributo = cursor;
        while (cursor < fonte.length && nomeValido(fonte[cursor])) cursor++;
        if (cursor === inicioAtributo) return { erro: 'Atributo XML malformado.' };
        var nomeAtributo = fonte.slice(inicioAtributo, cursor);
        while (cursor < fonte.length && /\s/.test(fonte[cursor])) cursor++;
        if (fonte[cursor] !== '=') return { erro: 'Atributo XML sem valor.' };
        cursor++;
        while (cursor < fonte.length && /\s/.test(fonte[cursor])) cursor++;
        var aspas = fonte[cursor];
        if (aspas !== '"' && aspas !== "'") return { erro: 'Valor de atributo XML deve usar aspas.' };
        cursor++;
        var inicioValor = cursor;
        while (cursor < fonte.length && fonte[cursor] !== aspas) cursor++;
        if (cursor >= fonte.length) return { erro: 'Atributo XML sem fechamento.' };
        var valorAtributo = decodificar(fonte.slice(inicioValor, cursor));
        if (!valorAtributo.ok) return { erro: 'Entidade XML não reconhecida ou inválida.' };
        var localAtributo = nomeAtributo.slice(nomeAtributo.lastIndexOf(':') + 1).toLowerCase();
        atributos[localAtributo] = valorAtributo.texto;
        cursor++;
      }
      if (!tagFechada) return { erro: 'Tag XML sem fechamento.' };
      if (nome.slice(nome.lastIndexOf(':') + 1).toLowerCase() === 'ntry') {
        quantidadeEntradas++;
        if (quantidadeEntradas > LIMITE_ENTRADAS) return { erro: 'Arquivo camt.053 excede o limite de entradas.' };
      }
      quantidadeNos++;
      if (quantidadeNos > LIMITE_NOS) return { erro: 'Arquivo XML excede o limite de elementos.' };
      var pai = pilha[pilha.length - 1];
      var no = { nome: nome, atributos: atributos, filhos: [], texto: '', pai: pai };
      pai.filhos.push(no);
      if (!autoFechamento) {
        if (pilha.length >= LIMITE_PROFUNDIDADE) return { erro: 'Arquivo XML excede a profundidade máxima permitida.' };
        pilha.push(no);
      }
      posicao = cursor;
    }
    if (pilha.length !== 1) return { erro: 'Arquivo XML truncado: há tags sem fechamento.' };
    return { raiz: raiz };
  }

  function local(no) { return no.nome.slice(no.nome.lastIndexOf(':') + 1).toLowerCase(); }

  function filhos(no, nome) {
    return no.filhos.filter(function (filho) { return local(filho) === nome.toLowerCase(); });
  }

  function primeiro(no, nome) { return filhos(no, nome)[0] || null; }

  function todos(no, nome) {
    var encontrados = [], pendentes = no.filhos.slice().reverse();
    while (pendentes.length) {
      var atual = pendentes.pop();
      if (local(atual) === nome.toLowerCase()) encontrados.push(atual);
      for (var i = atual.filhos.length - 1; i >= 0; i--) pendentes.push(atual.filhos[i]);
    }
    return encontrados;
  }

  function conteudo(no) {
    if (!no) return '';
    var partes = [], pendentes = [no];
    while (pendentes.length) {
      var atual = pendentes.pop();
      if (atual.texto) partes.push(atual.texto);
      for (var i = atual.filhos.length - 1; i >= 0; i--) pendentes.push(atual.filhos[i]);
    }
    return partes.join(' ').replace(/\s+/g, ' ').trim();
  }

  function filhoTexto(no, nome) { return conteudo(primeiro(no, nome)); }

  function moedaDo(no) { return no && no.atributos.ccy ? no.atributos.ccy.toUpperCase() : ''; }

  function centavos(valor) {
    var texto = String(valor == null ? '' : valor).trim();
    if (texto.length > 64) return null;
    var m = texto.match(/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/);
    if (!m) return null;
    if (m[2].length > 15) return null;
    var total = BigInt(m[2]) * 100n + BigInt((m[3] || '').padEnd(2, '0') || '0');
    if (m[1] === '-') total = -total;
    var numero = Number(total);
    return Number.isSafeInteger(numero) ? numero : null;
  }

  function dataIso(valor) {
    var texto = String(valor || '').trim();
    var m = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
    if (!m) return null;
    var ano = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
    var dt = new Date(Date.UTC(ano, mes - 1, dia));
    if (dt.getUTCFullYear() !== ano || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== dia) return null;
    return m[1] + '-' + m[2] + '-' + m[3];
  }

  function dataDo(no) {
    if (!no) return null;
    return dataIso(filhoTexto(no, 'Dt')) || dataIso(filhoTexto(no, 'DtTm')) || dataIso(conteudo(no));
  }

  function valorDo(no) {
    if (!no) return null;
    var valor = centavos(conteudo(no));
    if (valor === null) return null;
    return { centavos: valor, moeda: moedaDo(no) };
  }

  function sinal(valor, indicador, estorno) {
    var absoluto = Math.abs(valor), tipo = String(indicador || '').trim().toUpperCase();
    var resultado = tipo === 'DBIT' ? -absoluto : tipo === 'CRDT' ? absoluto : valor;
    if (estorno) resultado = -resultado;
    return resultado;
  }

  function eEstorno(no) { return filhoTexto(no, 'RvslInd').toLowerCase() === 'true'; }

  function textoLivre(no) {
    return todos(no, 'Ustrd').map(conteudo).filter(Boolean);
  }

  function nomesPartes(no) {
    var partes = [], relacionados = todos(no, 'RltdPties');
    relacionados.forEach(function (grupo) {
      ['Cdtr', 'Dbtr'].forEach(function (tipo) {
        filhos(grupo, tipo).forEach(function (parte) {
          var nome = filhoTexto(parte, 'Nm');
          if (nome && partes.indexOf(nome) < 0) partes.push(nome);
        });
      });
    });
    return partes;
  }

  function descricao(no, entrada) {
    var livre = textoLivre(no);
    if (!livre.length && entrada) livre = textoLivre(entrada);
    if (livre.length) return livre.join(' · ');
    var adicional = filhoTexto(no, 'AddtlNtryInf') || (entrada && filhoTexto(entrada, 'AddtlNtryInf'));
    if (adicional) return adicional;
    var nomes = nomesPartes(no);
    if (!nomes.length && entrada) nomes = nomesPartes(entrada);
    return nomes.join(' · ');
  }

  function indicador(no, fallback) { return filhoTexto(no, 'CdtDbtInd') || fallback || ''; }

  function valorDetalhe(detalhe) {
    var montantes = todos(detalhe, 'Amt');
    for (var i = 0; i < montantes.length; i++) {
      /* Prefere o Amount dentro de TxAmt; ignora taxas e valores instruídos. */
      var pai = montantes[i].pai;
      if (pai === detalhe) return valorDo(montantes[i]);
      while (pai && pai !== detalhe) {
        if (local(pai) === 'txamt') return valorDo(montantes[i]);
        pai = pai.pai;
      }
    }
    return null;
  }

  function valorEntrada(entrada) { return valorDo(primeiro(entrada, 'Amt')); }

  function moedaStatement(statement) {
    var acct = primeiro(statement, 'Acct');
    return acct ? filhoTexto(acct, 'Ccy').toUpperCase() : '';
  }

  function tipoSaldo(bal) {
    var tp = primeiro(bal, 'Tp');
    if (!tp) return '';
    var codigo = primeiro(tp, 'CdOrPrtry');
    return (codigo ? filhoTexto(codigo, 'Cd') : filhoTexto(tp, 'Cd')).toUpperCase();
  }

  function ler(texto) {
    try {
      var fonte = fonteDe(texto), analisado = analisarXml(fonte);
      if (analisado.erro) return erro(analisado.erro);
      var statements = todos(analisado.raiz, 'Stmt');
      if (!statements.length) return erro('Arquivo XML válido, mas não contém Stmt camt.053.');
      var tx = [], moedas = new Set(), saldos = {}, tiposSaldos = {}, movimentosIgnorados = 0;

      statements.forEach(function (statement) {
        var moedaStmt = moedaStatement(statement);
        if (/^[A-Z]{3}$/.test(moedaStmt)) moedas.add(moedaStmt);
        var entradas = filhos(statement, 'Ntry');

        entradas.forEach(function (entrada) {
          var montanteEntrada = valorEntrada(entrada);
          var dataMovimento = dataDo(primeiro(entrada, 'BookgDt')) || dataDo(primeiro(entrada, 'ValDt'));
          var indicadorEntrada = indicador(entrada, '');
          var estornoEntrada = eEstorno(entrada);
          var detalhes = todos(entrada, 'TxDtls');
          var montantesDetalhe = detalhes.map(valorDetalhe);
          var usaDetalhes = detalhes.length > 0 && montantesDetalhe.some(Boolean);
          if (usaDetalhes) {
            detalhes.forEach(function (detalhe, indice) {
              var montante = montantesDetalhe[indice];
              if (!montante) {
                movimentosIgnorados++;
                return;
              }
              var data = dataDo(primeiro(detalhe, 'BookgDt')) || dataMovimento;
              var sinalDetalhe = indicador(detalhe, indicadorEntrada);
              var estorno = eEstorno(detalhe) || estornoEntrada;
              var valor = sinal(montante.centavos, sinalDetalhe, estorno);
              var descr = descricao(detalhe, entrada);
              if (montante.moeda) moedas.add(montante.moeda);
              if (data && Number.isSafeInteger(valor)) tx.push([data, descr, 'Others', valor, 0]);
              else movimentosIgnorados++;
            });
          } else if (montanteEntrada) {
            var valorEntradaAssinado = sinal(montanteEntrada.centavos, indicadorEntrada, estornoEntrada);
            var descrEntrada = descricao(entrada, null);
            if (montanteEntrada.moeda) moedas.add(montanteEntrada.moeda);
            if (dataMovimento && Number.isSafeInteger(valorEntradaAssinado)) tx.push([dataMovimento, descrEntrada, 'Others', valorEntradaAssinado, 0]);
            else movimentosIgnorados++;
          } else movimentosIgnorados++;
        });

        todos(statement, 'Bal').forEach(function (bal) {
          var tipo = tipoSaldo(bal);
          if (tipo !== 'OPBD' && tipo !== 'CLBD') return;
          var montante = valorDo(primeiro(bal, 'Amt'));
          var data = dataDo(primeiro(bal, 'Dt'));
          if (!montante || !data) return;
          var valor = sinal(montante.centavos, indicador(bal, ''), false);
          if (!Number.isSafeInteger(valor)) return;
          if (montante.moeda) moedas.add(montante.moeda);
          if (!tiposSaldos[data] || tipo === 'CLBD' || tiposSaldos[data] === 'OPBD') {
            saldos[data] = valor;
            tiposSaldos[data] = tipo;
          }
        });
      });

      if (movimentosIgnorados > 0 && tx.length === 0) {
        return erro('Arquivo camt.053 não contém movimentos válidos.', movimentosIgnorados);
      }
      return {
        tx: tx,
        moedas: Array.from(moedas).sort(),
        saldos: Object.keys(saldos).length ? saldos : null,
        periodo: null,
        avisos: avisoMovimentosIgnorados(movimentosIgnorados)
      };
    } catch (falha) {
      var mensagem = falha && typeof falha.message === 'string' ? falha.message : '';
      if (mensagem === 'Arquivo camt.053 excede o limite de entradas.') return erro(mensagem);
      return erro('Não foi possível ler o arquivo camt.053: formato inválido.');
    }
  }

  function reconhece(texto) {
    try {
      var analisado = analisarXml(fonteDe(texto));
      return !analisado.erro && todos(analisado.raiz, 'Stmt').length > 0;
    } catch (_) { return false; }
  }

  return { id: 'camt053', nome: 'camt.053', reconhece: reconhece, ler: ler };
};
