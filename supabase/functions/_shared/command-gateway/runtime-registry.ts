import { createDay1CompleteTaskRuntime } from "../engine-runtime/day1-complete-task-v1.ts";
import { createExpeditionBootstrapRuntime } from "../engine-runtime/expedition-bootstrap-v1.ts";
import { createDay1PilotRuntime } from "../engine-runtime/day1-pilot-v1.ts";
import type { RuntimeBundle, RuntimeRegistry, RuntimeRelease } from "./types.ts";

function matches(bundle: RuntimeBundle, release: RuntimeRelease): boolean {
  return bundle.release_key === release.release_key &&
    bundle.git_commit_sha === release.git_commit_sha &&
    bundle.rules_release === release.rules_release &&
    bundle.content_release === release.content_release &&
    bundle.reducer_version === release.reducer_version;
}

export class StaticRuntimeRegistry implements RuntimeRegistry {
  readonly #bundles: readonly RuntimeBundle[];

  constructor(bundles: readonly RuntimeBundle[]) {
    this.#bundles = [...bundles];
  }

  find(release: RuntimeRelease): RuntimeBundle | null {
    return this.#bundles.find((bundle) => matches(bundle, release)) ?? null;
  }
}

export const day1CompleteTaskV1 = createDay1CompleteTaskRuntime({
  release_key: "day1_complete_task_v1",
  git_commit_sha: "edbfc911e9bcfddfb87a4adb6b39d21e1a5f2617",
  rules_release: "engine_v8_permissions_v7_onboarding_v3",
  content_release: "day1_content_v1",
  reducer_version: "day1_complete_task_v1",
});

export const expeditionBootstrapV1 = createExpeditionBootstrapRuntime({
  release_key: "expedition_bootstrap_v1",
  git_commit_sha: "6175902f32a73a08476111befcb9e9be36e219bf",
  rules_release: "engine_v8_permissions_v7",
  content_release: "ilka_mvp_12_day_v5",
  reducer_version: "expedition_bootstrap_v1",
  duration_days: 12,
  recovery_days_available: 1,
});

export const day1PilotV1 = createDay1PilotRuntime({
  release_key: "day1_pilot_v1",
  git_commit_sha: "969d4956a9247aa5f28ba18cc6fe587bd38c20f4",
  rules_release: "engine_v10_permissions_v8_roles_v2_rotation_v2",
  content_release: "ilka_mvp_12_day_v5_onboarding_v3",
  reducer_version: "day1_pilot_v1",
});

export const commandGatewayRuntimeRegistry = new StaticRuntimeRegistry([
  day1CompleteTaskV1,
  expeditionBootstrapV1,
  day1PilotV1,
]);
