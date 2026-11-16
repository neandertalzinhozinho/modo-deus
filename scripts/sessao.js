'use strict';
// Gancho SessionStart: imprime uma linha de contexto. Sempre sai com 0.
const path = require('node:path');

function linha(bruto) {
  let entrada = {};
  try {
    const o = JSON.parse(bruto);
    if (o && typeof o === 'object') entrada = o;
  } catch (_) { /* entrada vazia ou quebrada */ }

  const raiz = process.env.CLAUDE_PROJECT_DIR || (typeof entrada.cwd === 'string' && entrada.cwd) || process.cwd();
  const projeto = require('./lib/projeto.js');
  const estado = projeto.estado(raiz);

  if (estado.divergencia === 'marcador-sem-chave') {
    return '[modo-deus] desligado à mão (a chave agent saiu do settings.json) · /modo-deus:desligar para limpar o resto';
  }
  if (!estado.ligado) {
    return '[modo-deus] desligado neste projeto · /modo-deus:ligar para ativar';
  }
  if (entrada.agent_type === 'orquestrador') {
    const escada = require('./lib/escada.js');
    const base = escada.resumo(raiz).base;
    const script = path.join(__dirname, 'escada.js').replace(/\\/g, '/');
    return `[modo-deus] LIGADO · degrau de partida ${base} · escada: node "${script}" (passou <etapa> | nova | status)`;
  }
  return '[modo-deus] LIGADO neste projeto, mas esta sessão não abriu como orquestrador. Abra uma sessão nova. Se continuar assim, a trava e o esforço do guia não estão valendo.';
}

const partes = [];
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => partes.push(c));
process.stdin.on('error', () => {});
process.stdin.on('end', () => {
  try {
    process.stdout.write(`${linha(partes.join(''))}\n`);
  } catch (_) { /* não imprime nada */ }
  process.exitCode = 0;
});
