---
id: role_product_captain_day_10
type: role
title: Product Captain — Day 10
version: 1
summary: Удержать границу User Feedback, обеспечить traceability и подтвердить outputs без выбора Iteration solution.
available_stages:
- user_feedback
roles:
- product_captain
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

- подтвердить feedback scope, аудиторию, launched version и collection methods;
- не допускать наводящих вопросов и подмены observation командным мнением;
- требовать разделения raw evidence, interpretation и priority scoring;
- проверить связь feedback с distribution log, launch metrics и known limitations;
- не утверждать feature или Iteration solution на Stage 10;
- подтвердить `feedback_log`, `signal_summary` и `priority_issues`;
- подготовить `request_stage_advance` после выполнения DoD.

High load. Несовместима с `cook`.
