import { assertEquals } from "jsr:@std/assert@1.0.19";

import { createSupabaseAuthVerifier } from "../../../_shared/command-gateway/auth.ts";

Deno.test("Auth verifier returns confirmed email context for invitation acceptance", async () => {
  const verifier = createSupabaseAuthVerifier({
    baseUrl: "https://example.supabase.co",
    projectPublicKey: "public-key",
    fetcher: async () =>
      new Response(
        JSON.stringify({
          id: "10000000-0000-0000-0000-000000000099",
          email: "Anna@Example.Test",
          email_confirmed_at: "2026-07-21T20:00:00Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });

  const user = await verifier.verify("Bearer valid-session");
  assertEquals(user, {
    id: "10000000-0000-0000-0000-000000000099",
    email: "Anna@Example.Test",
    email_verified: true,
  });
});

Deno.test("Auth verifier marks an unconfirmed email as unavailable for acceptance", async () => {
  const verifier = createSupabaseAuthVerifier({
    baseUrl: "https://example.supabase.co",
    projectPublicKey: "public-key",
    fetcher: async () =>
      new Response(
        JSON.stringify({
          id: "10000000-0000-0000-0000-000000000099",
          email: "anna@example.test",
          email_confirmed_at: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });

  const user = await verifier.verify("Bearer valid-session");
  assertEquals(user?.email_verified, false);
});
