# Componentes do painel (P1 a P5) — Guia de estrutura HTML e classes CSS

Este documento descreve a estrutura HTML exata, os estados, os atributos `aria-*` e os pares **ícone + texto** dos componentes aprovados nas prévias estáticas (`docs/painel-previa.html` e `docs/painel-previa-2.html`), cujos estilos estão na seção final `/* Painel: componentes P1 a P5 */` do `styles.css`.

Regras gerais:
- **Cores só por variáveis (`var(--...)`):** todas as classes funcionam automaticamente no tema claro (`:root`) e no tema escuro (`:root[data-tema="escuro"]`), sem `prefers-color-scheme`.
- **Nunca depender só de cor:** todo estado semântico (ok, info, atenção, estouro, resgate, privacidade ativa) combina `<svg class="painel-ico" aria-hidden="true">` + texto explícito.
- **Alvos de toque e teclado:** botões `.painel-mes-btn`, `.painel-priv-btn`, ações `.painel-conf-acoes .btn` e o campo `.painel-conf-ancora input` têm pelo menos `44px` de altura (e `44×44px` nas setas de mês), foco visível (`:focus-visible` com `outline: 2px solid var(--accent)`) e transições desligadas em `prefers-reduced-motion: reduce`.
- **Sem `style` inline nem `<script>` nos modelos abaixo:** quando o `app.js` ligar os componentes dinamicamente, apenas as larguras e posições percentuais calculadas em tempo de execução (`width` e `left` de `.painel-cota-seg`, `.painel-cota-meta` e `.cat .track i`/`b`) entram pelo mesmo mecanismo já usado hoje em `.ptrack` e `.cat .track`.

---

## 0. Utilitários compartilhados (`painel-ico` e `painel-selo`)

Usados em cabeçalhos de cartão e indicadores de estado em P1, P4, P4b e P5:

- `.painel-ico`: dimensiona o `<svg>` inline em `16×16px` (`flex: none`).
- `.painel-selo`: cápsula semântica com ícone + texto (`min-height: 28px`).
  - Modificadores de estado: `.painel-selo.ok` (`--pos`), `.painel-selo.info` (`--accent` / `--accent-ink`), `.painel-selo.atencao` (`--warn`), `.painel-selo.estouro` (`--neg`), `.painel-selo.neutro` (`--field-line` / `--soft`).

```html
<span class="painel-selo ok">
  <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="10" cy="10" r="8"/>
    <path d="M6.5 10.2 9 12.6l4.6-5.2"/>
  </svg>
  <span>Dentro da meta</span>
</span>
```

---

## 1. P1 — Cota diária e livre para gastar (`painel-cota-*`)

Classes no `styles.css`:
- `.painel-cota-card` (em conjunto com `.card`, e modificador `.painel-cota-card.em-estouro`)
- `.painel-cota-cab`, `.painel-cota-rotulo`
- `.painel-cota-destaque`, `.painel-cota-valor` (e `.painel-cota-valor.em-estouro`), `.painel-cota-resumo`
- `.painel-cota-trilha`, `.painel-cota-seg` (`.gasto-ok`, `.fixas-ok`, `.gasto-acima`, `.fixas-acima`), `.painel-cota-meta` (`.no-fim`)
- `.painel-cota-legenda`, `.painel-cota-sw-gasto`, `.painel-cota-sw-fixas`, `.painel-cota-sw-atencao`, `.painel-cota-sw-estouro`
- `.painel-cota-conta` (`<dl>` de 3 colunas que empilha em `<= 560px`)

### Estado 1 — Dentro do limite (livre positivo no mês em andamento)

