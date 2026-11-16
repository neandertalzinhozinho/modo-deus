'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projeto = require('../scripts/lib/projeto.js');

const PLUGIN = path.resolve(__dirname, '..');
const AGENTES = ['orquestrador', 'executor', 'conselheiro'];

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

function zerador() {
  const f = (raiz) => { f.chamadas.push(raiz); };
  f.chamadas = [];
  return f;
}

function ligar(raiz, plugin = PLUGIN, zerarEscada = zerador()) {
  return projeto.ligar(raiz, plugin, { zerarEscada });
}

test('projeto vazio: liga tudo', () => {
  const raiz = novaPasta();
  try {
    const r = ligar(raiz);
    assert.equal(r.ok, true, r.mensagens.join('\n'));
    assert.equal(r.mudou, true);
    for (const a of AGENTES) {
      assert.equal(ler(raiz, `.claude/agents/${a}.md`), fs.readFileSync(path.join(PLUGIN, 'modelos', `${a}.md`), 'utf8'));
    }
    const settings = JSON.parse(ler(raiz, '.claude/settings.json'));
    assert.deepEqual(settings, {
      agent: 'orquestrador',
      effortLevel: 'xhigh',
      env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '40' },
    });
    assert.ok(ler(raiz, 'CLAUDE.md').startsWith(projeto.MARCA_INI));
    assert.ok(ler(raiz, 'CLAUDE.md').includes(projeto.MARCA_FIM));
    assert.equal(ler(raiz, 'memoria/plano.md'), '');
    assert.ok(fs.statSync(path.join(raiz, '.claude/skills')).isDirectory());
    assert.ok(existe(raiz, '.claude/modo-deus.json'));
    const e = projeto.estado(raiz);
    assert.equal(e.ligado, true);
    assert.equal(e.divergencia, null);
    assert.equal(e.settingsInvalido, false);
    assert.equal(e.marcador.versao, 1);
  } finally { limpar(raiz); }
});

test('settings existente: mantém outras chaves e marca envExistia', () => {
  const raiz = novaPasta();
  try {
    escrever(raiz, '.claude/settings.json', '{"model":"fable","env":{"X":"1"}}');
    const r = ligar(raiz);
    assert.equal(r.ok, true, r.mensagens.join('\n'));
    const s = JSON.parse(ler(raiz, '.claude/settings.json'));
    assert.equal(s.model, 'fable');
    assert.equal(s.env.X, '1');
    assert.equal(s.agent, 'orquestrador');
    assert.equal(projeto.estado(raiz).marcador.settings.anteriores.envExistia, true);
    assert.equal(projeto.estado(raiz).marcador.settings.existia, true);
  } finally { limpar(raiz); }
});

test('settings com BOM: liga normalmente e guarda o original com BOM', () => {
  const raiz = novaPasta();
  try {
    const original = '﻿{"model":"fable"}';
    escrever(raiz, '.claude/settings.json', original);
    const r = ligar(raiz);
    assert.equal(r.ok, true, r.mensagens.join('\n'));
    const bruto = fs.readFileSync(path.join(raiz, '.claude/settings.json'));
    assert.notEqual(bruto[0], 0xEF, 'arquivo regravado não leva BOM');
    assert.equal(JSON.parse(bruto.toString('utf8')).model, 'fable');
    assert.equal(projeto.estado(raiz).marcador.settings.original, original);
    assert.equal(projeto.estado(raiz).ligado, true);
  } finally { limpar(raiz); }
});

test('settings inválido: ok false e nada muda', () => {
  const raiz = novaPasta();
  try {
    escrever(raiz, '.claude/settings.json', '{ "a": ');
    escrever(raiz, 'CLAUDE.md', 'texto\n');
    const antes = arvore(raiz);
    const r = ligar(raiz);
    assert.equal(r.ok, false);
    assert.ok(r.mensagens.length > 0);
    assert.deepEqual(arvore(raiz), antes);
    assert.equal(projeto.estado(raiz).settingsInvalido, true);
    assert.equal(projeto.estado(raiz).ligado, false);
  } finally { limpar(raiz); }
});

