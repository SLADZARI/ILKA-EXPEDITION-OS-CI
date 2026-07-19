---
id: knowledge_launch_measurement
type: knowledge
title: Launch Metrics и Distribution Evidence
version: 1
summary: Как заранее определить стартовые метрики, фиксировать exposures и не выдавать малую проверочную выборку за доказательство успеха.
available_stages:
- launch
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
## Измерение Launch

До distribution для каждой метрики фиксируются:

- `metric_id` и точное определение;
- источник данных и observation window;
- baseline или ожидаемое стартовое значение;
- допустимый способ подсчёта;
- ограничения выборки и evidence reference.

Минимально различаются delivery, access, scenario start и scenario completion. Качественные ответы и повторяющиеся сигналы обрабатываются в Stage 10, а не смешиваются с первичными Launch metrics.
