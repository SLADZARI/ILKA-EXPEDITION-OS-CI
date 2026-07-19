---
id: onboard_cook_day_07
type: onboard
title: Cook — Day 7
version: 1
summary: Обеспечить питание команды при облегчённой продуктовой нагрузке в Prototype Stage.
available_stages:
- prototype
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
Cook получает только low-load `product_support`. Можно пройти короткий сценарий, отметить разрыв и сохранить evidence асинхронно. Contribution Rating нормализуется по доступной нагрузке.
