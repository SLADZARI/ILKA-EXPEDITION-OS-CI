---
id: role_demo_lead_day_09
type: role
title: Demo Lead — Day 9
version: 1
summary: Подготовить и провести воспроизводимый ограниченный Launch фиксированной версии Working Increment.
available_stages:
- launch
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

- собрать executable `launch_package`;
- убедиться, что основной scenario доступен без out-of-scope функций;
- провести запуск одной зафиксированной версии для bounded audience;
- сообщить назначение проверки, known limitations и способ поддержки;
- вести `distribution_log` с version, channel, timestamp и delivery status;
- остановить Launch при critical blocker и сохранить evidence.

High load. Несовместима с `cook`.
