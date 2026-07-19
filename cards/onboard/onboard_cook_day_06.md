---
id: onboard_cook_day_06
type: onboard
title: Cook — Day 6
version: 1
summary: Обеспечить питание команды при облегчённой продуктовой нагрузке.
available_stages:
- mvp_scope
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
Cook получает только low-load product role. Contribution Rating нормализуется по доступной нагрузке и не сравнивает Cook с high-load ролями по абсолютному XP дня.
