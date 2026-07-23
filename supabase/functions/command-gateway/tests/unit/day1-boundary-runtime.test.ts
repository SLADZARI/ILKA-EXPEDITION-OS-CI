import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";

import { createDay1BoundaryRuntime } from "../../../_shared/engine-runtime/day1-boundary-v1.ts";
import {
  boundaryCommand,
  boundaryRuntime,
  DAY1_POLICY,
  PARTICIPANTS,
  systemContext,
} from "./day1-boundary-fixture.ts";

Deno.test("Day 1 boundary emits canonical events and all read models", async () => {
  const result = await boundaryRuntime.reduceBoundary({
    command: boundaryCommand(),
    actor_id: "system_clock",
    actor_role: "system_clock",
    context: systemContext(),
    received_at: "2026-07-23T04:30:00Z",
  });
  assertEquals(result.status, "accepted");
  assertEquals(result.events.map((event) => event.event_type), [
    "day.started",
    "role_assignments.activated",
    "card_bundles.published",
  ]);
  assertEquals(
    result.events.every((event) =>
      event.occurred_at === "2026-07-23T04:30:00Z" &&
      event.recorded_at === "2026-07-23T04:30:00Z"
    ),
    true,
  );
  assertEquals(result.projection_mutations.length, PARTICIPANTS.length + 1);
  assertEquals(result.projection_mutations.map((mutation) => mutation.projection_key), [
    ...PARTICIPANTS.map((participant) => `today_view:${participant}`),
    "captain_day_view",
  ]);
  const assignments = result.events[1].payload.assignments as Array<
    Record<string, unknown>
  >;
  assertEquals(assignments.length, 6);
  assertEquals(
    assignments[0].assignment_id,
    `assignment_day_01_${PARTICIPANTS[0]}_product`,
  );
  assertEquals(
    assignments[1].assignment_id,
    `assignment_day_01_${PARTICIPANTS[0]}_onboard`,
  );
  const captain = result.projection_mutations.at(-1)!.projection;
  const blockers = captain.blockers as Array<Record<string, unknown>>;
  assertEquals(
    blockers.some((blocker) =>
      blocker.entity_id === `${PARTICIPANTS[0]}:task_team_agreement`
    ),
    true,
  );
});

Deno.test("Day 1 catch-up preserves planned boundary but uses trusted event time", async () => {
  const result = await boundaryRuntime.reduceBoundary({
    command: boundaryCommand({ issued_at: "2026-07-23T02:00:00Z" }),
    actor_id: "system_clock",
    actor_role: "system_clock",
    context: systemContext(),
    received_at: "2026-07-23T18:00:00Z",
  });
  assertEquals(result.status, "accepted");
  assertEquals(result.events[0].occurred_at, "2026-07-23T18:00:00Z");
  assertEquals(
    (result.events[0].payload as Record<string, unknown>).boundary_at,
    "2026-07-23T06:00:00+03:00",
  );
});

Deno.test("Day 1 boundary rejects before the configured local time", async () => {
  const result = await boundaryRuntime.reduceBoundary({
    command: boundaryCommand(),
    actor_id: "system_clock",
    actor_role: "system_clock",
    context: systemContext(),
    received_at: "2026-07-23T02:59:59Z",
  });
  assertEquals(result.status, "rejected");
  assertEquals(result.rejection?.code, "local_boundary_not_reached");
});

Deno.test("Day 1 boundary rejects an existing authoritative Day", async () => {
  const context = systemContext();
  context.projections.push({
    projection_key: `today_view:${PARTICIPANTS[0]}`,
    projection_type: "today_view",
    subject_id: PARTICIPANTS[0],
    schema_id: "https://ilka.local/schemas/today-view.schema.json",
    schema_version: "1",
    projection: {},
    projection_version: 2,
    source_stream_position: 5,
  });
  const result = await boundaryRuntime.reduceBoundary({
    command: boundaryCommand(),
    actor_id: "system_clock",
    actor_role: "system_clock",
    context,
    received_at: "2026-07-23T04:30:00Z",
  });
  assertEquals(result.status, "rejected");
  assertEquals(result.rejection?.code, "active_day_already_exists");
});

Deno.test("Day 1 boundary policy rejects duplicate methodology references", () => {
  assertThrows(
    () =>
      createDay1BoundaryRuntime({
        ...DAY1_POLICY,
        shared_cards: [...DAY1_POLICY.shared_cards, DAY1_POLICY.shared_cards[0]],
      }),
    Error,
    "duplicate_day1_card_reference",
  );
});
