'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projeto = require('../scripts/lib/projeto.js');

const PLUGIN = path.resolve(__dirname, '..');

function novaPasta() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'modo-deus-'));
}

function limpar(...pastas) {
  for (const p of pastas) fs.rmSync(p, { recursive: true, force: true });
}

function arvore(raiz) {
  const mapa = {};
  (function varrer(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const cam = path.join(dir, e.name);
      if (e.isDirectory()) varrer(cam);
      else mapa[path.relative(raiz, cam).split(path.sep).join('/')] = fs.readFileSync(cam).toString('base64');
    }
  })(raiz);
  return mapa;
}

function escrever(raiz, rel, texto) {
  const cam = path.join(raiz, rel);
  fs.mkdirSync(path.dirname(cam), { recursive: true });
  fs.writeFileSync(cam, texto, 'utf8');
}

function ler(raiz, rel) {
  return fs.readFileSync(path.join(raiz, rel), 'utf8');
}

function existe(raiz, rel) {
  return fs.existsSync(path.join(raiz, rel));
}

function ligar(raiz) {
  const r = projeto.ligar(raiz, PLUGIN, { zerarEscada: () => {} });
  assert.equal(r.ok, true, r.mensagens.join('\n'));
  return r;
}

function semExtras(mapa) {
  const c = Object.assign({}, mapa);
  delete c['memoria/plano.md'];
  return c;
}

const PONTOS = [
  ['projeto vazio', {}],
  ['settings com outras chaves', { '.claude/settings.json': '{\n  "model": "fable",\n  "env": { "X": "1" }\n}' }],
  ['settings com BOM', { '.claude/settings.json': '﻿{"model":"fable"}\r\n' }],
  ['CLAUDE.md em LF', { 'CLAUDE.md': '# Projeto\n\nregra\n' }],
  ['CLAUDE.md em CRLF', { 'CLAUDE.md': '# Projeto\r\n\r\nregra\r\n' }],
  ['CLAUDE.md sem quebra final', { 'CLAUDE.md': 'sem quebra' }],
  ['tudo junto', { '.claude/settings.json': '{"effortLevel":"low","env":{"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE":"90"}}', 'CLAUDE.md': 'x\r\n', 'a/b.txt': 'qualquer' }],
];

for (const [nome, arquivos] of PONTOS) {
  test(`ligar e desligar devolvem a árvore original: ${nome}`, () => {
    const raiz = novaPasta();
    try {
      for (const [rel, txt] of Object.entries(arquivos)) escrever(raiz, rel, txt);
      const inicial = arvore(raiz);
      ligar(raiz);
      const r = projeto.desligar(raiz);
      assert.equal(r.ok, true, r.mensagens.join('\n'));
      assert.equal(r.mudou, true);
      assert.deepEqual(semExtras(arvore(raiz)), inicial);
      assert.equal(projeto.estado(raiz).ligado, false);
      assert.equal(existe(raiz, '.claude/agents'), false, 'pasta agents vazia é removida');
      assert.ok(existe(raiz, '.claude/skills'), 'skills não é tocada');
      assert.ok(existe(raiz, 'memoria/plano.md'), 'memoria não é tocada');
    } finally { limpar(raiz); }
  });
}

test('settings editado depois: mantém theme, remove as três chaves, JSON válido', () => {
  const raiz = novaPasta();
  try {
    escrever(raiz, '.claude/settings.json', '{"model":"fable","env":{"X":"1"}}');
    ligar(raiz);
    const s = JSON.parse(ler(raiz, '.claude/settings.json'));
    s.theme = 'dark';
    escrever(raiz, '.claude/settings.json', JSON.stringify(s));
    const r = projeto.desligar(raiz);
    assert.equal(r.ok, true, r.mensagens.join('\n'));
    assert.deepEqual(JSON.parse(ler(raiz, '.claude/settings.json')), { model: 'fable', env: { X: '1' }, theme: 'dark' });
  } finally { limpar(raiz); }
});

test('settings editado, sem env original: env vazio é removido', () => {
  const raiz = novaPasta();
  try {
    ligar(raiz);
    const s = JSON.parse(ler(raiz, '.claude/settings.json'));
    s.theme = 'dark';
    escrever(raiz, '.claude/settings.json', JSON.stringify(s));
    assert.equal(projeto.desligar(raiz).ok, true);
    assert.deepEqual(JSON.parse(ler(raiz, '.claude/settings.json')), { theme: 'dark' });
  } finally { limpar(raiz); }
});

