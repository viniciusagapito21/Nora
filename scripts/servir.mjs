// npm start: o mesmo servidor estático de antes (serve, versão fixa), na primeira porta livre a partir da 3000,
// ou exatamente na porta de PORTA (PORTA=3005 npm start).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { escolherPorta } from './porta.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
let porta;
try { porta = await escolherPorta({ nome: 'PORTA', inicio: 3000 }); }
catch (e) { console.error(e.message); process.exit(1); }

const filho = spawn('npx', ['--yes', 'serve@14.2.4', '.', '-l', String(porta)], { cwd: RAIZ, stdio: 'inherit' });
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => filho.kill(sinal));
filho.on('exit', (codigo, sinal) => process.exit(codigo ?? (sinal ? 1 : 0)));
