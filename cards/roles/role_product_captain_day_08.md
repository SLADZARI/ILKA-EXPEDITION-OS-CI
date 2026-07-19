---
id: role_product_captain_day_08
type: role
title: Product Captain — Day 8
version: 1
summary: Удержать Build в подтверждённом Scope, организовать проверку Working Increment и подготовить запрос на переход в Launch.
available_stages:
- build
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

- открыть Build от подтверждённых Prototype, test plan и Scope;
- согласовать порядок интеграции с Build Lead;
- останавливать новые функции без связи с acceptance criteria;
- организовать walkthrough и фиксацию failed checks;
- подтвердить `working_increment`, `build_log` и `known_limitations`;
- подготовить запрос на переход к `launch`.

High load. Несовместима с `cook`.
