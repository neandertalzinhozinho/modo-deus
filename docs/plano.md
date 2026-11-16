# Modo Deus: plano de construção

> **Para quem for executar:** siga tarefa por tarefa, na ordem. Cada passo usa caixa (`- [ ]`). Leia também o desenho: o plano parte dele.

**Objetivo:** plugin local `modo-deus` que liga e desliga o Modo Deus do guia por projeto e aplica a escada de modelo e esforço por um gancho.

**Arquitetura:** scripts Node sem dependências. Duas bibliotecas puras (`projeto.js` mexe nos arquivos do projeto, `escada.js` guarda as regras e o estado da escada), dois ganchos finos (`gancho.js` no PreToolUse da ferramenta Agent, `sessao.js` no SessionStart), dois comandos de terminal e seis skills que só chamam os comandos.

**Tecnologia:** Node 26 (`node:test`, `node:assert/strict`, `node:fs`, `node:crypto`), Claude Code 2.1.325, Windows 11.

**Desenho:** `D:\PROJETOS\flowdase\modo-deus-desenho.md`

**Pasta do plugin (PLUGIN):** `C:\Users\tromb\.claude\plugins-local\flow-cinema\modo-deus`

## Resumo para o dono

São 9 tarefas. As 7 primeiras constroem e testam as peças com testes automáticos. A 8ª roda sessões reais do Claude num projeto descartável. A 9ª instala o plugin e confere com você no app. Eu desenho e confiro cada entrega; a escrita do código vai para executores em Sonnet, como manda o seu Semana Cheia.

## Restrições gerais

- Sem dependências externas. Só módulos do próprio Node.
- Sem commits: a pasta do plugin não é repositório git. O ponto de controle de cada tarefa é a suíte inteira passando: `node --test` dentro de PLUGIN.
- Todo caminho que vai para uma mensagem ou comando usa barra normal (`/`) e aspas duplas.
- Nenhum script lê ou grava fora do projeto alvo e de PLUGIN.
- Ganchos nunca derrubam a sessão: erro inesperado é registrado e a chamada passa (saída 0).
- Textos do guia entram sem mudar uma letra, salvo a linha `tools:` (ver Tarefa 1).
- Mensagens ao usuário e ao modelo em português.
- Testes criam o projeto de mentira em `fs.mkdtempSync(path.join(os.tmpdir(), 'modo-deus-'))` e apagam no fim.
- Sessões reais de teste recebem o prompt pela entrada padrão (`spawnSync(..., { input })`), nunca como argumento: o Git Bash transforma `/comando` em caminho do Windows.
- No Windows o `claude` é um `claude.cmd`: chamar com `shell: true` e pôr aspas em todo argumento com espaço ou parênteses.

## Fatos já medidos nesta máquina (não reteste, use)

- Chave `agent: "orquestrador"` no `.claude/settings.json` do projeto abre a sessão como esse agente, com a lista de ferramentas dele.
- `tools: Agent(executor, conselheiro), ...` restringe as delegações a esses dois. Erro literal para os outros: `Agent type 'intruso' not found. Available agents: conselheiro, executor`.
- A ferramenta Agent aceita `model` e `effort` por chamada, e `model` vence o do arquivo do agente.
- Entrada do gancho PreToolUse: `{ session_id, transcript_path, cwd, scratchpad_dir, prompt_id, permission_mode, effort, hook_event_name, tool_name: "Agent", tool_input: { description, prompt, subagent_type, model?, effort? }, tool_use_id }`. Saída 2 com texto no stderr barra a chamada e o texto chega ao modelo.
- Entrada do gancho SessionStart: `{ session_id, transcript_path, cwd, scratchpad_dir, agent_type?, hook_event_name, source }`. `agent_type` vem `"orquestrador"` quando a sessão abriu pelo agente. O que o gancho imprime vira contexto da sessão.
- Nos ganchos de plugin existem as variáveis de ambiente `CLAUDE_PLUGIN_ROOT` e `CLAUDE_PROJECT_DIR`.
- Em SKILL.md de plugin, `${CLAUDE_PLUGIN_ROOT}` e `$ARGUMENTS` são substituídos, e a skill chamada pelo usuário com `/plugin:skill` funciona mesmo na sessão do orquestrador.
- Com as 7 ferramentas do guia o orquestrador **não** consegue acionar skills (falta a ferramenta `Skill`).
- `claude --plugin-dir <pasta>` carrega um plugin só para aquela sessão.

## Foco de revisão

Casos que o desenho não detalha e que mais provavelmente morderiam o usuário. Cada um tem teste na tarefa dona do código.

1. `settings.json` com marca BOM no início, ou com a chave `agent` já em `orquestrador` sem o plugin ter ligado: `ligar` funciona e `desligar` realmente desliga. (Tarefas 3 e 4)
2. `CLAUDE.md` com quebras de linha do Windows (CRLF): o bloco entra em CRLF e o `desligar` devolve o arquivo idêntico. (Tarefas 3 e 4)
3. Pasta de projeto com espaço e acento (`meu projeto ação`): comandos impressos funcionam colados no terminal. (Tarefas 6 e 7)
4. Marca de etapa escrita de outro jeito (`[Etapa: 3]`, `[ETAPA:3]`): é aceita e vira `3`. (Tarefa 5)
5. Arquivo de trava que sobrou de um processo morto: é ignorado depois de 10 segundos, a escada não congela. (Tarefa 2)
6. Gancho recebe entrada vazia, JSON quebrado ou sem `tool_input`: deixa passar, não trava a sessão. (Tarefa 6)

