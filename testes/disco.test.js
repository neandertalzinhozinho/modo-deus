'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const disco = require('../scripts/lib/disco.js');

function novaPasta() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'modo-deus-'));
}

test('lerTexto de arquivo inexistente devolve null', () => {
  const d = novaPasta();
  try {
    assert.equal(disco.lerTexto(path.join(d, 'nao-existe.txt')), null);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('lerTexto devolve o conteúdo com BOM', () => {
  const d = novaPasta();
  try {
    const p = path.join(d, 'a.json');
    fs.writeFileSync(p, '﻿{"a":1}');
    assert.equal(disco.lerTexto(p), '﻿{"a":1}');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('gravarAtomico cria pastas e não deixa temporário', () => {
  const d = novaPasta();
  try {
    const p = path.join(d, 'x', 'y', 'arq.txt');
    disco.gravarAtomico(p, 'olá');
    assert.equal(fs.readFileSync(p, 'utf8'), 'olá');
    assert.deepEqual(fs.readdirSync(path.dirname(p)), ['arq.txt']);
    disco.gravarAtomico(p, 'novo');
    assert.equal(fs.readFileSync(p, 'utf8'), 'novo');
    assert.deepEqual(fs.readdirSync(path.dirname(p)), ['arq.txt']);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('impressao é sha256 hexadecimal', () => {
  assert.equal(disco.impressao('a'), 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb');
});

test('comTrava devolve o retorno e apaga a trava', () => {
  const d = novaPasta();
  try {
    const t = path.join(d, 'trava');
    assert.equal(disco.comTrava(t, () => { assert.ok(fs.existsSync(t)); return 42; }), 42);
    assert.equal(fs.existsSync(t), false);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('comTrava apaga a trava quando fn lança e repassa o erro', () => {
  const d = novaPasta();
  try {
    const t = path.join(d, 'trava');
    assert.throws(() => disco.comTrava(t, () => { throw new Error('boom'); }), /boom/);
    assert.equal(fs.existsSync(t), false);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('trava recente lança TRAVA_OCUPADA', () => {
  const d = novaPasta();
  try {
    const t = path.join(d, 'trava');
    fs.writeFileSync(t, '');
    assert.throws(() => disco.comTrava(t, () => 1, { esperaMs: 200 }), /TRAVA_OCUPADA/);
    assert.ok(fs.existsSync(t), 'não apaga trava alheia');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('trava com mais de 10 s é ignorada', () => {
  const d = novaPasta();
  try {
    const t = path.join(d, 'trava');
    fs.writeFileSync(t, '');
    const antes = new Date(Date.now() - 11000);
    fs.utimesSync(t, antes, antes);
    assert.equal(disco.comTrava(t, () => 'ok', { esperaMs: 200 }), 'ok');
    assert.equal(fs.existsSync(t), false);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
