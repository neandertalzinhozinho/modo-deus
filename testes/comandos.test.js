'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PLUGIN = path.join(__dirname, '..');
const MODO = path.join(PLUGIN, 'scripts', 'modo.js');
const ESCADA = path.join(PLUGIN, 'scripts', 'escada.js');
const FRASE_LIGADO = 'Modo Deus ligado. Abra uma sessão nova neste projeto para ele valer. Confira com /model (Opus) e /effort status (xhigh).';

function tmp(nome) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'modo-deus-'));
  const dir = nome ? path.join(base, nome) : base;
  fs.mkdirSync(dir, { recursive: true });
  return { base, dir };
}
function limpar(t) { fs.rmSync(t.base, { recursive: true, force: true }); }

function rodar(script, args, extraEnv) {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  Object.assign(env, extraEnv || {});
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env });
  const linhas = r.stdout.split(/\r?\n/).filter((l) => l !== '');
  return { status: r.status, out: r.stdout, err: r.stderr, linhas };
}
const modo = (args, env) => rodar(MODO, args, env);
const escada = (args, env) => rodar(ESCADA, args, env);

test('modo ligar: sai 0, última linha é a frase; status diz ligado', () => {
  const t = tmp();
  try {
    const r = modo(['ligar', '--projeto', t.dir]);
    assert.equal(r.status, 0, r.out + r.err);
    assert.equal(r.linhas[r.linhas.length - 1], FRASE_LIGADO);
    const s = modo(['status', '--projeto', t.dir]);
    assert.equal(s.status, 0);
    assert.equal(s.linhas[0], 'Modo Deus: ligado');
    assert.match(s.out, /degrau de partida 1/);
  } finally { limpar(t); }
});

test('modo ligar duas vezes: avisa que nada mudou antes da frase', () => {
  const t = tmp();
  try {
    modo(['ligar', '--projeto', t.dir]);
    const r = modo(['ligar', '--projeto', t.dir]);
    assert.equal(r.status, 0);
    assert.ok(r.linhas.includes('Já estava ligado; nada mudou.'));
    assert.equal(r.linhas[r.linhas.length - 1], FRASE_LIGADO);
  } finally { limpar(t); }
});

test('modo desligar: sai 0 e status diz desligado', () => {
  const t = tmp();
  try {
    modo(['ligar', '--projeto', t.dir]);
    const r = modo(['desligar', '--projeto', t.dir]);
    assert.equal(r.status, 0, r.out + r.err);
    assert.equal(r.linhas[r.linhas.length - 1], 'Modo Deus desligado. Vale a partir da próxima sessão neste projeto.');
    const s = modo(['status', '--projeto', t.dir]);
    assert.equal(s.status, 0);
    assert.equal(s.linhas[0], 'Modo Deus: desligado');
    const again = modo(['desligar', '--projeto', t.dir]);
    assert.equal(again.status, 0);
    assert.equal(again.linhas[again.linhas.length - 1], 'Já estava desligado; nada mudou.');
  } finally { limpar(t); }
});

test('modo contexto 60 com ligado: sai 0 e termina com a frase', () => {
  const t = tmp();
  try {
    modo(['ligar', '--projeto', t.dir]);
    const r = modo(['contexto', '60', '--projeto', t.dir]);
    assert.equal(r.status, 0, r.out + r.err);
    assert.equal(r.linhas[r.linhas.length - 1], 'Vale a partir da próxima sessão.');
    const r2 = modo(['--projeto', t.dir, 'contexto', '40']);
    assert.equal(r2.status, 0);
  } finally { limpar(t); }
});

test('modo contexto 50 sai com 1; sem argumento sai com 1; desligado sai com 1', () => {
  const t = tmp();
  try {
    modo(['ligar', '--projeto', t.dir]);
    assert.equal(modo(['contexto', '50', '--projeto', t.dir]).status, 1);
    assert.equal(modo(['contexto', '--projeto', t.dir]).status, 1);
    modo(['desligar', '--projeto', t.dir]);
    assert.equal(modo(['contexto', '40', '--projeto', t.dir]).status, 1);
  } finally { limpar(t); }
});

