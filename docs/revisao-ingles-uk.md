# Revisão do inglês britânico (`en-GB`) — Nora

Base lida (somente leitura) em `~/Documents/Finance/cortex-financas`:
- `i18n/pt-BR.js` (97 chaves)
- `i18n/en-GB.js` (97 chaves)

## Critérios aplicados nesta revisão

1. **Inglês britânico cotidiano (`en-GB`) para finanças pessoais:** vocabulário próximo ao que pessoas comuns veem no Reino Unido (*Monzo*, *Starling*, *MoneyHelper*), sem jargão contábil ou técnico.
2. **Tom simples, calmo e acolhedor:** pensado para quem pode estar organizando gastos pela primeira vez — sem culpar a pessoa e sem termos internos de programação (como *"dedicated reader"*).
3. **Grafia e pontuação britânicas:** `instalment` (um `l`), `organise`, `categorise`, `colour`, `cancelled`, `cheque`; datas como `1 January` (sem vírgula nem ordinal na escrita simples); exemplos curtos em *placeholders* com `e.g.` sem dois-pontos (`e.g. CHF`).
4. **Marcas e nomes próprios intocados:** `Nora`, `Revolut`, `Flexible Cash`, `Pix` (além dos nomes de bancos).
5. **Segurança com variáveis `{...}` e plurais:** todas as sugestões preservam exatamente os mesmos `{placeholders}` do `pt-BR.js` e testam o encaixe gramatical em outra ordem de palavras (incluindo `1` vs vários itens e nomes de abas/moedas injetados).
6. **Datas e moeda apenas como texto:** formatação numérica e de datas (`Intl`) fica para o passo específico.

---

## Decisões que dependem de você (ambiguidades de produto e tom)

Antes de editar o `i18n/en-GB.js`, vale bater o martelo nestes **8 pontos**, porque eles se repetem nas áreas de `app.js` que ainda serão extraídas:

### 1. `Account` vs `Wallet` (`Carteira` vs `Conta`)
- **Como está hoje:** `Accounts` (`abas.rotulo`), `{n} accounts` (`casca.resumoTopo`), `account in {moeda}` (`casca.contaEm`).
- **O dilema:** Em inglês britânico, ninguém chama conta bancária de *wallet* (*wallet* lembra *Apple Wallet* ou cripto), então **`Account` é muito mais natural**. Porém, o Nora usa *carteira* para o espaço no app e *conta* para o banco. Em 95% das telas ambos podem ser `account` sem ruído — exceto em dois lugares:
  1. **`cats.brasil.antigo` (`Contas no Brasil`):** aqui *contas* significa **boletos/despesas** (como em *Aluguel e contas*), **não** contas bancárias. Hoje está `Accounts in Brazil` (erro de sentido); deve ser **`Bills in Brazil`**.
  2. **Explicações de configuração** (*"Uma carteira para cada conta"*): basta escrever *"One tab/space per bank account"* ou *"Add one account per bank and currency"*.
- **Recomendação:** manter **`Account` / `Accounts`** para `Carteira(s)` e corrigir `cats.brasil.antigo` para **`Bills in Brazil`**.

### 2. `Summary` vs `Overview` (`Resumo`)
- **Como está hoje:** `Summary` (`abas.resumo`).
- **O dilema:** No Reino Unido, `Summary` lembra o PDF estático de fim de mês (*statement summary*). Para a primeira aba viva que consolida saldos, transferências, metas e pagamentos, apps britânicos usam quase sempre **`Overview`**.
- **Nota gramatical ligada (`casca.notaResumo`):** hoje diz *"are in the {resumo}"*, que renderiza *"are in the Summary"* (soa truncado para nome de aba). Trocar para **`on the {resumo} tab`** funciona tanto com `Overview` quanto com `Summary`.
- **Recomendação:** **`Overview`** + `on the {resumo} tab`.

### 3. `Money in` / `Spent` / `Saved` vs `Money out` / `Income` / `Outgoings`
- **Como está hoje:** `Money in` (`comum.entrou`) e `Spent` (`comum.gastou`).
- **O dilema:** Há dois contextos diferentes no Nora:
  - **KPIs do mês (`Entrou · Gastou · Guardou · Saldo do mês`):** `Money in` é ótimo (melhor que `Income`, pois pode entrar reembolso ou venda avulsa), e **`Money in` · `Spent` · `Saved` · `Monthly balance`** (ou `Left over`) conversa direto com a pessoa.
  - **Prévia de importação de extrato (`Entradas · Saídas`):** ali os números são brutos (incluem transferências entre contas e investimentos antes de categorizar), então chamar `Saídas` de `Spent` seria impreciso; ali o par exato é **`Money in` / `Money out`**.
