---
id: role_validation_lead_day_05
type: role
title: Validation Lead — Day 5
version: 1
summary: Проверить traceability каждой alternative до evidence и отделить факты от интерпретации.
available_stages:
- product_decision
roles:
- validation_lead
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

- проверить evidence refs и критерии каждой alternative;
- отметить unsupported claims и contradictory signals;
- сформулировать риски и условия пересмотра;
- проверить, что rationale отражает результат vote, а не переписывает его;
- сохранить minority objections.

Medium load. Не назначается участнику в роли `cook`.
