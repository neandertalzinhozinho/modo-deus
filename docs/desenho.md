# Modo Deus: desenho do plugin

Data: 2026-11-15 · Estado: construído e instalado em 2026-11-16 (`modo-deus@tromb-local`). Falta só a conferência no app desktop.

Código: `C:\Users\tromb\.claude\plugins-local\flow-cinema\modo-deus`. Resultado dos testes com sessões reais: `testes\e2e\RESULTADO.md` nessa pasta.

## Para que serve

Hoje montar o "Modo Deus" do guia exige colar seis prompts em cada projeto. O plugin faz isso com um comando, e você decide projeto a projeto se quer ligar.

Além do que o guia traz, ele resolve um problema que você descreveu: o modelo "fica com pena" de chamar um modelo mais forte ou de subir o esforço, e o trabalho empaca. A subida e a descida de nível passam a ser regra mecânica, não decisão do modelo.

## O que você pediu (e está garantido)

- Todo o conteúdo do guia entra, com o texto original.
- Ligar é escolha sua, por projeto.
- A trava do orquestrador tem que funcionar de verdade.
- A distribuição de trabalho e de pensamento tem que ser real: empacou, sobe sem pena; está fácil, desce.
- Validar antes de programar e validar de novo ao programar.

## O que já foi validado (testes reais, nesta máquina, Claude Code 2.1.325)

