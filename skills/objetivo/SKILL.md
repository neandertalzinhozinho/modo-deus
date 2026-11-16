---
name: objetivo
description: Monta a linha do /goal (estado final, comando que prova e limite de turnos) para o usuário enviar.
---

Peça ao usuário estas três coisas (pergunte só pelo que faltar):

1. O estado final que dá para medir.
2. O comando que prova que chegou lá.
3. O limite de turnos.

Monte a linha neste formato e entregue dentro de um bloco de código:

```
/goal <estado final> Mostre a saída de <comando> na conversa como prova. Pare depois de <N> turnos se não chegar lá.
```

Exemplo: `/goal Todos os testes passam (npm test sem nenhuma falha) e o resumo da entrega está em memoria/plano.md. Mostre a saída do npm test na conversa como prova. Pare depois de 20 turnos se não chegar lá.`

Explique que só o usuário consegue enviar o /goal: ele precisa copiar o bloco e enviar como mensagem dele.

Avise: o avaliador só julga o que apareceu na conversa, ele não roda comando nem abre arquivo. Por isso a condição pede para mostrar a saída do comando na conversa.

Lembre: `/goal` sozinho mostra o status e `/goal clear` remove o objetivo. Ele vale só para a sessão atual.
