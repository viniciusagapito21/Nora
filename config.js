/*
 * Configuração de quem usa o painel.
 *
 * FIN_TITULAR: o seu nome como ele aparece nas transferências do extrato
 * (por exemplo "To MARIA SILVA"). Serve para reconhecer dinheiro que vai
 * para outra conta sua (como uma conta no Brasil) e não confundir com renda.
 *
 * Hoje o valor vem do localStorage, para cada pessoa ter o próprio sem mexer
 * no código. Para testar, no console do navegador:
 *   localStorage.setItem('cortex-financas.titular', 'MARIA SILVA'); location.reload();
 *
 * Tarefa aberta (ver CLAUDE.md): trocar isso por um campo na própria tela.
 */
(function () {
  var nome = '';
  try { nome = localStorage.getItem('cortex-financas.titular') || ''; } catch (e) { }
  window.FIN_TITULAR = nome;
})();