---

### Tarefa 1: Esqueleto do plugin e textos

**Arquivos:**
- Criar: `PLUGIN/.claude-plugin/plugin.json`
- Criar: `PLUGIN/referencia/guia-original.html` (cópia de `C:\Users\tromb\Downloads\Modo Deus do Claude_ o guia completo.html`)
- Criar: `PLUGIN/modelos/orquestrador.md`, `executor.md`, `conselheiro.md`, `regras.md`, `skill-modelo.md`
- Teste: `PLUGIN/testes/modelos.test.js`

**Interfaces:**
- Produz: os cinco arquivos de `modelos/`, lidos pelas Tarefas 3 e 7. Os blocos `<pre>` do guia, na ordem em que aparecem: 0 estrutura, 1 orquestrador, 2 executor, 3 settings, 4 CLAUDE.md, 5 skill, 6 `/goal`.

- [ ] **Passo 1: escrever o teste que falha.** `modelos.test.js` extrai os blocos `<pre ...>...</pre>` de `referencia/guia-original.html`, troca `&quot;` `&amp;` `&lt;` `&gt;` pelos caracteres, tira a primeira linha de cada bloco (`Salve em ... exatamente este conteúdo:` e a linha vazia seguinte) e afirma:
  - `orquestrador.md` contém o bloco 1 inteiro, exceto a linha `tools:`, que tem que ser exatamente `tools: Agent(executor, conselheiro), Skill, Read, Write, Edit, Bash, Glob, Grep`.
  - `executor.md` contém o bloco 2 inteiro, exceto a linha `tools:`, que tem que ser `tools: Skill, Read, Write, Edit, Bash, Glob, Grep`.
  - `regras.md` contém o bloco 4 inteiro.
  - `skill-modelo.md` é igual ao bloco 5 a partir da linha `---`.
  - `orquestrador.md` contém `## Escada` depois da regra 7 do guia, e `regras.md` contém `## Escada`.
  - `conselheiro.md` tem no cabeçalho `name: conselheiro`, `model: opus`, `effort: xhigh`, `tools: Read, Glob, Grep, Bash`.
- [ ] **Passo 2: rodar e ver falhar.** `node --test testes/modelos.test.js` → falha por arquivo inexistente.
- [ ] **Passo 3: criar os arquivos.** `plugin.json`: `{"name":"modo-deus","version":"1.0.0","description":"Liga o Modo Deus do guia por projeto e aplica a escada de modelo e esforço.","author":{"name":"tromb"}}`. Os textos do guia são copiados do HTML. Os acréscimos são estes, exatos:

Seção acrescentada ao fim de `orquestrador.md`:

```markdown
## Escada (modelo e esforço por etapa)

Neste projeto um gancho confere cada delegação. Estas são as regras que ele aplica:

1. No plano em memoria/plano.md, marque cada etapa como [etapa:N], onde N é um número ou nome curto.
2. Ao delegar pro executor, comece o pedido com [etapa:N] e passe sempre model e effort. O degrau de partida aparece no aviso de início da sessão.
3. Degraus: 1 haiku/low · 2 sonnet/medium · 3 sonnet/high · 4 opus/high · 5 opus/xhigh.
4. Se a verificação falhar, delegue de novo a mesma etapa um degrau acima, passando o erro exato. Não insista no mesmo nível e não tenha pena de subir: pedir acima do exigido é sempre permitido.
5. Da 3ª tentativa em diante, consulte antes o conselheiro (Agent conselheiro, com [etapa:N], o erro exato e o que já foi tentado) e siga o diagnóstico dele. Pode consultar antes disso sempre que estiver em dúvida.
6. Etapa conferida e aprovada: rode o comando "passou" da escada. O comando completo está no aviso de início da sessão.
7. Plano novo: rode o comando "nova" da escada antes de delegar.
8. Se o gancho barrar, leia a mensagem e faça o que ela pede. Quando ele mandar parar, pare e mostre ao usuário o problema e as evidências.
9. Trabalho em paralelo usa etapas diferentes. Nunca dois executores na mesma etapa.
```

`conselheiro.md`:

```markdown
---
name: conselheiro
description: Conselheiro sênior. Analisa uma etapa que travou e devolve diagnóstico e caminho. Não edita arquivos.
model: opus
effort: xhigh
tools: Read, Glob, Grep, Bash
---

Você é o conselheiro. O orquestrador chama você quando uma etapa não passa.

- Leia o código e o erro exato antes de opinar. Reproduza o erro se der.
- Não edite nenhum arquivo. Use o Bash só para ler e rodar verificações.
- Devolva quatro coisas: a causa mais provável com a evidência; o que as tentativas anteriores erraram; o caminho recomendado, em passos que um executor consiga seguir; e como provar que ficou pronto.
- Se não der para saber a causa, diga o que falta descobrir. Não invente.
```

Seção acrescentada ao fim de `regras.md`:

