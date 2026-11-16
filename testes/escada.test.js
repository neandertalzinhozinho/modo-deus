'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const escada = require('../scripts/lib/escada.js');

const CMD = { passou: 'node passou.js' };
let raiz;

function dir() { return path.join(raiz, 'memoria', 'escada'); }
function lerJson(nome) { return JSON.parse(fs.readFileSync(path.join(dir(), nome), 'utf8')); }
function existe(nome) { return fs.existsSync(path.join(dir(), nome)); }
function gravarJson(nome, obj) {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(path.join(dir(), nome), JSON.stringify(obj));
}
function exec(etapa, modelo, esforco) {
  return escada.avaliar(raiz, { tipo: 'executor', texto: `[etapa:${etapa}] faça`, modelo, esforco }, CMD);
}
function cons(etapa, modelo, esforco) {
  return escada.avaliar(raiz, { tipo: 'conselheiro', texto: `[etapa:${etapa}] ajude`, modelo, esforco }, CMD);
}

beforeEach(() => {
  raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'modo-deus-'));
  fs.mkdirSync(path.join(raiz, 'memoria'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'memoria', 'plano.md'), '[etapa:1] [etapa:2] [etapa:3] [etapa:4]\n');
});
afterEach(() => { fs.rmSync(raiz, { recursive: true, force: true }); });

test('constantes e degraus', () => {
  assert.equal(escada.MAX_TENTATIVAS, 6);
  assert.equal(escada.TETO_BASE, 4);
  assert.equal(escada.LIMPAS_PARA_DESCER, 3);
  assert.equal(escada.DEGRAUS.length, 6);
  assert.equal(escada.DEGRAUS[0], null);
  assert.deepEqual(escada.DEGRAUS[5], { modelo: 'opus', esforco: 'xhigh' });
});

test('extrairEtapa', () => {
  assert.equal(escada.extrairEtapa('[etapa:3] x'), '3');
  assert.equal(escada.extrairEtapa('[Etapa: 3]'), '3');
  assert.equal(escada.extrairEtapa('[ETAPA:Login-2]'), 'login-2');
  assert.equal(escada.extrairEtapa('sem marca'), null);
});

test('degrauAtendido', () => {
  const g = escada.degrauAtendido;
  assert.equal(g('haiku', 'low'), 1);
  assert.equal(g('haiku', 'xhigh'), 1);
  assert.equal(g('sonnet', 'low'), 1);
  assert.equal(g('sonnet', 'medium'), 2);
  assert.equal(g('sonnet', 'xhigh'), 3);
  assert.equal(g('opus', 'low'), 3);
  assert.equal(g('opus', 'high'), 4);
  assert.equal(g('opus', 'max'), 5);
  assert.equal(g('fable', 'low'), 5);
  assert.equal(g('gpt', 'high'), 0);
  assert.equal(g('sonnet', undefined), 0);
});

test('caminho feliz', () => {
  const r = exec('1', 'haiku', 'low');
  assert.equal(r.permitir, true);
  assert.equal(lerJson('etapa-1.json').tentativas, 1);
});

test('sem marca, fora do plano e sem model são barradas sem criar arquivo', () => {
  const a = escada.avaliar(raiz, { tipo: 'executor', texto: 'sem marca', modelo: 'haiku', esforco: 'low' }, CMD);
  assert.equal(a.permitir, false);
  assert.equal(a.mensagem, 'Inclua [etapa:N] no começo do pedido.');
  const b = exec('9', 'haiku', 'low');
  assert.equal(b.permitir, false);
  assert.match(b.mensagem, /A etapa 9 não está no plano/);
  const c = exec('1', undefined, undefined);
  assert.equal(c.permitir, false);
  assert.match(c.mensagem, /model haiku/);
  assert.match(c.mensagem, /effort low/);
  assert.equal(existe('etapa-1.json'), false);
  assert.equal(existe('etapa-9.json'), false);
});

test('repetição exige degrau acima e sobe a base; barrada não conta', () => {
  assert.equal(exec('1', 'haiku', 'low').permitir, true);
  const b = exec('1', 'haiku', 'low');
  assert.equal(b.permitir, false);
  assert.match(b.mensagem, /model sonnet/);
  assert.match(b.mensagem, /effort medium/);
  assert.equal(lerJson('etapa-1.json').tentativas, 1);
  assert.equal(exec('1', 'sonnet', 'medium').permitir, true);
  assert.deepEqual(lerJson('base.json'), { base: 2, limpas: 0 });
});

