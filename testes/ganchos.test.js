'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const projeto = require('../scripts/lib/projeto.js');

const PLUGIN = path.join(__dirname, '..');
const GANCHO = path.join(PLUGIN, 'scripts', 'gancho.js');
const SESSAO = path.join(PLUGIN, 'scripts', 'sessao.js');

function projetoTemp(t, nome) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'modo-deus-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  if (!nome) return base;
  const raiz = path.join(base, nome);
  fs.mkdirSync(raiz);
  return raiz;
}

function ligado(raiz) {
  const r = projeto.ligar(raiz, PLUGIN);
  assert.equal(r.ok, true, (r.mensagens || []).join(' | '));
  fs.mkdirSync(path.join(raiz, 'memoria'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'memoria', 'plano.md'), '[etapa:1] fazer algo\n');
}

function rodar(script, raiz, entrada, semVar) {
  const env = { ...process.env };
  if (semVar) delete env.CLAUDE_PROJECT_DIR; else env.CLAUDE_PROJECT_DIR = raiz;
  return spawnSync(process.execPath, [script], { input: entrada, env, encoding: 'utf8' });
}

function pre(raiz, ti) {
  return JSON.stringify({
    session_id: 's', transcript_path: 't', cwd: raiz, scratchpad_dir: 'x', prompt_id: 'p',
    permission_mode: 'default', effort: 'xhigh', hook_event_name: 'PreToolUse', tool_name: 'Agent',
    tool_input: ti, tool_use_id: 'u',
  });
}

const valida = { description: 'Teste', prompt: '[etapa:1] faça X', subagent_type: 'executor', model: 'haiku', effort: 'low' };

function etapa1(raiz) {
  return path.join(raiz, 'memoria', 'escada', 'etapa-1.json');
}

test('gancho: modo desligado deixa passar', (t) => {
  const raiz = projetoTemp(t);
  const r = rodar(GANCHO, raiz, pre(raiz, { ...valida, prompt: 'sem marca' }));
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});

test('gancho: subagent_type sc-executor passa sem criar arquivos de escada', (t) => {
  const raiz = projetoTemp(t);
  ligado(raiz);
  const r = rodar(GANCHO, raiz, pre(raiz, { ...valida, subagent_type: 'sc-executor' }));
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(path.join(raiz, 'memoria', 'escada', 'etapa-1.json')), false);
  assert.equal(fs.existsSync(path.join(raiz, 'memoria', 'escada', 'historico.log')), false);
});

test('gancho: executor sem marca é barrado', (t) => {
  const raiz = projetoTemp(t);
  ligado(raiz);
  const r = rodar(GANCHO, raiz, pre(raiz, { ...valida, prompt: 'faça X' }));
  assert.equal(r.status, 2);
  assert.ok(r.stderr.startsWith('[modo-deus] '), r.stderr);
  assert.ok(r.stderr.includes('[etapa:N]'), r.stderr);
});

test('gancho: executor válido passa, grava tentativa e não imprime nada', (t) => {
  const raiz = projetoTemp(t);
  ligado(raiz);
  const r = rodar(GANCHO, raiz, pre(raiz, valida));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
  assert.equal(JSON.parse(fs.readFileSync(etapa1(raiz), 'utf8')).tentativas, 1);
});

test('gancho: entrada vazia, JSON quebrado e sem tool_input passam', (t) => {
  const raiz = projetoTemp(t);
  ligado(raiz);
  for (const entrada of ['', '{', '{"tool_name":"Agent"}']) {
    const r = rodar(GANCHO, raiz, entrada);
    assert.equal(r.status, 0, `entrada ${JSON.stringify(entrada)}: ${r.stderr}`);
  }
});

test('gancho: sem CLAUDE_PROJECT_DIR usa o cwd da entrada', (t) => {
  const raiz = projetoTemp(t);
  ligado(raiz);
  const r = rodar(GANCHO, raiz, pre(raiz, valida), true);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(etapa1(raiz), 'utf8')).tentativas, 1);
});

