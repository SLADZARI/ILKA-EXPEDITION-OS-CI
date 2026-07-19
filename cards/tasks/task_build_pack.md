---
id: task_build_pack
type: task
title: Собрать Build Pack
version: 1
summary: Создать проверяемый Working Increment, traceable build log и классифицированный список известных ограничений.
available_stages:
- build
roles:
- build_lead
estimated_minutes: 50
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

- `working_increment`;
- `build_log`;
- `known_limitations`.

## Definition of Done

- основной end-to-end scenario работает на Working Increment;
- реализованные элементы связаны с `mvp_scope` и acceptance criteria;
- Prototype Test Plan выполнен на текущей версии;
- каждый check имеет result и evidence reference;
- out-of-scope не требуется для ограниченного Launch;
- unresolved critical blockers отсутствуют;
- build log содержит версии, изменения, dependencies и важные решения;
- known limitations содержат severity, impact, workaround, owner и launch relevance;
- Launch handover объясняет запуск, reset, данные и способ воспроизведения;
- все три outputs подтверждены через `output.confirmed`.