```markdown
## Escada
- Com o Modo Deus ligado, a delegação segue a escada deste projeto (executor e conselheiro). A tabela de níveis e os agentes sc-* do Semana Cheia não se aplicam aqui. O resto do Semana Cheia continua valendo.
- Empacou, sobe sem pena: cada nova tentativa na mesma etapa vai um degrau acima, e da 3ª em diante o conselheiro é consultado antes.
- Está passando de primeira, desce: registre cada etapa aprovada com o comando "passou" da escada.
- No plano, cada etapa leva a marca [etapa:N].
```

- [ ] **Passo 4: rodar e ver passar.** `node --test testes/modelos.test.js` → passa. `claude plugin validate "PLUGIN"` → `Validation passed`.

---

### Tarefa 2: Disco (gravação segura e trava)

**Arquivos:**
- Criar: `PLUGIN/scripts/lib/disco.js`
- Teste: `PLUGIN/testes/disco.test.js`

**Interfaces:**
- Produz:
  - `lerTexto(caminho: string): string | null` (null se não existe; devolve o conteúdo como está, com BOM se houver)
  - `gravarAtomico(caminho: string, texto: string): void` (cria as pastas; grava em arquivo temporário ao lado e renomeia)
  - `impressao(texto: string): string` (sha256 em hexadecimal)
  - `comTrava<T>(caminhoTrava: string, fn: () => T, opcoes?: { esperaMs?: number }): T` (espera padrão 3000; lança `Error('TRAVA_OCUPADA')` se estourar)

- [ ] **Passo 1: testes que falham.**
  - `lerTexto` de arquivo inexistente devolve `null`.
  - `gravarAtomico` em pasta que não existe cria a pasta, e não sobra arquivo temporário.
  - `impressao('a')` é `ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb`.
  - `comTrava` devolve o retorno de `fn` e apaga a trava, inclusive quando `fn` lança.
  - Com a trava já criada há menos de 10 s, `comTrava(..., { esperaMs: 200 })` lança `TRAVA_OCUPADA`.
  - Com a trava criada e a data de modificação recuada 11 s (`fs.utimesSync`), `comTrava` passa por cima e roda `fn`.
- [ ] **Passo 2: ver falhar.** `node --test testes/disco.test.js`
- [ ] **Passo 3: implementar.** A trava é um arquivo criado com a opção `wx`. Enquanto existir, tenta de novo a cada 25 ms, com espera síncrona por `Atomics.wait`. Trava com mais de 10 000 ms é apagada e a tentativa segue.
- [ ] **Passo 4: ver passar.** `node --test testes/disco.test.js`

---

### Tarefa 3: Projeto, parte 1 (estado e ligar)

**Arquivos:**
- Criar: `PLUGIN/scripts/lib/projeto.js`
- Teste: `PLUGIN/testes/projeto-ligar.test.js`

**Interfaces:**
- Consome: `disco.js` (Tarefa 2); `PLUGIN/modelos/*` (Tarefa 1); `escada.nova(raiz)` (Tarefa 5). Até a Tarefa 5 existir, o `ligar` recebe a função de zerar por parâmetro opcional: `ligar(raiz, plugin, { zerarEscada } = {})`.
- Produz:
  - `MARCA_INI = '<!-- modo-deus:inicio -->'`, `MARCA_FIM = '<!-- modo-deus:fim -->'`
  - `estado(raiz: string): { ligado: boolean, marcador: object | null, divergencia: null | 'marcador-sem-chave' | 'chave-sem-marcador', settingsInvalido: boolean }`. `ligado` é `settings.agent === 'orquestrador'`.
  - `ligar(raiz: string, plugin: string, opcoes?): { ok: boolean, mudou: boolean, mensagens: string[] }`
  - Marcador em `<raiz>/.claude/modo-deus.json`:
    ```json
    { "versao": 1,
      "settings": { "existia": true, "original": "<texto ou null>", "gravado": "<impressao>",
        "anteriores": { "agent": { "tinha": false, "valor": null }, "effortLevel": { "tinha": false, "valor": null },
                        "autocompact": { "tinha": false, "valor": null }, "envExistia": false } },
      "claudeMd": { "existia": true, "original": "<texto ou null>", "gravado": "<impressao>" },
      "arquivos": { ".claude/agents/orquestrador.md": "<impressao>", ".claude/agents/executor.md": "<impressao>", ".claude/agents/conselheiro.md": "<impressao>" } }
    ```

**O que o `ligar` grava:** os três agentes em `.claude/agents/`; em `.claude/settings.json` as chaves `agent: "orquestrador"`, `effortLevel: "xhigh"`, `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "40"`; em `CLAUDE.md` o bloco `MARCA_INI` + conteúdo de `modelos/regras.md` + `MARCA_FIM`; `memoria/plano.md` vazio se não existir; a pasta `.claude/skills/`; o marcador. Settings é regravado com `JSON.stringify(obj, null, 2) + '\n'`. O bloco do CLAUDE.md vai no fim, separado por uma linha em branco, usando CRLF se o arquivo já usa CRLF.

