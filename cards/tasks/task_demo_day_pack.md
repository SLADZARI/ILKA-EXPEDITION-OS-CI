---
id: task_demo_day_pack
type: task
title: Провести Demo Day и собрать Shore Package
version: 1
summary: Продемонстрировать финальную версию, сохранить evidence и передать проверяемый пакет для продолжения работы после экспедиции.
available_stages:
- demo_day
roles:
- demo_lead
estimated_minutes: 60
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
  - photo
  - audio
---
## Обязательный результат

- `demo`;
- `shore_package`;
- `next_steps`.

## Demo

Зафиксируй version ID, runbook, основной user scenario, роли выступающих, environment, data set, offline fallback, timestamps, evidence refs и список вопросов. Покажи проблему, evidence, scope, Launch, User Feedback, Iteration и итоговый результат без скрытых функций.

## Shore Package

Собери финальный artifact, source map outputs Stage 01–12, acceptance results, launch metrics, signal summary, iteration decision, change log, known limitations, Demo evidence и integrity manifest. Все refs должны открываться локально либо иметь понятный sync status.

## Next Steps

Для каждого пункта укажи stable ID, тип `maintain | validate | build | stop`, priority, owner, rationale, evidence refs, dependency и первый проверяемый milestone. Новая возможность не становится committed scope автоматически.

## Completion

Task завершается после репетиции, проведения Demo, evidence capture и проверки Shore Package. Локальная completion остаётся `pending` до синхронизации. Закрытие Expedition выполняется отдельно Captain после authoritative `day.closed`.
