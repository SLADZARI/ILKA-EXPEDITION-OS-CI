---
id: task_prototype_pack
type: task
title: Собрать Prototype Pack
version: 1
summary: Создать проверяемый Prototype, воспроизводимый test plan и классифицированный список открытых вопросов.
available_stages:
- prototype
roles:
- build_lead
estimated_minutes: 40
required: true
offline: true
requires_acknowledgement: false
completion_event_type: task.completed
evidence:
  required: true
  accepted_types:
  - text
  - file
  - link
  - audio
  - photo
---
## Обязательный результат

- `prototype`;
- `prototype_test_plan`;
- `open_questions`.

## Definition of Done

- Prototype покрывает один основной end-to-end scenario;
- каждый проверяемый шаг связан минимум с одним acceptance criterion;
- ни одна out-of-scope функция не нужна для walkthrough;
- ручные симуляции и ограничения отмечены явно;
- другой участник может выполнить test plan без устного восстановления замысла;
- evidence capture и stop conditions определены;
- open questions содержат category, blocking flag, owner и next validation step;
- Build handover перечисляет данные, зависимости и известные ограничения;
- все три outputs подтверждены через `output.confirmed`.
