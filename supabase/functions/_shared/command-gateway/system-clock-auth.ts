export const SYSTEM_CLOCK_TIMESTAMP_HEADER = "x-ilka-system-timestamp";
export const SYSTEM_CLOCK_SIGNATURE_HEADER = "x-ilka-system-signature";

export interface SystemClockVerificationRequest {
  authorization: string;
  timestamp: string | null;
  signature: string | null;
  raw_body: string;
}

export type SystemClockErrorCode =
  | "system_clock_authentication_required"
  | "system_clock_timestamp_invalid"
  | "system_clock_signature_invalid";

export type SystemClockVerificationResult =
  | { ok: true }
  | {
    ok: false;
    status: number;
    code: SystemClockErrorCode;
    message: string;
    retryable: boolean;
  };

export interface SystemClockRequestVerifier {
  verify(
    request: SystemClockVerificationRequest,
  ): Promise<SystemClockVerificationResult>;
}

export interface SystemClockVerifierOptions {
  secret: string | null | undefined;
  now(): Date;
  replayWindowSeconds?: number;
}

const encoder = new TextEncoder();

function failure(
  code: SystemClockErrorCode,
  message: string,
): SystemClockVerificationResult {
  return { ok: false, status: 401, code, message, retryable: false };
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function createSystemClockRequestVerifier(
  options: SystemClockVerifierOptions,
): SystemClockRequestVerifier {
  const replayWindowSeconds = options.replayWindowSeconds ?? 300;
  if (!Number.isInteger(replayWindowSeconds) || replayWindowSeconds < 1) {
    throw new Error("invalid_system_clock_replay_window");
  }

  return {
    async verify(
      request: SystemClockVerificationRequest,
    ): Promise<SystemClockVerificationResult> {
      if (
        !request.authorization.match(/^Bearer\s+\S+$/) ||
        !request.timestamp || !request.signature || !options.secret
      ) {
        return failure(
          "system_clock_authentication_required",
          "Trusted system clock authentication is required.",
        );
      }
      if (!/^\d{10}$/.test(request.timestamp)) {
        return failure(
          "system_clock_timestamp_invalid",
          "The trusted system clock timestamp is invalid.",
        );
      }
      if (!/^[0-9a-f]{64}$/.test(request.signature)) {
        return failure(
          "system_clock_signature_invalid",
          "The trusted system clock signature is invalid.",
        );
      }

      const timestampSeconds = Number(request.timestamp);
      const nowSeconds = Math.floor(options.now().getTime() / 1000);
      if (
        !Number.isSafeInteger(timestampSeconds) ||
        Math.abs(nowSeconds - timestampSeconds) > replayWindowSeconds
      ) {
        return failure(
          "system_clock_timestamp_invalid",
          "The trusted system clock timestamp is outside the replay window.",
        );
      }

      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(options.secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signed = `${request.timestamp}.${request.raw_body}`;
      const digest = new Uint8Array(
        await crypto.subtle.sign("HMAC", key, encoder.encode(signed)),
      );
      const expected = hex(digest);
      if (!constantTimeEqual(expected, request.signature)) {
        return failure(
          "system_clock_signature_invalid",
          "The trusted system clock signature is invalid.",
        );
      }
      return { ok: true };
    },
  };
}