test('conselheiro exigido a partir da 3ª tentativa; consulta vale uma vez', () => {
  exec('1', 'haiku', 'low');
  exec('1', 'sonnet', 'medium');
  const b = exec('1', 'sonnet', 'high');
  assert.equal(b.permitir, false);
  assert.match(b.mensagem, /consulte o conselheiro/);
  assert.equal(cons('1', undefined, undefined).permitir, true);
  assert.equal(exec('1', 'sonnet', 'high').permitir, true);
  const q = exec('1', 'opus', 'high');
  assert.equal(q.permitir, false);
  assert.match(q.mensagem, /consulte o conselheiro/);
});

test('topo: opus/xhigh aceita a 2ª tentativa em opus/xhigh', () => {
  assert.equal(exec('1', 'opus', 'xhigh').permitir, true);
  assert.equal(exec('1', 'opus', 'xhigh').permitir, true);
  assert.equal(lerJson('etapa-1.json').tentativas, 2);
});

test('teto: 6ª passa, 7ª esgotada', () => {
  assert.equal(exec('1', 'opus', 'xhigh').permitir, true);
  assert.equal(exec('1', 'opus', 'xhigh').permitir, true);
  for (let i = 3; i <= 6; i++) {
    assert.equal(cons('1').permitir, true);
    assert.equal(exec('1', 'opus', 'xhigh').permitir, true, `tentativa ${i}`);
  }
  assert.equal(lerJson('etapa-1.json').tentativas, 6);
  cons('1');
  const r = exec('1', 'opus', 'xhigh');
  assert.equal(r.permitir, false);
  assert.match(r.mensagem, /6 tentativas esgotadas/);
});

test('pedir acima: primeira em opus/xhigh passa, segunda exige degrau 5', () => {
  assert.equal(exec('2', 'opus', 'xhigh').permitir, true);
  const r = exec('2', 'opus', 'high');
  assert.equal(r.permitir, false);
  assert.match(r.mensagem, /degrau 5/);
});

test('conselheiro: sonnet barrado, sem modelo passa, não conta tentativa', () => {
  const a = cons('1', 'sonnet', undefined);
  assert.equal(a.permitir, false);
  assert.equal(a.mensagem, 'O conselheiro roda em opus com effort high ou acima.');
  assert.equal(cons('1', 'opus', 'medium').permitir, false);
  assert.equal(cons('1', undefined, undefined).permitir, true);
  assert.equal(cons('1', 'opus', 'xhigh').permitir, true);
  assert.equal(lerJson('etapa-1.json').tentativas, 0);
  assert.equal(cons('9').permitir, false);
  assert.equal(escada.avaliar(raiz, { tipo: 'conselheiro', texto: 'x' }, CMD).permitir, false);
});

test('descida da base após 3 etapas limpas; base 1 é o piso', () => {
  gravarJson('base.json', { base: 3, limpas: 0 });
  for (const id of ['1', '2', '3']) {
    assert.equal(exec(id, 'sonnet', 'high').permitir, true);
    assert.equal(escada.passou(raiz, id).ok, true);
  }
  assert.deepEqual(lerJson('base.json'), { base: 2, limpas: 0 });
  fs.rmSync(path.join(dir(), 'base.json'));
  for (const id of ['1', '2', '3']) {
    exec(id, 'haiku', 'low');
    escada.passou(raiz, id);
  }
  assert.deepEqual(lerJson('base.json'), { base: 1, limpas: 0 });
});

test('passou: 2 tentativas zera limpas; repetido conta uma vez; sem rodar é ok false', () => {
  gravarJson('base.json', { base: 1, limpas: 2 });
  exec('1', 'haiku', 'low');
  exec('1', 'sonnet', 'medium');
  assert.equal(escada.passou(raiz, '1').ok, true);
  assert.equal(lerJson('base.json').limpas, 0);
  exec('2', 'sonnet', 'medium');
  assert.equal(escada.passou(raiz, '2').ok, true);
  assert.equal(lerJson('base.json').limpas, 1);
  assert.equal(escada.passou(raiz, '2').ok, true);
  assert.equal(lerJson('base.json').limpas, 1);
  const r = escada.passou(raiz, '4');
  assert.equal(r.ok, false);
  assert.equal(existe('etapa-4.json'), false);
});

