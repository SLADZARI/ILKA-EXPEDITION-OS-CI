---
id: knowledge_prototype_principles
type: knowledge
title: Принципы проверяемого Prototype
version: 1
summary: Как создать минимальный артефакт для проверки сценария, не превращая Prototype в преждевременный Build.
available_stages:
- prototype
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
## Назначение

Prototype проверяет основной пользовательский сценарий и понимание решения. Он не доказывает production readiness.

## Граница

- покрывает один основной end-to-end scenario;
- использует только подтверждённый `mvp_scope`;
- не требует out-of-scope функции для walkthrough;
- допускает ручную симуляцию, если она отмечена явно;
- показывает состояния, действия и ожидаемые результаты;
- сохраняет ограничения, допущения и открытые вопросы.

Допустимы paper prototype, storyboard, service script, clickable mockup, physical model или structured simulation.
