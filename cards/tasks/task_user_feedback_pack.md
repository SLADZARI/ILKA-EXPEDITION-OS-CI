---
id: task_user_feedback_pack
type: task
title: Собрать и синтезировать User Feedback
version: 1
summary: Сформировать traceable feedback log, signal summary и ranked priority issues по фиксированной Launch version.
available_stages:
- user_feedback
roles:
- validation_lead
estimated_minutes: 55
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

- `feedback_log`;
- `signal_summary`;
- `priority_issues`.

## Feedback record

Каждая запись содержит:

- stable feedback ID и launched version;
- pseudonymous participant reference;
- source type, channel и ISO 8601 timestamp;
- consent status;
- raw quote или observed behavior;
- отдельную interpretation;
- scenario step, evidence refs и tags;
- связь с known limitation, если она существует.

## Definition of Done

- scope соответствует bounded Launch audience;
- есть first-party user evidence;
- raw observations отделены от interpretations;
- repeated signals, contradictions и outliers сохранены;
- summary сопоставлен с launch metrics и sample coverage;
- known limitations отделены от new signals;
- issue candidates ранжированы по заранее объявленным frequency, severity, impact и confidence;
- каждый priority issue имеет evidence refs;
- Stage 10 не выбирает feature или Iteration solution;
- три outputs подтверждены через `output.confirmed`.
