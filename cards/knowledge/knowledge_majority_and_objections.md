---
id: knowledge_majority_and_objections
type: knowledge
title: Большинство, воздержание и objections
version: 1
summary: Как работает quorum, strict majority и фиксация несогласия без стирания позиции меньшинства.
available_stages:
- product_decision
estimated_minutes: 7
required: true
offline: true
requires_acknowledgement: true
completion_event_type: card.acknowledged
evidence:
  required: true
  accepted_types:
  - acknowledgement
---
## Правило MVP

Все eligible voters должны выбрать option или `abstain`. Побеждает только option, получившая больше половины голосов всех eligible voters. Воздержание не уменьшает denominator.

## Objections

Перед finalization команда фиксирует сильнейшие objections к победившему варианту и условия пересмотра. Minority position не удаляется. Tie или отсутствие strict majority означает новый round, если Captain не применил отдельный override с причиной.
