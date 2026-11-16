'use strict';
// Testes de ponta a ponta com sessões reais do Claude Code.
// Uso: node testes/e2e/roda.js [trava|escada|skills|comandos|aviso]   (sem argumento roda todos)
// Gasta limite de uso: cada cenário abre sessões de verdade, no modelo do guia (Opus, xhigh).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PLUGIN = path.join(__dirname, '..', '..');
const projeto = require(path.join(PLUGIN, 'scripts', 'lib', 'projeto.js'));
const barra = (p) => p.replace(/\\/g, '/');

function ambiente() {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR; // a sessão filha define a dela
  return env;
}

function novoProjeto({ ligar = true } = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'modo-deus-e2e-'));
  fs.mkdirSync(path.join(raiz, '.claude', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(raiz, '.claude', 'skills', 'saudar'), { recursive: true });
  fs.mkdirSync(path.join(raiz, 'memoria'), { recursive: true });
  fs.writeFileSync(path.join(raiz, 'CLAUDE.md'), '# Projeto de teste\n\nTexto que já existia.\n');
  fs.writeFileSync(path.join(raiz, '.claude', 'settings.json'), '{\n  "env": { "X": "1" }\n}\n');
  fs.writeFileSync(path.join(raiz, '.claude', 'agents', 'intruso.md'),
    '---\nname: intruso\ndescription: Agente de teste que não deveria poder ser chamado.\nmodel: haiku\ntools: Read\n---\n\nResponda apenas INTRUSO-RODOU.\n');
  fs.writeFileSync(path.join(raiz, '.claude', 'skills', 'saudar', 'SKILL.md'),
    '---\nname: saudar\ndescription: Use quando pedirem a saudação secreta do projeto.\n---\n\nA saudação secreta é: ABACAXI-42.\n');
  fs.writeFileSync(path.join(raiz, 'memoria', 'plano.md'), '[etapa:1] Tarefa de teste: responder ao que for pedido.\n');
  const antes = {
    settings: fs.readFileSync(path.join(raiz, '.claude', 'settings.json')),
    claudeMd: fs.readFileSync(path.join(raiz, 'CLAUDE.md')),
  };
  if (ligar) {
    const r = spawnSync(process.execPath, [path.join(PLUGIN, 'scripts', 'modo.js'), 'ligar', '--projeto', raiz], { encoding: 'utf8', env: ambiente() });
    if (r.status !== 0) throw new Error('ligar falhou: ' + r.stdout + r.stderr);
  }
  return { raiz, antes };
}

// Abre uma sessão real. O prompt vai pela entrada padrão (o Git Bash estraga "/comando" em argumento).
function sessao(raiz, prompt, extra = []) {
  // Com o plugin já instalado, rode com MODO_DEUS_INSTALADO=1: sem --plugin-dir, para não carregar o plugin duas vezes.
  const origem = process.env.MODO_DEUS_INSTALADO === '1' ? [] : ['--plugin-dir', `"${barra(PLUGIN)}"`];
  const args = ['-p', ...origem, '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits', '--allowedTools', '"Bash(node:*)"', ...extra];
  const r = spawnSync('claude', args, {
    cwd: raiz, input: prompt, encoding: 'utf8', shell: true, env: ambiente(),
    maxBuffer: 256 * 1024 * 1024, timeout: 15 * 60 * 1000,
  });
  const eventos = [];
  for (const l of String(r.stdout || '').split(/\r?\n/)) {
    if (!l.trim()) continue;
    try { eventos.push(JSON.parse(l)); } catch (_) { /* linha que não é JSON */ }
  }
  const texto = (c) => (typeof c === 'string' ? c : (c || []).map((b) => b.text || '').join(' '));
  const init = eventos.find((e) => e.type === 'system' && e.subtype === 'init') || {};
  const usos = []; // chamadas de ferramenta da sessão principal, em ordem
  const usosFilhos = [];
  const resultados = new Map();
  for (const e of eventos) {
    if (e.type === 'assistant') {
      for (const b of (e.message && e.message.content) || []) {
        if (b.type !== 'tool_use') continue;
        (e.parent_tool_use_id ? usosFilhos : usos).push({ id: b.id, nome: b.name, entrada: b.input || {} });
      }
    } else if (e.type === 'user') {
      for (const b of (e.message && e.message.content) || []) {
        if (b.type === 'tool_result') resultados.set(b.tool_use_id, { erro: b.is_error === true, texto: texto(b.content) });
      }
    }
  }
  const fim = eventos.filter((e) => e.type === 'result').pop() || {};
  return {
    codigo: r.status, stderr: String(r.stderr || '').slice(0, 500), init, usos, usosFilhos,
    resultadoDe: (u) => resultados.get(u.id) || { erro: false, texto: '(sem resultado)' },
    final: String(fim.result || ''), custo: Number(fim.total_cost_usd || 0),
  };
}

