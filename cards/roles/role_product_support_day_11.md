---
id: role_product_support_day_11
type: role
title: Product Support — Day 11
version: 1
summary: Выполнить low-load evidence QA, regression capture и актуализацию change log для ограниченной Iteration.
available_stages:
- iteration
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

- проверить связь selected issue с feedback и metric evidence;
- фиксировать version, timestamps и результаты acceptance/regression checks;
- проверить, что change log не скрывает дополнительные изменения;
- обновить remaining issues и known limitations;
- подготовить краткие evidence refs для Demo Day handover.

Low load и совместима с `cook`.