- [ ] **Passo 1: testes que falham.**
  - Projeto vazio: `ligar` devolve `ok: true, mudou: true`; os três agentes são idênticos aos de `modelos/`; settings tem exatamente as três chaves; `CLAUDE.md` começa com `MARCA_INI`; `memoria/plano.md` existe vazio; `estado(raiz).ligado === true`.
  - Settings já com `{"model":"fable","env":{"X":"1"}}`: depois de ligar, `model` e `env.X` continuam, e o marcador tem `envExistia: true`.
  - Settings começando com BOM (`\uFEFF{...}`): liga normalmente.
  - Settings com texto inválido (`{ "a": `): `ok: false`, e **nenhum** arquivo do projeto foi criado ou mudado (comparar a árvore antes e depois).
  - `orquestrador.md` já existe com outro conteúdo e sem marcador: `ok: false`, mensagem cita o arquivo, nada foi gravado.
  - `ligar` duas vezes: a segunda devolve `mudou: false` e o marcador fica byte a byte igual.
  - Atualização: depois de ligar, trocar o conteúdo de `modelos/` (usar uma pasta de plugin de mentira) e ligar de novo regrava o agente e atualiza a impressão no marcador. Se o agente do projeto foi editado à mão, não regrava e a mensagem avisa.
  - `CLAUDE.md` existente em CRLF: o bloco acrescentado usa CRLF e o texto anterior fica intacto no começo.
  - Settings já com `agent: "orquestrador"` e sem marcador (`divergencia: 'chave-sem-marcador'`): liga, e o marcador grava `anteriores.agent.tinha === false`.
  - Erro no meio: com `fs.writeFileSync` trocado por uma versão que lança na 3ª gravação (`t.mock.method`), `ligar` devolve `ok: false` e a árvore volta a ser igual à de antes.
  - `zerarEscada` é chamado uma vez quando o modo estava desligado antes do `ligar`, e não é chamado quando já estava ligado (uma atualização de modelos no meio do trabalho não apaga a escada).
- [ ] **Passo 2: ver falhar.** `node --test testes/projeto-ligar.test.js`
- [ ] **Passo 3: implementar `estado` e `ligar`.** Duas fases: primeiro monta a lista de gravações e confere todos os impedimentos; só depois grava, guardando o conteúdo anterior de cada arquivo para desfazer se alguma gravação lançar.
- [ ] **Passo 4: ver passar.** `node --test`

---

### Tarefa 4: Projeto, parte 2 (desligar e contexto)

**Arquivos:**
- Modificar: `PLUGIN/scripts/lib/projeto.js`
- Teste: `PLUGIN/testes/projeto-desligar.test.js`

**Interfaces:**
- Consome: marcador e funções da Tarefa 3.
- Produz:
  - `desligar(raiz: string): { ok: boolean, mudou: boolean, mensagens: string[] }`
  - `contexto(raiz: string, pct: '40' | '60'): { ok: boolean, mensagens: string[] }`

**Regras do `desligar`:**
- Arquivo cuja impressão atual é igual à `gravado` do marcador volta ao `original` exato. Se `existia` era falso, é apagado.
- Settings editado depois: cada uma das três chaves que ainda tem o valor que o plugin pôs volta ao valor anterior, ou é removida se `tinha` era falso. Chave que você mudou fica, com aviso. `env` vazio é removido se `envExistia` era falso.
- CLAUDE.md editado depois: sai o trecho de `MARCA_INI` a `MARCA_FIM` e a linha em branco que o separava. Se sobrar só espaço e `existia` era falso, o arquivo é apagado.
- Agente com impressão igual à do marcador é apagado. Diferente fica, com aviso.
- `memoria/` e `.claude/skills/` nunca são tocados. O marcador é apagado por último.
- Settings inválido na hora de desligar: `ok: false`, nada muda.
- Sem marcador e com `agent: "orquestrador"`: remove só a chave `agent` e avisa que não havia dados para desfazer o resto.
- Sem marcador e sem a chave: `ok: true, mudou: false`.

**`contexto`:** só com o modo ligado (senão `ok: false`). Troca `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` e, se o settings estava intocado, atualiza `settings.gravado` no marcador para o `desligar` continuar devolvendo o original exato.

- [ ] **Passo 1: testes que falham.**
  - Para cada ponto de partida (projeto vazio; settings com outras chaves; settings com BOM; CLAUDE.md em LF; CLAUDE.md em CRLF): `ligar` seguido de `desligar` deixa a árvore do projeto byte a byte igual à inicial, exceto `memoria/plano.md` e a pasta `.claude/skills/`.
  - Editar o settings depois de ligar (acrescentar `"theme":"dark"`): `desligar` mantém `theme`, remove as três chaves, e o arquivo é JSON válido.
  - Mudar `effortLevel` para `high` depois de ligar: `desligar` mantém `high` e avisa.
  - Acrescentar texto ao CLAUDE.md antes e depois do bloco: `desligar` mantém os dois textos e tira o bloco e as marcas.
  - Editar `executor.md` depois de ligar: `desligar` mantém o arquivo e a mensagem cita ele.
  - `ligar`, `ligar`, `desligar`: `estado(raiz).ligado === false` (a segunda ligação não estraga o desfazer).
  - `contexto(raiz, '60')` e depois `desligar`: árvore volta ao inicial.
  - `contexto` com o modo desligado devolve `ok: false`.
  - `contexto(raiz, '50')` devolve `ok: false`.
