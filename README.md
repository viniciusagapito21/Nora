# Painel de Finanças

Painel de finanças pessoais que roda inteiro no seu navegador. Você importa o extrato CSV do banco e vê:

- saldo e para onde foi o dinheiro;
- gastos por mês e por categoria, com metas;
- previsão de como o mês vai fechar e quanto ainda dá para gastar por dia;
- contas fixas e assinaturas detectadas sozinhas;
- metas de poupança (reserva, investimentos, viagens) e taxa de poupança.

Nenhum dado sai do seu aparelho: não há servidor nem login.

## Usar

1. Abra `index.html` no navegador (ou rode `npm start`).
2. Toque em **Adicionar extrato** e escolha o CSV do Revolut. Para testar sem dados reais, use
   `exemplo/extrato-exemplo.csv`.

Por enquanto só lê extratos do Revolut em euro. Outros bancos e a versão em inglês estão no plano
(veja `CLAUDE.md`).

## Desenvolver

```
npm test
```

O guia completo do código e o plano de trabalho estão em `CLAUDE.md`.
