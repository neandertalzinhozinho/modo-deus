'use strict';
// Peças juntas, sem substitutos: o ligar de verdade zera a escada de verdade.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const projeto = require('../scripts/lib/projeto.js');
const escada = require('../scripts/lib/escada.js');

const PLUGIN = path.join(__dirname, '..');

function projetoTemp(t) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'modo-deus-'));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  return raiz;
}

test('ligar sem opções zera a escada antiga e mantém o histórico', (t) => {
  const raiz = projetoTemp(t);
  const pasta = path.join(raiz, 'memoria', 'escada');
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'base.json'), '{"base":4,"limpas":2}');
  fs.writeFileSync(path.join(pasta, 'etapa-1.json'), '{"id":"1","tentativas":6,"ultimoDegrau":5,"conselhoPara":6,"estado":"aberta","subiuBase":true}');
  fs.writeFileSync(path.join(pasta, 'historico.log'), 'linha antiga\n');

  const r = projeto.ligar(raiz, PLUGIN);
  assert.equal(r.ok, true, r.mensagens.join(' | '));
  assert.equal(projeto.estado(raiz).ligado, true);
  assert.deepEqual(escada.resumo(raiz), { base: 1, limpas: 0, etapas: [] });
  assert.equal(fs.readFileSync(path.join(pasta, 'historico.log'), 'utf8'), 'linha antiga\n');
});

test('ligar de novo com o modo ligado não apaga a escada em andamento', (t) => {
  const raiz = projetoTemp(t);
  assert.equal(projeto.ligar(raiz, PLUGIN).ok, true);
  fs.writeFileSync(path.join(raiz, 'memoria', 'plano.md'), '[etapa:1] fazer algo\n');
  const a = escada.avaliar(raiz, { tipo: 'executor', texto: '[etapa:1] vai', modelo: 'haiku', esforco: 'low' }, { passou: 'p' });
  assert.equal(a.permitir, true);

  const r = projeto.ligar(raiz, PLUGIN);
  assert.equal(r.ok, true);
  assert.equal(r.mudou, false);
  assert.equal(escada.resumo(raiz).etapas.length, 1);
});

test('os agentes gravados no projeto são os modelos do plugin, e o desligar desfaz', (t) => {
  const raiz = projetoTemp(t);
  assert.equal(projeto.ligar(raiz, PLUGIN).ok, true);
  for (const nome of ['orquestrador', 'executor', 'conselheiro']) {
    assert.equal(
      fs.readFileSync(path.join(raiz, '.claude', 'agents', `${nome}.md`), 'utf8'),
      fs.readFileSync(path.join(PLUGIN, 'modelos', `${nome}.md`), 'utf8')
    );
  }
  const settings = JSON.parse(fs.readFileSync(path.join(raiz, '.claude', 'settings.json'), 'utf8'));
  assert.deepEqual(settings, { agent: 'orquestrador', effortLevel: 'xhigh', env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '40' } });
  const md = fs.readFileSync(path.join(raiz, 'CLAUDE.md'), 'utf8');
  assert.ok(md.includes('## Skills que se aprimoram') && md.includes('## Escada'));

  const d = projeto.desligar(raiz);
  assert.equal(d.ok, true, d.mensagens.join(' | '));
  assert.equal(projeto.estado(raiz).ligado, false);
  assert.equal(fs.existsSync(path.join(raiz, '.claude', 'settings.json')), false);
  assert.equal(fs.existsSync(path.join(raiz, 'CLAUDE.md')), false);
  assert.equal(fs.existsSync(path.join(raiz, '.claude', 'agents')), false);
  assert.equal(fs.existsSync(path.join(raiz, 'memoria', 'plano.md')), true);
});
