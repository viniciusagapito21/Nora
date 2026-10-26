/*
 * Modelo de leitor de banco para parsers/<banco>.js.
 *
 * Copie este arquivo para um nome novo e substitua BANCO pelo nome do leitor. O integrador
 * decide quando ligar o leitor ao app; um parser novo deve continuar independente até lá.
 *
 * Contrato: fábrica pura LEITOR_BANCO(ajuda) que devolve
 * { id, nome, reconhece(linhas), ler(linhas, moeda) }.
 * `linhas` é a entrada que o núcleo entrega aos leitores. `ler` devolve sempre
 * { tx, moedas, saldos, periodo }:
 *   tx: [data ISO, descrição, tipo, centavos inteiros, saldo em centavos ou 0];
 *   moedas: códigos ISO 4217 que o arquivo realmente informa;
 *   saldos: mapa de data ISO para centavos, ou null se não houver saldo;
 *   periodo: { de, ate, fonte: 'arquivo' }, somente se o arquivo informar as datas, ou null.
 *
 * Sem DOM, rede, armazenamento, console ou dependências externas. Não guarde linhas completas
 * do arquivo nem acrescente campos pessoais ao resultado. Veja docs/como-adicionar-um-banco.md.
 */
var LEITOR_BANCO = function (ajuda) {
  var cents = ajuda.cents;
  var isoDate = ajuda.isoDate;

  function reconhece(linhas) {
    /* Use uma combinação específica de cabeçalhos ou marcadores públicos do formato. */
    return false;
  }

  function ler(linhas, moeda) {
    /*
     * Leia somente colunas necessárias. Converta valores para centavos inteiros sem float;
     * normalize datas para AAAA-MM-DD. Ignore linhas que não puderem ser interpretadas com
     * segurança. Se houver saldo atual, saldo por dia ou outros metadados necessários à
     * prévia, documente-os em campos adicionais aprovados no contrato do projeto.
     */
    return {
      tx: [],
      moedas: [],
      saldos: null,
      periodo: null
    };
  }

  return {
    id: 'banco',
    nome: 'Banco',
    reconhece: reconhece,
    ler: ler
  };
};
