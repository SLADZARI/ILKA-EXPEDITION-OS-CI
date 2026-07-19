---
id: knowledge_shore_package_handover
type: knowledge
title: Проверяемый Shore Package
version: 1
summary: Минимальный состав финального пакета, который позволяет продолжить продуктовую работу после экспедиции.
available_stages:
- demo_day
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
## Shore Package — не архив без структуры

Пакет должен содержать:

- stable ID и версию финального `updated_increment`;
- Demo runbook и offline fallback;
- source map всех обязательных outputs Stage 01–12;
- `mvp_scope`, `out_of_scope` и acceptance results;
- Launch metrics, signal summary и priority issues;
- iteration decision и traceable change log;
- known limitations с severity, owner и recommended action;
- `next_steps` с приоритетом, владельцем и типом: maintain, validate, build или stop;
- integrity manifest с file refs, versions и ISO 8601 timestamps.

Shore Package считается переданным только после `output.confirmed`. Он не закрывает Expedition: финальный переход выполняет Captain через online `close_expedition` после закрытия Day 12.
