---
id: onboard_cook_day_08
type: onboard
title: Cook — Day 8
version: 1
summary: Обеспечить питание команды при облегчённой продуктовой нагрузке в Build Stage.
available_stages:
- build
roles:
- cook
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
Cook получает только low-load `product_support`: может выполнить один acceptance check, сохранить evidence или провести короткий retest асинхронно. Contribution Rating нормализуется по доступной нагрузке.