- [ ] **Passo 2: ver falhar.** `node --test testes/projeto-desligar.test.js`
- [ ] **Passo 3: implementar.**
- [ ] **Passo 4: ver passar.** `node --test`

---

### Tarefa 5: Escada (regras e estado)

**Arquivos:**
- Criar: `PLUGIN/scripts/lib/escada.js`
- Teste: `PLUGIN/testes/escada.test.js`

**Interfaces:**
- Consome: `disco.js`.
- Produz:
  - `DEGRAUS = [null, {modelo:'haiku',esforco:'low'}, {modelo:'sonnet',esforco:'medium'}, {modelo:'sonnet',esforco:'high'}, {modelo:'opus',esforco:'high'}, {modelo:'opus',esforco:'xhigh'}]`
  - `MAX_TENTATIVAS = 6`, `TETO_BASE = 4`, `LIMPAS_PARA_DESCER = 3`
  - `extrairEtapa(texto: string): string | null`. Expressão: `/\[etapa:\s*([A-Za-z0-9._-]{1,40})\s*\]/i`. Devolve a captura em minúsculas.
  - `degrauAtendido(modelo: string, esforco: string): number`. Ordem dos modelos `haiku < sonnet < opus < fable`, dos esforços `low < medium < high < xhigh < max`. Devolve o maior degrau cujo modelo é mais fraco que o pedido, ou igual com esforço menor ou igual ao pedido. Modelo ou esforço fora das listas devolve `0`.
  - `avaliar(raiz: string, chamada: { tipo: 'executor' | 'conselheiro', texto: string, modelo?: string, esforco?: string }, comandos: { passou: string }): { permitir: boolean, mensagem: string }`
  - `passou(raiz: string, etapa: string): { ok: boolean, mensagem: string }`
  - `nova(raiz: string): void` (apaga `base.json` e `etapa-*.json`; mantém `historico.log`)
  - `resumo(raiz: string): { base: number, limpas: number, etapas: Array<{ id, tentativas, ultimoDegrau, conselhoPara, estado }> }`
- Estado em `<raiz>/memoria/escada/`: `base.json` `{ "base": 1, "limpas": 0 }`; `etapa-<id>.json` `{ "id", "tentativas", "ultimoDegrau", "conselhoPara", "estado": "aberta" | "passou", "subiuBase": false }`; `historico.log`, uma linha por decisão (data ISO, etapa, decisão, modelo/esforço). Toda leitura seguida de gravação acontece dentro de `comTrava` do arquivo `.trava` correspondente.

**`avaliar` para `executor`, nesta ordem (a primeira que barrar encerra, sem mudar o estado):**
1. Sem marca de etapa no texto → barra: `Inclua [etapa:N] no começo do pedido.`
2. `memoria/plano.md` não contém a mesma etapa (comparar com `extrairEtapa` em cada marca do plano) → barra: `A etapa N não está no plano. Escreva o plano em memoria/plano.md marcando cada etapa como [etapa:N].`
3. `degrauAtendido` devolve `0` (faltou `model` ou `effort`, ou valor desconhecido) → barra dizendo o degrau exigido com os dois valores.
4. Etapa em estado `passou` → começa ciclo novo (`tentativas = 0`, `conselhoPara = 0`, `subiuBase = false`, `estado = 'aberta'`).
5. `tentativas >= 6` → barra: `Etapa N: 6 tentativas esgotadas. Pare e mostre ao usuário o problema e as evidências.`
6. Exigido: `base` se `tentativas === 0`; senão `Math.min(5, ultimoDegrau + 1)`. Atendido menor que o exigido → barra: `Etapa N, tentativa T: exige degrau D ou acima. Chame de novo com model M e effort E.`
7. `tentativas >= 2` e `conselhoPara !== tentativas + 1` → barra: `Etapa N: antes da tentativa T consulte o conselheiro (Agent conselheiro com [etapa:N], o erro exato e o que já foi tentado).`
8. Permite: `tentativas += 1`, `ultimoDegrau = atendido`. Se `tentativas === 2` e `subiuBase` é falso: `base = Math.min(4, base + 1)`, `limpas = 0`, `subiuBase = true`. Mensagem: `Etapa N, tentativa T no degrau D. Depois de conferir, registre: <comandos.passou> N`.

**`avaliar` para `conselheiro`:** sem marca de etapa → barra (mesma mensagem 1). Etapa fora do plano → barra (mensagem 2). `modelo` informado e mais fraco que `opus`, ou `esforco` informado e mais fraco que `high` → barra: `O conselheiro roda em opus com effort high ou acima.` Senão permite e grava `conselhoPara = tentativas + 1`. Não conta tentativa.

**`passou`:** etapa sem arquivo ou com `tentativas === 0` → `ok: false`. Já em `passou` → `ok: true`, sem mudar nada. Senão `estado = 'passou'`; se `tentativas === 1`, `limpas += 1` e, chegando a 3, `base = Math.max(1, base - 1)` e `limpas = 0`; se `tentativas > 1`, `limpas = 0`.

