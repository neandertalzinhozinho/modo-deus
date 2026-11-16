'use strict';
// Uso: node avalia.js <raiz> <texto> <modelo> <esforco> <instanteInicioMs>
// Espera até o instante combinado para que os processos disputem a trava juntos.
const path = require('node:path');
const escada = require(path.join(__dirname, '..', '..', 'scripts', 'lib', 'escada.js'));

const [raiz, texto, modelo, esforco, inicio] = process.argv.slice(2);
const alvo = Number(inicio) || 0;
while (Date.now() < alvo) { /* espera ocupada curta */ }

try {
  const r = escada.avaliar(raiz, { tipo: 'executor', texto, modelo, esforco }, { passou: 'passou' });
  process.stdout.write(JSON.stringify(r));
} catch (e) {
  process.stdout.write(JSON.stringify({ erro: String(e && e.message) }));
}
