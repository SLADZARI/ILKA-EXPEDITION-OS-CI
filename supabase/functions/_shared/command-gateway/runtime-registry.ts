import { createDay1CompleteTaskRuntime } from "../engine-runtime/day1-complete-task-v1.ts";
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

export const commandGatewayRuntimeRegistry = new StaticRuntimeRegistry([
  day1CompleteTaskV1,
]);
