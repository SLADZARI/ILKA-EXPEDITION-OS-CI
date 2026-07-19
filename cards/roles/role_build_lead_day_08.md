---
id: role_build_lead_day_08
type: role
title: Build Lead — Day 8
version: 1
summary: Собрать целостный Working Increment, обеспечить traceable build log и подготовить технический handover в Launch.
available_stages:
- build
roles:
- build_lead
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

- определить минимальный порядок сборки по основному scenario;
- интегрировать только подтверждённые in-scope элементы;
- вести версии, зависимости, решения и evidence в `build_log`;
- выполнить Prototype Test Plan на Working Increment;
- классифицировать defects и `known_limitations`;
- устранить critical blockers и подготовить воспроизводимый Launch handover.

High load. Несовместима с `cook`.
