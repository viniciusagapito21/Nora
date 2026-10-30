// Analisador de textos visíveis do app.js (o mesmo do inventário do passo d): lê cada literal entre aspas simples,
// separa o texto que aparece na tela (entre tags, ou em aria-label/title/placeholder/alt/data-l) do que é código (classes,
// ids, seletores, chaves "area.item", CSS) e diz em que função de topo do app.js ele está. É uma heurística: o que
// ela confundir vai para a lista de permitidos do teste, com o motivo.

const ATRIB = /(?<![\w-])(aria-label|title|placeholder|alt|data-l)="([^"]*)"/g;  // data-l: rótulo que o CSS mostra (content: attr(data-l))
const LETRA = /[A-Za-zÀ-ÿ]{2,}/;
const ACENTO = /[À-ÿ]/;
const CODIGO = /^-?[a-z0-9_]+([-.:#/][a-z0-9_]+)*$/;  // inclui o fim de um id montado, como '-nome"'

export function pedacosVisiveis(lit) {
  const out = [];
  for (const m of lit.matchAll(ATRIB)) if (LETRA.test(m[2])) out.push({ tipo: 'atributo', texto: m[2] });
  let s = lit.replace(ATRIB, '');
  const tinhaTag = /[<>]/.test(s);
  s = s.replace(/<[^>]*>/g, '\0');
  if (s.includes('>') && (s.indexOf('<') === -1 || s.indexOf('>') < s.indexOf('<'))) s = s.slice(s.lastIndexOf('>') + 1);
  s = s.replace(/<[^>]*$/, '\0').replace(/\b[\w-]+="[^"]*"?/g, '\0');
  for (const p of s.split('\0')) {
    const q = p.replace(/^[\s"'=;,]+|[\s"'=;,]+$/g, '');
    if (!LETRA.test(q) || CODIGO.test(q) || q.includes('var(--') || /\dpx/.test(q) || /^(#|\.|fin-|data-|http)/.test(q)) continue;
    const prosa = q.includes(' ') || ACENTO.test(q) || /^[A-ZÀ-Ý][a-zà-ÿ]/.test(q) || p !== p.trim();
    if (prosa) out.push({ tipo: tinhaTag ? 'html' : 'texto', texto: q });
  }
  return out;
}

// [{ linha, funcao, tipo, texto }] da parte de tela do app.js (depois do /*CORE-END*/) ou do núcleo
export function textosDoApp(fonte, { parte = 'tela' } = {}) {
  const linhas = fonte.split('\n'), fim = linhas.findIndex(l => l.includes('/*CORE-END*/'));
  const res = [];
  let funcao = '(topo)';
  linhas.forEach((l, i) => {
    const m = l.match(/^ {2}function ([A-Za-z0-9_]+)\(/);
    if (m) funcao = m[1];
    else if (/^ {2}var /.test(l)) funcao = '(módulo)';  // constante de topo: não é da função de cima
    else if (/^ {2}[A-Za-z$(]/.test(l) && !/^ {2}function /.test(l)) funcao = '(eventos)';
    if ((parte === 'tela') !== (i > fim) || /^\s*(\/\*|\*|\/\/)/.test(l)) return;
    for (const lit of l.matchAll(/'((?:[^'\\\n]|\\.)*)'/g))
      for (const p of pedacosVisiveis(lit[1])) res.push({ linha: i + 1, funcao, ...p });
  });
  return res;
}