test('settings editado com valores anteriores: voltam aos anteriores', () => {
  const raiz = novaPasta();
  try {
    escrever(raiz, '.claude/settings.json', '{"effortLevel":"low","env":{"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE":"90"}}');
    ligar(raiz);
    const s = JSON.parse(ler(raiz, '.claude/settings.json'));
    s.theme = 'dark';
    escrever(raiz, '.claude/settings.json', JSON.stringify(s));
    assert.equal(projeto.desligar(raiz).ok, true);
    assert.deepEqual(JSON.parse(ler(raiz, '.claude/settings.json')),
      { effortLevel: 'low', env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '90' }, theme: 'dark' });
  } finally { limpar(raiz); }
});

test('effortLevel mudado para high: desligar mantém e avisa', () => {
  const raiz = novaPasta();
  try {
    ligar(raiz);
    const s = JSON.parse(ler(raiz, '.claude/settings.json'));
    s.effortLevel = 'high';
    escrever(raiz, '.claude/settings.json', JSON.stringify(s));
    const r = projeto.desligar(raiz);
    assert.equal(r.ok, true, r.mensagens.join('\n'));
    const f = JSON.parse(ler(raiz, '.claude/settings.json'));
    assert.equal(f.effortLevel, 'high');
    assert.equal(f.agent, undefined);
    assert.ok(r.mensagens.join('\n').includes('effortLevel'));
  } finally { limpar(raiz); }
});

test('CLAUDE.md com texto antes e depois do bloco: mantém os dois, tira bloco e marcas', () => {
  const raiz = novaPasta();
  try {
    escrever(raiz, 'CLAUDE.md', 'inicio\n');
    ligar(raiz);
    escrever(raiz, 'CLAUDE.md', 'antes novo\n' + ler(raiz, 'CLAUDE.md') + 'depois novo\n');
    const r = projeto.desligar(raiz);
    assert.equal(r.ok, true, r.mensagens.join('\n'));
    const md = ler(raiz, 'CLAUDE.md');
    assert.ok(md.includes('antes novo'));
    assert.ok(md.includes('inicio'));
    assert.ok(md.includes('depois novo'));
    assert.equal(md.includes(projeto.MARCA_INI), false);
    assert.equal(md.includes(projeto.MARCA_FIM), false);
    assert.equal(md, 'antes novo\ninicio\ndepois novo\n');
  } finally { limpar(raiz); }
});

test('CLAUDE.md criado pelo plugin e editado: sobrando só espaço, é apagado', () => {
  const raiz = novaPasta();
  try {
    ligar(raiz);
    escrever(raiz, 'CLAUDE.md', ler(raiz, 'CLAUDE.md') + '\n\n');
    assert.equal(projeto.desligar(raiz).ok, true);
    assert.equal(existe(raiz, 'CLAUDE.md'), false);
  } finally { limpar(raiz); }
});

test('executor.md editado: desligar mantém o arquivo e cita ele', () => {
  const raiz = novaPasta();
  try {
    ligar(raiz);
    escrever(raiz, '.claude/agents/executor.md', 'meu executor\n');
    const r = projeto.desligar(raiz);
    assert.equal(r.ok, true, r.mensagens.join('\n'));
    assert.equal(ler(raiz, '.claude/agents/executor.md'), 'meu executor\n');
    assert.ok(r.mensagens.join('\n').includes('executor.md'));
    assert.equal(existe(raiz, '.claude/agents/orquestrador.md'), false);
    assert.equal(existe(raiz, '.claude/agents/conselheiro.md'), false);
    assert.equal(existe(raiz, '.claude/modo-deus.json'), false);
  } finally { limpar(raiz); }
});

test('ligar, ligar, desligar: modo desligado', () => {
  const raiz = novaPasta();
  try {
    escrever(raiz, '.claude/settings.json', '{"model":"fable"}');
    const inicial = arvore(raiz);
    ligar(raiz);
    ligar(raiz);
    assert.equal(projeto.desligar(raiz).ok, true);
    assert.equal(projeto.estado(raiz).ligado, false);
    assert.deepEqual(semExtras(arvore(raiz)), inicial);
  } finally { limpar(raiz); }
});