function conferir(nome, checagens) {
  const falhas = checagens.filter((c) => !c.ok);
  return { nome, passou: falhas.length === 0, checagens };
}
const corta = (s, n = 220) => (s.length > n ? s.slice(0, n) + '…' : s).replace(/\s+/g, ' ');

const cenarios = {
  trava() {
    const { raiz } = novoProjeto();
    const s = sessao(raiz, [
      'Teste técnico. Não edite arquivos e não mude o plano. Faça exatamente três chamadas da ferramenta Agent, uma de cada vez, nesta ordem:',
      '(1) subagent_type intruso, prompt: responda.',
      '(2) subagent_type general-purpose, prompt: responda.',
      '(3) subagent_type executor, model haiku, effort low, prompt: [etapa:1] Responda só EXECUTOR-OK, sem usar ferramentas.',
      'Depois relate o resultado literal de cada uma e copie literalmente a linha do contexto desta sessão que começa com [modo-deus].',
    ].join('\n'));
    const ag = s.usos.filter((u) => u.nome === 'Agent' || u.nome === 'Task');
    const r = ag.map((u) => s.resultadoDe(u));
    const ferramentas = (s.init.tools || []).filter((t) => !/^mcp__/.test(t)).map((t) => (t === 'Task' ? 'Agent' : t)).sort();
    const esperadas = ['Agent', 'Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Skill', 'Write'];
    const naoAchou = 'not found. Available agents: conselheiro, executor';
    return {
      custo: s.custo, raiz,
      ...conferir('trava', [
        { ok: /opus/.test(String(s.init.model)), o: 'sessão abre em Opus', v: String(s.init.model) },
        { ok: JSON.stringify(ferramentas) === JSON.stringify(esperadas), o: 'ferramentas são as 7 do guia mais Skill', v: ferramentas.join(', ') },
        { ok: ag.length === 3, o: 'três delegações', v: String(ag.length) },
        { ok: !!r[0] && r[0].texto.includes(naoAchou), o: 'intruso barrado pela trava', v: r[0] ? corta(r[0].texto) : '-' },
        { ok: !!r[1] && r[1].texto.includes(naoAchou), o: 'general-purpose barrado pela trava', v: r[1] ? corta(r[1].texto) : '-' },
        // O executor pode rodar em segundo plano: aí o resultado imediato é só "lançado" e a resposta chega depois, no texto final.
        { ok: !!r[2] && !r[2].erro && (r[2].texto.includes('EXECUTOR-OK') || /EXECUTOR-OK/.test(s.final)), o: 'executor não foi barrado e respondeu', v: r[2] ? corta(r[2].texto, 90) + ' || final: ' + corta(s.final, 160) : '-' },
        { ok: s.final.includes('LIGADO · degrau de partida 1'), o: 'orquestrador enxerga o aviso de início', v: corta(s.final, 400) },
      ]),
    };
  },

  escada() {
    const { raiz } = novoProjeto();
    const s = sessao(raiz, [
      'Teste técnico da escada. Não edite arquivos e não mude o plano. Faça as seis chamadas abaixo da ferramenta Agent, uma de cada vez, exatamente nesta ordem, mesmo que alguma seja barrada. Não corrija nem repita por conta própria: siga a lista.',
      'Em todas, o prompt é exatamente: [etapa:1] Responda só OK, sem usar ferramentas.',
      '(1) subagent_type executor, model haiku, effort low',
      '(2) subagent_type executor, model haiku, effort low',
      '(3) subagent_type executor, model sonnet, effort medium',
      '(4) subagent_type executor, model sonnet, effort high',
      '(5) subagent_type conselheiro, sem model e sem effort',
      '(6) subagent_type executor, model sonnet, effort high',
      'No fim, diga para cada chamada se rodou ou foi barrada, com a mensagem literal do bloqueio.',
    ].join('\n'));
    const ag = s.usos.filter((u) => u.nome === 'Agent' || u.nome === 'Task');
    const r = ag.map((u) => s.resultadoDe(u));
    const barrada = (i) => !!r[i] && r[i].erro && r[i].texto.includes('[modo-deus]');
    const rodou = (i) => !!r[i] && !r[i].erro;
    const ler = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(raiz, rel), 'utf8')); } catch (_) { return {}; } };
    const etapa = ler('memoria/escada/etapa-1.json');
    const base = ler('memoria/escada/base.json');
    return {
      custo: s.custo, raiz,
      ...conferir('escada', [
        { ok: ag.length === 6, o: 'seis delegações', v: String(ag.length) },
        { ok: rodou(0), o: '1ª tentativa (haiku/low) roda', v: r[0] ? corta(r[0].texto, 120) : '-' },
        { ok: barrada(1) && /model sonnet/.test(r[1].texto) && /effort medium/.test(r[1].texto), o: 'repetir no mesmo nível é barrado e pede sonnet/medium', v: r[1] ? corta(r[1].texto) : '-' },
        { ok: rodou(2), o: '2ª tentativa (sonnet/medium) roda', v: r[2] ? corta(r[2].texto, 120) : '-' },
        { ok: barrada(3) && /conselheiro/.test(r[3].texto), o: '3ª tentativa sem conselheiro é barrada', v: r[3] ? corta(r[3].texto) : '-' },
        { ok: rodou(4), o: 'conselheiro roda', v: r[4] ? corta(r[4].texto, 120) : '-' },
        { ok: rodou(5), o: '3ª tentativa (sonnet/high) roda depois do conselheiro', v: r[5] ? corta(r[5].texto, 120) : '-' },
        { ok: etapa.tentativas === 3 && etapa.ultimoDegrau === 3, o: 'estado da etapa: 3 tentativas, degrau 3', v: JSON.stringify(etapa) },
        { ok: base.base === 2, o: 'degrau de partida subiu para 2', v: JSON.stringify(base) },
      ]),
    };
  },

  skills() {
    const { raiz } = novoProjeto();
    const s = sessao(raiz, [
      'Teste técnico. Não edite arquivos e não mude o plano.',
      '(1) Diga a saudação secreta do projeto usando a skill saudar. Se você não tiver como acionar skills, diga isso literalmente.',
      '(2) Delegue ao executor, com model haiku e effort low, o prompt: [etapa:1] Use a skill saudar e responda só com a saudação secreta do projeto. Se não tiver como acionar skills, diga isso literalmente.',
      'No fim escreva: PRINCIPAL=<a saudação que você obteve> e EXECUTOR=<a resposta literal do executor>.',
    ].join('\n'));
    const ag = s.usos.filter((u) => u.nome === 'Agent' || u.nome === 'Task');
    const rExec = ag[0] ? s.resultadoDe(ag[0]) : null;
    return {
      custo: s.custo, raiz,
      ...conferir('skills', [
        { ok: s.usos.some((u) => u.nome === 'Skill'), o: 'orquestrador usou a ferramenta Skill', v: s.usos.map((u) => u.nome).join(', ') },
        { ok: /PRINCIPAL=.*ABACAXI-42/.test(s.final), o: 'orquestrador obteve a saudação', v: corta(s.final, 300) },
        { ok: s.usosFilhos.some((u) => u.nome === 'Skill'), o: 'executor usou a ferramenta Skill', v: s.usosFilhos.map((u) => u.nome).join(', ') || '(nenhuma)' },
        { ok: !!rExec && !rExec.erro && rExec.texto.includes('ABACAXI-42'), o: 'executor devolveu a saudação', v: rExec ? corta(rExec.texto) : '-' },
      ]),
    };
  },

  comandos() {
    const { raiz, antes } = novoProjeto();
    const s1 = sessao(raiz, '/modo-deus:status');
    const s2 = sessao(raiz, '/modo-deus:contexto 60');
    const settings2 = fs.readFileSync(path.join(raiz, '.claude', 'settings.json'), 'utf8');
    const s3 = sessao(raiz, '/modo-deus:desligar');
    const existe = (rel) => fs.existsSync(path.join(raiz, rel));
    const igual = (rel, buf) => existe(rel) && Buffer.compare(fs.readFileSync(path.join(raiz, rel)), buf) === 0;
    return {
      custo: s1.custo + s2.custo + s3.custo, raiz,
      ...conferir('comandos', [
        { ok: s1.final.includes('Modo Deus: ligado'), o: '/modo-deus:status responde ligado', v: corta(s1.final, 300) },
        { ok: /"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60"/.test(settings2), o: '/modo-deus:contexto 60 grava 60', v: corta(settings2, 300) },
        { ok: projeto.estado(raiz).ligado === false, o: '/modo-deus:desligar desliga de dentro do modo', v: corta(s3.final, 300) },
        { ok: igual('.claude/settings.json', antes.settings), o: 'settings.json voltou idêntico', v: existe('.claude/settings.json') ? corta(fs.readFileSync(path.join(raiz, '.claude', 'settings.json'), 'utf8')) : '(apagado)' },
        { ok: igual('CLAUDE.md', antes.claudeMd), o: 'CLAUDE.md voltou idêntico', v: existe('CLAUDE.md') ? corta(fs.readFileSync(path.join(raiz, 'CLAUDE.md'), 'utf8')) : '(apagado)' },
        { ok: !existe('.claude/agents/orquestrador.md') && existe('.claude/agents/intruso.md'), o: 'agentes do plugin saíram, o do projeto ficou', v: fs.readdirSync(path.join(raiz, '.claude', 'agents')).join(', ') },
      ]),
    };
  },

  aviso() {
    const { raiz } = novoProjeto();
    const s = sessao(raiz, 'Copie literalmente a linha do contexto desta sessão que começa com [modo-deus]. Se não houver, responda SEM-LINHA.', ['--agent', 'executor']);
    return {
      custo: s.custo, raiz,
      ...conferir('aviso', [
        { ok: s.final.includes('não abriu como orquestrador'), o: 'sessão fora do orquestrador recebe o aviso', v: corta(s.final, 300) },
      ]),
    };
  },
};