test('agente existente com outro conteúdo e sem marcador: ok false, nada gravado', () => {
  const raiz = novaPasta();
  try {
    escrever(raiz, '.claude/agents/orquestrador.md', 'meu agente\n');
    escrever(raiz, 'CLAUDE.md', 'texto\n');
    const antes = arvore(raiz);
    const r = ligar(raiz);
    assert.equal(r.ok, false);
    assert.ok(r.mensagens.join('\n').includes('orquestrador.md'));
    assert.deepEqual(arvore(raiz), antes);
  } finally { limpar(raiz); }
});

test('ligar duas vezes: segunda não muda e o marcador fica igual', () => {
  const raiz = novaPasta();
  try {
    const z = zerador();
    assert.equal(ligar(raiz, PLUGIN, z).ok, true);
    const marcador1 = fs.readFileSync(path.join(raiz, '.claude/modo-deus.json'));
    const antes = arvore(raiz);
    const r2 = ligar(raiz, PLUGIN, z);
    assert.equal(r2.ok, true);
    assert.equal(r2.mudou, false);
    assert.ok(fs.readFileSync(path.join(raiz, '.claude/modo-deus.json')).equals(marcador1));
    assert.deepEqual(arvore(raiz), antes);
  } finally { limpar(raiz); }
});

test('atualização de modelos regrava agente e impressão; agente editado à mão não é regravado', () => {
  const raiz = novaPasta();
  const falso = novaPasta();
  try {
    const modelosFalsos = path.join(falso, 'modelos');
    fs.cpSync(path.join(PLUGIN, 'modelos'), modelosFalsos, { recursive: true });
    assert.equal(ligar(raiz, falso).ok, true);
    const imp1 = projeto.estado(raiz).marcador.arquivos['.claude/agents/executor.md'];
    const orig = fs.readFileSync(path.join(modelosFalsos, 'executor.md'), 'utf8');
    fs.writeFileSync(path.join(modelosFalsos, 'executor.md'), orig + '\nlinha nova\n', 'utf8');
    fs.writeFileSync(path.join(modelosFalsos, 'conselheiro.md'),
      fs.readFileSync(path.join(modelosFalsos, 'conselheiro.md'), 'utf8') + '\nmais\n', 'utf8');
    // conselheiro editado à mão no projeto
    escrever(raiz, '.claude/agents/conselheiro.md', 'editado por mim\n');
    const r = ligar(raiz, falso);
    assert.equal(r.ok, true, r.mensagens.join('\n'));
    assert.equal(r.mudou, true);
    assert.equal(ler(raiz, '.claude/agents/executor.md'), orig + '\nlinha nova\n');
    const m = projeto.estado(raiz).marcador;
    assert.notEqual(m.arquivos['.claude/agents/executor.md'], imp1);
    assert.equal(ler(raiz, '.claude/agents/conselheiro.md'), 'editado por mim\n');
    assert.ok(r.mensagens.join('\n').includes('conselheiro.md'));
  } finally { limpar(raiz, falso); }
});

test('CLAUDE.md existente em CRLF: bloco em CRLF e texto anterior intacto', () => {
  const raiz = novaPasta();
  try {
    const original = '# Meu projeto\r\n\r\nregra minha\r\n';
    escrever(raiz, 'CLAUDE.md', original);
    const r = ligar(raiz);
    assert.equal(r.ok, true, r.mensagens.join('\n'));
    const novo = ler(raiz, 'CLAUDE.md');
    assert.ok(novo.startsWith(original + '\r\n' + projeto.MARCA_INI + '\r\n'));
    assert.ok(novo.endsWith(projeto.MARCA_FIM + '\r\n'));
    assert.equal(/(^|[^\r])\n/.test(novo), false, 'nenhuma quebra LF solta');
  } finally { limpar(raiz); }
});

test('CLAUDE.md existente em LF sem quebra final: completa e separa por linha em branco', () => {
  const raiz = novaPasta();
  try {
    escrever(raiz, 'CLAUDE.md', 'abc');
    assert.equal(ligar(raiz).ok, true);
    assert.ok(ler(raiz, 'CLAUDE.md').startsWith('abc\n\n' + projeto.MARCA_INI + '\n'));
  } finally { limpar(raiz); }
});

