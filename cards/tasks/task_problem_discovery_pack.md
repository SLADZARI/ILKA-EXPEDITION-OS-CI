---
id: task_problem_discovery_pack
type: task
title: Собрать Problem Discovery Pack
version: 1
summary: Зафиксировать problem statement, target user profile и evidence log.
available_stages: [problem_discovery]
roles: [product_captain]
estimated_minutes: 20
required: true
offline: true
requires_acknowledgement: false
completion_event_type: task.completed
evidence:
  required: true
  accepted_types: [text, file, link, audio, photo]
---
## Обязательный результат
- `problem_statement`;
- `target_user_profile`;
- `evidence_log`.

## Definition of Done
Каждый output сохранён отдельно, содержит источник данных и подтверждён через `output.confirmed`.