```html
<div class="card painel-cota-card">
  <div class="painel-cota-cab">
    <span class="painel-cota-rotulo">Cota diária · outubro em andamento</span>
    <span class="painel-selo ok">
      <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="10" cy="10" r="8"/>
        <path d="M6.5 10.2 9 12.6l4.6-5.2"/>
      </svg>
      <span>Dentro da meta</span>
    </span>
  </div>
  <div class="painel-cota-destaque">
    <p class="painel-cota-valor">€ 20 <small>por dia</small></p>
    <p class="painel-cota-resumo"><strong>€ 300 livres para gastar</strong> · 15 dias pela frente</p>
  </div>
  <div class="painel-cota-trilha" role="img" aria-label="Meta de € 1.000: € 610 gastos, € 90 de contas fixas por cair e € 300 livres">
    <i class="painel-cota-seg gasto-ok"></i>
    <i class="painel-cota-seg fixas-ok"></i>
    <b class="painel-cota-meta no-fim"></b>
  </div>
  <div class="painel-cota-legenda">
    <span><i class="sw painel-cota-sw-gasto" aria-hidden="true"></i>já gasto (€ 610)</span>
    <span><i class="sw painel-cota-sw-fixas" aria-hidden="true"></i>fixas por cair (€ 90)</span>
    <span><i class="sw line" aria-hidden="true"></i>teto da meta (€ 1.000)</span>
  </div>
  <dl class="painel-cota-conta">
    <div><dt>Meta de gasto</dt><dd>€ 1.000</dd></div>
    <div><dt>Já gasto</dt><dd>€ 610</dd></div>
    <div><dt>Fixas por cair</dt><dd>€ 90</dd></div>
  </dl>
</div>
```

### Estado 2 — Fora do limite (livre negativo: mostra ícone + "Meta usada, € X acima", sem cota negativa)

```html
<div class="card painel-cota-card em-estouro">
  <div class="painel-cota-cab">
    <span class="painel-cota-rotulo">Cota diária · outubro em andamento</span>
    <span class="painel-selo estouro">
      <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6.8 2.5h6.4l4.3 4.3v6.4l-4.3 4.3H6.8l-4.3-4.3V6.8Z"/>
        <path d="M10 6.5v4.5"/>
        <circle cx="10" cy="14" r="0.7" fill="currentColor"/>
      </svg>
      <span>Limite ultrapassado</span>
    </span>
  </div>
  <div class="painel-cota-destaque">
    <p class="painel-cota-valor em-estouro">
      <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6.8 2.5h6.4l4.3 4.3v6.4l-4.3 4.3H6.8l-4.3-4.3V6.8Z"/>
        <path d="M10 6.5v4.5"/>
        <circle cx="10" cy="14" r="0.7" fill="currentColor"/>
      </svg>
      <span>Meta usada, € 100 acima</span>
    </p>
    <p class="painel-cota-resumo">Sem cota nos <strong>7 dias restantes</strong> · comprometido em <strong>€ 1.100</strong></p>
  </div>
  <div class="painel-cota-trilha" role="img" aria-label="Meta de € 1.000 ultrapassada em € 100: € 980 gastos mais € 120 de contas fixas por cair">
    <i class="painel-cota-seg gasto-acima"></i>
    <i class="painel-cota-seg fixas-acima"></i>
    <b class="painel-cota-meta"></b>
  </div>
  <div class="painel-cota-legenda">
    <span><i class="sw painel-cota-sw-estouro" aria-hidden="true"></i>já gasto (€ 980)</span>
    <span><i class="sw painel-cota-sw-atencao" aria-hidden="true"></i>fixas por cair (€ 120)</span>
    <span><i class="sw line" aria-hidden="true"></i>meta (€ 1.000)</span>
  </div>
  <dl class="painel-cota-conta">
    <div><dt>Meta de gasto</dt><dd>€ 1.000</dd></div>
    <div><dt>Já gasto</dt><dd>€ 980</dd></div>
    <div><dt>Fixas por cair</dt><dd>€ 120</dd></div>
  </dl>
</div>
```

---

## 2. P2 — Taxa de poupança e caso negativo (`painel-taxa-*`)

Classes no `styles.css`:
- `.painel-taxa-destaque` (linha de destaque positiva dentro do KPI `Guardou`)
- `.painel-taxa-retirada` (substitui o valor principal no KPI `Guardou` quando `saved < 0`)
- `.painel-taxa-resgate` (modificador na coluna `.vbc.painel-taxa-resgate` do gráfico `.vb`)
- `.painel-taxa-nota` (aviso com ícone + texto abaixo de `.vb` quando há mês com resgate líquido)

### Estado 1 — Poupança líquida positiva (`saved >= 0` e `entrou > 0`)