- [ ] **Passo 1: testes que falham.** Cada teste parte de um projeto com `memoria/plano.md` contendo `[etapa:1] [etapa:2] [etapa:3] [etapa:4]`.
  - `extrairEtapa`: `'[etapa:3] x'` → `'3'`; `'[Etapa: 3]'` → `'3'`; `'[ETAPA:Login-2]'` → `'login-2'`; `'sem marca'` → `null`.
  - `degrauAtendido`: haiku/low 1; haiku/xhigh 1; sonnet/low 1; sonnet/medium 2; sonnet/xhigh 3; opus/low 3; opus/high 4; opus/max 5; fable/low 5; `'gpt'`/high 0; sonnet/`undefined` 0.
  - Caminho feliz: etapa 1 com haiku/low é permitida; `tentativas` vira 1.
  - Sem marca, fora do plano, sem `model`: barradas, e nenhum arquivo de etapa é criado.
  - Repetição: segunda chamada da etapa 1 com haiku/low é barrada e a mensagem contém `model sonnet` e `effort medium`; com sonnet/medium passa, e `base.json` vira `{ base: 2, limpas: 0 }`.
  - Chamada barrada não conta: depois da barrada acima, `tentativas` continua 1.
  - Conselheiro: terceira chamada com sonnet/high é barrada pedindo o conselheiro; depois de `avaliar` do conselheiro para a etapa 1, sonnet/high passa. A quarta, com opus/high, é barrada de novo até nova consulta.
  - Topo: etapa que começou em opus/xhigh aceita a 2ª tentativa em opus/xhigh (exigido fica em 5).
  - Teto: com as consultas feitas, a 6ª tentativa passa e a 7ª é barrada com `6 tentativas esgotadas`.
  - Pedir acima: primeira chamada da etapa 2 com opus/xhigh passa, e a segunda exige degrau 5.
  - Conselheiro com `modelo: 'sonnet'` é barrado; sem `modelo` passa; não muda `tentativas`.
  - Descida: `base.json` em `{ base: 3, limpas: 0 }`; três etapas resolvidas de primeira e registradas com `passou` levam a `base: 2, limpas: 0`. Base 1 não desce abaixo de 1.
  - `passou` numa etapa que precisou de 2 tentativas zera `limpas`. `passou` duas vezes na mesma etapa conta uma vez só. `passou` de etapa que nunca rodou devolve `ok: false`.
  - Subida tem teto: com `base: 4`, uma etapa indo para a 2ª tentativa deixa `base: 4`.
  - Ciclo novo: etapa em `passou` chamada de novo começa com `tentativas` 1 e exige só a base.
  - `nova` apaga `base.json` e as etapas e mantém `historico.log`.
  - Fila: dois processos filhos (`child_process.spawn` de um script de apoio em `testes/apoio/avalia.js`) chamando `avaliar` da mesma etapa ao mesmo tempo com haiku/low: exatamente um é permitido.
  - `historico.log` ganha uma linha por decisão, permitida ou barrada.
- [ ] **Passo 2: ver falhar.** `node --test testes/escada.test.js`
- [ ] **Passo 3: implementar.**
- [ ] **Passo 4: ver passar.** `node --test`
- [ ] **Passo 5: ligar a escada ao `ligar`.** Em `projeto.js`, o padrão de `opcoes.zerarEscada` passa a ser `escada.nova`. Rodar `node --test`.

---

### Tarefa 6: Ganchos

**Arquivos:**
- Criar: `PLUGIN/scripts/gancho.js`, `PLUGIN/scripts/sessao.js`, `PLUGIN/hooks/hooks.json`
- Teste: `PLUGIN/testes/ganchos.test.js` (roda os scripts como processo filho, com a entrada na entrada padrão e `CLAUDE_PROJECT_DIR` no ambiente)

**Interfaces:**
- Consome: `projeto.estado`, `escada.avaliar`, `escada.resumo`.
- Produz: `hooks.json`:
  ```json
  { "hooks": {
      "SessionStart": [ { "hooks": [ { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/sessao.js\"" } ] } ],
      "PreToolUse": [ { "matcher": "Agent|Task", "hooks": [ { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/gancho.js\"" } ] } ] } }
  ```

**`gancho.js`:** raiz do projeto é `process.env.CLAUDE_PROJECT_DIR`, ou o `cwd` da entrada se a variável faltar. Sai com 0 sem fazer nada quando: a entrada não é JSON; `tool_input.subagent_type` não é `executor` nem `conselheiro`; o modo não está ligado na raiz. Senão chama `escada.avaliar` com `texto = description + '\n' + prompt`, `modelo = tool_input.model`, `esforco = tool_input.effort`, e `comandos.passou = 'node "<pasta scripts>/escada.js" passou'`. Barrado: mensagem no stderr com o prefixo `[modo-deus] ` e saída 2. Erro inesperado: uma linha em `memoria/escada/erros.log` e saída 0.

**`sessao.js`:** imprime uma linha e sai com 0 sempre.
- Desligado: `[modo-deus] desligado neste projeto · /modo-deus:ligar para ativar`
- Ligado e `agent_type === 'orquestrador'`: `[modo-deus] LIGADO · degrau de partida B · escada: node "<pasta scripts>/escada.js" (passou <etapa> | nova | status)`
- Ligado e `agent_type` diferente: `[modo-deus] LIGADO neste projeto, mas esta sessão não abriu como orquestrador. Abra uma sessão nova. Se continuar assim, a trava e o esforço do guia não estão valendo.`
- `divergencia: 'marcador-sem-chave'`: `[modo-deus] desligado à mão (a chave agent saiu do settings.json) · /modo-deus:desligar para limpar o resto`

