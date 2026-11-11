# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Qualquer pessoa com conta no Revolut (por enquanto, conta em euro e regras de comerciantes da Irlanda)
que quer entender para onde vai o dinheiro sem entregar os dados a ninguém. Usa no celular e no
computador na mesma medida: no computador para importar o extrato CSV e revisar categorias; no
celular para ver como está o mês.

## Product Purpose
Importar o extrato CSV do banco e mostrar saldo, gastos por mês e por categoria com metas, previsão de
como o mês vai fechar, contas fixas detectadas, metas de poupança e pagamentos em observação em
qualquer moeda. Sucesso: a pessoa configura sozinha, importa o extrato e sabe quanto ainda pode gastar
no mês.

## Positioning
Tudo roda no navegador: não há servidor, login, analytics nem API. Os dados ficam no aparelho
(`localStorage`), com backup em JSON que a pessoa baixa e restaura.

## Capabilities and Constraints
- Site estático (HTML, CSS e JS sem build); abre direto do arquivo ou por servidor estático.
- Nenhum dado financeiro sai do navegador; nenhuma fonte, script ou imagem vem de servidor externo.
- Interface em português do Brasil e em inglês britânico.
- Lê extratos do Revolut, do BTG Pactual e do Itaú; outros bancos entram pela escolha de colunas.
- Exemplos sempre com dados inventados.
- As chaves salvas continuam `cortex-financas.*`; mudar exige migração.

## Brand Commitments
- Nome: **Nora**. Lema do brand board: "Clarity you can act on." Uma identidade calma e humana para
  decisões financeiras do dia a dia.
- Documento de origem: `../brand-board.svg` (out/2026).
- Cores: Deep Fjord `#17343B`, Nora Teal `#2F8F7B`, Pale Mint `#DCEFE8`, Warm Paper `#F7F5EF`,
  Apricot `#E7A278`.
- Tipos: Manrope nos títulos (600–700), Inter na interface (400–600).
- Tema escolhido pelo autor: claro, sobre Warm Paper. Um tema só.
- Logo (`logo.svg`, monograma N + palavra Nora) e ícone (`icon.svg`, N em Pale Mint sobre Deep Fjord).

## Evidence on Hand
- `exemplo/extrato-exemplo.csv`: extrato inventado de 4 meses no formato do Revolut.
- Não há depoimentos, clientes ou números de uso; não invente.

## Product Principles
1. Os dados são da pessoa: nada sai do aparelho, e ela pode baixar, restaurar e apagar tudo.
2. Números que levam a uma ação: a previsão e as metas dizem quanto ainda dá para gastar.
3. Sem valores de ninguém como padrão: metas e nomes vêm da pessoa ou do próprio extrato.
4. Errar para o lado seguro: na dúvida, a previsão conta a conta fixa que ainda não caiu.

## Accessibility & Inclusion
Texto com contraste AA (4,5:1; 3:1 para texto grande), controles com 44 px no toque, cores de
categoria distinguíveis com daltonismo e sempre acompanhadas de nome (legenda e tabela).