- **Recomendação:** manter **`Money in`** e **`Spent`** nos KPIs/gráficos, usar **`Saved`** para `Guardou`, e reservar **`Money in` / `Money out`** para `Entradas` / `Saídas` brutas na importação.

### 4. `"Debts on watch"` (`Em observação`)
- **Como está hoje:** `Debts on watch` (`obs.titulo`) e `No debts on watch.` (`obs.vazio`).
- **O dilema:** Em português, *"Em observação — pagamentos para fazer"* (com exemplos *"banco ou escola"*, *"Parcela 4/5"*) é leve e serve para mensalidade escolar, imposto futuro ou conta em outra moeda. No Reino Unido, a palavra **`Debts`** tem carga pesada de inadimplência/dívida atrasada (*debt collection*). Até `obs.vazio` em português diz *"Nenhum pagamento"*, não *"Nenhuma dívida"*.
- **Opções:**
  - **`Upcoming payments`** (mais natural e acolhedora; subtítulo pode virar `bills and future payments` para não repetir *payments*)
  - **`Payments to watch`** (preserva a ideia exata de *"em observação"* sem o peso de *debts*, mantendo o subtítulo `payments to make`)
  - **`Bills to watch`** (curto, mas exclui pagamentos que não parecem conta/boleto)
- **Recomendação:** **`Payments to watch`** (se quiser manter a imagem de *"em observação"*) ou **`Upcoming payments`**.

### 5. `"Returns"` (`Rendimento` em extratos e poupança)
- **Onde vai aparecer (passo d):** rótulo de entradas automáticas de juros/CDB/conta remunerada (`Rendimento`, ex.: Itaú / Flexible Cash).
- **O dilema:** Em apps de consumo no Reino Unido, **`Returns`** sozinho é lido de imediato como **devolução de compra em loja** (*shop returns*). Já `Estorno / Reembolso` é **`Refund`**.
- **Recomendação:** usar **`Interest & returns`** (ou **`Investment returns`** quando for só fundo/investimento) para `Rendimento`, e **`Refund` / `Refunds`** para `Estorno / Reembolso`.

### 6. `"Card bill"` (`Fatura` / `Pagamento de fatura do cartão`)
- **Onde vai aparecer (passo d):** movimentos de pagamento da fatura mensal de cartão de crédito (BTG, Itaú, Nubank).
- **O dilema:** No Reino Unido, *bill* sozinho remete a luz/água/gás (*household bills*) ou conta de restaurante; e *card payment* significa qualquer compra passada no cartão na padaria. Para a fatura mensal do cartão de crédito, diz-se **`Credit card bill`** (ou **`Credit card bill payment`** para o pagamento dela).
- **Recomendação:** **`Credit card bill`** (substantivo curto) e **`Credit card bill payment`** (quando descrever o pagamento da fatura).

### 7. `"target"` vs `"budget"` / `"goal"` (`Meta de gasto` vs `Meta de poupança`)
- **Como está hoje:** `target {valor} a month` em `casca.cartaoMeta` (rodapé do cartão que mostra quanto você **gastou** no mês).
- **O dilema:** Em português, *meta* serve tanto para teto de gasto quanto para objetivo de poupança. Em inglês, ver *"£1,420 Spent in Oct · target £1,800 a month"* passa para iniciantes a ideia de que £1.800 é um alvo a bater. No Reino Unido, teto mensal de gasto é **`budget`** (ou **`spending limit`**), enquanto reserva/objetivo é **`savings goal`** (ou **`target`**).
- **Recomendação:** usar **`budget`** para metas de gasto (`budget {valor} a month`, `Monthly budgets`) e **`goal` / `target`** para metas de poupança (`Savings goals`).

### 8. Verbo de interação: `"Tap"` vs `"Select"` / `"Choose"` + nomes de moeda em `{moeda}`
- **Dispositivo (`casca.toqueAdicionar`, `casca.fimMes*`):** a frase atual mistura toque de celular com mouse na mesma linha (*"Tap Add statement or drag the file onto this page"*). **`Select Add statement`** (ou `Click or tap`) funciona igual no celular e no computador.
- **Variável `{moeda}` (`obs.pagoEmMoeda`, `casca.contaEm`, `casca.resumoTopo`):** no `app.js`, `{moeda}` vem de `nomeMoeda()` (hoje `{ EUR: 'euro', BRL: 'real', GBP: 'libra', USD: 'dólar' }`). Em português o singular funciona em *"pago em libra"*, *"conta em libra"* e *"somas em libra"*, mas em inglês *"paid in pound"* ou *"totals in pound"* quebra a gramática. Ao traduzir `NOME_MOEDA` no passo d, vale usar **plural** (`euros`, `reais`, `pounds`, `US dollars`) — ou códigos ISO (`EUR`, `BRL`, `GBP`, `USD`) — e usar código/símbolo onde houver *"1 …"*.

