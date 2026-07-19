---
id: role_build_lead_day_11
type: role
title: Build Lead — Day 11
version: 1
summary: Реализовать одну утверждённую итерацию, сохранить version traceability и доказать отсутствие regression.
available_stages:
- iteration
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

- сохранить baseline artifact и target version;
- реализовать только изменение, описанное в `iteration_decision`;
- не подменять выбранную проблему более удобной технической задачей;
- выполнить issue checks, primary scenario regression и предыдущие acceptance checks;
- связать каждое изменение с issue ID, evidence и verification result;
- обновить known limitations и подготовить демонстрируемый путь.

High load. На Stage 11 несовместима с `cook`.