```html
<div class="kpi">
  <span class="l">Guardou</span>
  <span class="v">€ 360</span>
  <span class="painel-taxa-destaque">
    <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="10" cy="10" r="8"/>
      <path d="M6.5 10.2 9 12.6l4.6-5.2"/>
    </svg>
    <span>18% do que entrou</span>
  </span>
  <span class="s"><span class="d good">▲ € 60 acima da meta</span> de € 300<br>reserva e investimentos</span>
</div>
```

### Estado 2 — Resgate líquido no mês (`saved < 0`: mostra "Retirou € X da reserva", nunca percentual negativo)

```html
<!-- No cartão KPI Guardou -->
<div class="kpi">
  <span class="l">Guardou</span>
  <span class="painel-taxa-retirada">
    <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 13v3h12v-3"/>
      <path d="M10 12V4"/>
      <path d="M6.5 7.5 10 4l3.5 3.5"/>
    </svg>
    <span>Retirou € 220 da reserva</span>
  </span>
  <span class="s">resgates (€ 300) superaram os aportes (€ 80)<br>no lugar de percentual negativo</span>
</div>

<!-- Na coluna correspondente do gráfico .vb e na nota logo abaixo -->
<div class="vb" role="img" aria-label="Taxa de poupança de maio a setembro: 12%, 14%, 16%, 18%, 20%; em outubro em andamento, retirou € 220 da reserva">
  <div class="vbc"><b>20%</b><i></i><span>set</span></div>
  <div class="vbc painel-taxa-resgate">
    <b>
      <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 13v3h12v-3"/>
        <path d="M10 12V4"/>
        <path d="M6.5 7.5 10 4l3.5 3.5"/>
      </svg>
      <em>saída</em>
    </b>
    <i></i>
    <span>out*</span>
  </div>
</div>
<p class="painel-taxa-nota">
  <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 13v3h12v-3"/>
    <path d="M10 12V4"/>
    <path d="M6.5 7.5 10 4l3.5 3.5"/>
  </svg>
  <span><strong>Outubro*:</strong> retirou € 220 da reserva (sem percentual negativo no gráfico).</span>
</p>
```

---

## 3. P3 — Barras de alerta de meta a 80% e 100% (`painel-alerta-*`)

Classes no `styles.css`:
- `.painel-alerta-atencao` (modificador em `.cat.painel-alerta-atencao` quando `80% <= gasto/meta <= 100%`)
- `.painel-alerta-estouro` (modificador em `.cat.painel-alerta-estouro` quando `gasto > meta`)
- `.painel-alerta-st` (em `.st`, ou aplicado automaticamente por `.cat.painel-alerta-atencao .st` e `.cat.painel-alerta-estouro .st`)
- `.painel-alerta-selo` com `.painel-alerta-selo.atencao` (`--warn`) e `.painel-alerta-selo.estouro` (`--neg`)

### Estado 1 — Atenção (de 80% até 100% exato = "No limite · 100% da meta")

```html
<!-- 80% a 99%: Atenção -->
<button type="button" class="cat painel-alerta-atencao" aria-pressed="false">
  <i class="sw" aria-hidden="true"></i>
  <span class="nm">Mercado</span>
  <span class="val">€ 170</span>
  <span class="track"><i></i><b></b></span>
  <span class="st painel-alerta-st">
    <span class="painel-alerta-selo atencao">
      <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M10 3 2.2 16.5h15.6Z"/>
        <path d="M10 8v4"/>
        <circle cx="10" cy="14.5" r="0.6" fill="currentColor"/>
      </svg>
      <span>Atenção · 85% da meta</span>
    </span>
    <span>restam € 30 de € 200</span>
  </span>
</button>

<!-- 100% exato: No limite (continua em atenção, sem estouro) -->
<button type="button" class="cat painel-alerta-atencao" aria-pressed="false">
  <i class="sw" aria-hidden="true"></i>
  <span class="nm">Assinaturas e celular</span>
  <span class="val">€ 90</span>
  <span class="track"><i></i><b></b></span>
  <span class="st painel-alerta-st">
    <span class="painel-alerta-selo atencao">
      <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M10 3 2.2 16.5h15.6Z"/>
        <path d="M10 8v4"/>
        <circle cx="10" cy="14.5" r="0.6" fill="currentColor"/>
      </svg>
      <span>No limite · 100% da meta</span>
    </span>
    <span>= igual à meta de € 90</span>
  </span>
</button>
```

