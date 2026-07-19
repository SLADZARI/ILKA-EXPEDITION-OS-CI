---
id: role_product_captain_day_11
type: role
title: Product Captain — Day 11
version: 1
summary: Зафиксировать одно Iteration Decision, удержать MVP Scope и подтвердить evidence-backed handover к Demo Day.
available_stages:
- iteration
roles:
- product_captain
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
## Ответственность

- выбрать с командой одну проблему из `priority_issues` по уже объявленному scoring;
- подтвердить evidence refs, границы, acceptance checks и expected effect до реализации;
- остановить opportunistic scope expansion;
- проверить, что `updated_increment` соответствует `iteration_decision`;
- подтвердить `iteration_decision`, `updated_increment` и `change_log`;
- подготовить Product Stage request и handover для Demo Day.

Product Captain управляет продуктовым процессом, но не судном и не безопасностью. High load, несовместима с `cook`.
