import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raiz = join(__dirname, "..");

const css = readFileSync(join(raiz, "styles.css"), "utf8");
const doc = readFileSync(join(raiz, "docs/componentes-painel.md"), "utf8");

const MARCADOR_SECAO = "/* Painel: componentes P1 a P5 */";

function semComentariosCss(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "");
}

function extrairSecaoPainel(textoCss) {
  const idx = textoCss.indexOf(MARCADOR_SECAO);
  assert.ok(idx !== -1, `Seção '${MARCADOR_SECAO}' não encontrada em styles.css`);
  return textoCss.slice(idx);
}

function removerBlocosRoot(textoCss) {
  return semComentariosCss(textoCss).replace(
    /:root(?:\[data-tema="escuro"\])?\s*\{[^}]*\}/g,
    ""
  );
}

function extrairBlocosHtml(markdown) {
  return [...markdown.matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1]);
}

test("styles.css inclui a seção '/* Painel: componentes P1 a P5 */' no fim do arquivo", () => {
  const idx = css.indexOf(MARCADOR_SECAO);
  assert.ok(idx > 0, "A seção de componentes do painel deve estar no fim do styles.css");
  const antes = css.slice(0, idx);
  assert.match(
    antes,
    /:root\[data-tema="escuro"\]\s*::selection\s*\{\s*background:\s*var\(--accent-soft\);\s*color:\s*var\(--fg\);\s*\}\s*$/,
    "A seção nova deve entrar logo após a regra :root[data-tema=\"escuro\"] ::selection sem alterar linhas anteriores"
  );
});

test("styles.css não tem nenhuma cor hexadecimal fora dos blocos :root", () => {
  const foraDeRoot = removerBlocosRoot(css);
  const hexSoltos = [...foraDeRoot.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  assert.deepEqual(
    hexSoltos,
    [],
    `Encontradas cores hexadecimais fora de :root no styles.css: ${hexSoltos.join(", ")}`
  );

  const secaoPainel = semComentariosCss(extrairSecaoPainel(css));
  assert.doesNotMatch(secaoPainel, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(secaoPainel, /\brgba?\s*\(/i);
  assert.doesNotMatch(secaoPainel, /\bhsla?\s*\(/i);
  assert.doesNotMatch(secaoPainel, /\burl\s*\(/i);
});

test("styles.css não usa prefers-color-scheme", () => {
  assert.doesNotMatch(css, /prefers-color-scheme/i);
});

test("todo componente e classe documentados em docs/componentes-painel.md existem na seção nova do styles.css", () => {
  const secaoPainel = semComentariosCss(extrairSecaoPainel(css));
  const blocosHtml = extrairBlocosHtml(doc);
  assert.ok(blocosHtml.length >= 13, "docs/componentes-painel.md deve documentar todos os estados de P1 a P5 em blocos HTML");

  // Todas as classes painel-* documentadas (seletores .painel-*, atributos class="..." e tabela-resumo)
  const classesPainelNoDoc = new Set([
    ...[...doc.matchAll(/\.painel-[a-z0-9-]+/g)].map((m) => m[0].slice(1)),
    ...[...doc.matchAll(/`(painel-[a-z0-9-]+)`/g)].map((m) => m[1]),
    ...[...blocosHtml.join("\n").matchAll(/\bpainel-[a-z0-9-]+/g)].map((m) => m[0])
  ]);

  const prefixosEsperados = [
    "painel-cota-",
    "painel-taxa-",
    "painel-alerta-",
    "painel-conf-",
    "painel-mes-",
    "painel-priv-"
  ];
  for (const prefixo of prefixosEsperados) {
    const encontradas = [...classesPainelNoDoc].filter((c) => c.startsWith(prefixo));
    assert.ok(
      encontradas.length >= 3,
      `Prefixo ${prefixo} deve ter classes documentadas em docs/componentes-painel.md`
    );
  }

  for (const cls of classesPainelNoDoc) {
    const padrao = new RegExp(`\\.${cls}(?![a-z0-9_-])`);
    assert.match(
      secaoPainel,
      padrao,
      `Classe documentada .${cls} não existe na seção nova do styles.css`
    );
  }

  // Também confere todos os pares classe-base + modificador usados nos atributos class="..." dos blocos HTML
  const htmlJunto = blocosHtml.join("\n");
  const atributosClass = [...htmlJunto.matchAll(/\bclass="([^"]+)"/g)].map((m) =>
    m[1].trim().split(/\s+/)
  );

  for (const lista of atributosClass) {
    const basePainel = lista.find((c) => c.startsWith("painel-"));
    if (!basePainel) continue;
    for (const token of lista) {
      if (token.startsWith("painel-")) {
        assert.match(
          secaoPainel,
          new RegExp(`\\.${token}(?![a-z0-9_-])`),
          `Classe .${token} usada no HTML documentado deve existir no styles.css`
        );
      } else if (!["card", "btn", "pri", "sm", "cat", "st", "sw", "line", "vbc", "v"].includes(token)) {
        // É um modificador de estado (ex.: ok, info, atencao, estouro, neutro, em-estouro, gasto-ok, estado-ok...)
        assert.match(
          secaoPainel,
          new RegExp(`\\.${basePainel}\\.${token}(?![a-z0-9_-])`),
          `Modificador .${basePainel}.${token} usado no HTML documentado deve existir no styles.css`
        );
      }
    }
  }
});

test("seção nova do styles.css garante foco visível, alvos de 44 px, responsividade e prefers-reduced-motion", () => {
  const secaoPainel = semComentariosCss(extrairSecaoPainel(css));

  assert.match(secaoPainel, /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
  assert.match(secaoPainel, /\.painel-mes-btn\s*\{[^}]*min-width:\s*44px;\s*min-height:\s*44px/);
  assert.match(secaoPainel, /\.painel-priv-btn\s*\{[^}]*min-height:\s*44px/);
  assert.match(secaoPainel, /\.painel-conf-ancora input\s*\{[^}]*min-height:\s*44px/);
  assert.match(secaoPainel, /@media\s*\(pointer:\s*coarse\)/);
  assert.match(secaoPainel, /@media\s*\(max-width:\s*560px\)/);
  assert.match(secaoPainel, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("docs/componentes-painel.md não contém style inline, script ou handlers inline, e todo estado tem ícone + texto", () => {
  const blocosHtml = extrairBlocosHtml(doc);
  const htmlJunto = blocosHtml.join("\n");

  assert.doesNotMatch(htmlJunto, /<script\b/i, "Não deve haver <script> nos exemplos HTML");
  assert.doesNotMatch(htmlJunto, /<style\b/i, "Não deve haver <style> nos exemplos HTML");
  assert.doesNotMatch(htmlJunto, /\sstyle\s*=/i, "Não deve haver style inline nos exemplos HTML");
  assert.doesNotMatch(htmlJunto, /\son[a-z]+\s*=/i, "Não deve haver atributo on* inline nos exemplos HTML");

  // Selos e alertas nos exemplos HTML devem ter SVG (aria-hidden="true") + texto
  const selos = [
    ...htmlJunto.matchAll(
      /<span class="(?:painel-selo|painel-alerta-selo|painel-taxa-destaque|painel-taxa-retirada)[^"]*">([\s\S]*?)<\/span>\s*<\/span>/g
    )
  ];
  assert.ok(selos.length >= 10, "Os exemplos HTML devem incluir os selos e destaques de estado com ícone + texto");
  for (const [bloco] of selos) {
    assert.match(bloco, /<svg class="painel-ico"[^>]*aria-hidden="true"/);
    assert.match(bloco, /<span>[^<]+<\/span>/);
  }
});