### Estado 2 — Estouro (acima de 100% da meta da categoria)

```html
<button type="button" class="cat painel-alerta-estouro" aria-pressed="false">
  <i class="sw" aria-hidden="true"></i>
  <span class="nm">Mercado</span>
  <span class="val">€ 240</span>
  <span class="track"><i></i><b></b></span>
  <span class="st painel-alerta-st">
    <span class="painel-alerta-selo estouro">
      <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6.8 2.5h6.4l4.3 4.3v6.4l-4.3 4.3H6.8l-4.3-4.3V6.8Z"/>
        <path d="M10 6.5v4.5"/>
        <circle cx="10" cy="14" r="0.7" fill="currentColor"/>
      </svg>
      <span>Estouro · € 40 acima da meta</span>
    </span>
    <span>120% de € 200</span>
  </span>
</button>
```

---

## 4. P4 — Conferência de saldo após importar (`painel-conf-*`)

Classes no `styles.css`:
- `.painel-conf-card` (com `.estado-ok`, `.estado-explicada`, `.estado-atencao`, `.estado-faltam`)
- `.painel-conf-cab`, `.painel-conf-rotulo`, `.painel-conf-titulo`, `.painel-conf-texto`, `.painel-conf-rodape`
- `.painel-conf-grade`, `.painel-conf-dif-ok`, `.painel-conf-dif-info`, `.painel-conf-dif-atencao`
- `.painel-conf-olhar`, `.painel-conf-olhar-titulo`
- `.painel-conf-acoes`, `.painel-conf-ancora`

### Estado 1 — Bateu com o banco (`estado-ok`)

```html
<div class="card painel-conf-card estado-ok">
  <div class="painel-conf-cab">
    <span class="painel-conf-rotulo">Conferência após importar · outubro</span>
    <span class="painel-selo ok">
      <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="10" cy="10" r="8"/>
        <path d="M6.5 10.2 9 12.6l4.6-5.2"/>
      </svg>
      <span>Bateu com o banco</span>
    </span>
  </div>
  <p class="painel-conf-titulo">Saldo conferido com o extrato</p>
  <p class="painel-conf-texto">O saldo calculado pelo Nora bate com o fechamento de 20 de outubro trazido pelo extrato. Arredondamentos do banco até € 0,05 entram como normais.</p>
  <dl class="painel-conf-grade">
    <div><dt>Saldo no Nora</dt><dd>€ 2.400,00</dd></div>
    <div><dt>Saldo no banco (20 out)</dt><dd>€ 2.400,00</dd></div>
    <div><dt>Diferença</dt><dd class="painel-conf-dif-ok">€ 0,00<small>nenhuma pendência</small></dd></div>
  </dl>
  <p class="painel-conf-rodape">60 movimentos conferidos de 1 a 20 out · nenhuma ação necessária</p>
</div>
```

### Estado 2 — Diferença pequena explicada (`estado-explicada`)

```html
<div class="card painel-conf-card estado-explicada">
  <div class="painel-conf-cab">
    <span class="painel-conf-rotulo">Conferência após importar · outubro</span>
    <span class="painel-selo info">
      <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="10" cy="10" r="8"/>
        <path d="M10 9v4.5"/>
        <circle cx="10" cy="6.3" r="0.7" fill="currentColor"/>
      </svg>
      <span>Diferença pequena explicada</span>
    </span>
  </div>
  <p class="painel-conf-titulo">+€ 10,00 no saldo do banco, explicados</p>
  <p class="painel-conf-texto">Entre 18 e 20 de outubro o saldo do extrato subiu € 10,00 além das entradas e saídas listadas. Em contas remuneradas isso costuma ser rendimento diário somado direto no saldo. O Nora mantém o saldo do banco (€ 810,00) sem criar linha artificial.</p>
  <dl class="painel-conf-grade">
    <div><dt>Pelos movimentos</dt><dd>€ 800,00</dd></div>
    <div><dt>Saldo no banco (20 out)</dt><dd>€ 810,00</dd></div>
    <div><dt>Diferença explicada</dt><dd class="painel-conf-dif-info">+€ 10,00<small>provável rendimento</small></dd></div>
  </dl>
  <p class="painel-conf-rodape">Dentro da faixa diária esperada · nenhum gasto ou entrada foi inventado</p>
</div>
```

