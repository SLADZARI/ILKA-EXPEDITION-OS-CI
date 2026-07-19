---
id: knowledge_prototype_test_plan
type: knowledge
title: Prototype Test Plan
version: 1
summary: Как подготовить воспроизводимый walkthrough и связать каждый шаг с acceptance criteria.
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
## Минимальная структура

- target user и начальное состояние;
- основной scenario и последовательность шагов;
- ожидаемый результат каждого шага;
- ссылки на `acceptance_criteria`;
- способ фиксации evidence;
- stop conditions и критические ошибки;
- ручные симуляции и известные ограничения.

План должен позволять другому участнику провести walkthrough без устного восстановления замысла автора.
