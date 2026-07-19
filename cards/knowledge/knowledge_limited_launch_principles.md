---
id: knowledge_limited_launch_principles
type: knowledge
title: Принципы ограниченного Launch
version: 1
summary: Как провести проверочный запуск фиксированной версии для ограниченной аудитории без превращения Stage 09 в production release.
available_stages:
- launch
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
## Ограниченный Launch

Launch проверяет доступность основного scenario на подтверждённом Working Increment.

- аудитория, канал и версия фиксируются до первой exposure;
- участникам сообщаются назначение проверки и известные ограничения;
- out-of-scope функции не добавляются ради впечатления;
- доступ, данные, поддержка и stop conditions определены заранее;
- critical blocker останавливает Launch до устранения либо явного Captain override;
- Launch не доказывает market fit и не заменяет Stage 10 User Feedback.
