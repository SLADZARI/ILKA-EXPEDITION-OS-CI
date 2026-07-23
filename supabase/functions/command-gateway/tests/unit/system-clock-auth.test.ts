import { assertEquals } from "jsr:@std/assert@1.0.19";

import { createSystemClockRequestVerifier } from "../../../_shared/command-gateway/system-clock-auth.ts";

const encoder = new TextEncoder();

async function signature(
  secret: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.test("system clock verifier accepts exact raw-body HMAC", async () => {
  const secret = "gate9d3-test-secret";
  const timestamp = "1784781000";
  const body = '{"command_type":"process_day_boundary"}';
  const verifier = createSystemClockRequestVerifier({
    secret,
    now: () => new Date(Number(timestamp) * 1000),
  });
  assertEquals(
    await verifier.verify({
      authorization: "Bearer platform-jwt",
      timestamp,
      signature: await signature(secret, timestamp, body),
      raw_body: body,
    }),
    { ok: true },
  );
});

Deno.test("system clock verifier rejects stale timestamp", async () => {
  const verifier = createSystemClockRequestVerifier({
    secret: "secret",
    now: () => new Date("2026-07-23T06:00:00Z"),
    replayWindowSeconds: 300,
  });
  const result = await verifier.verify({
    authorization: "Bearer platform-jwt",
    timestamp: "1784770000",
    signature: "a".repeat(64),
    raw_body: "{}",
  });
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, "system_clock_timestamp_invalid");
});

Deno.test("system clock verifier rejects uppercase or altered signature", async () => {
  const verifier = createSystemClockRequestVerifier({
    secret: "secret",
    now: () => new Date("2026-07-23T06:00:00Z"),
  });
  const result = await verifier.verify({
    authorization: "Bearer platform-jwt",
    timestamp: "1784786400",
    signature: "A".repeat(64),
    raw_body: "{}",
  });
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.code, "system_clock_signature_invalid");
});
