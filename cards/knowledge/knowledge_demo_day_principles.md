---
id: knowledge_demo_day_principles
type: knowledge
title: Принципы Demo Day
version: 1
summary: Как показать подтверждённый продукт через воспроизводимый сценарий, evidence и честные ограничения.
available_stages:
- demo_day
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
## Демонстрация — это проверяемая история

Demo Day показывает не набор обещаний, а одну подтверждённую версию `updated_increment`.

Структура истории:

1. проблема и пользователь;
2. ключевая гипотеза и evidence;
3. выбранный `mvp_scope` и явный `out_of_scope`;
4. Working Increment и Limited Launch;
5. сигналы пользователей и выбранная Iteration;
6. итоговый сценарий, метрики, ограничения и следующий проверяемый шаг.

Каждый значимый тезис должен иметь artifact или evidence ref. Нельзя скрывать `known_limitations`, подменять live flow макетом или включать в Demo функцию, отсутствующую в подтверждённой версии.
