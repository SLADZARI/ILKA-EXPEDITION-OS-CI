---
id: knowledge_hypothesis_flow
type: knowledge
title: Как собрать проверяемую гипотезу
version: 1
summary: Маршрут от problem statement и evidence к одной проверяемой гипотезе.
available_stages:
- hypothesis
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
## Маршрут
1. Зафиксировать пользователя, контекст и доказанную проблему.
2. Описать ожидаемое изменение поведения или результата.
3. Сформулировать причинное объяснение через `because`.
4. Разложить гипотезу на проверяемые assumptions.
5. Выбрать самые рискованные assumptions.
6. Установить наблюдаемые критерии подтверждения и опровержения.
