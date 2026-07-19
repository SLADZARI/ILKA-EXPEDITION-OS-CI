---
id: onboard_order_day_05
type: onboard
title: Order — Day 5
version: 1
summary: Выполнить судовую обязанность по briefing Captain и участвовать в Product Decision только без ущерба безопасности.
available_stages:
- product_decision
estimated_minutes: 5
required: true
offline: true
requires_acknowledgement: true
completion_event_type: card.acknowledged
evidence:
  required: true
  accepted_types:
  - acknowledgement
---
## Ограничение

Роль выполняется только в пределах указаний Captain и не даёт полномочий по управлению судном. Любой vote или discussion приостанавливается на время safety-critical действий.
