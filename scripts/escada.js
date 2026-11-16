'use strict';
// Comando de terminal: node escada.js <passou <etapa>|nova|status> [--projeto <pasta>]
const path = require('node:path');
const escada = require('./lib/escada.js');

const USO = 'Use: escada.js <passou <etapa>|nova|status> [--projeto <pasta>]';

function lerArgs(argv) {
  const pos = [];
  let raiz = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--projeto') {
      if (i + 1 >= argv.length) return null;
      raiz = argv[++i];
    } else {
      pos.push(argv[i]);
    }
  }
  return { pos, raiz: path.resolve(raiz || process.env.CLAUDE_PROJECT_DIR || process.cwd()) };
}

function principal(argv) {
  const a = lerArgs(argv);
  if (!a) { console.log(USO); return 1; }
  const [verbo, ...resto] = a.pos;
  const raiz = a.raiz;

  if (verbo === 'passou' && resto.length === 1) {
    const r = escada.passou(raiz, resto[0]);
    console.log(r.mensagem);
    return r.ok ? 0 : 1;
  }
  if (verbo === 'nova' && resto.length === 0) {
    escada.nova(raiz);
    console.log('Escada zerada.');
    return 0;
  }
  if (verbo === 'status' && resto.length === 0) {
    const r = escada.resumo(raiz);
    console.log(`degrau de partida ${r.base}`);
    for (const et of r.etapas) {
      if (et.estado === 'aberta') console.log(`etapa ${et.id}: ${et.tentativas} tentativas, último degrau ${et.ultimoDegrau}`);
    }
    return 0;
  }
  console.log(USO);
  return 1;
}

try {
  process.exitCode = principal(process.argv.slice(2));
} catch (e) {
  console.log(`Erro: ${e && e.message ? e.message : e}`);
  process.exitCode = 1;
}
