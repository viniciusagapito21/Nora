# Como adicionar um leitor de banco

Cada leitor fica em `parsers/<banco>.js` e segue o contrato descrito no início de `parsers/revolut.js`. Comece por `parsers/_modelo.js` e mantenha o leitor puro: sem DOM, rede, armazenamento, logs ou bibliotecas.

## Contrato

O arquivo declara uma fábrica global `LEITOR_<BANCO>(ajuda)` que devolve:

- `id` e `nome` do banco;
- `reconhece(linhas)`, que só retorna verdadeiro para um cabeçalho ou marcador específico daquele formato;
- `ler(linhas, moeda)`, que devolve `{ tx, moedas, saldos, periodo }`.

Cada movimento de `tx` tem `[data ISO, descrição, tipo, centavos, saldo em centavos]`. Use `AAAA-MM-DD`, centavos inteiros e códigos ISO 4217. Não use ponto flutuante para converter dinheiro. `saldos` é um mapa de datas para centavos, ou `null`; `periodo` é `{ de, ate, fonte: 'arquivo' }` quando o arquivo informa o período, ou `null`.

Leia apenas os campos necessários ao resultado. Não carregue linhas inteiras adiante, não acrescente nomes, documentos, agência, conta, identificadores ou outros dados pessoais. A moeda solicitada deve limitar os movimentos quando o formato contiver mais de uma moeda.

## Exemplo inventado e teste

1. Descreva a estrutura do formato sem copiar dados de uma pessoa. Crie um exemplo sintético em `exemplo/`, com titulares, números, descrições, datas e valores inteiramente inventados. Não use um extrato real, mesmo que esteja anonimizado.
2. Se a amostra precisar reproduzir o formato de um banco, mantenha somente os cabeçalhos e a estrutura necessários. Gere-a por um script de teste quando isso tornar o caso repetível.
3. Crie `tests/<banco>.test.mjs`. Confira o reconhecimento, movimentos, ordem das colunas, sinais, datas, centavos, moedas, saldos e período, além dos casos de moeda errada e entrada malformada.
4. Carregue o leitor isoladamente no teste com auxiliares mínimos. Confira que nenhum campo pessoal ou conteúdo integral do arquivo aparece no resultado.
5. Rode `npm test`. Não conecte o leitor ao painel nesta tarefa: a integração no `app.js` e o carregamento em `index.html` cabem ao integrador.

## Privacidade

Use exclusivamente dados inventados em exemplos e testes. Nunca adicione extratos reais, PDFs, planilhas pessoais, nomes, documentos, números de conta ou identificadores bancários ao repositório. Não imprima conteúdo de arquivos em falhas, logs ou diagnósticos. Se a estrutura tiver sido estudada com um documento real fora do repositório, construa uma fixture nova do zero e verifique que ela e o código não preservaram texto ou valores pessoais antes de propor a integração.
