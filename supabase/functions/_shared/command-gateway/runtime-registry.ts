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

// Gate 5 intentionally contains no production reducer bundle. Gate 6 registers
// the first exact pinned runtime together with its read-model contracts.
export const commandGatewayRuntimeRegistry = new StaticRuntimeRegistry([]);
