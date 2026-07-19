---
id: role_product_support_day_08
type: role
title: Product Support — Day 8
version: 1
summary: Выполнить независимую проверку Working Increment, сохранить evidence и повторно проверить исправления.
available_stages:
- build
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

- пройти основной scenario по test plan;
- сравнить фактические результаты с acceptance criteria;
- записать шаги воспроизведения, evidence и severity;
- повторно проверить исправленные defects;
- отличать blocker от улучшения и не расширять scope самостоятельно.

Low load. Выполняет QA-функцию Stage 08 и допустима для `cook`.
