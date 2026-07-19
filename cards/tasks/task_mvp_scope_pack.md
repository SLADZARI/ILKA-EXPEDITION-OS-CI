---
id: task_mvp_scope_pack
type: task
title: Собрать MVP Scope Pack
version: 1
summary: Зафиксировать in-scope, out-of-scope и acceptance criteria для перехода к Prototype.
available_stages:
- mvp_scope
roles:
- scope_lead
estimated_minutes: 35
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

- `mvp_scope`;
- `out_of_scope`;
- `acceptance_criteria`.

## Definition of Done

- каждый in-scope item связан с Product Decision или обязательным ограничением;
- для каждого in-scope item есть минимум один acceptance criterion;
- manual workaround обозначен явно;
- зависимости и данные перечислены;
- offline/server-confirmation границы указаны;
- out-of-scope содержит причины и условия возможного возврата;
- Scope Lead и Product Captain подготовили build handover;
- все три outputs подтверждены через `output.confirmed`.
