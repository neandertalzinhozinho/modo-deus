'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { lerTexto, gravarAtomico, comTrava } = require('./disco.js');

const DEGRAUS = [
  null,
  { modelo: 'haiku', esforco: 'low' },
  { modelo: 'sonnet', esforco: 'medium' },
  { modelo: 'sonnet', esforco: 'high' },
  { modelo: 'opus', esforco: 'high' },
  { modelo: 'opus', esforco: 'xhigh' },
];
const MAX_TENTATIVAS = 6;
const TETO_BASE = 4;
const LIMPAS_PARA_DESCER = 3;

const MODELOS = ['haiku', 'sonnet', 'opus', 'fable'];
const ESFORCOS = ['low', 'medium', 'high', 'xhigh', 'max'];
const RE_ETAPA = /\[etapa:\s*([A-Za-z0-9._-]{1,40})\s*\]/i;

function extrairEtapa(texto) {
  if (typeof texto !== 'string') return null;
  const m = RE_ETAPA.exec(texto);
  return m ? m[1].toLowerCase() : null;
}

function posicao(lista, valor) {
  if (typeof valor !== 'string') return -1;
  return lista.indexOf(valor.trim().toLowerCase());
}

function degrauAtendido(modelo, esforco) {
  const pm = posicao(MODELOS, modelo);
  const pe = posicao(ESFORCOS, esforco);
  if (pm < 0 || pe < 0) return 0;
  let melhor = 0;
  for (let d = 1; d < DEGRAUS.length; d++) {
    const dm = MODELOS.indexOf(DEGRAUS[d].modelo);
    const de = ESFORCOS.indexOf(DEGRAUS[d].esforco);
    if (dm < pm || (dm === pm && de <= pe)) melhor = d;
  }
  return melhor;
}

function pasta(raiz) { return path.join(raiz, 'memoria', 'escada'); }
function caminhoBase(raiz) { return path.join(pasta(raiz), 'base.json'); }
function caminhoEtapa(raiz, id) { return path.join(pasta(raiz), `etapa-${id}.json`); }

function lerJson(caminho) {
  try {
    const t = lerTexto(caminho);
    if (t === null) return null;
    const o = JSON.parse(t);
    return (o && typeof o === 'object' && !Array.isArray(o)) ? o : null;
  } catch (_) {
    return null;
  }
}

function inteiro(v, padrao, min, max) {
  return (Number.isInteger(v) && v >= min && v <= max) ? v : padrao;
}

function lerBase(raiz) {
  const o = lerJson(caminhoBase(raiz)) || {};
  return {
    base: inteiro(o.base, 1, 1, TETO_BASE),
    limpas: inteiro(o.limpas, 0, 0, 1000),
  };
}

function gravarBase(raiz, b) {
  gravarAtomico(caminhoBase(raiz), JSON.stringify({ base: b.base, limpas: b.limpas }));
}

// Todo ler-gravar de base.json passa por aqui (trava da base, sempre depois da trava da etapa).
function comBase(raiz, fn) {
  return comTrava(`${caminhoBase(raiz)}.trava`, () => {
    const b = lerBase(raiz);
    const r = fn(b);
    gravarBase(raiz, b);
    return r;
  });
}

function comEtapa(raiz, id, fn) {
  return comTrava(`${caminhoEtapa(raiz, id)}.trava`, fn);
}

function lerEtapa(raiz, id) {
  const o = lerJson(caminhoEtapa(raiz, id)) || {};
  return {
    id,
    tentativas: inteiro(o.tentativas, 0, 0, 1000),
    ultimoDegrau: inteiro(o.ultimoDegrau, 0, 0, 5),
    conselhoPara: inteiro(o.conselhoPara, 0, 0, 1001),
    estado: o.estado === 'passou' ? 'passou' : 'aberta',
    subiuBase: o.subiuBase === true,
  };
}

function gravarEtapa(raiz, e) {
  gravarAtomico(caminhoEtapa(raiz, e.id), JSON.stringify({
    id: e.id,
    tentativas: e.tentativas,
    ultimoDegrau: e.ultimoDegrau,
    conselhoPara: e.conselhoPara,
    estado: e.estado,
    subiuBase: e.subiuBase,
  }));
}

