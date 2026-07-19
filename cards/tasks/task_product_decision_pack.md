---
id: task_product_decision_pack
type: task
title: Собрать Product Decision Pack
version: 1
summary: Создать decision draft, провести vote round и сохранить подтверждённые outputs с rejected alternatives и objections.
available_stages:
- product_decision
roles:
- product_captain
estimated_minutes: 30
required: true
offline: true
requires_acknowledgement: false
completion_event_type: task.completed
evidence:
  required: true
  accepted_types:
  - text
  - file
  - link
  - audio
  - photo
---
## Обязательный результат

- `product_decision`;
- `decision_rationale`;
- `rejected_alternatives`.

## Definition of Done

- draft содержит один question, 2–5 alternatives, criteria и evidence refs;
- round содержит frozen eligible voters;
- каждый eligible voter проголосовал или явно воздержался;
- winning option получила strict majority всех eligible voters либо Captain override записан отдельным событием;
- rationale содержит evidence, risks, assumptions и review triggers;
- rejected alternatives содержат причины отказа и условия возможного возврата;
- objections и minority positions сохранены;
- все три outputs подтверждены через `output.confirmed`.