- [ ] **Passo 1: testes que falham.**
  - Gancho, modo desligado, chamada de executor sem nada: saída 0.
  - Gancho, modo ligado, `subagent_type: 'sc-executor'`: saída 0, nenhum arquivo de escada criado.
  - Gancho, modo ligado, executor sem marca: saída 2, stderr começa com `[modo-deus] ` e contém `[etapa:N]`.
  - Gancho, modo ligado, executor `[etapa:1]` com `model: 'haiku', effort: 'low'` e etapa no plano: saída 0, e `etapa-1.json` tem `tentativas: 1`.
  - Gancho com entrada vazia, com `{`, e com `{"tool_name":"Agent"}`: saída 0 nas três.
  - Gancho sem `CLAUDE_PROJECT_DIR` usa o `cwd` da entrada.
  - Gancho em projeto cuja pasta se chama `meu projeto ação`, com a mesma chamada válida: saída 0 e `etapa-1.json` gravado.
  - Chamada permitida não imprime nada no stdout nem no stderr (a mensagem de `avaliar` vai só para o `historico.log`).
  - Sessão: as quatro linhas acima, cada uma no seu cenário. No cenário ligado, o caminho impresso usa `/` e está entre aspas.
  - Sessão com entrada vazia: saída 0.
- [ ] **Passo 2: ver falhar.** `node --test testes/ganchos.test.js`
- [ ] **Passo 3: implementar.**
- [ ] **Passo 4: ver passar.** `node --test`

---

### Tarefa 7: Comandos e skills

**Arquivos:**
- Criar: `PLUGIN/scripts/modo.js`, `PLUGIN/scripts/escada.js`
- Criar: `PLUGIN/skills/ligar/SKILL.md`, `desligar/`, `status/`, `contexto/`, `objetivo/`, `nova-skill/`
- Teste: `PLUGIN/testes/comandos.test.js`

**Interfaces:**
- Consome: `projeto.js`, `lib/escada.js`.
- Produz:
  - `node modo.js <ligar|desligar|status|contexto> [40|60] [--projeto <pasta>]`
  - `node escada.js <passou <etapa>|nova|status> [--projeto <pasta>]`
  - Raiz padrão: `process.env.CLAUDE_PROJECT_DIR`, senão a pasta atual. Saída 0 quando `ok`, 1 quando recusado ou argumento errado. Cada mensagem numa linha.
  - `modo.js ligar` termina com: `Modo Deus ligado. Abra uma sessão nova neste projeto para ele valer. Confira com /model (Opus) e /effort status (xhigh).`
  - `modo.js status` imprime: ligado ou desligado; divergência se houver; degrau de partida; uma linha por etapa aberta (`etapa N: T tentativas, último degrau D`).

**Skills.** Todas com `name`, `description` e corpo curto. `ligar`, `desligar` e `contexto` levam `disable-model-invocation: true`.
- `ligar`, `desligar`, `status`: corpo `Rode exatamente este comando e mostre a saída ao usuário sem resumir:` seguido de `node "${CLAUDE_PLUGIN_ROOT}/scripts/modo.js" <verbo>`.
- `contexto`: mesmo formato, com `contexto $ARGUMENTS`. Explica em uma linha: 40 para o dia a dia, 60 para tarefa grande, e que vale na próxima sessão.
- `objetivo`: pede três coisas (estado final que dá para medir, comando que prova, limite de turnos), monta a linha no formato do bloco 6 do guia e entrega num bloco de código para o usuário enviar. Avisa, com as palavras do guia, que o avaliador só julga o que aparece na conversa. Lembra `/goal` sozinho (status) e `/goal clear`.
- `nova-skill`: pergunta o nome e a tarefa, cria `.claude/skills/<nome>/SKILL.md` a partir de `${CLAUDE_PLUGIN_ROOT}/modelos/skill-modelo.md` e preenche o passo a passo.

- [ ] **Passo 1: testes que falham.** Rodando os comandos como processo filho:
  - `modo.js ligar --projeto <tmp>` sai com 0 e a última linha é a frase acima. `modo.js status` contém `ligado`.
  - `modo.js desligar` sai com 0 e `status` contém `desligado`.
  - `modo.js contexto 50` sai com 1. `modo.js xyz` sai com 1 e lista os verbos.
  - `escada.js passou 9 --projeto <tmp>` sem etapa 9 sai com 1.
  - `escada.js status` num projeto sem escada imprime `degrau de partida 1`.
  - Pasta `meu projeto ação`: `ligar` e `desligar` funcionam.
  - Cada `SKILL.md` existe, tem `name` igual ao nome da pasta e `description` não vazia; os três indicados têm `disable-model-invocation: true`; `ligar`, `desligar`, `status` e `contexto` contêm `${CLAUDE_PLUGIN_ROOT}/scripts/modo.js`.
