---
id: role_validation_lead_day_10
type: role
title: Validation Lead — Day 10
version: 1
summary: Собрать first-party feedback, синтезировать сигналы и подготовить evidence-backed priority issues для Iteration.
available_stages:
- user_feedback
roles:
- validation_lead
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

- подготовить нейтральный feedback guide и collection plan;
- фиксировать consent, source, timestamp, launched version и raw evidence;
- отделять наблюдение пользователя от интерпретации команды;
- сопоставлять qualitative signals с launch metrics и known limitations;
- сохранять repeated signals, contradictions и outliers;
- ранжировать issue candidates по predeclared scoring;
- передать Stage 11 проблемы и evidence, не выбирая реализацию.

Medium load. На Stage 10 несовместима с `cook` из-за low-load ограничения Cook.
