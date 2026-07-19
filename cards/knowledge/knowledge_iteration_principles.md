---
id: knowledge_iteration_principles
type: knowledge
title: Принципы ограниченной итерации
version: 1
summary: Как выбрать одну evidence-backed проблему, зафиксировать решение до реализации и не расширить MVP Scope.
available_stages:
- iteration
estimated_minutes: 8
required: true
offline: true
requires_acknowledgement: true
completion_event_type: card.acknowledged
evidence:
  required: true
  accepted_types:
  - acknowledgement
---
## Одна проблема — одна итерация

До изменения продукта зафиксируй:

- stable ID выбранной записи из `priority_issues`;
- feedback и metric evidence refs;
- baseline version и затронутый user scenario step;
- ожидаемое изменение поведения;
- границы: что меняется и что явно не меняется;
- acceptance checks и ожидаемый signal/metric effect;
- риск, rollback note и нерешённые альтернативы.

Высокий priority score не разрешает скрыто расширять `mvp_scope`. Новая возможность из `out_of_scope` остаётся отложенной, если Captain не оформил отдельное корректирующее решение в append-only журнале.
