---
name: nova-skill
description: Cria uma skill nova no projeto para uma tarefa repetitiva, a partir do modelo do Modo Deus.
---

1. Pergunte ao usuário o nome da skill (minúsculas com hífen) e a tarefa repetitiva que ela vai fazer.
2. Se `.claude/skills/<nome>/SKILL.md` já existir no projeto, pare e avise: não sobrescreva.
3. Leia `${CLAUDE_PLUGIN_ROOT}/modelos/skill-modelo.md`.
4. Crie `.claude/skills/<nome>/SKILL.md` no projeto com esse modelo, trocando o nome, a descrição (uma frase dizendo quando usar) e os passos. Mantenha "Versão: v1" e deixe a seção "Lições aprendidas" vazia, como no modelo.
5. Mostre ao usuário o arquivo criado e confira que `name` é igual ao nome da pasta.
