# ADR-017 Gate 8D registration note

This note records the bounded registration decision under accepted `ADR-017` without changing the canonical command or aggregate model.

- Protected Gate 8C implementation SHA: `6175902f32a73a08476111befcb9e9be36e219bf`
- Release key: `expedition_bootstrap_v1`
- Rules release: `engine_v8_permissions_v7`
- Content release: `ilka_mvp_12_day_v5`
- Reducer version: `expedition_bootstrap_v1`
- Program policy: 12 days, one floating Recovery Day

The release is bootstrap-only. Because an Expedition is immutably pinned to its runtime release, this release may be used only for the controlled development smoke bootstrap. It is not approved for invitations, Participants, rotation, Expedition start or Day execution. A separate runtime-composition decision and release are required before a real Expedition is created.
