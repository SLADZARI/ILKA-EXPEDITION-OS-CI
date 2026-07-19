---
id: knowledge_iteration_verification
type: knowledge
title: Проверка Iteration и regression
version: 1
summary: Как доказать, что выбранная проблема исправлена, а ранее работающий основной сценарий не сломан.
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
## Verification sequence

1. Зафиксируй target version до проверки.
2. Выполни acceptance checks выбранной проблемы.
3. Повтори primary user scenario.
4. Перепроверь ранее подтверждённые `acceptance_criteria`.
5. Обнови статус `known_limitations` и критических blockers.
6. Для каждого результата сохрани `pass`, `fail` или `blocked`, timestamp и evidence refs.

Iteration считается готовой к Demo Day только при traceable change log и отсутствии unresolved critical blocker. Команда не должна объявлять успех по локальному UI-state или одному субъективному впечатлению.
