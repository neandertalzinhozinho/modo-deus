'use strict';
// Gancho PreToolUse (Agent|Task): aplica a escada. Nunca derruba a sessão.
const fs = require('node:fs');
const path = require('node:path');

let raizLog = null;

function registrarErro(e) {
  try {
    if (!raizLog) return;
    const pasta = path.join(raizLog, 'memoria', 'escada');
    fs.mkdirSync(pasta, { recursive: true });
    const msg = String(e && e.message ? e.message : e).replace(/\s+/g, ' ');
    fs.appendFileSync(path.join(pasta, 'erros.log'), `${new Date().toISOString()} ${msg}\n`, 'utf8');
  } catch (_) { /* nem o log deu: segue */ }
}

function decidir(bruto) {
  let entrada;
  try { entrada = JSON.parse(bruto); } catch (_) { return 0; }
  if (!entrada || typeof entrada !== 'object') return 0;
  const ti = entrada.tool_input;
  if (!ti || typeof ti !== 'object') return 0;
  const tipo = ti.subagent_type;
  if (tipo !== 'executor' && tipo !== 'conselheiro') return 0;

  const raiz = process.env.CLAUDE_PROJECT_DIR || entrada.cwd;
  if (!raiz || typeof raiz !== 'string') return 0;
  raizLog = raiz;

  const projeto = require('./lib/projeto.js');
  if (!projeto.estado(raiz).ligado) return 0;

  const escada = require('./lib/escada.js');
  const script = path.join(__dirname, 'escada.js').replace(/\\/g, '/');
  const r = escada.avaliar(
    raiz,
    {
      tipo,
      texto: `${ti.description === undefined ? '' : ti.description}\n${ti.prompt === undefined ? '' : ti.prompt}`,
      modelo: ti.model,
      esforco: ti.effort,
    },
    { passou: `node "${script}" passou` }
  );
  if (r && r.permitir === false) {
    process.stderr.write(`[modo-deus] ${r.mensagem}`);
    return 2;
  }
  return 0;
}

const partes = [];
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => partes.push(c));
process.stdin.on('error', () => {});
process.stdin.on('end', () => {
  let codigo = 0;
  try {
    codigo = decidir(partes.join(''));
  } catch (e) {
    registrarErro(e);
    codigo = 0;
  }
  process.exitCode = codigo;
});