test('bloco já presente e modo ligado: só o trecho entre as marcas é substituído', () => {
  const raiz = novaPasta();
  const falso = novaPasta();
  try {
    escrever(raiz, 'CLAUDE.md', 'antes\n');
    fs.cpSync(path.join(PLUGIN, 'modelos'), path.join(falso, 'modelos'), { recursive: true });
    assert.equal(ligar(raiz, falso).ok, true);
    const cam = path.join(raiz, 'CLAUDE.md');
    fs.writeFileSync(cam, ler(raiz, 'CLAUDE.md') + '\ndepois\n', 'utf8');
    fs.writeFileSync(path.join(falso, 'modelos', 'regras.md'), '# Regras novas\n\nlinha\n', 'utf8');
    const r = ligar(raiz, falso);
    assert.equal(r.ok, true, r.mensagens.join('\n'));
    assert.equal(ler(raiz, 'CLAUDE.md'),
      'antes\n\n' + projeto.MARCA_INI + '\n# Regras novas\n\nlinha\n' + projeto.MARCA_FIM + '\n\ndepois\n');
  } finally { limpar(raiz, falso); }
});

test('settings já com agent orquestrador e sem marcador: liga e grava tinha false', () => {
  const raiz = novaPasta();
  try {
    escrever(raiz, '.claude/settings.json', '{"agent":"orquestrador"}');
    const antes = projeto.estado(raiz);
    assert.equal(antes.divergencia, 'chave-sem-marcador');
    assert.equal(antes.ligado, true);
    const r = ligar(raiz);
    assert.equal(r.ok, true, r.mensagens.join('\n'));
    assert.deepEqual(projeto.estado(raiz).marcador.settings.anteriores.agent, { tinha: false, valor: null });
    assert.equal(projeto.estado(raiz).divergencia, null);
  } finally { limpar(raiz); }
});

test('marcador sem chave: estado aponta a divergência', () => {
  const raiz = novaPasta();
  try {
    assert.equal(ligar(raiz).ok, true);
    escrever(raiz, '.claude/settings.json', '{}');
    const e = projeto.estado(raiz);
    assert.equal(e.ligado, false);
    assert.equal(e.divergencia, 'marcador-sem-chave');
  } finally { limpar(raiz); }
});

test('erro no meio: desfaz e a árvore volta a ser a de antes', (t) => {
  const raiz = novaPasta();
  try {
    escrever(raiz, '.claude/settings.json', '{"model":"fable"}');
    escrever(raiz, 'CLAUDE.md', 'texto\n');
    const antes = arvore(raiz);
    const original = fs.writeFileSync;
    let n = 0;
    const m = t.mock.method(fs, 'writeFileSync', function (...args) {
      n++;
      if (n === 3) throw new Error('disco cheio de mentira');
      return original.apply(this, args);
    });
    const r = ligar(raiz);
    m.mock.restore();
    assert.equal(r.ok, false);
    assert.ok(r.mensagens.length > 0);
    assert.deepEqual(arvore(raiz), antes);
  } finally { limpar(raiz); }
});

test('zerarEscada: chamado uma vez ao ligar desligado e não chamado se já ligado', () => {
  const raiz = novaPasta();
  const falso = novaPasta();
  try {
    fs.cpSync(path.join(PLUGIN, 'modelos'), path.join(falso, 'modelos'), { recursive: true });
    const z = zerador();
    assert.equal(ligar(raiz, falso, z).ok, true);
    assert.equal(z.chamadas.length, 1);
    assert.equal(z.chamadas[0], raiz);
    fs.appendFileSync(path.join(falso, 'modelos', 'executor.md'), '\nmudou\n');
    const r = ligar(raiz, falso, z);
    assert.equal(r.ok, true);
    assert.equal(r.mudou, true);
    assert.equal(z.chamadas.length, 1);
  } finally { limpar(raiz, falso); }
});