### Estado 3 — Diferença que precisa de atenção, com lista de onde olhar (`estado-atencao`)

```html
<div class="card painel-conf-card estado-atencao">
  <div class="painel-conf-cab">
    <span class="painel-conf-rotulo">Conferência após importar · outubro</span>
    <span class="painel-selo atencao">
      <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M10 3.2 17.6 16.4H2.4L10 3.2Z"/>
        <path d="M10 8.2v3.8"/>
        <circle cx="10" cy="14.4" r="0.6" fill="currentColor"/>
      </svg>
      <span>Diferença para conferir</span>
    </span>
  </div>
  <p class="painel-conf-titulo">Há uma diferença de −€ 200,00 para olhar com calma</p>
  <p class="painel-conf-texto">Os movimentos importados somam € 2.300,00, enquanto o saldo do banco mostra € 2.100,00. Isso é comum quando o aplicativo do banco já descontou compras que ainda não saíram no arquivo exportado.</p>
  <dl class="painel-conf-grade">
    <div><dt>Pelos movimentos</dt><dd>€ 2.300,00</dd></div>
    <div><dt>Saldo no banco</dt><dd>€ 2.100,00</dd></div>
    <div><dt>Diferença</dt><dd class="painel-conf-dif-atencao">−€ 200,00<small>vale revisar os pontos abaixo</small></dd></div>
  </dl>
  <div class="painel-conf-olhar">
    <span class="painel-conf-olhar-titulo">
      <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="9" cy="9" r="5.5"/>
        <path d="m13.2 13.2 3.6 3.6"/>
      </svg>
      <span>Onde vale olhar primeiro</span>
    </span>
    <ul>
      <li><strong>Compras em processamento após 20 out:</strong> o aplicativo do banco abate na hora, mas o extrato exportado só lista o movimento depois que ele liquida.</li>
      <li><strong>Datas fora do período baixado:</strong> veja se o arquivo cobre todos os dias entre 1 e 20 de outubro, sem lacuna entre dois extratos.</li>
      <li><strong>Reserva ou subconta separada:</strong> confira se € 200,00 foram guardados em caixinha ou reserva (como Flexible Cash) fora da conta corrente.</li>
    </ul>
  </div>
  <div class="painel-conf-acoes">
    <button type="button" class="btn pri">Importar extrato mais recente</button>
    <button type="button" class="btn">Revisar saldo informado</button>
  </div>
</div>
```

### Estado 4 — "Não consigo conferir ainda" / faltam dados (`estado-faltam`)

```html
<div class="card painel-conf-card estado-faltam">
  <div class="painel-conf-cab">
    <span class="painel-conf-rotulo">Conferência após importar · outubro</span>
    <span class="painel-selo neutro">
      <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="10" cy="10" r="8"/>
        <path d="M7.9 8a2.1 2.1 0 1 1 3 1.9c-.7.4-.9.8-.9 1.5"/>
        <circle cx="10" cy="14.3" r="0.6" fill="currentColor"/>
      </svg>
      <span>Não consigo conferir ainda</span>
    </span>
  </div>
  <p class="painel-conf-titulo">Não consigo conferir o saldo ainda</p>
  <p class="painel-conf-texto">Este arquivo CSV trouxe entradas e saídas normalmente, mas o banco não incluiu uma coluna com o saldo após cada movimento. Seus gastos do mês já estão prontos no painel; só falta um saldo de referência para bater a conta.</p>
  <dl class="painel-conf-grade">
    <div><dt>Movimentos lidos</dt><dd>40 linhas</dd></div>
    <div><dt>Coluna de saldo</dt><dd>Ausente no CSV</dd></div>
    <div><dt>Status</dt><dd><small>Falta o saldo do banco em 20 out</small></dd></div>
  </dl>
  <div class="painel-conf-ancora">
    <label for="fin-conf-ancora">Saldo no banco no fim de 20 out (€)
      <input id="fin-conf-ancora" type="text" inputmode="decimal" autocomplete="off" placeholder="ex.: 1.500,00">
    </label>
    <button type="button" class="btn pri">Informar saldo e conferir</button>
  </div>
</div>
```

---

## 5. P4b — Botões `‹` `›` para trocar de mês no painel (`painel-mes-*`)

