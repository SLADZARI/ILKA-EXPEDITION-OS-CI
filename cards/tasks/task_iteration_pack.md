---
id: task_iteration_pack
type: task
title: Выполнить одну evidence-backed Iteration
version: 1
summary: Зафиксировать Iteration Decision, обновить Working Increment и собрать traceable Change Log без расширения MVP Scope.
available_stages:
- iteration
roles:
- build_lead
estimated_minutes: 60
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
  - photo
---
## Обязательный результат

- `iteration_decision`;
- `updated_increment`;
- `change_log`.

## Iteration Decision

Зафиксируй:

- selected `priority_issue_id` и его rank/scoring;
- feedback, signal и metric evidence refs;
- baseline version;
- точную границу изменения и исключённые альтернативы;
- acceptance checks, expected effect и rollback note;
- решение о каждом затронутом known limitation.

## Updated Increment

- имеет новый stable version ID;
- содержит только утверждённую итерацию;
- сохраняет primary user scenario;
- не требует out-of-scope функции;
- готов к воспроизводимой демонстрации.

## Change Log

Каждая запись связывает issue ID, change description, artifact/version refs, author, ISO 8601 timestamp, verification result и evidence refs. Отдельно перечисли remaining issues, reclassified known limitations и Demo Day caveats.

## Completion

Заверши task только после issue acceptance checks, regression основного сценария и повторной проверки прежних acceptance criteria. Локальная completion остаётся `pending` до синхронизации.
