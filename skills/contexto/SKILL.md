---
name: contexto
description: Troca o ponto da auto-compactação do Modo Deus entre 40 e 60 por cento neste projeto.
disable-model-invocation: true
---

40 é o do dia a dia e 60 o de tarefa grande; vale a partir da próxima sessão.

Se o usuário não passou 40 nem 60, pergunte qual dos dois antes de rodar.

Depois rode exatamente este comando com a ferramenta Bash e mostre a saída ao usuário sem resumir:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/modo.js" contexto $ARGUMENTS
```
