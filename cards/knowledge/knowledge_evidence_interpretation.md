---
id: knowledge_evidence_interpretation
type: knowledge
title: Как интерпретировать validation evidence
version: 1
summary: Как отделить наблюдение от вывода и присвоить гипотезе статус supported, rejected или inconclusive.
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
## Evidence record

Каждая запись должна содержать источник, метод, время наблюдения, linked assumption, фактический signal, ограничения и ссылку на исходный материал.

## Статусы

- `supported` — critical criteria достигнуты и disconfirming signals не обнаружены;
- `rejected` — обнаружен заранее определённый critical disconfirming signal;
- `inconclusive` — данных недостаточно, качество evidence низкое или результаты противоречат друг другу.

Интервью, мнение эксперта и market proxy не называются доказательством поведения без явного указания ограничений. Отсутствие сигнала не равно подтверждению гипотезы.
