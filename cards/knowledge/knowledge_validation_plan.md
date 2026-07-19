---
id: knowledge_validation_plan
type: knowledge
title: Как составить Validation Plan
version: 1
summary: Как превратить critical assumptions и success criteria в выполнимый план проверки без подмены критериев после получения данных.
available_stages:
- validation
estimated_minutes: 8
required: true
offline: true
requires_acknowledgement: true
completion_event_type: card.acknowledged
evidence:
  required: true
  accepted_types:
  - acknowledgement
---
## Минимальный стандарт

Для каждого critical assumption зафиксируйте до начала проверки:

1. `assumption_id` и связь с `hypothesis_statement`;
2. метод проверки и доступный источник данных;
3. наблюдаемый signal;
4. threshold и observation window из `success_criteria`;
5. disconfirming signal;
6. ответственного и срок;
7. ограничения метода и требования к согласию пользователя.

Нельзя менять threshold после просмотра результата. Изменение критерия оформляется как новая версия и не переписывает уже собранные evidence records.
