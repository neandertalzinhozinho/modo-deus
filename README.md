# modo-deus

Plugin do Claude Code que liga o "Modo Deus" por projeto: um orquestrador em Opus que só planeja, delega e confere, executores baratos que fazem o trabalho, e uma escada que sobe ou desce o modelo e o esforço por regra, não por vontade do modelo.

Repositório privado de backup. Os textos em `modelos/` e o arquivo em `referencia/` vêm do guia "Modo Deus do Claude", de Matheus Fonseca. Não publique este repositório.

## Instalar numa máquina nova

Precisa do Node no PATH e do Claude Code. Como o repositório é privado, a máquina precisa estar logada no GitHub (`gh auth login`).

No Claude Code:

```
/plugin marketplace add neandertalzinhozinho/modo-deus
```

```
/plugin install modo-deus@modo-deus-backup
```

Depois abra uma sessão nova.

Nesta máquina de origem o plugin já está instalado pelo mercado local `tromb-local`. Não instale os dois ao mesmo tempo: os ganchos rodariam em dobro.

### Instalar à mão (sem o comando acima)

```bash
git clone https://github.com/neandertalzinhozinho/modo-deus.git
```

Ponha a pasta clonada dentro de um mercado local (uma pasta com `.claude-plugin/marketplace.json` que aponte para ela) e instale por esse mercado.

## Usar

| Comando | O que faz |
|---|---|
| `/modo-deus:ligar` | Monta o Modo Deus no projeto aberto. Vale a partir da próxima sessão nesse projeto. |
| `/modo-deus:desligar` | Desfaz. O projeto volta a abrir normal. |
| `/modo-deus:status` | Mostra se está ligado, o degrau de partida e as etapas abertas. |
| `/modo-deus:contexto 40` ou `60` | Troca o ponto da compactação: 40 no dia a dia, 60 em tarefa grande. |
| `/modo-deus:objetivo` | Monta a linha do `/goal` para você enviar. |
| `/modo-deus:nova-skill` | Cria uma skill no projeto com "Versão" e "Lições aprendidas". |

No início de cada sessão aparece uma linha `[modo-deus]` dizendo se o modo está ligado no projeto.

## A escada

| Degrau | Modelo | Esforço |
|---|---|---|
| 1 | Haiku | low |
| 2 | Sonnet | medium |
| 3 | Sonnet | high |
| 4 | Opus | high |
| 5 | Opus | xhigh |

- Cada delegação ao executor leva `[etapa:N]`, modelo e esforço. A etapa tem que estar no `memoria/plano.md`.
- Repetiu a etapa, o gancho exige um degrau acima.
- Da 3ª tentativa em diante, exige antes uma consulta ao conselheiro (Opus).
- Máximo de 6 tentativas por etapa. Depois o gancho manda parar e mostrar o problema.
- Três etapas resolvidas de primeira baixam o degrau de partida. Uma etapa que precisou repetir sobe.

## O que tem aqui

| Pasta | Conteúdo |
|---|---|
| `modelos/` | Os agentes (orquestrador, executor, conselheiro), as regras do CLAUDE.md e o modelo de skill |
| `scripts/` | `modo.js` e `escada.js` (comandos), `gancho.js` e `sessao.js` (ganchos), `lib/` (a lógica) |
| `skills/` | Os seis comandos `/modo-deus:*` |
| `hooks/` | A ligação dos ganchos |
| `testes/` | Testes automáticos e, em `e2e/`, os testes com sessões reais |
| `referencia/` | O guia original, guardado como veio |
| `docs/` | O desenho e o plano de construção |

## Testar

Testes automáticos (não gastam limite de uso):

```bash
node --test
```

Testes com sessões reais do Claude (gastam limite de uso; com o plugin instalado, use a variável como abaixo):

```bash
MODO_DEUS_INSTALADO=1 node testes/e2e/roda.js
```

O resultado da última rodada completa está em `testes/e2e/RESULTADO.md`.
