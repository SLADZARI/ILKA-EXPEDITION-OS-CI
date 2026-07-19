---
id: role_product_captain_day_12
type: role
title: Product Captain — Day 12
version: 1
summary: Удержать доказательную линию Demo Day, подтвердить финальные outputs и передать Captain готовность к завершению Expedition.
available_stages:
- demo_day
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

- подтвердить, что Demo использует authoritative `updated_increment`;
- проверить связь каждого тезиса с evidence;
- не допустить скрытого расширения `mvp_scope`;
- согласовать честное раскрытие known limitations;
- подтвердить `demo`, `shore_package` и `next_steps` через `confirm_output`;
- запросить закрытие Day 12 после выполнения Definition of Done;
- передать Captain completion summary и Shore Package ref.

Product Captain не закрывает Expedition и не создаёт следующий Stage. Команда `close_expedition` принадлежит только Captain и требует server confirmation.
