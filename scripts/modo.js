'use strict';
// Comando de terminal: node modo.js <ligar|desligar|status|contexto 40|60> [--projeto <pasta>]
const path = require('node:path');
const projeto = require('./lib/projeto.js');

const USO = 'Use: modo.js <ligar|desligar|status|contexto 40|60> [--projeto <pasta>]';

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

function imprimir(linhas) { for (const l of linhas) console.log(l); }

function principal(argv) {
  const a = lerArgs(argv);
  if (!a) { console.log(USO); return 1; }
  const [verbo, ...resto] = a.pos;
  const raiz = a.raiz;

  if (verbo === 'ligar' && resto.length === 0) {
    const r = projeto.ligar(raiz, path.join(__dirname, '..'));
    imprimir(r.mensagens);
    if (!r.ok) return 1;
    if (!r.mudou) console.log('Já estava ligado; nada mudou.');
    console.log('Modo Deus ligado. Abra uma sessão nova neste projeto para ele valer. Confira com /model (Opus) e /effort status (xhigh).');
    return 0;
  }
  if (verbo === 'desligar' && resto.length === 0) {
    const r = projeto.desligar(raiz);
    imprimir(r.mensagens);
    if (!r.ok) return 1;
    console.log(r.mudou
      ? 'Modo Deus desligado. Vale a partir da próxima sessão neste projeto.'
      : 'Já estava desligado; nada mudou.');
    return 0;
  }
  if (verbo === 'contexto' && resto.length === 1) {
    const r = projeto.contexto(raiz, resto[0]);
    imprimir(r.mensagens);
    if (!r.ok) return 1;
    console.log('Vale a partir da próxima sessão.');
    return 0;
  }
  if (verbo === 'status' && resto.length === 0) {
    const e = projeto.estado(raiz);
    console.log(`Modo Deus: ${e.ligado ? 'ligado' : 'desligado'}`);
    if (e.settingsInvalido) console.log('Atenção: .claude/settings.json está inválido.');
    if (e.divergencia === 'marcador-sem-chave') {
      console.log('Atenção: foi desligado à mão (a chave agent saiu do settings.json). Rode desligar para limpar o resto.');
    } else if (e.divergencia === 'chave-sem-marcador') {
      console.log('Atenção: foi ligado à mão, sem os dados para desfazer.');
    }
    const r = require('./lib/escada.js').resumo(raiz);
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
