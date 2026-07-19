---
id: role_product_support_day_04
type: role
title: Product Support — Day 4
version: 1
summary: Выполнить одну ограниченную проверку, зафиксировать evidence record и указать ограничения результата.
available_stages:
- validation
roles:
- product_support
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

- выполнить назначенный validation action;
- сохранить источник и фактическое наблюдение без домысливания;
- связать evidence с `assumption_id` и criterion;
- указать качество данных и ограничения метода;
- сообщить blocker или contradictory signal Product Captain.

## Нагрузка

Low. Допустима для `cook`.