function etapaNoPlano(raiz, id) {
  const texto = lerTexto(path.join(raiz, 'memoria', 'plano.md'));
  if (texto === null) return false;
  const re = new RegExp(RE_ETAPA.source, 'gi');
  let m;
  while ((m = re.exec(texto)) !== null) {
    if (m[1].toLowerCase() === id) return true;
  }
  return false;
}

function registrar(raiz, etapa, decisao, modelo, esforco) {
  try {
    fs.mkdirSync(pasta(raiz), { recursive: true });
    const linha = [
      new Date().toISOString(),
      `etapa=${etapa === null ? '-' : etapa}`,
      decisao,
      `${modelo === undefined || modelo === null || modelo === '' ? '-' : modelo}/${esforco === undefined || esforco === null || esforco === '' ? '-' : esforco}`,
    ].join(' | ');
    fs.appendFileSync(path.join(pasta(raiz), 'historico.log'), `${linha}\n`, 'utf8');
  } catch (_) { /* histórico é só registro */ }
}

function avaliarExecutor(raiz, id, chamada, comandos) {
  const { modelo, esforco } = chamada;
  const barrar = (msg, rotulo) => {
    registrar(raiz, id, `barrou: ${rotulo}`, modelo, esforco);
    return { permitir: false, mensagem: msg };
  };

  return comEtapa(raiz, id, () => {
    let e = lerEtapa(raiz, id);
    const estavaPassou = e.estado === 'passou';
    if (estavaPassou) e = { ...e, tentativas: 0, conselhoPara: 0, subiuBase: false, estado: 'aberta' };
    const base = lerBase(raiz).base;
    const exigido = e.tentativas === 0 ? base : Math.min(5, e.ultimoDegrau + 1);
    const t = e.tentativas + 1;

    const atendido = degrauAtendido(modelo, esforco);
    if (atendido === 0) {
      const d = DEGRAUS[exigido];
      return barrar(
        `Etapa ${id}, tentativa ${t}: informe model e effort válidos. Use model ${d.modelo} e effort ${d.esforco} (degrau ${exigido}).`,
        'sem model/effort válidos'
      );
    }
    if (e.tentativas >= MAX_TENTATIVAS) {
      return barrar(`Etapa ${id}: ${MAX_TENTATIVAS} tentativas esgotadas. Pare e mostre ao usuário o problema e as evidências.`, 'tentativas esgotadas');
    }
    if (atendido < exigido) {
      const d = DEGRAUS[exigido];
      return barrar(
        `Etapa ${id}, tentativa ${t}: exige degrau ${exigido} ou acima. Chame de novo com model ${d.modelo} e effort ${d.esforco}.`,
        `degrau ${atendido} abaixo do exigido ${exigido}`
      );
    }
    if (e.tentativas >= 2 && e.conselhoPara !== e.tentativas + 1) {
      return barrar(
        `Etapa ${id}: antes da tentativa ${t} consulte o conselheiro (Agent conselheiro com [etapa:${id}], o erro exato e o que já foi tentado).`,
        'falta consulta ao conselheiro'
      );
    }

    e.tentativas += 1;
    e.ultimoDegrau = atendido;
    if (e.tentativas === 2 && !e.subiuBase) {
      comBase(raiz, (b) => {
        b.base = Math.min(TETO_BASE, b.base + 1);
        b.limpas = 0;
      });
      e.subiuBase = true;
    }
    gravarEtapa(raiz, e);
    registrar(raiz, id, `permitiu: tentativa ${e.tentativas} degrau ${atendido}`, modelo, esforco);
    return {
      permitir: true,
      mensagem: `Etapa ${id}, tentativa ${e.tentativas} no degrau ${atendido}. Depois de conferir, registre: ${comandos && comandos.passou} ${id}`,
    };
  });
}

