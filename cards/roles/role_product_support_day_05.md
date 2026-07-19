---
id: role_product_support_day_05
type: role
title: Product Support — Day 5
version: 1
summary: Проверить одну alternative, проголосовать и зафиксировать сильнейший аргумент против собственного выбора.
available_stages:
- product_decision
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

- прочитать decision draft и evidence refs;
- сообщить конфликт или недостающие данные до открытия round;
- отдать attributable ballot или явно `abstain`;
- не голосовать от имени другого участника;
- назвать сильнейший objection к выбранному варианту.

Low load. Допустима для `cook`.
