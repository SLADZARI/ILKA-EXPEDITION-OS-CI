import type { CommandEnvelope, JsonValue } from "./types.ts";

function normalizeValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value !== null && typeof value === "object") {
    const normalized: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeValue(value[key]);
    }
    return normalized;
  }

  return value;
}

export function normalizedCommandIntent(command: CommandEnvelope): JsonValue {
  const issuedAt = new Date(command.issued_at);
  if (Number.isNaN(issuedAt.valueOf())) {
    throw new Error("invalid_issued_at");
  }

  return normalizeValue({
    command_id: command.command_id,
    command_type: command.command_type,
    expedition_id: command.expedition_id,
    idempotency_key: command.idempotency_key,
    issued_at: issuedAt.toISOString(),
    day_number: command.day_number ?? null,
    stage_id: command.stage_id ?? null,
    device_id: command.device_id ?? null,
    day_revision: command.day_revision ?? null,
    payload: normalizeValue(command.payload),
  });
}

export function canonicalJson(value: JsonValue): string {
  return JSON.stringify(normalizeValue(value));
}

export async function commandRequestHash(
  command: CommandEnvelope,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    canonicalJson(normalizedCommandIntent(command)),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
