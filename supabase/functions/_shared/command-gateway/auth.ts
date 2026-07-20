import type { AuthUser, AuthVerifier } from "./types.ts";

export class AuthServiceError extends Error {
  constructor(message = "authentication_service_unavailable") {
    super(message);
    this.name = "AuthServiceError";
  }
}

export interface AuthVerifierOptions {
  baseUrl: string;
  projectPublicKey: string;
  fetcher?: typeof fetch;
}

export function createSupabaseAuthVerifier(
  options: AuthVerifierOptions,
): AuthVerifier {
  const fetcher = options.fetcher ?? fetch;
  const endpoint = new URL("/auth/v1/user", options.baseUrl);

  return {
    async verify(sessionHeader: string): Promise<AuthUser | null> {
      if (!sessionHeader.startsWith("Bearer ")) return null;

      let response: Response;
      try {
        response = await fetcher(endpoint, {
          method: "GET",
          headers: {
            Authorization: sessionHeader,
            apikey: options.projectPublicKey,
          },
          signal: AbortSignal.timeout(5_000),
        });
      } catch {
        throw new AuthServiceError();
      }

      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) throw new AuthServiceError();

      const body = await response.json().catch(() => null) as
        | { id?: unknown }
        | null;
      if (!body || typeof body.id !== "string" || body.id.length === 0) {
        throw new AuthServiceError("invalid_auth_service_response");
      }
      return { id: body.id };
    },
  };
}