test('modo xyz e sem verbo: uso e saída 1', () => {
  const uso = 'Use: modo.js <ligar|desligar|status|contexto 40|60> [--projeto <pasta>]';
  const a = modo(['xyz']);
  assert.equal(a.status, 1);
  assert.equal(a.linhas[0], uso);
  const b = modo([]);
  assert.equal(b.status, 1);
  assert.equal(b.linhas[0], uso);
});

test('modo status: aviso de settings inválido sai 0', () => {
  const t = tmp();
  try {
    fs.mkdirSync(path.join(t.dir, '.claude'));
    fs.writeFileSync(path.join(t.dir, '.claude', 'settings.json'), '{ quebrado');
    const r = modo(['status', '--projeto', t.dir]);
    assert.equal(r.status, 0);
    assert.ok(r.linhas.includes('Atenção: .claude/settings.json está inválido.'), r.out);
  } finally { limpar(t); }
});

test('modo status: divergências', () => {
  const t = tmp();
  try {
    // chave sem marcador
    fs.mkdirSync(path.join(t.dir, '.claude'));
    fs.writeFileSync(path.join(t.dir, '.claude', 'settings.json'), '{"agent":"orquestrador"}');
    let r = modo(['status', '--projeto', t.dir]);
    assert.equal(r.status, 0);
    assert.equal(r.linhas[0], 'Modo Deus: ligado');
    assert.ok(r.linhas.includes('Atenção: foi ligado à mão, sem os dados para desfazer.'), r.out);
    // marcador sem chave: liga de verdade, depois remove a chave
    fs.rmSync(path.join(t.dir, '.claude'), { recursive: true, force: true });
    modo(['ligar', '--projeto', t.dir]);
    const sp = path.join(t.dir, '.claude', 'settings.json');
    const obj = JSON.parse(fs.readFileSync(sp, 'utf8'));
    delete obj.agent;
    fs.writeFileSync(sp, JSON.stringify(obj));
    r = modo(['status', '--projeto', t.dir]);
    assert.equal(r.status, 0);
    assert.equal(r.linhas[0], 'Modo Deus: desligado');
    assert.ok(r.linhas.includes('Atenção: foi desligado à mão (a chave agent saiu do settings.json). Rode desligar para limpar o resto.'), r.out);
  } finally { limpar(t); }
});

test('sem --projeto, CLAUDE_PROJECT_DIR define a raiz', () => {
  const t = tmp();
  try {
    modo(['ligar', '--projeto', t.dir]);
    const r = modo(['status'], { CLAUDE_PROJECT_DIR: t.dir });
    assert.equal(r.status, 0);
    assert.equal(r.linhas[0], 'Modo Deus: ligado');
    const e = escada(['status'], { CLAUDE_PROJECT_DIR: t.dir });
    assert.equal(e.status, 0);
    assert.match(e.out, /degrau de partida 1/);
  } finally { limpar(t); }
});

test('pasta com espaço e acento: ligar e desligar funcionam', () => {
  const t = tmp('meu projeto ação');
  try {
    const r = modo(['ligar', '--projeto', t.dir]);
    assert.equal(r.status, 0, r.out + r.err);
    assert.equal(r.linhas[r.linhas.length - 1], FRASE_LIGADO);
    assert.equal(modo(['status', '--projeto', t.dir]).linhas[0], 'Modo Deus: ligado');
    assert.equal(modo(['desligar', '--projeto', t.dir]).status, 0);
    assert.equal(modo(['status', '--projeto', t.dir]).linhas[0], 'Modo Deus: desligado');
  } finally { limpar(t); }
});

test('escada passou 9 sem etapa sai com 1', () => {
  const t = tmp();
  try {
    const r = escada(['passou', '9', '--projeto', t.dir]);
    assert.equal(r.status, 1);
    assert.match(r.out, /Etapa 9/);
  } finally { limpar(t); }
});

test('escada passou sem etapa sai com 1', () => {
  const t = tmp();
  try {
    assert.equal(escada(['passou', '--projeto', t.dir]).status, 1);
  } finally { limpar(t); }
});

