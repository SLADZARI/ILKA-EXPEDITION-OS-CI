---
id: role_demo_lead_day_12
type: role
title: Demo Lead — Day 12
version: 1
summary: Подготовить и провести воспроизводимый Demo финальной версии продукта с offline fallback и evidence capture.
available_stages:
- demo_day
roles:
- demo_lead
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

- зафиксировать Demo version и основной user scenario;
- подготовить runbook, роли выступающих и timebox;
- проверить данные, доступы и устройство показа;
- подготовить offline fallback без подмены результата;
- провести репетицию и устранить critical blockers;
- провести Demo и сохранить вопросы, наблюдения и evidence refs;
- передать воспроизводимые материалы в `shore_package`.

High load. Несовместима с `cook`.
