# Nora

Nora é um painel de finanças pessoais que roda inteiro no seu navegador. Você importa o extrato CSV do banco e vê:

- saldo e para onde foi o dinheiro;
- gastos por mês e por categoria, com metas;
- previsão de como o mês vai fechar e a cota diária: quanto ainda dá para gastar por dia;
- contas fixas e assinaturas detectadas sozinhas;
- metas de poupança (reserva, investimentos, viagens) e taxa de poupança;
- alertas quando uma categoria chega a 80% da meta ou passa dela.

Em português ou inglês, no tema claro ou escuro (Configurações → Idioma e tema), e com um modo privacidade
("Ocultar valores") para abrir o painel perto de outras pessoas.

Nenhum dado sai do seu aparelho: não há servidor nem login.

## Usar

Não precisa instalar nada nem criar conta.

1. Baixe o arquivo `nora.zip` na página de **Releases** deste repositório e descompacte.
2. Abra o `index.html` com dois cliques: ele abre no seu navegador.
3. Toque em **Adicionar extrato** e escolha o arquivo que você baixou do seu banco.

O Nora reconhece sozinho os extratos do Revolut (CSV), do BTG Pactual (.xls) e do Itaú (PDF). Para qualquer outro
banco (AIB, Bank of Ireland, Wise, Nubank…), escolha o banco ou "Outro banco" e diga quais colunas do CSV ou da
planilha são a data, a descrição e o valor; o Nora lembra da escolha na próxima vez.

**Extrato em PDF:** aberto direto do disco, o navegador não deixa carregar o leitor de PDF. Para ler PDF, instale o
[Node.js](https://nodejs.org), rode `npm start` nesta pasta e abra o endereço que aparecer. CSV e planilha funcionam
dos dois jeitos.

**Seus dados:** ficam só no navegador onde você abriu o Nora. Se limpar os dados do navegador, eles somem: use
**Baixar backup** de vez em quando. Para testar sem dados reais, use os arquivos da pasta `exemplo/` (só no código
completo, não no zip).

## In English

Nora is a personal finance dashboard that runs entirely in your browser: no server, no account, and no data leaves
your device. Download `nora.zip` from the **Releases** page, unzip it and open `index.html`. Pick English under
Settings → Language and theme (it follows your browser by default). Revolut (CSV), BTG Pactual (.xls) and Itaú (PDF)
statements are recognised automatically; for any other bank, choose which CSV or spreadsheet columns hold the date,
description and amount. PDF statements need `npm start` (Node.js), because browsers block the PDF reader on pages
opened straight from disk.

## Desenvolver

```
npm test                 # testes
npm run telas            # compara as telas com as referências aprovadas
npm run telas:completo   # as mesmas telas em pt-BR/en-GB × claro/escuro, só as conferências
```

O produto e a marca estão descritos em `PRODUCT.md`.

As fontes Manrope e Inter ficam em `fonts/` (licença SIL Open Font License, nos arquivos `OFL-*.txt`),
para a página não depender de nenhum servidor externo.

## Licença

O código do Nora é distribuído sob a licença MIT (arquivo `LICENSE`). As bibliotecas em `vendor/` (pdf.js e SheetJS)
e as fontes em `fonts/` mantêm as licenças próprias, que acompanham os arquivos.
