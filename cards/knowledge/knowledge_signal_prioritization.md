---
id: knowledge_signal_prioritization
type: knowledge
title: Синтез и приоритизация сигналов
version: 1
summary: Как связать feedback evidence с launch metrics и ранжировать проблемы по frequency, severity, impact и confidence.
available_stages:
- user_feedback
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
## От evidence к issue candidate

Для каждого сигнала зафиксируй:

- evidence refs и launched version;
- affected scenario step;
- frequency в доступной выборке;
- severity и user impact;
- confidence с учётом метода и sample coverage;
- соответствие или противоречие launch metrics;
- статус `known_limitation`, `new_signal` или `out_of_scope_request`.

Priority score должен быть объявлен до финального ranking. Высокий rank не является решением об изменении продукта — это input для Stage 11 Iteration.
