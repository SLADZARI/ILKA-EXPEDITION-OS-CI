---
id: knowledge_mvp_scope_principles
type: knowledge
title: Принципы MVP Scope
version: 1
summary: Как отделить минимальный проверяемый продукт от полного будущего решения.
available_stages:
- mvp_scope
estimated_minutes: 7
required: true
offline: true
requires_acknowledgement: true
completion_event_type: card.acknowledged
evidence:
  required: true
  accepted_types:
  - acknowledgement
---
## Правило

MVP должен проверить Product Decision с минимальным количеством функций, данных и ручных операций.

## Проверка границы

- каждый in-scope item проверяет конкретное предположение;
- элемент без тестируемой ценности удаляется или переносится в `out_of_scope`;
- инфраструктура допускается только если без неё нельзя провести проверку;
- удобство будущего масштабирования не является самостоятельным основанием;
- безопасность, приватность и обязательная целостность данных не сокращаются ради скорости.
