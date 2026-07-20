import {
  assertEquals,
  assertNotEquals,
} from "jsr:@std/assert@1.0.19";

import {
  canonicalJson,
  commandRequestHash,
  normalizedCommandIntent,
} from "../../_shared/command-gateway/canonical-json.ts";
import type { CommandEnvelope } from "../../_shared/command-gateway/types.ts";

function command(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
  return {
    command_id: "cmd_hash_01",
    command_type: "complete_task",
    issued_at: "2026-07-20T21:00:00+02:00",
    actor_id: "participant_01",
    actor_role: "participant",
    expedition_id: "expedition_hash",
    idempotency_key: "cmd_hash_01",
    payload: {
      task_id: "task_01",
      nested: { z: 2, a: 1 },
      ordered: ["b", "a"],
    },
    ...overrides,
  };
}

Deno.test("canonical JSON recursively sorts object keys and preserves arrays", () => {
  const value = canonicalJson({
    z: 1,
    a: { z: 2, a: 1 },
    list: [{ z: 1, a: 2 }, "x"],
  });
  assertEquals(
    value,
    '{"a":{"a":1,"z":2},"list":[{"a":2,"z":1},"x"],"z":1}',
  );
});

Deno.test("normalized command intent excludes client actor claims", () => {
  const participant = normalizedCommandIntent(command());
  const captainClaim = normalizedCommandIntent(command({
    actor_id: "forged_actor",
    actor_role: "captain",
  }));
  assertEquals(participant, captainClaim);
});

Deno.test("normalized command intent converts timestamps to UTC", () => {
  const normalized = normalizedCommandIntent(command()) as Record<string, unknown>;
  assertEquals(normalized.issued_at, "2026-07-20T19:00:00.000Z");
});

Deno.test("request hash ignores object key order and actor claims", async () => {
  const first = command();
  const second = command({
    actor_id: "forged_actor",
    actor_role: "product_captain",
    payload: {
      ordered: ["b", "a"],
      nested: { a: 1, z: 2 },
      task_id: "task_01",
    },
  });
  assertEquals(await commandRequestHash(first), await commandRequestHash(second));
});

Deno.test("request hash preserves array order and payload meaning", async () => {
  const first = command();
  const second = command({
    payload: {
      task_id: "task_01",
      nested: { z: 2, a: 1 },
      ordered: ["a", "b"],
    },
  });
  assertNotEquals(await commandRequestHash(first), await commandRequestHash(second));
});
