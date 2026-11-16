'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { lerTexto, gravarAtomico, impressao } = require('./disco.js');

const MARCA_INI = '<!-- modo-deus:inicio -->';
const MARCA_FIM = '<!-- modo-deus:fim -->';
const AGENTES = ['orquestrador', 'executor', 'conselheiro'];
const REL_SETTINGS = '.claude/settings.json';
const REL_MARCADOR = '.claude/modo-deus.json';
const REL_CLAUDE_MD = 'CLAUDE.md';
const CHAVE_AUTOCOMPACT = 'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE';

function cam(raiz, rel) {
  return path.join(raiz, ...rel.split('/'));
}

function semBom(texto) {
  return texto.charCodeAt(0) === 0xFEFF ? texto.slice(1) : texto;
}

function ehObjeto(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Lê o settings. Devolve { texto, obj, invalido }. Arquivo ausente: texto null, obj {}.
function lerSettings(raiz) {
  let texto;
  try {
    texto = lerTexto(cam(raiz, REL_SETTINGS));
  } catch (e) {
    return { texto: null, obj: null, invalido: true, erro: e.message };
  }
  if (texto === null) return { texto: null, obj: {}, invalido: false };
  try {
    const obj = JSON.parse(semBom(texto));
    if (!ehObjeto(obj)) return { texto, obj: null, invalido: true, erro: 'não é um objeto JSON' };
    return { texto, obj, invalido: false };
  } catch (e) {
    return { texto, obj: null, invalido: true, erro: e.message };
  }
}

// Lê o marcador. Devolve { marcador, invalido }.
function lerMarcador(raiz) {
  let texto;
  try {
    texto = lerTexto(cam(raiz, REL_MARCADOR));
  } catch (e) {
    return { marcador: null, invalido: true, erro: e.message };
  }
  if (texto === null) return { marcador: null, invalido: false };
  try {
    const m = JSON.parse(semBom(texto));
    if (!ehObjeto(m) || !ehObjeto(m.settings) || !ehObjeto(m.claudeMd) || !ehObjeto(m.arquivos)) {
      return { marcador: null, invalido: true, erro: 'formato inesperado' };
    }
    return { marcador: m, invalido: false };
  } catch (e) {
    return { marcador: null, invalido: true, erro: e.message };
  }
}

function estado(raiz) {
  const s = lerSettings(raiz);
  const m = lerMarcador(raiz);
  const ligado = !s.invalido && s.obj.agent === 'orquestrador';
  let divergencia = null;
  if (m.marcador && !ligado) divergencia = 'marcador-sem-chave';
  else if (!m.marcador && ligado) divergencia = 'chave-sem-marcador';
  return { ligado, marcador: m.marcador, divergencia, settingsInvalido: s.invalido };
}

// Aplica gravações/remoções em ordem; se alguma falhar, desfaz o que já fez.
// ops: [{ tipo: 'gravar', caminho, texto } | { tipo: 'apagar', caminho }]
function aplicar(ops) {
  const feitos = [];
  try {
    for (const op of ops) {
      // registra antes: se a operação falhar, o alvo dela também é restaurado
      feitos.push({ caminho: op.caminho, anterior: lerTexto(op.caminho) });
      if (op.tipo === 'gravar') gravarAtomico(op.caminho, op.texto);
      else fs.rmSync(op.caminho, { force: true });
    }
    return { ok: true };
  } catch (e) {
    for (let i = feitos.length - 1; i >= 0; i--) {
      const f = feitos[i];
      try {
        if (f.anterior === null) fs.rmSync(f.caminho, { force: true });
        else gravarAtomico(f.caminho, f.anterior);
      } catch (_) { /* melhor esforço */ }
    }
    return { ok: false, erro: e.message };
  }
}

function serializar(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

function eolDe(texto) {
  return texto !== null && texto.includes('\r\n') ? '\r\n' : '\n';
}

function blocoCom(regras, eol) {
  const corpo = regras.replace(/(\r?\n)+$/, '').replace(/\r?\n/g, eol);
  return MARCA_INI + eol + corpo + eol + MARCA_FIM;
}

function ligar(raiz, plugin, opcoes = {}) {
  const mensagens = [];
  const falha = (msg) => { mensagens.push(msg); return { ok: false, mudou: false, mensagens }; };

  // ---- fase 1: ler tudo e conferir impedimentos ----
  const s = lerSettings(raiz);
  if (s.invalido) return falha(`${REL_SETTINGS} está inválido (${s.erro}). Conserte o arquivo e tente de novo.`);
  const mk = lerMarcador(raiz);
  if (mk.invalido) return falha(`${REL_MARCADOR} está inválido (${mk.erro}). Nada foi alterado.`);
  const marcador = mk.marcador;
  const ligadoAntes = s.obj.agent === 'orquestrador';

  let zerar = null;
  if (!ligadoAntes) {
    if (typeof opcoes.zerarEscada === 'function') {
      zerar = opcoes.zerarEscada;
    } else {
      try {
        zerar = require('./escada.js').nova;
        if (typeof zerar !== 'function') throw new Error('escada.nova não existe');
      } catch (e) {
        return falha(`Não consegui carregar a escada (${e.message}). Nada foi alterado.`);
      }
    }
  }

  const ops = [];
  const arquivosNovos = Object.assign({}, marcador ? marcador.arquivos : {});

  for (const nome of AGENTES) {
    const rel = `.claude/agents/${nome}.md`;
    let modelo;
    try {
      modelo = lerTexto(path.join(plugin, 'modelos', `${nome}.md`));
    } catch (e) {
      return falha(`Não consegui ler o modelo ${nome}.md (${e.message}).`);
    }
    if (modelo === null) return falha(`Modelo ausente no plugin: modelos/${nome}.md.`);
    let atual;
    try {
      atual = lerTexto(cam(raiz, rel));
    } catch (e) {
      return falha(`Não consegui ler ${rel} (${e.message}).`);
    }
    const registrado = marcador ? marcador.arquivos[rel] : undefined;
    if (registrado === undefined) {
      if (atual !== null && atual !== modelo) {
        return falha(`${rel} já existe com outro conteúdo e não é do Modo Deus. Renomeie ou apague o arquivo e tente de novo.`);
      }
      arquivosNovos[rel] = impressao(modelo);
      if (atual === null) ops.push({ tipo: 'gravar', caminho: cam(raiz, rel), texto: modelo });
    } else if (atual === null) {
      arquivosNovos[rel] = impressao(modelo);
      ops.push({ tipo: 'gravar', caminho: cam(raiz, rel), texto: modelo });
    } else if (impressao(atual) === registrado) {
      if (atual !== modelo) {
        arquivosNovos[rel] = impressao(modelo);
        ops.push({ tipo: 'gravar', caminho: cam(raiz, rel), texto: modelo });
        mensagens.push(`${rel} atualizado para a versão nova do plugin.`);
      }
    } else if (atual !== modelo) {
      mensagens.push(`${rel} foi editado à mão e não foi regravado.`);
    } else {
      arquivosNovos[rel] = impressao(modelo);
    }
  }

  // settings
  const novo = JSON.parse(JSON.stringify(s.obj));
  const anteriores = marcador ? marcador.settings.anteriores : {
    agent: s.obj.agent !== undefined && s.obj.agent !== 'orquestrador'
      ? { tinha: true, valor: s.obj.agent } : { tinha: false, valor: null },
    effortLevel: s.obj.effortLevel !== undefined
      ? { tinha: true, valor: s.obj.effortLevel } : { tinha: false, valor: null },
    autocompact: ehObjeto(s.obj.env) && s.obj.env[CHAVE_AUTOCOMPACT] !== undefined
      ? { tinha: true, valor: s.obj.env[CHAVE_AUTOCOMPACT] } : { tinha: false, valor: null },
    envExistia: ehObjeto(s.obj.env),
  };
  novo.agent = 'orquestrador';
  if (!marcador || novo.effortLevel === undefined) novo.effortLevel = 'xhigh';
  if (!ehObjeto(novo.env)) novo.env = {};
  if (!marcador || novo.env[CHAVE_AUTOCOMPACT] === undefined) novo.env[CHAVE_AUTOCOMPACT] = '40';
  const mudouSettings = !marcador || JSON.stringify(novo) !== JSON.stringify(s.obj);
  const textoSettings = serializar(novo);
  let settingsMarc;
  if (marcador) {
    settingsMarc = Object.assign({}, marcador.settings);
    if (mudouSettings) {
      ops.push({ tipo: 'gravar', caminho: cam(raiz, REL_SETTINGS), texto: textoSettings });
      if (s.texto !== null && impressao(s.texto) === marcador.settings.gravado) {
        settingsMarc.gravado = impressao(textoSettings);
      }
    }
  } else {
    settingsMarc = {
      existia: s.texto !== null,
      original: s.texto,
      gravado: impressao(textoSettings),
      anteriores,
    };
    ops.push({ tipo: 'gravar', caminho: cam(raiz, REL_SETTINGS), texto: textoSettings });
  }

  // CLAUDE.md
  let md;
  try {
    md = lerTexto(cam(raiz, REL_CLAUDE_MD));
  } catch (e) {
    return falha(`Não consegui ler ${REL_CLAUDE_MD} (${e.message}).`);
  }
  let regras;
  try {
    regras = lerTexto(path.join(plugin, 'modelos', 'regras.md'));
  } catch (e) {
    return falha(`Não consegui ler modelos/regras.md (${e.message}).`);
  }
  if (regras === null) return falha('Modelo ausente no plugin: modelos/regras.md.');
  const eol = eolDe(md);
  const bloco = blocoCom(regras, eol);
  let textoMd;
  const ini = md === null ? -1 : md.indexOf(MARCA_INI);
  const fim = ini < 0 ? -1 : md.indexOf(MARCA_FIM, ini + MARCA_INI.length);
  if (ini >= 0 && fim >= 0) {
    textoMd = md.slice(0, ini) + bloco + md.slice(fim + MARCA_FIM.length);
  } else if (md === null || md === '') {
    textoMd = bloco + eol;
  } else {
    textoMd = md + (/\n$/.test(md) ? '' : eol) + eol + bloco + eol;
  }
  let mdMarc;
  if (marcador) {
    mdMarc = Object.assign({}, marcador.claudeMd);
    if (textoMd !== md) {
      ops.push({ tipo: 'gravar', caminho: cam(raiz, REL_CLAUDE_MD), texto: textoMd });
      if (md !== null && impressao(md) === marcador.claudeMd.gravado) mdMarc.gravado = impressao(textoMd);
    }
  } else {
    mdMarc = { existia: md !== null, original: md, gravado: impressao(textoMd) };
    if (textoMd !== md) ops.push({ tipo: 'gravar', caminho: cam(raiz, REL_CLAUDE_MD), texto: textoMd });
  }

  // memoria/plano.md
  if (!fs.existsSync(cam(raiz, 'memoria/plano.md'))) {
    ops.push({ tipo: 'gravar', caminho: cam(raiz, 'memoria/plano.md'), texto: '' });
  }

  // marcador
  const novoMarcador = { versao: 1, settings: settingsMarc, claudeMd: mdMarc, arquivos: arquivosNovos };
  const textoMarcador = serializar(novoMarcador);
  const marcadorAtual = lerTexto(cam(raiz, REL_MARCADOR));
  if (textoMarcador !== marcadorAtual) {
    ops.push({ tipo: 'gravar', caminho: cam(raiz, REL_MARCADOR), texto: textoMarcador });
  }

  // ---- fase 2: gravar ----
  const dirSkills = cam(raiz, '.claude/skills');
  const skillsExistia = fs.existsSync(dirSkills);
  const mudou = ops.length > 0 || !skillsExistia;
  if (!mudou) return { ok: true, mudou: false, mensagens };

  const r = aplicar(ops);
  if (!r.ok) {
    mensagens.push(`Falha ao gravar (${r.erro}). O que já tinha sido gravado foi desfeito.`);
    return { ok: false, mudou: false, mensagens };
  }
  try {
    fs.mkdirSync(dirSkills, { recursive: true });
  } catch (e) {
    mensagens.push(`Não consegui criar .claude/skills (${e.message}).`);
  }
  if (zerar) {
    try {
      zerar(raiz);
    } catch (e) {
      mensagens.push(`Aviso: não consegui zerar a escada (${e.message}).`);
    }
  }
  return { ok: true, mudou: true, mensagens };
}

function desligar(raiz) {
  const mensagens = [];
  const falha = (msg) => { mensagens.push(msg); return { ok: false, mudou: false, mensagens }; };

  const s = lerSettings(raiz);
  if (s.invalido) return falha(`${REL_SETTINGS} está inválido (${s.erro}). Nada foi alterado.`);
  const mk = lerMarcador(raiz);
  if (mk.invalido) return falha(`${REL_MARCADOR} está inválido (${mk.erro}). Nada foi alterado.`);
  const marcador = mk.marcador;
  const caminhoSettings = cam(raiz, REL_SETTINGS);

  if (!marcador) {
    if (s.obj.agent !== 'orquestrador') return { ok: true, mudou: false, mensagens };
    const obj = JSON.parse(JSON.stringify(s.obj));
    delete obj.agent;
    const r = aplicar([{ tipo: 'gravar', caminho: caminhoSettings, texto: serializar(obj) }]);
    if (!r.ok) return falha(`Falha ao gravar (${r.erro}).`);
    mensagens.push('Não havia dados para desfazer o resto: removi só a chave agent do settings.json.');
    return { ok: true, mudou: true, mensagens };
  }

  const ops = [];

  // settings
  if (s.texto !== null) {
    const ms = marcador.settings;
    let original = null;
    if (ms.original !== null && ms.original !== undefined) {
      try { original = JSON.parse(semBom(ms.original)); } catch (_) { original = null; }
    }
    const originalLigado = ehObjeto(original) && original.agent === 'orquestrador';
    if (impressao(s.texto) === ms.gravado && !originalLigado) {
      if (ms.existia) ops.push({ tipo: 'gravar', caminho: caminhoSettings, texto: ms.original });
      else ops.push({ tipo: 'apagar', caminho: caminhoSettings });
    } else {
      const obj = JSON.parse(JSON.stringify(s.obj));
      const ant = ms.anteriores || {};
      const restaurar = (a, aplicarValor, apagarChave) => {
        if (a && a.tinha) aplicarValor(a.valor); else apagarChave();
      };
      if (obj.agent === 'orquestrador') {
        restaurar(ant.agent, (v) => { obj.agent = v; }, () => { delete obj.agent; });
      } else if (obj.agent !== undefined) {
        mensagens.push(`settings.json: agent foi mudado por você (${JSON.stringify(obj.agent)}); mantido.`);
      }
      if (obj.effortLevel === 'xhigh') {
        restaurar(ant.effortLevel, (v) => { obj.effortLevel = v; }, () => { delete obj.effortLevel; });
      } else if (obj.effortLevel !== undefined) {
        mensagens.push(`settings.json: effortLevel foi mudado por você (${JSON.stringify(obj.effortLevel)}); mantido.`);
      }
      if (ehObjeto(obj.env)) {
        const v = obj.env[CHAVE_AUTOCOMPACT];
        if (v === '40' || v === '60') {
          restaurar(ant.autocompact, (x) => { obj.env[CHAVE_AUTOCOMPACT] = x; }, () => { delete obj.env[CHAVE_AUTOCOMPACT]; });
        } else if (v !== undefined) {
          mensagens.push(`settings.json: ${CHAVE_AUTOCOMPACT} foi mudado por você (${JSON.stringify(v)}); mantido.`);
        }
        if (Object.keys(obj.env).length === 0 && !ant.envExistia) delete obj.env;
      }
      ops.push({ tipo: 'gravar', caminho: caminhoSettings, texto: serializar(obj) });
    }
  }

  // CLAUDE.md
  let md;
  try {
    md = lerTexto(cam(raiz, REL_CLAUDE_MD));
  } catch (e) {
    return falha(`Não consegui ler ${REL_CLAUDE_MD} (${e.message}).`);
  }
  if (md !== null) {
    const mc = marcador.claudeMd;
    if (impressao(md) === mc.gravado) {
      if (mc.existia) ops.push({ tipo: 'gravar', caminho: cam(raiz, REL_CLAUDE_MD), texto: mc.original });
      else ops.push({ tipo: 'apagar', caminho: cam(raiz, REL_CLAUDE_MD) });
    } else {
      const ini = md.indexOf(MARCA_INI);
      const fim = ini < 0 ? -1 : md.indexOf(MARCA_FIM, ini + MARCA_INI.length);
      if (ini < 0 || fim < 0) {
        mensagens.push('CLAUDE.md: não achei o bloco do Modo Deus; deixei o arquivo como está.');
      } else {
        let a = ini;
        if (md.slice(0, a).endsWith('\r\n')) a -= 2;
        else if (md.slice(0, a).endsWith('\n')) a -= 1;
        let b = fim + MARCA_FIM.length;
        if (md.startsWith('\r\n', b)) b += 2;
        else if (md.startsWith('\n', b)) b += 1;
        const resto = md.slice(0, a) + md.slice(b);
        if (resto.trim() === '' && !mc.existia) ops.push({ tipo: 'apagar', caminho: cam(raiz, REL_CLAUDE_MD) });
        else ops.push({ tipo: 'gravar', caminho: cam(raiz, REL_CLAUDE_MD), texto: resto });
      }
    }
  }

  // agentes
  for (const rel of Object.keys(marcador.arquivos)) {
    let atual;
    try {
      atual = lerTexto(cam(raiz, rel));
    } catch (e) {
      return falha(`Não consegui ler ${rel} (${e.message}).`);
    }
    if (atual === null) continue;
    if (impressao(atual) === marcador.arquivos[rel]) ops.push({ tipo: 'apagar', caminho: cam(raiz, rel) });
    else mensagens.push(`${rel} foi editado por você e foi mantido.`);
  }

  // marcador por último
  ops.push({ tipo: 'apagar', caminho: cam(raiz, REL_MARCADOR) });

  const r = aplicar(ops);
  if (!r.ok) {
    mensagens.push(`Falha ao desfazer (${r.erro}). O que já tinha sido mudado foi restaurado.`);
    return { ok: false, mudou: false, mensagens };
  }
  try { fs.rmdirSync(cam(raiz, '.claude/agents')); } catch (_) { /* não vazia ou ausente */ }
  return { ok: true, mudou: true, mensagens };
}

function contexto(raiz, pct) {
  const mensagens = [];
  const falha = (msg) => { mensagens.push(msg); return { ok: false, mensagens }; };
  const valor = String(pct);
  if (valor !== '40' && valor !== '60') return falha('Valor inválido: use 40 ou 60.');
  const s = lerSettings(raiz);
  if (s.invalido) return falha(`${REL_SETTINGS} está inválido (${s.erro}). Nada foi alterado.`);
  if (s.obj.agent !== 'orquestrador') return falha('O Modo Deus não está ligado neste projeto.');
  const mk = lerMarcador(raiz);
  if (mk.invalido) return falha(`${REL_MARCADOR} está inválido (${mk.erro}). Nada foi alterado.`);

  const obj = JSON.parse(JSON.stringify(s.obj));
  if (!ehObjeto(obj.env)) obj.env = {};
  if (obj.env[CHAVE_AUTOCOMPACT] === valor) {
    mensagens.push(`O contexto já estava em ${valor}%.`);
    return { ok: true, mensagens };
  }
  obj.env[CHAVE_AUTOCOMPACT] = valor;
  const texto = serializar(obj);
  const ops = [{ tipo: 'gravar', caminho: cam(raiz, REL_SETTINGS), texto }];
  const m = mk.marcador;
  if (m && s.texto !== null && impressao(s.texto) === m.settings.gravado) {
    const novoM = JSON.parse(JSON.stringify(m));
    novoM.settings.gravado = impressao(texto);
    ops.push({ tipo: 'gravar', caminho: cam(raiz, REL_MARCADOR), texto: serializar(novoM) });
  }
  const r = aplicar(ops);
  if (!r.ok) return falha(`Falha ao gravar (${r.erro}). Nada foi alterado.`);
  mensagens.push(`Contexto ajustado para ${valor}%.`);
  return { ok: true, mensagens };
}

module.exports = { MARCA_INI, MARCA_FIM, estado, ligar, desligar, contexto };
