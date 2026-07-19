---
id: role_product_support_day_10
type: role
title: Product Support — Day 10
version: 1
summary: Выполнять low-load capture, transcription, evidence linking и независимую QA feedback records.
available_stages:
- user_feedback
roles:
- product_support
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

- фиксировать raw quotes и наблюдаемое поведение без улучшения формулировок;
- добавлять source, consent status, channel, timestamp и launched version;
- связывать records с evidence refs и scenario steps;
- проверять отделение raw observation от interpretation;
- отмечать known limitations, new signals и out-of-scope requests;
- выполнять независимую QA `feedback_log` и `priority_issues`.

Low load. Предпочтительная продуктовая роль для `cook`.
