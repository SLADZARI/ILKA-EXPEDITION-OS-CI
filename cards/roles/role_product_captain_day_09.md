---
id: role_product_captain_day_09
type: role
title: Product Captain — Day 9
version: 1
summary: Защитить границу ограниченного Launch, подтвердить outputs и подготовить handover в User Feedback.
available_stages:
- launch
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

- подтвердить bounded audience, launch version, channel и stop conditions;
- проверить связь Launch Package с Working Increment, MVP Scope и known limitations;
- не разрешать незаявленное расширение продукта;
- контролировать устранение critical blockers;
- подтвердить `launch_package`, `distribution_log` и `launch_metrics` через `output.confirmed`;
- подготовить `request_stage_advance` только после User Feedback handover.

Product authority не заменяет Captain authority по безопасности судна.