Classes no `styles.css`:
- `.painel-mes-topo` (linha superior que alinha a navegação por mês com o botão de média)
- `.painel-mes-nav` (`role="group"` contendo seta anterior, título anunciável e próxima seta)
- `.painel-mes-btn` (botão circular `44×44px`; quando `:disabled`, mantém contraste legível sem `opacity` reduzida)
- `.painel-mes-titulo` (`role="status" aria-live="polite"`), `.painel-mes-nome`, `.painel-mes-sub`

### Estado 1 — Mês intermediário (`‹` e `›` ativos)

```html
<div class="painel-mes-topo">
  <div class="painel-mes-nav" role="group" aria-label="Navegação por mês">
    <button type="button" class="btn painel-mes-btn" data-mes-ant aria-label="Mês anterior: agosto de 2026">
      <span aria-hidden="true">‹</span>
    </button>
    <div class="painel-mes-titulo" role="status" aria-live="polite" aria-label="Mês selecionado: setembro de 2026, mês fechado">
      <span class="painel-mes-nome">Setembro de 2026</span>
      <span class="painel-mes-sub">mês fechado · 5 de 6 meses com dados</span>
    </div>
    <button type="button" class="btn painel-mes-btn" data-mes-prox aria-label="Próximo mês: outubro de 2026">
      <span aria-hidden="true">›</span>
    </button>
  </div>
  <button type="button" class="btn sm" data-all aria-pressed="false">Ver média de todos os meses</button>
</div>
```

### Estado 2 — Primeiro mês com dados (`‹` desabilitado)

```html
<div class="painel-mes-nav" role="group" aria-label="Navegação por mês">
  <button type="button" class="btn painel-mes-btn" data-mes-ant disabled aria-label="Mês anterior indisponível: maio de 2026 é o primeiro mês com dados">
    <span aria-hidden="true">‹</span>
  </button>
  <div class="painel-mes-titulo" role="status" aria-live="polite" aria-label="Mês selecionado: maio de 2026, primeiro mês com dados">
    <span class="painel-mes-nome">Maio de 2026</span>
    <span class="painel-mes-sub">primeiro mês importado · 1 de 6 meses</span>
  </div>
  <button type="button" class="btn painel-mes-btn" data-mes-prox aria-label="Próximo mês: junho de 2026">
    <span aria-hidden="true">›</span>
  </button>
</div>
```

### Estado 3 — Mês em andamento (`›` desabilitado)

```html
<div class="painel-mes-nav" role="group" aria-label="Navegação por mês">
  <button type="button" class="btn painel-mes-btn" data-mes-ant aria-label="Mês anterior: setembro de 2026">
    <span aria-hidden="true">‹</span>
  </button>
  <div class="painel-mes-titulo" role="status" aria-live="polite" aria-label="Mês selecionado: outubro de 2026, mês em andamento até dia 20">
    <span class="painel-mes-nome">Outubro de 2026 · até dia 20</span>
    <span class="painel-mes-sub">mês em andamento · 6 de 6 meses</span>
  </div>
  <button type="button" class="btn painel-mes-btn" data-mes-prox disabled aria-label="Próximo mês indisponível: outubro de 2026 é o mês em andamento">
    <span aria-hidden="true">›</span>
  </button>
</div>
```

---

## 6. P5 — Modo privacidade (`painel-priv-*`)

Classes no `styles.css`:
- `.painel-priv-btn` (botão no cabeçalho com `aria-pressed="false"` ou `aria-pressed="true"`, `min-height: 44px`, ícone de olho + texto explícito)
- `.painel-priv-faixa` (faixa `role="status"` exibida quando o modo privacidade está ativo)
- `.painel-priv-oculto` (aplicada aos elementos que exibem a máscara `€ ••••` / `−€ ••••`)

### Estado 1 — Modo privacidade desligado (`aria-pressed="false"`)

```html
<button type="button" class="btn painel-priv-btn" data-fin-priv aria-pressed="false">
  <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z"/>
    <circle cx="10" cy="10" r="2.4"/>
  </svg>
  <span>Ocultar valores</span>
</button>
```

### Estado 2 — Modo privacidade ativo (`aria-pressed="true"`, faixa de status e valores mascarados)