function avaliarConselheiro(raiz, id, chamada) {
  const { modelo, esforco } = chamada;
  const ausente = (v) => v === undefined || v === null || v === '';
  const fraco = (lista, v, minimo) => !ausente(v) && posicao(lista, v) < lista.indexOf(minimo);

  if (fraco(MODELOS, modelo, 'opus') || fraco(ESFORCOS, esforco, 'high')) {
    registrar(raiz, id, 'barrou: conselheiro fraco', modelo, esforco);
    return { permitir: false, mensagem: 'O conselheiro roda em opus com effort high ou acima.' };
  }
  return comEtapa(raiz, id, () => {
    const e = lerEtapa(raiz, id);
    e.conselhoPara = e.tentativas + 1;
    gravarEtapa(raiz, e);
    registrar(raiz, id, `permitiu: conselheiro para tentativa ${e.conselhoPara}`, modelo, esforco);
    return { permitir: true, mensagem: `Etapa ${id}: consulta ao conselheiro registrada para a tentativa ${e.conselhoPara}.` };
  });
}

function avaliar(raiz, chamada, comandos) {
  const c = chamada || {};
  const id = extrairEtapa(c.texto);
  if (id === null) {
    registrar(raiz, null, 'barrou: sem marca de etapa', c.modelo, c.esforco);
    return { permitir: false, mensagem: 'Inclua [etapa:N] no começo do pedido.' };
  }
  if (!etapaNoPlano(raiz, id)) {
    registrar(raiz, id, 'barrou: etapa fora do plano', c.modelo, c.esforco);
    return {
      permitir: false,
      mensagem: `A etapa ${id} não está no plano. Escreva o plano em memoria/plano.md marcando cada etapa como [etapa:N].`,
    };
  }
  if (c.tipo === 'conselheiro') return avaliarConselheiro(raiz, id, c);
  return avaliarExecutor(raiz, id, c, comandos);
}

function passou(raiz, etapa) {
  // Aceita "3" ou "[etapa:3]". O id vira nome de arquivo, então só passa o que a marca aceita.
  const bruto = String(etapa === undefined || etapa === null ? '' : etapa).trim();
  const id = extrairEtapa(bruto) || (/^[A-Za-z0-9._-]{1,40}$/.test(bruto) ? bruto.toLowerCase() : null);
  if (id === null) {
    return { ok: false, mensagem: 'Informe a etapa como aparece no plano, por exemplo: passou 3' };
  }
  return comEtapa(raiz, id, () => {
    const e = lerEtapa(raiz, id);
    if (e.tentativas === 0) {
      registrar(raiz, id, 'passou recusado: etapa sem tentativas', null, null);
      return { ok: false, mensagem: `Etapa ${id}: nenhuma tentativa registrada, nada a aprovar.` };
    }
    if (e.estado === 'passou') {
      return { ok: true, mensagem: `Etapa ${id}: já estava registrada como aprovada.` };
    }
    e.estado = 'passou';
    comBase(raiz, (b) => {
      if (e.tentativas === 1) {
        b.limpas += 1;
        if (b.limpas >= LIMPAS_PARA_DESCER) {
          b.base = Math.max(1, b.base - 1);
          b.limpas = 0;
        }
      } else {
        b.limpas = 0;
      }
    });
    gravarEtapa(raiz, e);
    registrar(raiz, id, `passou: ${e.tentativas} tentativa(s)`, null, null);
    return { ok: true, mensagem: `Etapa ${id} aprovada em ${e.tentativas} tentativa(s).` };
  });
}

function nova(raiz) {
  const p = pasta(raiz);
  let nomes;
  try { nomes = fs.readdirSync(p); } catch (_) { return; }
  for (const n of nomes) {
    if (n === 'base.json' || /^etapa-.+\.json$/.test(n)) {
      try { fs.rmSync(path.join(p, n), { force: true }); } catch (_) { /* ignora */ }
    }
  }
}

function resumo(raiz) {
  const b = lerBase(raiz);
  const etapas = [];
  let nomes = [];
  try { nomes = fs.readdirSync(pasta(raiz)); } catch (_) { /* sem pasta */ }
  for (const n of nomes.sort()) {
    const m = /^etapa-(.+)\.json$/.exec(n);
    if (!m) continue;
    const e = lerEtapa(raiz, m[1]);
    etapas.push({ id: e.id, tentativas: e.tentativas, ultimoDegrau: e.ultimoDegrau, conselhoPara: e.conselhoPara, estado: e.estado });
  }
  return { base: b.base, limpas: b.limpas, etapas };
}

module.exports = {
  DEGRAUS, MAX_TENTATIVAS, TETO_BASE, LIMPAS_PARA_DESCER,
  extrairEtapa, degrauAtendido, avaliar, passou, nova, resumo,
};