const pedidos = process.argv.slice(2);
const nomes = pedidos.length ? pedidos : Object.keys(cenarios);
const linhas = [`# Resultado dos testes de ponta a ponta`, '', `Data: ${new Date().toISOString()}`, ''];
let custo = 0;
let tudo = true;
for (const n of nomes) {
  if (!cenarios[n]) { console.log(`cenário desconhecido: ${n}`); process.exitCode = 1; continue; }
  let r;
  try { r = cenarios[n](); } catch (e) { r = { nome: n, passou: false, custo: 0, checagens: [{ ok: false, o: 'cenário rodou sem erro', v: String(e && e.stack ? e.stack : e) }] }; }
  custo += r.custo || 0;
  tudo = tudo && r.passou;
  const cab = `## ${n}: ${r.passou ? 'PASSOU' : 'FALHOU'}`;
  console.log(cab);
  linhas.push(cab, '');
  for (const c of r.checagens) {
    const l = `- ${c.ok ? 'ok' : 'FALHA'} · ${c.o} · ${c.v}`;
    console.log(l);
    linhas.push(l);
  }
  linhas.push('');
  if (r.raiz && r.passou) { try { fs.rmSync(r.raiz, { recursive: true, force: true }); } catch (_) { /* fica no temp */ } }
  else if (r.raiz) console.log(`(projeto de teste mantido para inspeção: ${r.raiz})`);
}
linhas.push(`Custo somado (referência de API): US$ ${custo.toFixed(2)}`, '');
console.log(`custo somado: US$ ${custo.toFixed(2)}`);
if (!pedidos.length) fs.writeFileSync(path.join(__dirname, 'RESULTADO.md'), linhas.join('\n'));
else fs.appendFileSync(path.join(__dirname, 'RESULTADO-parcial.md'), linhas.join('\n') + '\n');
if (!tudo) process.exitCode = 1;
