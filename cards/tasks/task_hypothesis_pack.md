---
id: task_hypothesis_pack
type: task
title: Собрать Hypothesis Pack
version: 1
summary: Зафиксировать hypothesis statement, assumptions map и success criteria.
available_stages:
- hypothesis
roles:
- product_captain
estimated_minutes: 20
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
- `hypothesis_statement`;
- `assumptions_map`;
- `success_criteria`.

## Definition of Done
- гипотеза связана с `problem_statement` и evidence;
- assumptions разделены на доказанные, недоказанные и критические;
- каждый success criterion содержит signal, threshold и observation window;
- для критических criteria указан disconfirming signal;
- каждый output сохранён отдельно и подтверждён через `output.confirmed`.
