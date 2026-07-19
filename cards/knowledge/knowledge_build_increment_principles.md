---
id: knowledge_build_increment_principles
type: knowledge
title: Принципы Working Increment
version: 1
summary: Как превратить Prototype в минимальный рабочий результат без скрытого расширения MVP Scope.
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
## Правило Build

Working Increment реализует один основной end-to-end scenario из Prototype и остаётся внутри `mvp_scope`.

- обязательные данные и состояния работают настолько, насколько нужно для проверки;
- ручные операции и stubs допустимы, если отмечены явно;
- безопасность, приватность и целостность данных не заменяются демонстрационной имитацией;
- каждое изменение связано с acceptance criterion или устранением подтверждённого blocker;
- удобство масштабирования само по себе не является причиной расширять Build.
