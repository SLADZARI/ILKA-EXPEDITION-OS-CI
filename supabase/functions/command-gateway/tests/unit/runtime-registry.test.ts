import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1.0.19";

import {
  commandGatewayRuntimeRegistry,
  day1CompleteTaskV1,
  day1PilotV1,
  expeditionBootstrapV1,
} from "../../../_shared/command-gateway/runtime-registry.ts";
import type { RuntimeRelease } from "../../../_shared/command-gateway/types.ts";

const day1Release: RuntimeRelease = {
  id: "64000000-0000-0000-0000-000000000001",
  release_key: "day1_complete_task_v1",
  git_commit_sha: "edbfc911e9bcfddfb87a4adb6b39d21e1a5f2617",
  rules_release: "engine_v8_permissions_v7_onboarding_v3",
  content_release: "day1_content_v1",
  reducer_version: "day1_complete_task_v1",
};

const bootstrapRelease: RuntimeRelease = {
  id: "64000000-0000-0000-0000-000000000002",
  release_key: "expedition_bootstrap_v1",
  git_commit_sha: "6175902f32a73a08476111befcb9e9be36e219bf",
  rules_release: "engine_v8_permissions_v7",
  content_release: "ilka_mvp_12_day_v5",
  reducer_version: "expedition_bootstrap_v1",
};

const pilotRelease: RuntimeRelease = {
  id: "64000000-0000-0000-0000-000000000003",
  release_key: "day1_pilot_v1",
  git_commit_sha: "969d4956a9247aa5f28ba18cc6fe587bd38c20f4",
  rules_release: "engine_v10_permissions_v8_roles_v2_rotation_v2",
  content_release: "ilka_mvp_12_day_v5_onboarding_v3",
  reducer_version: "day1_pilot_v1",
};

function assertMetadataMismatchRejected(release: RuntimeRelease): void {
  const fields: Array<keyof Omit<RuntimeRelease, "id">> = [
    "release_key",
    "git_commit_sha",
    "rules_release",
    "content_release",
    "reducer_version",
  ];

  for (const field of fields) {
    const mismatched = { ...release, [field]: `${release[field]}_other` };
    assertEquals(commandGatewayRuntimeRegistry.find(mismatched), null);
  }
}

Deno.test("runtime registry resolves the exact immutable Day 1 release", () => {
  assertStrictEquals(
    commandGatewayRuntimeRegistry.find(day1Release),
    day1CompleteTaskV1,
  );
});

Deno.test("runtime registry resolves the exact immutable bootstrap release", () => {
  assertStrictEquals(
    commandGatewayRuntimeRegistry.find(bootstrapRelease),
    expeditionBootstrapV1,
  );
  assertEquals(expeditionBootstrapV1.bootstrap_policy, {
    duration_days: 12,
    recovery_days_available: 1,
  });
});

Deno.test("runtime registry resolves the exact immutable Day 1 pilot release", () => {
  assertStrictEquals(
    commandGatewayRuntimeRegistry.find(pilotRelease),
    day1PilotV1,
  );
  assertEquals(day1PilotV1.bootstrap_policy, {
    duration_days: 12,
    recovery_days_available: 1,
  });
  assertEquals(day1PilotV1.invitation_policy.team_size_min, 3);
  assertEquals(day1PilotV1.invitation_policy.team_size_max, 5);
  assertEquals(day1PilotV1.rotation_policy.rotation_rules_version, 2);
  assertEquals(day1PilotV1.start_policy.first_stage_id, "onboarding");
  assertEquals(day1PilotV1.day1_policy.stage_id, "onboarding");
});

Deno.test("runtime registry rejects any pinned metadata mismatch", () => {
  assertMetadataMismatchRejected(day1Release);
  assertMetadataMismatchRejected(bootstrapRelease);
  assertMetadataMismatchRejected(pilotRelease);
});
