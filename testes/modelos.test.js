const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(raiz, 'referencia', 'guia-original.html'), 'utf8');
const blocos = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)].map((m) =>
  m[1]
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .split('\n')
    .slice(2)
    .join('\n')
);
const ler = (nome) => fs.readFileSync(path.join(raiz, 'modelos', nome), 'utf8');
const trocaTools = (bloco, novo) => bloco.replace(/^tools:.*$/m, novo);

test('o guia tem os 7 blocos esperados', () => {
  assert.equal(blocos.length, 7);
});

test('orquestrador.md contém o bloco 1 com a linha tools trocada e a seção Escada', () => {
  const t = ler('orquestrador.md');
  const esperado = trocaTools(blocos[1], 'tools: Agent(executor, conselheiro), Skill, Read, Write, Edit, Bash, Glob, Grep');
  assert.ok(t.includes(esperado));
  const regra7 = t.indexOf('7. No fim, mostre as evidências');
  assert.ok(regra7 >= 0);
  assert.ok(t.indexOf('## Escada') > regra7);
});

test('executor.md contém o bloco 2 com a linha tools trocada', () => {
  const esperado = trocaTools(blocos[2], 'tools: Skill, Read, Write, Edit, Bash, Glob, Grep');
  assert.ok(ler('executor.md').includes(esperado));
});

test('regras.md contém o bloco 4 e a seção Escada', () => {
  const t = ler('regras.md');
  assert.ok(t.includes(blocos[4]));
  assert.ok(t.includes('## Escada'));
});

test('skill-modelo.md é igual ao bloco 5 a partir de ---', () => {
  const b = blocos[5];
  const esperado = b.slice(b.indexOf('---'));
  assert.equal(ler('skill-modelo.md').trimEnd(), esperado.trimEnd());
});

test('conselheiro.md tem o cabeçalho esperado', () => {
  const t = ler('conselheiro.md');
  for (const linha of ['name: conselheiro', 'model: opus', 'effort: xhigh', 'tools: Read, Glob, Grep, Bash']) {
    assert.ok(t.split('\n').includes(linha), linha);
  }
});
