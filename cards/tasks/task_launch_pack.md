---
id: task_launch_pack
type: task
title: Провести Limited Launch
version: 1
summary: Подготовить Launch Package, выполнить минимум одну verified exposure и зафиксировать distribution log и стартовые metrics.
available_stages:
- launch
roles:
- demo_lead
estimated_minutes: 50
required: true
offline: true
requires_acknowledgement: false
completion_event_type: task.completed
evidence:
  required: true
  accepted_types:
  - text
  - file
  - link
  - audio
  - photo
---
## Обязательный результат

- `launch_package`;
- `distribution_log`;
- `launch_metrics`.

## Definition of Done

- bounded audience, channel, launch version и scenario зафиксированы;
- launched version совпадает с подтверждённым Working Increment;
- known limitations, access/data rules, support owner и stop conditions описаны;
- основной scenario доступен без out-of-scope функции;
- выполнена минимум одна verified exposure;
- distribution records содержат version, channel, timestamp, audience reference, delivery и scenario status;
- metrics определены до Launch, имеют source, baseline, observation window, sample size и evidence;
- unresolved critical launch blockers отсутствуют;
- подготовлен handover в Stage 10 User Feedback;
- три outputs подтверждены через `output.confirmed`.