| Pergunta | Resultado | Prova |
|---|---|---|
| A chave `agent` no settings.json do projeto abre a sessão como orquestrador? | Sim | Sessão abriu em Opus, só com as 7 ferramentas do guia |
| A trava `Agent(executor)` vale por esse caminho? | Sim | `Agent type 'intruso' not found. Available agents: executor` (idem para `general-purpose`) |
| O esforço `xhigh` é respeitado, mesmo com seu ajuste global de Opus em `medium`? | Sim | Registro da sessão mostra `perTurnEffort: xhigh` |
| Dá para escolher modelo e esforço a cada delegação? | Sim | A ferramenta Agent tem os parâmetros `model` e `effort` |
| O modelo pedido na delegação vence o `model: haiku` do arquivo do executor? | Sim | Pedido com `sonnet` rodou em `claude-sonnet-5-5` |
| Um gancho consegue ver a delegação e barrar? | Sim | Gancho recebeu `subagent_type`, `model`, `effort` e bloqueou a chamada sem nível |
| `effortLevel`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`, `/goal`, `maxTurns` existem como o guia diz? | Sim | Documentação oficial |

## O que ainda não foi validado (será testado durante a construção)

1. **App desktop.** Os testes rodaram pelo `claude` de linha de comando. Falta confirmar que o app (aba Code) também respeita a chave `agent`. O plugin avisa no início de cada sessão se o modo está ligado no projeto mas a sessão não abriu como orquestrador.
2. **Skills do guia.** Confirmado por teste: com as 7 ferramentas do guia o orquestrador não consegue acionar skills, porque falta a ferramenta `Skill`. O plugin acrescenta `Skill` à linha de ferramentas do orquestrador e do executor. Falta provar, na construção, que com isso as skills do projeto passam a funcionar nos dois.

Validado depois da primeira versão deste desenho:
- **Trava com dois nomes:** `Agent(executor, conselheiro)` funciona. Erro literal para os outros: `Agent type 'intruso' not found. Available agents: conselheiro, executor`.
- **Comandos do plugin dentro da sessão do orquestrador:** funcionam, então dá para desligar de dentro do próprio modo.
- **Aviso de início de sessão:** o gancho recebe o nome do agente da sessão, então consegue dizer se ela abriu como orquestrador.

## Caminhos considerados

| Caminho | Por que sim ou não |
|---|---|
| **Plugin local `modo-deus` (escolhido)** | Fica só na sua máquina, então pode levar o texto original do guia. Você já usa esse formato (`flow-cinema`). |
| Dentro do `semana-cheia` | Era minha primeira sugestão. Descartado: o repositório é público e você quer o texto idêntico do guia. |
| Só arquivos em `~/.claude` | Sem liga/desliga por projeto e sem gancho organizado. |
| Script que copia arquivos | Não cobre a escada nem o aviso de início de sessão. |

## Como fica para você

| Comando | O que faz |
|---|---|
| `/modo-deus:ligar` | Monta o Modo Deus no projeto aberto. Vale a partir da próxima sessão nesse projeto. |
| `/modo-deus:desligar` | Desfaz. O projeto volta a abrir normal. |
| `/modo-deus:status` | Mostra se está ligado, o degrau atual e as etapas em andamento. |
| `/modo-deus:objetivo` | Pergunta o estado final, o comando que prova e o limite de turnos, e devolve a linha `/goal` pronta para você enviar. |
| `/modo-deus:nova-skill` | Cria uma skill no projeto com o modelo do guia ("Versão" e "Lições aprendidas"). |
| `/modo-deus:contexto 40` ou `60` | Troca a compactação entre 40 (dia a dia) e 60 (tarefa grande). |

Ao abrir qualquer projeto, uma linha avisa o estado: `[modo-deus] desligado neste projeto` ou `[modo-deus] LIGADO · degrau base 2`.

## O que o `ligar` grava no projeto

Exatamente a estrutura do guia:

- `.claude/agents/orquestrador.md` e `executor.md`, com o texto do guia.
- `.claude/agents/conselheiro.md` (novo, ver abaixo).
- `.claude/settings.json`: acrescenta `agent`, `effortLevel` e a compactação em 40. As outras chaves que já existirem ficam intactas, e os valores antigos dessas três são guardados para o `desligar` devolver.
- `CLAUDE.md`: acrescenta as regras do guia num bloco marcado. O resto do arquivo fica intacto.
- `memoria/plano.md` e a pasta `.claude/skills/`.

O que vale como "ligado": a chave `agent` do settings.json do projeto ser `orquestrador`. É ela que de fato muda a sessão, então o aviso de início, o gancho e o `status` leem todos dali. Um arquivo à parte, `.claude/modo-deus.json`, guarda só o que é preciso para desfazer. Se os dois discordarem (alguém mexeu à mão), o `status` diz qual é a diferença.

Regras de segurança do `ligar`:
- **Confere tudo antes de gravar qualquer coisa.** Se algum arquivo impedir, para sem ter gravado nada. Se der erro no meio da gravação, desfaz o que já gravou.
- **Não sobrescreve arquivo seu.** Se já existir um `orquestrador.md` diferente do modelo e que não foi o plugin que gravou, avisa e para.
- **Atualização do plugin.** O plugin guarda a "impressão digital" de cada arquivo que gravou. Se o arquivo no projeto ainda é o que ele gravou, pode trocar pela versão nova. Se você editou, não troca e avisa.
- **Settings inválido:** não toca em nada.
- **Rodar duas vezes:** a segunda não muda nada e não apaga o que foi guardado para desfazer.
- **Zera a escada** do projeto (o histórico fica).

Regras do `desligar`:
- **Settings e CLAUDE.md intocados desde o `ligar`:** voltam a ser idênticos ao que eram, byte a byte. Se não existiam antes, são apagados.
- **Você editou depois do `ligar`:** suas edições ficam. Sai só o que o plugin pôs: as três chaves voltam ao valor antigo (ou somem, se não existiam) e o bloco marcado sai do CLAUDE.md.
- **Arquivos dos agentes:** saem se ainda forem os que o plugin gravou. Se você editou, ficam, e o comando avisa.
- **Ficam sempre:** a pasta `memoria/` e as skills do projeto.

## A escada (a parte nova)

Cada etapa do plano tem um degrau, que é modelo mais esforço:

| Degrau | Modelo | Esforço |
|---|---|---|
| 1 | Haiku | low |
| 2 | Sonnet | medium |
| 3 | Sonnet | high |
| 4 | Opus | high |
| 5 | Opus | xhigh |

Regras, todas aplicadas por um gancho que barra a delegação errada:

1. **Toda delegação ao executor declara a etapa e o nível.** O orquestrador marca `[etapa:N]` e passa modelo e esforço. Sem isso a chamada é barrada. A etapa tem que estar escrita com a mesma marca em `memoria/plano.md`, para ninguém escapar da contagem trocando o número.
2. **Repetiu a etapa, subiu.** Cada nova tentativa na mesma etapa exige um degrau acima do que foi usado na anterior, até o degrau 5. Chegando no 5, as tentativas seguintes repetem o 5. O orquestrador não precisa "admitir" que falhou: mandar de novo já conta.
3. **Conselheiro obrigatório.** Da 3ª tentativa em diante, cada tentativa exige antes uma consulta ao conselheiro para aquela etapa (Opus, esforço `xhigh`). Ele lê o código, o erro e as tentativas, e devolve diagnóstico e caminho. A consulta não conta como tentativa.
4. **Pode sempre pedir mais.** Chamar acima do degrau exigido nunca é barrado, e o conselheiro pode ser chamado a qualquer momento.
5. **Teto.** Cada etapa tem no máximo 6 tentativas. A 7ª é barrada, com a ordem de parar e te mostrar o problema e as evidências. Evita loop infinito.
6. **Subida do degrau de partida.** No momento em que uma etapa vai para a 2ª tentativa, o degrau de partida das próximas etapas sobe um (até o 4). Isso não depende de o orquestrador registrar nada.
7. **Descida do degrau de partida.** Quando o orquestrador confere uma etapa e ela passou, ele registra com um comando. Três etapas seguidas registradas como resolvidas de primeira baixam o degrau de partida em um.

O degrau de partida começa em 1 (Haiku), como no guia.

Detalhes que fecham as regras:

- **Uma chamada barrada não conta como tentativa.** O gancho confere tudo primeiro e só conta quando deixa passar.
- **Uma etapa, um executor por vez.** Trabalho em paralelo usa etapas diferentes. Duas chamadas simultâneas para a mesma etapa são tratadas em fila, e a segunda é vista como nova tentativa.
- **Combinações fora da tabela.** Uma chamada atende a um degrau se o modelo for mais forte que o do degrau, ou igual com esforço igual ou maior. Opus com esforço `low`, por exemplo, vale como degrau 3.
- **Quais chamadas o gancho olha.** Só as delegações para `executor` e `conselheiro`, e só em projeto com o modo ligado. Qualquer outra delegação passa sem interferência, então o `semana-cheia` continua funcionando numa sessão normal.
- **Escada nova.** Ao escrever um plano novo, o orquestrador zera a escada com um comando. O `ligar` também zera.
- **Onde fica.** Em `memoria/escada/`, um arquivo por etapa mais um histórico que você pode ler. Cada arquivo é gravado com trava, para chamadas simultâneas não se atropelarem.
- **Como o orquestrador acha os comandos.** O aviso de início de sessão e as mensagens do gancho trazem o comando completo, sempre com o caminho atual do plugin.

### Limites honestos da escada

- Ela conta tentativas, não julga qualidade. Se o orquestrador aceitar um resultado ruim como bom, a escada não percebe. A regra do guia "nunca aceite feito sem evidência" e o `/goal` cobrem essa parte.
- A descida depende de o orquestrador registrar que a etapa passou. Se ele esquecer, o custo fica um pouco maior, mas nunca fica preso num nível baixo.
- Se outra coisa barrar a delegação depois de o gancho da escada ter deixado passar (uma permissão negada, por exemplo), a tentativa já foi contada e a escada sobe um degrau antes da hora. O erro é sempre para cima.
- Um orquestrador decidido a burlar ainda consegue, editando o plano para inventar etapa nova. A escada resolve a "pena", que é o problema real, não má-fé.
- Ela vale só em projeto com o Modo Deus ligado. Levar a escada para as sessões normais do `semana-cheia` é um trabalho separado, fora deste.

## Mudanças em relação ao texto do guia

O texto do guia entra inteiro. São três acréscimos, e uma linha alterada:

1. **Linhas alteradas:** no orquestrador, `tools: Agent(executor), ...` vira `tools: Agent(executor, conselheiro), Skill, ...`. No executor, a linha `tools:` ganha `Skill`. Sem isso a trava impediria o conselheiro e as skills do guia não funcionariam.
2. **Acréscimo no orquestrador:** uma seção "Escada" depois das 7 regras do guia.
3. **Acréscimo no CLAUDE.md do projeto:** a seção da escada, e uma linha dizendo que neste projeto a delegação segue a escada e não a tabela de níveis do `semana-cheia` (os agentes `sc-*` ficam fora da trava). O resto do `semana-cheia` continua valendo.
4. **Arquivo novo:** `conselheiro.md`.

O HTML original fica guardado dentro do plugin como referência.

## Decisões que tomei por você (corrija se quiser)

- O plugin entra no seu mercado local que já existe (`tromb-local`, na pasta `C:\Users\tromb\.claude\plugins-local\flow-cinema`), ao lado do `flow-cinema`.
- Grava em `.claude/settings.json`, como o guia, e não em `settings.local.json`.
- A escada não freia quando o `semana-cheia` estiver em modo ECONOMICO ou RESERVA. Você pediu "sem pena". A linha de ritmo continua aparecendo para você decidir.
- O conselheiro pode ler e rodar comandos (para reproduzir o erro), mas não edita arquivos.
- O plano em `memoria/plano.md` passa a marcar cada etapa com `[etapa:N]`. É um acréscimo ao formato do guia, necessário para a escada contar direito.
- O gancho da escada só olha delegações para `executor` e `conselheiro`.
- O topo da escada é Opus `xhigh`. Fable fica de fora.
- Scripts em Node, sem dependências externas, como o `semana-cheia`.

## Como vou garantir que não tem bug

- **Testes automáticos dos scripts:** liga/desliga (settings com outras chaves, settings inválido, CLAUDE.md existente, rodar duas vezes, desfazer e comparar byte a byte) e a escada (cada regra acima, incluindo dois executores ao mesmo tempo).
- **Testes de ponta a ponta com sessões reais**, em projeto descartável: a sessão abre como orquestrador, a trava deixa passar só executor e conselheiro, o gancho barra nível baixo, uma tarefa feita para falhar duas vezes aciona o conselheiro, e o `desligar` devolve tudo.
- **Conferência final com você no app desktop**, para o item 1 da lista do que falta validar.
- Só digo que está pronto com a saída dos testes na mão.

## Fora deste trabalho

- Escada nas sessões normais do `semana-cheia`.
- Publicar o plugin.
- Mexer no `semana-cheia`.
