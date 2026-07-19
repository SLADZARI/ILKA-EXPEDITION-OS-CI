---
id: knowledge_build_verification
type: knowledge
title: Проверка Build перед Launch
version: 1
summary: Как выполнить test plan на Working Increment, классифицировать defects и подготовить воспроизводимый Launch handover.
available_stages:
- build
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
## Проверка

Для каждого acceptance criterion записываются:

- шаг и начальное состояние;
- фактический результат;
- evidence reference;
- статус `passed`, `failed` или `not_tested`;
- defect/limitation и severity;
- retest status после исправления.

Critical blocker — ошибка, из-за которой основной scenario нельзя безопасно или воспроизводимо пройти в ограниченном Launch. Такой blocker должен быть устранён либо Captain явно применяет override с причиной; прошлые записи не редактируются.