test('gancho: pasta com espaço e acento', (t) => {
  const raiz = projetoTemp(t, 'meu projeto ação');
  ligado(raiz);
  const r = rodar(GANCHO, raiz, pre(raiz, valida));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(etapa1(raiz), 'utf8')).tentativas, 1);
});

test('gancho: exceção da escada vira erros.log e saída 0', (t) => {
  const raiz = projetoTemp(t);
  ligado(raiz);
  // etapa-1.json como pasta: a leitura da etapa falha com erro inesperado
  fs.mkdirSync(etapa1(raiz), { recursive: true });
  const r = rodar(GANCHO, raiz, pre(raiz, valida));
  assert.equal(r.status, 0, r.stderr);
  const log = path.join(raiz, 'memoria', 'escada', 'erros.log');
  assert.match(fs.readFileSync(log, 'utf8'), /^\d{4}-\d\d-\d\dT\S+ .+\n/);
});

test('sessão: desligado', (t) => {
  const raiz = projetoTemp(t);
  const r = rodar(SESSAO, raiz, JSON.stringify({ cwd: raiz, agent_type: 'orquestrador' }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '[modo-deus] desligado neste projeto · /modo-deus:ligar para ativar');
});

test('sessão: ligado como orquestrador, caminho com / e aspas', (t) => {
  const raiz = projetoTemp(t);
  ligado(raiz);
  const r = rodar(SESSAO, raiz, JSON.stringify({ cwd: raiz, agent_type: 'orquestrador', hook_event_name: 'SessionStart', source: 'startup' }));
  assert.equal(r.status, 0);
  const esperado = path.join(PLUGIN, 'scripts', 'escada.js').replace(/\\/g, '/');
  assert.equal(
    r.stdout.trim(),
    `[modo-deus] LIGADO · degrau de partida 1 · escada: node "${esperado}" (passou <etapa> | nova | status)`
  );
});

test('sessão: ligado sem abrir como orquestrador', (t) => {
  const raiz = projetoTemp(t);
  ligado(raiz);
  const r = rodar(SESSAO, raiz, JSON.stringify({ cwd: raiz, source: 'startup' }));
  assert.equal(r.status, 0);
  assert.equal(
    r.stdout.trim(),
    '[modo-deus] LIGADO neste projeto, mas esta sessão não abriu como orquestrador. Abra uma sessão nova. Se continuar assim, a trava e o esforço do guia não estão valendo.'
  );
});

test('sessão: marcador sem chave (desligado à mão)', (t) => {
  const raiz = projetoTemp(t);
  ligado(raiz);
  const arq = path.join(raiz, '.claude', 'settings.json');
  const s = JSON.parse(fs.readFileSync(arq, 'utf8').replace(/^﻿/, ''));
  delete s.agent;
  fs.writeFileSync(arq, JSON.stringify(s, null, 2));
  const r = rodar(SESSAO, raiz, JSON.stringify({ cwd: raiz, agent_type: 'orquestrador' }));
  assert.equal(r.status, 0);
  assert.equal(
    r.stdout.trim(),
    '[modo-deus] desligado à mão (a chave agent saiu do settings.json) · /modo-deus:desligar para limpar o resto'
  );
});

test('sessão: entrada vazia sai com 0', (t) => {
  const raiz = projetoTemp(t);
  const r = rodar(SESSAO, raiz, '');
  assert.equal(r.status, 0);
});

test('sessão: sem CLAUDE_PROJECT_DIR usa o cwd da entrada', (t) => {
  const raiz = projetoTemp(t);
  ligado(raiz);
  const r = rodar(SESSAO, raiz, JSON.stringify({ cwd: raiz, agent_type: 'orquestrador' }), true);
  assert.match(r.stdout, /LIGADO · degrau de partida/);
});

test('hooks.json tem o conteúdo do plano', () => {
  const h = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'));
  assert.deepEqual(h, {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/sessao.js"' }] }],
      PreToolUse: [{ matcher: 'Agent|Task', hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/gancho.js"' }] }],
    },
  });
});