test('escada status sem escada: degrau de partida 1', () => {
  const t = tmp();
  try {
    const r = escada(['status', '--projeto', t.dir]);
    assert.equal(r.status, 0);
    assert.equal(r.linhas[0], 'degrau de partida 1');
  } finally { limpar(t); }
});

test('escada nova zera e imprime', () => {
  const t = tmp();
  try {
    const r = escada(['nova', '--projeto', t.dir]);
    assert.equal(r.status, 0);
    assert.equal(r.linhas[0], 'Escada zerada.');
  } finally { limpar(t); }
});

test('escada: verbo errado imprime uso e sai 1', () => {
  const r = escada(['xyz']);
  assert.equal(r.status, 1);
  assert.equal(r.linhas[0], 'Use: escada.js <passou <etapa>|nova|status> [--projeto <pasta>]');
  assert.equal(escada([]).status, 1);
});

test('escada status lista etapa aberta; passou aprova', () => {
  const t = tmp();
  try {
    const dir = path.join(t.dir, 'memoria', 'escada');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'etapa-3.json'), JSON.stringify({ id: '3', tentativas: 2, ultimoDegrau: 2, conselhoPara: 0, estado: 'aberta', subiuBase: false }));
    const r = escada(['status', '--projeto', t.dir]);
    assert.equal(r.status, 0);
    assert.equal(r.linhas[0], 'degrau de partida 1');
    assert.equal(r.linhas[1], 'etapa 3: 2 tentativas, último degrau 2');
    const p = escada(['--projeto', t.dir, 'passou', '3']);
    assert.equal(p.status, 0, p.out + p.err);
    assert.match(p.out, /Etapa 3 aprovada/);
    assert.equal(escada(['status', '--projeto', t.dir]).linhas.length, 1);
  } finally { limpar(t); }
});

// ---- skills ----
const SKILLS = ['ligar', 'desligar', 'status', 'contexto', 'objetivo', 'nova-skill'];

function lerSkill(nome) {
  const arq = path.join(PLUGIN, 'skills', nome, 'SKILL.md');
  assert.ok(fs.existsSync(arq), `falta ${arq}`);
  const txt = fs.readFileSync(arq, 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(txt);
  assert.ok(m, `${nome}: sem cabeçalho YAML`);
  const campos = {};
  for (const l of m[1].split('\n')) {
    const k = /^([\w-]+):\s*(.*)$/.exec(l);
    if (k) campos[k[1]] = k[2].trim();
  }
  return { txt, campos };
}

for (const nome of SKILLS) {
  test(`skill ${nome}: name e description`, () => {
    const { campos, txt } = lerSkill(nome);
    assert.equal(campos.name, nome);
    assert.ok(campos.description && campos.description.length > 0);
    assert.ok(txt.length > 0);
    if (['ligar', 'desligar', 'contexto'].includes(nome)) {
      assert.equal(campos['disable-model-invocation'], 'true');
    } else {
      assert.equal(campos['disable-model-invocation'], undefined);
    }
  });
}

for (const nome of ['ligar', 'desligar', 'status', 'contexto']) {
  test(`skill ${nome}: chama modo.js`, () => {
    const { txt } = lerSkill(nome);
    assert.ok(txt.includes('${CLAUDE_PLUGIN_ROOT}/scripts/modo.js'));
    assert.ok(txt.includes(`node "\${CLAUDE_PLUGIN_ROOT}/scripts/modo.js" ${nome}`));
  });
}

test('skill contexto usa $ARGUMENTS', () => {
  assert.ok(lerSkill('contexto').txt.includes('contexto $ARGUMENTS'));
});

test('skill objetivo traz /goal, /goal clear e aviso do avaliador', () => {
  const { txt } = lerSkill('objetivo');
  assert.ok(txt.includes('/goal clear'));
  assert.ok(txt.includes('Mostre a saída de'));
  assert.ok(txt.includes('Pare depois de'));
  assert.ok(txt.includes('o avaliador só julga o que apareceu na conversa'));
});

test('skill nova-skill aponta o modelo', () => {
  const { txt } = lerSkill('nova-skill');
  assert.ok(txt.includes('${CLAUDE_PLUGIN_ROOT}/modelos/skill-modelo.md'));
  assert.ok(txt.includes('.claude/skills/'));
});