---

## Tabela completa de revisão (`i18n/en-GB.js` — todas as 97 chaves)

| chave | português | inglês atual | sugestão (ou "ok") | motivo curto |
| :--- | :--- | :--- | :--- | :--- |
| `abas.rotulo` | Carteiras | Accounts | ok *(ver Decisão 1)* | Natural em `en-GB`; *Accounts* é mais claro que *Wallets* para contas bancárias. |
| `abas.resumo` | Resumo | Summary | `Overview` *(ver Decisão 2)* | No UK, *Overview* soa mais acolhedor para painel geral; *Summary* lembra extrato fechado. |
| `tema.rotulo` | Tema | Theme | ok | Padrão claro e natural. |
| `tema.auto` | Automático | Automatic | ok | Mais simples para pessoas comuns do que *System default*. |
| `tema.claro` | Claro | Light | ok | Padrão universal. |
| `tema.escuro` | Escuro | Dark | ok | Padrão universal. |
| `idioma.rotulo` | Idioma | Language | ok | Padrão universal. |
| `idioma.auto` | Automático (do navegador) | Automatic (from your browser) | ok | Acolhedor e autoexplicativo sem jargão. |
| `idioma.pt-BR` | Português (Brasil) | Português (Brasil) | ok | Nome do idioma no próprio idioma (boa prática). |
| `idioma.en-GB` | English (UK) | English (UK) | ok | Forma consagrada no Reino Unido. |
| `importar.adicionou` | `one`: Adicionei `{n}` movimentação em `{meses}`<br>`other`: Adicionei `{n}` movimentações em `{meses}` | `one`: Added `{n}` transaction across `{meses}`<br>`other`: Added `{n}` transactions across `{meses}` | `one`: `Added {n} transaction in {meses}`<br>`other`: `Added {n} transactions in {meses}` | Quando `{meses}` vale `1 month`, *"across 1 month"* soa estranho; `in {meses}` funciona para `1 month` e `4 months`. |
| `importar.meses` | `one`: `{n}` mês<br>`other`: `{n}` meses | `one`: `{n}` month<br>`other`: `{n}` months | ok | Plural correto via `Intl.PluralRules`. |
| `metas.padrao.reserva` | Reserva de emergência | Emergency fund | ok | Termo exato e familiar em finanças pessoais no UK. |
| `metas.padrao.invest` | Investimentos | Investments | ok | Direto e natural. |
| `metas.padrao.viagens` | Viagens pequenas | Short trips | `Short breaks` *(ou manter `Short trips`)* | *Short breaks* é muito idiomático no UK para viagens curtas/fins de semana; *Short trips* também é claro. |
| `metas.padrao.viagem` | Viagem grande do ano | Big trip of the year | `Main holiday of the year` *(ou `Big holiday`)* | No Reino Unido diz-se *holiday* para a grande viagem de férias anual (*trip* soa mais EUA ou viagem curta). |
| `cats.brasil.antigo` | Contas no Brasil | Accounts in Brazil | `Bills in Brazil` | **Correção de sentido:** na v1, esta categoria de gasto referia-se a pagar *contas/despesas* no Brasil, não contas bancárias (*accounts*). |
| `comum.gastou` | Gastou | Spent | ok *(ver Decisão 3)* | Direto e conversacional nos cartões e gráficos. |
| `comum.entrou` | Entrou | Money in | ok *(ver Decisão 3)* | Consagrado em bancos digitais do UK e mais fiel que *Income*. |
| `casca.carregando` | Carregando… | Loading… | ok | Reticências tipográficas corretas. |
| `casca.financas` | Finanças | Finances | ok | Natural para o selo do cartão. |
| `dica.mesEmAndamento` | `{mes}` · em andamento | `{mes}` · in progress | `{mes} · so far` *(ou manter `{mes} · in progress`)* | *"October 2026 · so far"* soa mais cotidiano em finanças pessoais do que *in progress* e alinha com `casca.cartaoTituloParcial`. |
| `comum.remover` | Remover | Remove | ok | Claro e neutro. |
| `comum.removerNome` | Remover `{nome}` | Remove `{nome}` | ok | Bom rótulo acessível (`aria-label`) em qualquer ordem de palavras. |
| `comum.total` | Total | Total | ok | Idêntico e natural. |
| `comum.nome` | Nome | Name | ok | Direto. |
| `comum.valor` | Valor | Amount | ok | Termo exato no UK para quantia em dinheiro (melhor que *Value*). |
| `comum.moeda` | Moeda | Currency | ok | Direto. |
| `comum.adicionar` | Adicionar | Add | ok | Direto. |
| `obs.titulo` | Em observação | Debts on watch | `Payments to watch` *(ou `Upcoming payments` — ver Decisão 4)* | *Debts* tem conotação pesada de dívida em atraso no UK; em pt-BR a seção abriga qualquer pagamento futuro (escola, câmbio, parcela). |
| `obs.subtitulo` | pagamentos para fazer | payments to make | ok *(ou `bills and future payments` se o título usar `payments`)* | Se o título virar `Payments to watch` / `Upcoming payments`, variar o subtítulo evita repetir *payments* duas vezes seguidas. |
| `obs.vazio` | Nenhum pagamento em observação. | No debts on watch. | `No payments to watch.` *(ou `No upcoming payments.` — ver Decisão 4)* | O próprio pt-BR diz *pagamento*, não *dívida*; evita rotular contas futuras como *debts*. |
| `obs.venceHoje` | vence hoje | due today | ok | Conciso e natural. |
| `obs.venceAmanha` | vence amanhã | due tomorrow | ok | Conciso e natural. |
| `obs.venceEm` | vence em `{n}` dias | due in `{n}` days | ok | Só é chamado para `n > 1`, então o plural fixo é seguro. |
| `obs.venceuOntem` | venceu ontem | was due yesterday | `due yesterday` *(ou manter `was due yesterday`)* | Em `{quando}, {data}` (*"due yesterday, 25 Oct 2026"*), sem `was` fica mais enxuto e paralelo a `due today`. |
| `obs.venceuHa` | venceu há `{n}` dias | overdue by `{n}` days | ok | Só entra para `n > 1`; *"overdue by 5 days, 21 Oct 2026"* é claro e sem tom punitivo. |
| `obs.vencimentoData` | `{quando}`, `{data}` | `{quando}`, `{data}` | ok | A ordem `{quando}, {data}` funciona naturalmente com todas as frases de vencimento em inglês. |
| `obs.anotadaEm` | anotada em `{data}` | noted on `{data}` | `added on {data}` *(ou manter `noted on {data}`)* | `added on 12 Oct 2026` é mais simples e habitual em apps britânicos do que `noted on`. |
| `obs.pagoEmMoeda` | pago em `{moeda}`, sem câmbio | paid in `{moeda}`, no exchange needed | `paid in {moeda}, no conversion needed` | *No conversion needed* é mais idiomático no UK; requer que `{moeda}` (`nomeMoeda`) venha no plural (`pounds`, `euros`) ou código (`GBP`). |
| `obs.reservarComMargem` | reservar `{valor}` com `{margem}`% de margem | set aside `{valor}` with a `{margem}`% margin | `set aside {valor} with a {margem}% buffer` | *Buffer* é mais cotidiano e acessível do que *margin* (que soa a jargão de investimentos/lucro). |
| `obs.definaCambio` | defina o câmbio de `{moeda}` abaixo | set the `{moeda}` exchange rate below | ok | Claro e funciona bem com códigos ISO (`CHF`, `BRL`). |
| `obs.marcarPaga` | Marcar `{nome}` como paga | Mark `{nome}` as paid | ok | Excelente texto de `aria-label` para leitores de tela. |
| `obs.paguei` | Paguei | Paid | `Mark paid` *(ou `I've paid`)* | Como botão de ação ao lado de `Remove`, `Paid` parece estado já concluído e repete o título `Paid ({n})` logo abaixo. |
| `obs.valorEmMoeda` | `{valor}` em `{moeda}` | `{valor}` in `{moeda}` | ok | Encaixe limpo no resumo (*"£420 in EUR"*). |
| `obs.reservar` | reservar `{valor}` | set aside `{valor}` | ok | *Set aside* é acolhedor e muito natural em `en-GB`. |
| `obs.posicao` | (posição de `{data}`) | (as of `{data}`) | ok | Entra em `{pos}` antes do ponto final nas quatro frases abaixo com encaixe perfeito. |
| `obs.saldoCobre` | O saldo da conta (`{saldo}`) já cobre o valor reservado`{pos}`. | The account balance (`{saldo}`) already covers the amount set aside`{pos}`. | `Your account balance ({saldo}) already covers the amount set aside{pos}.` | `Your` em vez de `The` deixa o tom mais próximo e acolhedor. |
| `obs.flexCobre` | A conta tem `{saldo}` e faltam `{falta}` para cobrir o valor reservado. O Flexible Cash (`{flex}`) cobre a diferença`{pos}`. | The account has `{saldo}`, `{falta}` short of the amount set aside. Flexible Cash (`{flex}`) covers the difference`{pos}`. | `Your account has {saldo}, {falta} short of the amount set aside. Flexible Cash ({flex}) covers the difference{pos}.` | Preserva `Flexible Cash` intacto e alinha `Your account` com as frases irmãs. |
| `obs.contaEFlexFaltam` | A conta (`{saldo}`) e o Flexible Cash (`{flex}`) somam `{soma}`; ainda faltam `{falta}` para cobrir tudo`{pos}`. | The account (`{saldo}`) and Flexible Cash (`{flex}`) add up to `{soma}`; `{falta}` still needed to cover everything`{pos}`. | `Your account ({saldo}) and Flexible Cash ({flex}) add up to {soma}, so you still need {falta} to cover everything{pos}.` | Evita frase telegráfica sem verbo (*"{falta} still needed"*) e deixa a leitura mais fluida. |
| `obs.faltam` | A conta tem `{saldo}`; faltam `{falta}` para cobrir o valor reservado`{pos}`. | The account has `{saldo}`; `{falta}` short of the amount set aside`{pos}`. | `Your account has {saldo} — {falta} short of the amount set aside{pos}.` | Mais natural que o ponto e vírgula e consistente com `Your account`. |
| `obs.definirCambio` | Definir câmbio (`{moedas}`) | Set exchange rates (`{moedas}`) | `Set exchange rate ({moedas})` *(ou `Exchange rates ({moedas})`)* | Quando há uma única moeda (`CHF`), `Set exchange rates (CHF)` fica no plural para um item só; no singular funciona bem mesmo com lista. |
| `obs.margem` | Margem para taxa e câmbio (%) | Margin for fees and exchange (%) | `Buffer for fees and exchange rate (%)` | Alinha *buffer* com `obs.reservarComMargem`, e em inglês diz-se *exchange rate* (não apenas *exchange*). |
| `obs.atualizarCambio` | Atualizar câmbio | Update exchange rates | `Update exchange rate` *(ou `Save exchange rates`)* | Evita plural estranho quando só existe 1 moeda estrangeira no formulário. |
| `obs.adicionarPagamento` | Adicionar pagamento | Add payment | ok | Simples e consistente. |
| `obs.exNome` | Ex.: banco ou escola | E.g. bank or school | `e.g. bank or school` | Em *placeholders* no estilo britânico, `e.g.` em minúsculas é mais leve e consistente com `ex.:` no resto do app. |
| `obs.outraMoeda` | Outra… | Other… | ok | Claro no seletor de moeda. |
| `obs.codigoMoeda` | Código da moeda | Currency code | ok | Claro ao lado do exemplo `CHF`. |
| `obs.exCodigo` | Ex.: CHF | E.g. CHF | `e.g. CHF` | Padronização de `e.g.` em minúscula nos *placeholders*. |
| `obs.vencimentoOpcional` | Vencimento (opcional) | Due date (optional) | ok | Idiomático e direto. |
| `obs.descricaoOpcional` | Descrição (opcional) | Description (optional) | ok | Claro e fiel ao original. |
| `obs.exDescricao` | Ex.: Parcela 4/5 | E.g. Instalment 4/5 | `e.g. Instalment 4/5` | Grafia britânica `Instalment` (um `l`) já está certa; só minúscula em `e.g.` para padronizar *placeholders*. |
| `obs.pagas` | Pagas (`{n}`) | Paid (`{n}`) | ok | Funciona para `1` e vários itens em inglês (`Paid (1)`, `Paid (4)`). |
| `obs.pagaEm` | paga em `{data}` | paid on `{data}` | ok | Idiomático (*"paid on 14 Oct 2026"*). |
| `comum.configuracoes` | Configurações | Settings | ok | Padrão universal no UK. |
| `comum.adicionarExtrato` | Adicionar extrato | Add statement | ok | Curto, claro e cabe bem em 390 px. |
| `comum.baixarBackup` | Baixar backup | Download backup | ok | Direto e claro. |
| `casca.resumoCarteira` | `{n}` movimentações · `{de}` a `{ate}` · última em `{data}` | `{n}` transactions · `{de}` to `{ate}` · latest on `{data}` | `one`: `{n} transaction · {de} to {ate} · latest on {data}`<br>`other`: `{n} transactions · {de} to {ate} · latest on {data}` | Ótimo texto, mas convém passar a `{ one, other }` para evitar *"1 transactions"*. |
| `casca.contaEm` | `{origem}` · conta em `{moeda}` | `{origem}` · account in `{moeda}` | `{origem} · {moeda} account` *(ou manter com `{moeda}` plural/ISO)* | No UK, *"Revolut · GBP account"* ou *"Revolut · euro account"* é muito natural; se mantiver `account in {moeda}`, `{moeda}` precisa ser `pounds`/`GBP` (não *pound*). |
| `casca.resumoTopo` | `{n}` carteiras · somas em `{moeda}` | `{n}` accounts · totals in `{moeda}` | ok *(garantindo `{moeda}` plural ou código ISO)* | Só aparece com 2+ carteiras (`accounts` seguro); atenção a `nomeMoeda()` no passo d para gerar *"totals in pounds"* / *"totals in EUR"*. |
| `casca.dadosAte` | dados até `{data}` | data up to `{data}` | ok *(ou `up to {data}`)* | Claro e conciso no cabeçalho do Resumo. |
| `casca.semEspaco` | A última mudança não foi salva: o espaço deste navegador acabou. Baixe um backup para não perder o que fez. | Your last change wasn't saved: this browser has run out of space. Download a backup so you don't lose your work. | `Your last change wasn't saved because this browser has run out of storage space. Download a backup so you don't lose your changes.` | *"lose your work"* soa a ferramenta corporativa; *"lose your changes"* é mais natural para finanças pessoais. |
| `casca.espacoPerto` | Os dados do Nora ocupam `{mb}` MB neste navegador, perto do limite de cerca de 5 MB. A cópia da versão anterior, guardada para dar para voltar, entra na conta. Baixe um backup: se o espaço acabar, o que você mudar deixa de ser salvo. | Nora's data takes up `{mb}` MB in this browser, close to the limit of about 5 MB. The copy of the previous version, kept so you can go back, counts towards it. Download a backup: if space runs out, your changes will stop being saved. | `Nora is using {mb} MB in this browser, close to the ~5 MB limit (including a safety copy of your older data). Download a backup — if space runs out, new changes won't be saved.` | A frase do meio estava literal e técnica demais para quem não conhece versões internas do app; a versão enxuta explica sem assustar. |
| `casca.notaResumo` | Em observação e Metas de poupança valem para todas as carteiras e ficam no `{resumo}`. | Debts on watch and Savings goals apply to all accounts and are in the `{resumo}`. | `Payments to watch and Savings goals apply across all accounts and are on the {resumo} tab.` *(ajustar conforme Decisões 1, 2 e 4)* | **Correção gramatical:** *"in the Summary"* / *"in the Overview"* soa quebrado para aba de navegação; `on the {resumo} tab` funciona com qualquer nome de aba. |
| `casca.primeiroExtrato` | Primeiro extrato | First statement | ok | Funciona bem como chapéu (*eyebrow*) da tela vazia. |
| `casca.nenhumExtrato` | Nenhum extrato salvo ainda | No statements saved yet | ok | Tom calmo e claro. |
| `casca.baixePdf` | No app ou no site de `{origem}`, baixe o extrato da conta em PDF. | In the `{origem}` app or website, download your account statement as a PDF. | `Open {origem} (app or website) and download your account statement as a PDF.` | Evita misturar preposições (*in* the app vs *on* the website) e funciona mesmo quando `{origem}` é um apelido dado pela pessoa (ex.: *"Joint account"*). |
| `casca.baixePlanilha` | No app ou no site de `{origem}`, baixe o extrato da conta em CSV ou planilha (.xls, .xlsx). | In the `{origem}` app or website, download your account statement as a CSV or spreadsheet (.xls, .xlsx). | `Open {origem} (app or website) and download your account statement as a CSV or spreadsheet (.xls, .xlsx).` | Mesmo motivo de `casca.baixePdf`: soa natural tanto com nome de banco (`Barclays`) quanto com nome de carteira (`Main account`). |
| `casca.toqueAdicionar` | Toque em Adicionar extrato ou arraste o arquivo para esta página. | Tap Add statement or drag the file onto this page. | `Select Add statement, or drag the file onto this page.` *(ver Decisão 8)* | Evita misturar gesto exclusivo de tela sensível ao toque (*Tap*) com ação de computador (*drag*) na mesma frase. |
| `casca.primeiraVezColunas` | Na primeira vez, diga quais colunas são a data, a descrição e o valor, e confira a prévia antes de importar. | The first time, say which columns hold the date, the description and the amount, and check the preview before importing. | `The first time, choose which columns show the date, description and amount, then check the preview before importing.` | *"say which columns"* é tradução literal de *"diga quais colunas"*; na tela a pessoa escolhe (`choose`) em seletores. |
| `casca.escolherArquivo` | Escolher arquivo | Choose file | ok | Texto padrão de seletor de arquivos no navegador em `en-GB`. |
| `casca.revolutPasso1` | No Revolut, abra Extratos e escolha o extrato consolidado. | In Revolut, open Statements and choose the consolidated statement. | ok | Mantém `Revolut` sem traduzir e bate com os rótulos do app Revolut no Reino Unido. |
| `casca.revolutPasso2` | Baixe em CSV, de 1º de janeiro até hoje. | Download it as a CSV, from 1 January to today. | ok | Data `1 January` já está no formato britânico limpo. |
| `casca.escolherCsv` | Escolher arquivo CSV | Choose CSV file | ok | Claro e direto. |
| `casca.carregandoDados` | Carregando seus dados… | Loading your data… | ok | Acolhedor e direto. |
| `casca.fimMesRevolut` | Todo fim de mês: baixe o extrato consolidado do Revolut em CSV e toque em Adicionar extrato. Movimentos que já estavam salvos são ignorados. | At the end of every month: download the consolidated Revolut statement as a CSV and tap Add statement. Transactions already saved are skipped. | `At the end of each month, download your consolidated Revolut statement as a CSV and select Add statement. Transactions already saved are skipped.` | `each month,` com vírgula soa mais amigável que dois-pontos, `your` aproxima o tom e `select` vale para celular e computador. |
| `casca.fimMesPdf` | Todo fim de mês: baixe o extrato de `{origem}` em PDF e toque em Adicionar extrato. Movimentos que já estavam salvos são ignorados. | At the end of every month: download the `{origem}` statement as a PDF and tap Add statement. Transactions already saved are skipped. | `At the end of each month, download your {origem} statement as a PDF and select Add statement. Transactions already saved are skipped.` | Mesma padronização de tom e dispositivo de `casca.fimMesRevolut`. |
| `casca.fimMesPlanilha` | Todo fim de mês: baixe o extrato de `{origem}` em CSV ou planilha e toque em Adicionar extrato. Movimentos que já estavam salvos são ignorados. | At the end of every month: download the `{origem}` statement as a CSV or spreadsheet and tap Add statement. Transactions already saved are skipped. | `At the end of each month, download your {origem} statement as a CSV or spreadsheet and select Add statement. Transactions already saved are skipped.` | Mesma padronização das duas chaves irmãs acima. |
| `casca.cartaoVazio` | Nenhum extrato ainda | No statements yet | ok | Curto e natural para o minicartão. |
| `casca.cartaoAdicione` | adicione o CSV do Revolut | add your Revolut CSV | ok | Fiel ao texto atual em `pt-BR` e preserva `Revolut`. |
| `casca.cartaoTitulo` | Gasto em `{mes}` | Spent in `{mes}` | ok | Ex.: *"Spent in October 2026"* — natural. |
| `casca.cartaoTituloParcial` | Gasto em `{mes}`, até agora | Spent in `{mes}`, so far | `Spent in {mes} so far` | Em inglês britânico, *so far* ao final da expressão não pede vírgula antes (*"Spent in October 2026 so far"*). |
| `casca.cartaoMes` | em `{mes}` | in `{mes}` | ok | Encaixe curto ao lado do valor (*"£1,420 in Oct"*). |
| `casca.cartaoMeta` | meta `{valor}` por mês | target `{valor}` a month | `budget {valor} a month` *(ver Decisão 7)* | Como o cartão mostra **gastos**, *target* parece meta para gastar mais; *budget* deixa claro que é o orçamento/limite mensal. |
| `casca.escolherExtrato` | Escolher extrato | Choose statement | ok | Bom `aria-label` para o seletor de arquivo oculto. |
| `casca.escolherBackup` | Escolher backup | Choose backup | `Choose backup file` *(ou manter `Choose backup`)* | Em leitores de tela, `Choose backup file` deixa ainda mais claro que vai abrir a escolha de arquivo. |
| `config.semLeitor` | Sem leitor próprio: na primeira importação, você escolhe as colunas de data, descrição e valor e confere uma prévia. | No dedicated reader: on the first import, you choose the date, description and amount columns and check a preview. | `Guided column setup: on your first import, choose the date, description and amount columns and check a preview.` | *"No dedicated reader"* é jargão interno (*leitor* = parser) e parece aviso de erro para leigos; descrever o passo guiado é muito mais tranquilo. |

---

## Glossário fixo (28 termos: português → inglês britânico)

Guia de referência rápida para manter o mesmo registro nas próximas extrações do `app.js` (painel, configuração, categorias, transferências, conferência de saldo e importador):

| # | Português (Nora) | Inglês britânico (`en-GB`) | Observação de uso e consistência |
| :--- | :--- | :--- | :--- |
| 1 | **Carteira** (aba no Nora) | **Account** *(ou Wallet — Decisão 1)* | Usar sempre o mesmo termo nas abas, em Configurações e em `Excluir carteira` (`Delete account` / `Remove account` do Nora, deixando claro que só apaga no navegador). |
| 2 | **Conta** (conta no banco) | **Account** / **Bank account** | Em frases onde `Carteira` e `Conta` aparecem juntas, explicitar `bank account` para o banco. |
| 3 | **Resumo** (aba consolidada) | **Overview** *(ou Summary — Decisão 2)* | Usar com `on the Overview tab` (nunca `in the Overview`). |
| 4 | **Titular** (`Seu nome no extrato`) | **Account holder** (`Your name on statements`) | Na dica de configuração, manter o tom simples: `Your name as shown on statements`. |
| 5 | **Extrato** | **Statement** | `Add statement`, `First statement`, `No statements yet`. |
| 6 | **Movimentação / Movimento** | **Transaction** | Padronizar **sempre** `transaction` / `transactions` (nunca *movement*, que em inglês bancário não é natural). |
| 7 | **Entrou** (KPI do mês) | **Money in** *(Decisão 3)* | Abrange salário, reembolsos e entradas diversas sem prometer que tudo é renda fixa. |
| 8 | **Gastou** (KPI do mês) | **Spent** *(Decisão 3)* | Curto, humano e consistente com `Spent in {mes}` e `Spending by category`. |
| 9 | **Guardou** (KPI do mês) | **Saved** | Soma do que foi para reserva e investimentos no mês. |
| 10 | **Saldo do mês** (KPI) | **Monthly balance** *(ou Net this month)* | Resultado do mês (`money in − spent − saved`), distinto do saldo em conta (`Current balance`). |
| 11 | **Entradas / Saídas** (importador) | **Money in / Money out** | Na prévia do arquivo importado, onde ainda há transferências brutas não classificadas. |
| 12 | **Saldo atual / Saldo estimado** | **Current balance / Estimated balance** | `Estimated from transactions` para `estimado a partir dos movimentos`. |
| 13 | **Livre para gastar** | **Left to spend** | Expressão cotidiana e imediata no Reino Unido (*Monzo*, *Starling*). |
| 14 | **Cota diária** (`por dia`) | **Daily allowance** (`a day` / `per day`) | Ex.: `up to £35 a day` — acolhedor e sem tom de restrição dura. |
| 15 | **Previsão do mês** | **Monthly forecast** | `At this pace` para `no ritmo atual`; `Spent so far` para `Gasto até agora`. |
| 16 | **Meta de gasto / Metas por mês** | **Spending budget / Monthly budgets** *(Decisão 7)* | Usar **budget** quando for teto de gasto, nunca *target* sem contexto. |
| 17 | **Metas de poupança** | **Savings goals** *(Decisão 7)* | Usar **goal** para o que a pessoa quer juntar (`Saved so far` para `Já guardado`, `Target date` para `Prazo`). |
| 18 | **Taxa de poupança** | **Savings rate** | Em pontos percentuais: `percentage points` (ou `pts` em espaço curto). |
| 19 | **Em observação** | **Payments to watch** *(ou Upcoming payments — Decisão 4)* | Sem a palavra *debts*; usar `set aside` para `reservar`. |
| 20 | **Conta fixa / Contas fixas e assinaturas** | **Regular bill / Regular bills & subscriptions** | Evitar *Fixed accounts* (falso cognato); no UK diz-se *regular bills* ou *recurring bills*. |
| 21 | **Parcela** (ex.: `Parcela 4/5`) | **Instalment** (`Instalment 4/5`) | **Grafia britânica obrigatória:** um `l` só (`instalment`, nunca `installment`). |
| 22 | **Fatura do cartão** | **Credit card bill** *(Decisão 6)* | E `Credit card bill payment` para o pagamento mensal da fatura. |
| 23 | **Rendimento** (juros/aplicação) | **Interest & returns** *(Decisão 5)* | Evita confundir `Returns` isolado com devolução de compras em loja. |
| 24 | **Estorno / Reembolso** | **Refund** | Distinto de `Interest & returns`. |
| 25 | **Resgate de investimento** | **From investments / Savings withdrawal** | Quando dinheiro volta da reserva/investimento para a conta corrente sem ser renda nova. |
| 26 | **Entre contas suas / Transferências entre carteiras** | **Between your accounts / Transfers between accounts** | `Suggested transfers` (`Transferências sugeridas`) e `Confirmed transfers` (`Transferências confirmadas`). |
| 27 | **Dinheiro movido (não gasto)** | **Money moved (not spent)** | Explica de forma simples a opção da categoria de envios para outra conta sua. |
| 28 | **Revisar categorias / Comerciante** | **Review categories / Merchant** *(ou Shop or payee)* | Grafia britânica **categorise** (`categorise manually` para `categorize manualmente`). |
