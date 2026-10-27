# Levantamento da formatação atual

Leitura somente de `app.js` da pasta principal. As quantidades abaixo contam pontos de uso no arquivo, sem contar a declaração da própria função. Os exemplos são saídas atuais para valores e datas de demonstração; não vieram de extratos.

## Dinheiro, números e percentuais

O painel guarda valores monetários do modelo em unidades da moeda (por exemplo, `12.34` significa doze unidades e trinta e quatro centavos). `f0` arredonda para a unidade inteira com `Math.round`; `f2` e `fMoeda` recebem o valor já dividido. `f0`, `fP0` e `fW` trocam o hífen de negativo por menos matemático (`−`); `f2`, `fMoeda` e `valorMov` deixam o sinal que o `Intl` produz. Em pt-BR, o `Intl` põe um espaço não separável entre símbolo e número.

| Nome | Saída atual em pt-BR | Onde aparece | Usos |
|---|---|---|---:|
| `fmtDe(cod, casas)` | Formatador de moeda com casas definidas; se o código falha, usa número sem símbolo. | Base de `simbolo`, `f0`, `f2`, `fP0`, `fW` e dois usos diretos em linhas de carteira e transferências. | 7 chamadas diretas |
| `f0(v)` | `f0(1234.56)` → `€ 1.235`; `f0(-1234.56)` → `−€ 1.235`. Moeda atual da configuração, sem centavos. | Valores do painel, gráficos, contas, metas, observações e histórico. | 64 |
| `f2(v)` | `f2(1234.56)` → `€ 1.234,56`; duas casas fixas e moeda da configuração. | Detalhes e campos de dinheiro que preservam centavos. | 27 |
| `sgn(v, fn)` | Prefixa `+` ou `−` e chama `fn` com o módulo; sem `fn`, usa `f0`. | Valores com sinal em movimentos e transferências. | 7 |
| `fP0(v)` | Mesmo formato de `f0`, usando a moeda principal do Resumo. | Resumo e metas quando há várias carteiras. | 15 |
| `fW(v, cod)` | Mesmo formato inteiro de `f0`, para uma carteira e sua moeda. | Valores por carteira no Resumo. | 7 |
| `valorMov(r, cod)` | Sinal e moeda com duas casas; `r.a = -12.5` → `−€ 12,50`. | Sugestões e detalhes de transferências. | 4 |
| `fMoeda(v, cod)` | Moeda indicada com casas padrão do código; `fMoeda(1234.56, 'USD')` → `US$ 1.234,56`. Se o `Intl` falha, usa `COD 1.234,56`. | Dívidas e pagamentos em moedas diferentes da moeda principal. | 3 |
| `simbolo(cod)` | Símbolo vindo de `formatToParts`: EUR `€`, BRL `R$`, USD `US$`, GBP `£`. | Rótulos de moeda e câmbio. | 11 |
| `nomeMoeda(cod)` | Mapa fixo: `euro`, `real`, `libra`, `dólar`; códigos sem entrada ficam como o código. | Resumo, observações, configurações e mensagens. | 14 |
| `nn.format(v)` | Inteiro localizado; `1234.56` → `1.235`. | Eixos e tabelas de gráficos, percentuais e metas. | 11 |
| `n2.format(v)` | Duas casas fixas; `1234.5` → `1.234,50`. | Só no fallback de `fMoeda`. | 1 |
| `n1.format(v)` | Até uma casa decimal. | Diferença percentual de transferências. | 1 |
| `nr.format(v)` | De duas a quatro casas. | Taxas de câmbio e sua idade no Resumo. | 5 |
| `pct(v)` | `nn.format(v) + '%'`; `12.5` → `13%`. | Taxa de poupança. | 2 |

Além dessas funções, há duas formatações numéricas pontuais: uma casa decimal no tamanho de armazenamento em MiB (uma saída) e `toLocaleString('pt-BR')` na contagem de linhas de uma planilha que excedeu o limite (uma saída). O arquivo tem oito construções `new Intl.NumberFormat('pt-BR', ...)`, contando o fallback de `fmtDe`. Não há `Intl.DateTimeFormat` nem `toLocaleDateString` no app atual.

## Datas e meses

As datas de tela partem de ISO `AAAA-MM-DD`; mês e ano partem de `AAAA-MM`. `MES` e `MS` são listas fixas em português, então as saídas atuais não mudam com a preferência de idioma.

| Nome | Saída atual em pt-BR | Onde aparece | Usos |
|---|---|---|---:|
| `dFmt(d)` | `dFmt('2026-01-02')` → `2 jan`. | Datas em listas, taxas, alertas e detalhes. | 14 |
| `dFull(d)` | `dFull('2026-01-02')` → `2 jan 2026`. | Datas completas em cartões, períodos, histórico, lembretes e gráficos. | 52 |
| `mLabel(k)` | `mLabel('2026-01')` → `janeiro de 2026`. | Títulos e rótulos de mês no painel e no histórico. | 17 |
| `mShort(k)` | `mShort('2026-01')` → `jan`. | Eixos e rótulos compactos de mês. | 7 |
| `mesAno(pz)` | `mesAno('2026-01')` → `jan 2026`. | Prazo das metas de poupança. | 1 |
| `trecho(f)` | Uma data ou intervalo, composto com `dFull`. | Períodos de carteira e extrato. | 1 |
| `vencTxt(iso)` | Texto relativo localizado por chave, como “vence hoje” ou “vence em 3 dias”; a data associada usa `dFull`. | Lembretes de pagamento. | 1 |

`todayIso`, `diasAte`, `diasDesde`, `isoMais`, `fimDoMes` e `addMonth` calculam ou validam datas ISO; não formatam texto de tela. `toFixed` aparece em coordenadas SVG, larguras e valores de estilo, não como formatação numérica para a pessoa.

## Moedas e países

`nomePais(cod)` procura o rótulo português em `PAISES`, derivado da tabela de países/moedas; para código fora da tabela, devolve o próprio código. É usado na lista de países e nos avisos sobre regras de comerciantes (três referências). A tela ainda não pede o nome por `Intl.DisplayNames`.

## Próximo módulo

O novo `formato.js` mantém as saídas legadas em pt-BR e oferece `NORA_FORMATO.para('en-GB')` para o integrador adotar no `app.js`. Em pt-BR, `nomeMoeda` conserva os quatro nomes atuais e devolve o código para outros; em en-GB, usa `Intl.DisplayNames`. O nome de país usa `Intl.DisplayNames`, preserva “Vaticano” para compatibilidade e usa o nome fixo `Kosovo` para `XK`. O módulo também aceita centavos inteiros diretamente. Esta preparação não altera nem liga o módulo ao app.
