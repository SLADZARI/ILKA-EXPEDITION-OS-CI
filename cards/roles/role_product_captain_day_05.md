---
id: role_product_captain_day_05
type: role
title: Product Captain — Day 5
version: 1
summary: Подготовить decision draft, провести прозрачный vote round и сохранить итог без подмены evidence мнением фасилитатора.
available_stages:
- product_decision
roles:
- product_captain
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

- сформировать 2–5 alternatives из Stage 04 evidence;
- объявить criteria до открытия голосования;
- проверить frozen `eligible_voter_ids`;
- провести discussion и открыть attributable single-choice round;
- не закрывать round без полного quorum и strict majority;
- сохранить rationale, objections и rejected alternatives;
- подтвердить три обязательных output.

High load. Несовместима с `cook`.