- [ ] **Passo 2: ver falhar.** `node --test testes/comandos.test.js`
- [ ] **Passo 3: implementar.**
- [ ] **Passo 4: ver passar.** `node --test` (suíte inteira) e `claude plugin validate "PLUGIN"`.

---

### Tarefa 8: Sessões reais

**Arquivos:**
- Criar: `PLUGIN/testes/e2e/roda.js`
- Criar: `PLUGIN/testes/e2e/RESULTADO.md` (saída resumida de cada cenário)

**Interfaces:**
- Consome: o plugin inteiro, carregado com `--plugin-dir PLUGIN`.
- Produz: `node testes/e2e/roda.js [cenario]` imprime, por cenário, `PASSOU` ou `FALHOU` com a evidência.

`roda.js` cria um projeto descartável, roda `node scripts/modo.js ligar --projeto <tmp>`, acrescenta um agente `intruso` e uma skill de projeto `saudar` (corpo: `A saudação secreta é: ABACAXI-42.`), e chama `claude -p --plugin-dir PLUGIN --output-format stream-json --verbose --permission-mode acceptEdits --allowedTools "Bash(node:*)"` com o prompt na entrada padrão. Lê o resultado linha a linha: o evento `system/init` (modelo, ferramentas), os `tool_use` de nome `Agent` e seus `tool_result`.

- [ ] **Passo 1: cenário `trava`.** Prompt pede três delegações: `intruso`, `general-purpose`, e `executor` com `[etapa:1]`, model haiku, effort low (o plano já vem escrito com `[etapa:1]`). Passa se: modelo do `init` contém `opus`; ferramentas do `init` são `Task, Skill, Read, Write, Edit, Bash, Glob, Grep`; as duas primeiras dão `not found. Available agents: conselheiro, executor`; a terceira roda.
- [ ] **Passo 2: cenário `escada`.** Plano com `[etapa:1]`. Prompt manda, em ordem e relatando a mensagem literal de cada bloqueio: executor etapa 1 haiku/low; de novo haiku/low; sonnet/medium; sonnet/high; conselheiro etapa 1; sonnet/high. Passa se a 2ª e a 4ª chamadas foram barradas com `[modo-deus]`, as outras rodaram, e `memoria/escada/etapa-1.json` termina com `tentativas: 3`.
- [ ] **Passo 3: cenário `skills`.** Prompt: `Diga a saudação secreta do projeto usando a skill saudar. Depois peça ao executor, com [etapa:1] haiku/low, que diga a mesma saudação usando a skill.` Passa se `ABACAXI-42` aparece nas duas respostas. **Se falhar**, registrar o motivo em `RESULTADO.md` e parar a tarefa: a linha `tools:` precisa ser revista com o dono do desenho antes de seguir.
- [ ] **Passo 4: cenário `comandos`.** Três sessões seguidas com os prompts `/modo-deus:status`, `/modo-deus:contexto 60`, `/modo-deus:desligar`. Passa se a primeira resposta contém `ligado`, depois da segunda o settings tem `"60"`, e depois da terceira `estado(raiz).ligado` é falso e o settings e o CLAUDE.md são iguais aos de antes do `ligar`.
- [ ] **Passo 5: cenário `aviso`.** Com o modo ligado, rodar `claude -p --agent executor --plugin-dir PLUGIN` com o prompt `Repita a linha que começa com [modo-deus] do início desta sessão.` Passa se a resposta contém `não abriu como orquestrador`.
- [ ] **Passo 6: gravar `RESULTADO.md`** com a evidência de cada cenário e o custo somado. Todos os cinco têm que estar `PASSOU`.

---

### Tarefa 9: Instalar e conferir no app

**Arquivos:**
- Modificar: `C:\Users\tromb\.claude\plugins-local\flow-cinema\.claude-plugin\marketplace.json` (acrescentar a entrada do plugin)

- [ ] **Passo 1:** acrescentar em `plugins`: `{ "name": "modo-deus", "source": "./modo-deus", "description": "Liga o Modo Deus do guia por projeto e aplica a escada de modelo e esforço." }`. Conferir que o arquivo continua JSON válido e que a entrada do `flow-cinema` não mudou.
- [ ] **Passo 2:** `claude plugin marketplace update tromb-local` e depois `claude plugin install modo-deus@tromb-local`. Esperado: instalado em `C:\Users\tromb\.claude\plugins\cache\tromb-local\modo-deus\1.0.0`.
- [ ] **Passo 3:** rodar a suíte dentro da pasta instalada: `node --test` → tudo passa.
- [ ] **Passo 4:** repetir o cenário `trava` da Tarefa 8 **sem** `--plugin-dir`, para provar que o plugin instalado é o que está valendo.
- [ ] **Passo 5 (com o usuário, no app desktop):** abrir uma sessão nova num projeto de teste, rodar `/modo-deus:ligar`, abrir outra sessão nova no mesmo projeto e conferir a linha `[modo-deus] LIGADO · degrau de partida 1`. Se aparecer `não abriu como orquestrador`, o app não respeita a chave `agent` e isso volta para o desenho.
- [ ] **Passo 6:** `/modo-deus:desligar` nesse projeto e conferir a linha `desligado` na sessão seguinte.

## O que fica de fora

Escada nas sessões normais do Semana Cheia, publicação do plugin e qualquer mudança no Semana Cheia.
