---
id: task_validation_pack
type: task
title: Собрать Validation Pack
version: 1
summary: Сохранить validation evidence, insight summary и evidence-based решение по гипотезе.
available_stages:
- validation
roles:
- product_captain
estimated_minutes: 25
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

- `validation_evidence`;
- `insight_summary`;
- `hypothesis_decision`.

## Definition of Done

- каждый critical assumption имеет evidence record или явно зафиксированную причину отсутствия данных;
- каждый record содержит source, method, observed signal, linked criterion, timestamp и limitations;
- observations отделены от interpretations;
- решение имеет одно значение: `supported`, `rejected` или `inconclusive`;
- решение использует только predeclared success criteria и disconfirming signals;
- противоречащие и слабые evidence не скрыты;
- каждый output сохранён отдельно и подтверждён через `output.confirmed`.
