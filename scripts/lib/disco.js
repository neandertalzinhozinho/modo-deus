'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const INTERVALO_MS = 25;
const TRAVA_VELHA_MS = 10000;
const ESPERA_PADRAO_MS = 3000;

function dormir(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function lerTexto(caminho) {
  try {
    return fs.readFileSync(caminho, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function gravarAtomico(caminho, texto) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const tmp = `${caminho}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, texto, 'utf8');
    let ultimo;
    for (let i = 0; i < 20; i++) {
      try {
        fs.renameSync(tmp, caminho);
        return;
      } catch (e) {
        if (e.code !== 'EPERM' && e.code !== 'EBUSY' && e.code !== 'EACCES') throw e;
        ultimo = e;
        dormir(25);
      }
    }
    throw ultimo;
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch (_) { /* ignora */ }
  }
}

function impressao(texto) {
  return crypto.createHash('sha256').update(texto).digest('hex');
}

function comTrava(caminhoTrava, fn, opcoes) {
  const esperaMs = (opcoes && opcoes.esperaMs !== undefined) ? opcoes.esperaMs : ESPERA_PADRAO_MS;
  fs.mkdirSync(path.dirname(caminhoTrava), { recursive: true });
  const inicio = Date.now();
  for (;;) {
    try {
      fs.closeSync(fs.openSync(caminhoTrava, 'wx'));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST' && e.code !== 'EPERM' && e.code !== 'EACCES') throw e;
      try {
        const idade = Date.now() - fs.statSync(caminhoTrava).mtimeMs;
        if (idade > TRAVA_VELHA_MS) {
          fs.rmSync(caminhoTrava, { force: true });
          continue;
        }
      } catch (_) { /* sumiu entre as chamadas: tenta de novo */ }
      if (Date.now() - inicio >= esperaMs) throw new Error('TRAVA_OCUPADA');
      dormir(INTERVALO_MS);
    }
  }
  try {
    return fn();
  } finally {
    try { fs.rmSync(caminhoTrava, { force: true }); } catch (_) { /* ignora */ }
  }
}

module.exports = { lerTexto, gravarAtomico, impressao, comTrava };
