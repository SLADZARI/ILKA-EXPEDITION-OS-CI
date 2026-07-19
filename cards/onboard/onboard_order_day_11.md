---
id: onboard_order_day_11
type: onboard
title: Order — Day 11
version: 1
summary: Поддерживать порядок рабочих зон и сохранность устройств и evidence во время Iteration.
available_stages:
- iteration
roles:
- order
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
Сохраняй проходы свободными, устройства защищёнными, а локальные evidence-файлы — привязанными к stable IDs. Уборка не должна уничтожать черновики, ожидающие синхронизации.