test('contexto 60 e desligar: árvore volta ao inicial', () => {
  const raiz = novaPasta();
  try {
    escrever(raiz, '.claude/settings.json', '﻿{"model":"fable"}');
    const inicial = arvore(raiz);
    ligar(raiz);
    const c = projeto.contexto(raiz, '60');
    assert.equal(c.ok, true, c.mensagens.join('\n'));
    assert.equal(JSON.parse(ler(raiz, '.claude/settings.json')).env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE, '60');
    assert.equal(projeto.desligar(raiz).ok, true);
    assert.deepEqual(semExtras(arvore(raiz)), inicial);
  } finally { limpar(raiz); }
});

test('contexto 60 e voltar a 40 funcionam em sequência', () => {
  const raiz = novaPasta();
  try {
    ligar(raiz);
    assert.equal(projeto.contexto(raiz, '60').ok, true);
    assert.equal(projeto.contexto(raiz, '40').ok, true);
    assert.equal(JSON.parse(ler(raiz, '.claude/settings.json')).env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE, '40');
  } finally { limpar(raiz); }
});

test('contexto com o modo desligado: ok false', () => {
  const raiz = novaPasta();
  try {
    const antes = arvore(raiz);
    const r = projeto.contexto(raiz, '60');
    assert.equal(r.ok, false);
    assert.ok(r.mensagens.length > 0);
    assert.deepEqual(arvore(raiz), antes);
  } finally { limpar(raiz); }
});

test('contexto 50: ok false e nada muda', () => {
  const raiz = novaPasta();
  try {
    ligar(raiz);
    const antes = arvore(raiz);
    const r = projeto.contexto(raiz, '50');
    assert.equal(r.ok, false);
    assert.deepEqual(arvore(raiz), antes);
  } finally { limpar(raiz); }
});

test('settings inválido na hora de desligar: ok false e nada muda', () => {
  const raiz = novaPasta();
  try {
    ligar(raiz);
    escrever(raiz, '.claude/settings.json', '{ "a": ');
    const antes = arvore(raiz);
    const r = projeto.desligar(raiz);
    assert.equal(r.ok, false);
    assert.deepEqual(arvore(raiz), antes);
  } finally { limpar(raiz); }
});

test('sem marcador e com agent orquestrador: remove só a chave agent e avisa', () => {
  const raiz = novaPasta();
  try {
    escrever(raiz, '.claude/settings.json', '{"agent":"orquestrador","model":"fable","effortLevel":"xhigh"}');
    const r = projeto.desligar(raiz);
    assert.equal(r.ok, true, r.mensagens.join('\n'));
    assert.equal(r.mudou, true);
    assert.deepEqual(JSON.parse(ler(raiz, '.claude/settings.json')), { model: 'fable', effortLevel: 'xhigh' });
    assert.ok(r.mensagens.length > 0);
    assert.equal(projeto.estado(raiz).ligado, false);
  } finally { limpar(raiz); }
});

test('agent orquestrador sem marcador: ligar e desligar realmente desliga', () => {
  const raiz = novaPasta();
  try {
    escrever(raiz, '.claude/settings.json', '{"agent":"orquestrador","effortLevel":"xhigh"}');
    ligar(raiz);
    assert.equal(projeto.desligar(raiz).ok, true);
    assert.equal(projeto.estado(raiz).ligado, false);
    assert.equal(JSON.parse(ler(raiz, '.claude/settings.json')).agent, undefined);
  } finally { limpar(raiz); }
});

test('sem marcador e sem a chave: ok true, mudou false', () => {
  const raiz = novaPasta();
  try {
    escrever(raiz, '.claude/settings.json', '{"model":"fable"}');
    const antes = arvore(raiz);
    const r = projeto.desligar(raiz);
    assert.equal(r.ok, true);
    assert.equal(r.mudou, false);
    assert.deepEqual(arvore(raiz), antes);
    const vazio = novaPasta();
    try {
      const r2 = projeto.desligar(vazio);
      assert.equal(r2.ok, true);
      assert.equal(r2.mudou, false);
    } finally { limpar(vazio); }
  } finally { limpar(raiz); }
});