```html
<!-- Botão no cabeçalho -->
<button type="button" class="btn painel-priv-btn" data-fin-priv aria-pressed="true">
  <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 3l14 14"/>
    <path d="M8.3 4.8A8.5 8.5 0 0 1 10 4.5c5 0 8 5.5 8 5.5a14.4 14.4 0 0 1-2.6 3.3"/>
    <path d="M5.4 6.2A14.2 14.2 0 0 0 2 10s3 5.5 8 5.5c1.3 0 2.5-.4 3.5-1"/>
    <path d="M8.3 8.3a2.4 2.4 0 0 0 3.4 3.4"/>
  </svg>
  <span>Mostrar valores</span>
</button>

<!-- Faixa anunciável indicando que o modo privacidade está ativo -->
<div class="painel-priv-faixa" role="status">
  <svg class="painel-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 3l14 14"/>
    <path d="M8.3 4.8A8.5 8.5 0 0 1 10 4.5c5 0 8 5.5 8 5.5a14.4 14.4 0 0 1-2.6 3.3"/>
    <path d="M5.4 6.2A14.2 14.2 0 0 0 2 10s3 5.5 8 5.5c1.3 0 2.5-.4 3.5-1"/>
    <path d="M8.3 8.3a2.4 2.4 0 0 0 3.4 3.4"/>
  </svg>
  <div><strong>Modo privacidade ativo</strong> · valores em dinheiro ocultos no painel e nos rótulos de voz. Porcentagens continuam visíveis.</div>
</div>

<!-- Exemplo de valor mascarado em KPI / linha de movimento (porcentagens permanecem visíveis) -->
<div class="kpi">
  <span class="l">Saldo atual</span>
  <span class="v painel-priv-oculto" aria-label="Saldo atual: valor oculto">€ ••••</span>
  <span class="s">conferido em 20 out</span>
</div>
```

> **Exceções que nunca são mascaradas:** formulários de edição (`#fin-fsetup`, `#fin-fmetas`, `#fin-fgoals`, `#fin-fdiv`, `#fin-fcamb`, `.painel-conf-ancora`) e a pré-visualização da importação (`#fin-imp`) continuam exibindo os valores reais mesmo quando `privado` está ativo.

---

## 7. Resumo das classes documentadas

| Grupo | Classes no `styles.css` |
| :--- | :--- |
| Compartilhadas | `painel-ico`, `painel-selo` (`.ok`, `.info`, `.atencao`, `.estouro`, `.neutro`) |
| P1 Cota diária | `painel-cota-card` (`.em-estouro`), `painel-cota-cab`, `painel-cota-rotulo`, `painel-cota-destaque`, `painel-cota-valor` (`.em-estouro`), `painel-cota-resumo`, `painel-cota-trilha`, `painel-cota-seg` (`.gasto-ok`, `.fixas-ok`, `.gasto-acima`, `.fixas-acima`), `painel-cota-meta` (`.no-fim`), `painel-cota-legenda`, `painel-cota-sw-gasto`, `painel-cota-sw-fixas`, `painel-cota-sw-atencao`, `painel-cota-sw-estouro`, `painel-cota-conta` |
| P2 Taxa de poupança | `painel-taxa-destaque`, `painel-taxa-retirada`, `painel-taxa-resgate`, `painel-taxa-nota` |
| P3 Alertas de meta | `painel-alerta-atencao`, `painel-alerta-estouro`, `painel-alerta-st`, `painel-alerta-selo` (`.atencao`, `.estouro`) |
| P4 Conferência | `painel-conf-card` (`.estado-ok`, `.estado-explicada`, `.estado-atencao`, `.estado-faltam`), `painel-conf-cab`, `painel-conf-rotulo`, `painel-conf-titulo`, `painel-conf-texto`, `painel-conf-grade`, `painel-conf-dif-ok`, `painel-conf-dif-info`, `painel-conf-dif-atencao`, `painel-conf-olhar`, `painel-conf-olhar-titulo`, `painel-conf-acoes`, `painel-conf-ancora`, `painel-conf-rodape` |
| P4b Troca de mês | `painel-mes-topo`, `painel-mes-nav`, `painel-mes-btn`, `painel-mes-titulo`, `painel-mes-nome`, `painel-mes-sub` |
| P5 Privacidade | `painel-priv-btn`, `painel-priv-faixa`, `painel-priv-oculto` |
