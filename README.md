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

1. Abra `index.html` no navegador (ou rode `npm start`).
2. Toque em **Adicionar extrato** e escolha o CSV do Revolut. Para testar sem dados reais, use
   `exemplo/extrato-exemplo.csv`.

Lê os extratos do Revolut, do BTG Pactual (.xls) e do Itaú (PDF); outros bancos entram pelo importador genérico
(CSV ou planilha, escolhendo as colunas). Veja `CLAUDE.md` para o que ainda não foi testado.

## Desenvolver

```
npm test                 # testes
npm run telas            # compara as telas com as referências aprovadas
npm run telas:completo   # as mesmas telas em pt-BR/en-GB × claro/escuro, só as conferências
```

O guia completo do código e o plano de trabalho estão em `CLAUDE.md`; o produto e a marca, em `PRODUCT.md`.

As fontes Manrope e Inter ficam em `fonts/` (licença SIL Open Font License, nos arquivos `OFL-*.txt`),
para a página não depender de nenhum servidor externo.
