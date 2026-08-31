# @wadeck-app/shared-cli

Single source of truth for CLI features across Workspace_Tooling. A fix or addition here benefits all consumer CLIs on their next `shared-cli` version bump — no per-CLI changes required.

**Consumer CLIs:** orchestrator, queue, flow-cli, task-cli, violations-cli, scrapers (×3), wdrive

## Workspace structure

```
shared-cli/
  src/               # published package
  packages/
    test-cli/        # private workspace — integration + unit tests
```

## packages/test-cli

Exercises shared-cli and shared-updater end-to-end with a controlled mock environment.

**Run tests:**
```bash
npm test --workspace packages/test-cli
```

**Integration tests** (`tests/integration/update.test.ts`) test the full `runUpdater` state machine — version detection, cache, install, defer, rollback — without spawning a real npm process. `node:child_process` is mocked via `vi.mock` so tests are deterministic and offline.

**`MockRegistry`** (`src/MockRegistry.ts`) is an `http.createServer`-based npm registry stub. Use it when you want to test with real npm pointed at a local registry:
```ts
const registry = new MockRegistry();
await registry.start();
registry.setLatestVersion('@my/pkg', '2.0.0');
process.env.npm_config_registry = registry.url;
// ... run npm commands ...
await registry.stop();
```

**Antifragility:** when `shared-cli` grows, `test-cli` grows with it — providing regression coverage before any consumer CLI bumps its dependency.