test('subida tem teto', () => {
  gravarJson('base.json', { base: 4, limpas: 0 });
  assert.equal(exec('1', 'opus', 'high').permitir, true);
  assert.equal(exec('1', 'opus', 'xhigh').permitir, true);
  assert.equal(lerJson('base.json').base, 4);
});

test('ciclo novo após passou', () => {
  exec('1', 'haiku', 'low');
  escada.passou(raiz, '1');
  const r = exec('1', 'haiku', 'low');
  assert.equal(r.permitir, true);
  const e = lerJson('etapa-1.json');
  assert.equal(e.tentativas, 1);
  assert.equal(e.estado, 'aberta');
});

test('nova apaga base e etapas e mantém historico.log', () => {
  exec('1', 'haiku', 'low');
  exec('2', 'haiku', 'low');
  gravarJson('base.json', { base: 2, limpas: 0 });
  escada.nova(raiz);
  assert.equal(existe('base.json'), false);
  assert.equal(existe('etapa-1.json'), false);
  assert.equal(existe('etapa-2.json'), false);
  assert.equal(existe('historico.log'), true);
});

test('estado quebrado é tratado como ausente', () => {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(path.join(dir(), 'base.json'), '{quebrado');
  fs.writeFileSync(path.join(dir(), 'etapa-1.json'), 'xx');
  assert.equal(exec('1', 'haiku', 'low').permitir, true);
  assert.equal(lerJson('etapa-1.json').tentativas, 1);
});

test('resumo', () => {
  exec('1', 'haiku', 'low');
  const r = escada.resumo(raiz);
  assert.equal(r.base, 1);
  assert.equal(r.limpas, 0);
  assert.equal(r.etapas.length, 1);
  assert.deepEqual(r.etapas[0], { id: '1', tentativas: 1, ultimoDegrau: 1, conselhoPara: 0, estado: 'aberta' });
});

test('historico.log ganha uma linha por decisão', () => {
  exec('1', 'haiku', 'low');
  exec('1', 'haiku', 'low');
  exec('9', 'haiku', 'low');
  const linhas = fs.readFileSync(path.join(dir(), 'historico.log'), 'utf8').trim().split('\n');
  assert.equal(linhas.length, 3);
});

test('fila: dois processos na mesma etapa, exatamente um permitido', async () => {
  const script = path.join(__dirname, 'apoio', 'avalia.js');
  const inicio = String(Date.now() + 1500);
  const roda = () => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [script, raiz, '[etapa:1] x', 'haiku', 'low', inicio]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', reject);
    p.on('close', () => resolve(JSON.parse(out)));
  });
  const rs = await Promise.all([roda(), roda()]);
  assert.equal(rs.filter((r) => r.permitir === true).length, 1, JSON.stringify(rs));
  assert.equal(rs.filter((r) => r.permitir === false).length, 1, JSON.stringify(rs));
  assert.equal(lerJson('etapa-1.json').tentativas, 1);
});

test('passou recusa etapa que não serve de nome de arquivo e aceita a marca inteira', (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'modo-deus-'));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  fs.mkdirSync(path.join(raiz, 'memoria'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'memoria', 'plano.md'), '[etapa:1]\n');
  for (const ruim of ['../../fora', 'a/b', 'a\b', '', undefined, 'x'.repeat(41)]) {
    assert.equal(escada.passou(raiz, ruim).ok, false, String(ruim));
  }
  assert.deepEqual(fs.readdirSync(raiz), ['memoria']);
  assert.equal(fs.existsSync(path.join(raiz, 'memoria', 'escada')), false);
  assert.equal(escada.avaliar(raiz, { tipo: 'executor', texto: '[etapa:1] x', modelo: 'haiku', esforco: 'low' }, { passou: 'p' }).permitir, true);
  assert.equal(escada.passou(raiz, '[Etapa: 1]').ok, true);
});
