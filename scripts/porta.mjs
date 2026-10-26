// Escolha da porta dos servidores locais (npm start e npm run telas), para dois servidores rodando ao mesmo tempo
// (um por pasta de trabalho) não brigarem pela mesma porta.
//
//   porta da variável (PORTA para o npm start, PORTA_TELAS para as telas): usa exatamente essa, ou para com erro
//   se estiver ocupada; sem a variável, a primeira livre a partir da porta inicial
import { createServer } from 'node:net';

// true se dá para escutar na porta agora (fecha logo em seguida)
export function portaLivre(porta, host) {
  return new Promise(resolve => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.listen({ port: porta, host, exclusive: true }, () => s.close(() => resolve(true)));
  });
}

export function lerPorta(texto, nome) {
  if (!/^\d+$/.test(String(texto).trim())) throw new Error(`${nome} tem que ser um número de porta (veio "${texto}")`);
  const n = Number(texto);
  if (n < 1 || n > 65535) throw new Error(`${nome} tem que ficar entre 1 e 65535 (veio ${n})`);
  return n;
}

// a primeira porta livre de inicio até inicio + tentativas − 1
export async function primeiraLivre(inicio, host, tentativas = 50) {
  for (let p = inicio; p < inicio + tentativas && p <= 65535; p++) if (await portaLivre(p, host)) return p;
  throw new Error(`nenhuma porta livre entre ${inicio} e ${Math.min(inicio + tentativas - 1, 65535)}`);
}

// { env, nome, inicio, host }: a porta da variável `nome` em `env`, se houver; senão a primeira livre desde `inicio`
export async function escolherPorta({ env = process.env, nome, inicio, host } = {}) {
  const v = env[nome];
  if (v === undefined || v === '') return primeiraLivre(inicio, host);
  const p = lerPorta(v, nome);
  if (!await portaLivre(p, host)) throw new Error(`a porta ${p} (${nome}) está ocupada; escolha outra ou tire a variável`);
  return p;
}
