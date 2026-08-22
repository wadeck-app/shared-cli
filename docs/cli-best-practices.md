# CLI Best Practices — Wadeck Ecosystem

Reference for implementing a new Wadeck CLI. `@wadeck/flow-cli` is the canonical reference implementation.

---

## 1. Distribution pattern (exe-in-npm)

Each CLI is three npm packages:

| Package | Contents | Published |
|---------|----------|-----------|
| `@wadeck/<name>-cli` | JS shim (`bin/<name>.js`), CJS bundle (`<name>.cjs`), updater bundle (`<name>-updater.cjs`) | Yes |
| `@wadeck/<name>-cli-<platform>` | Go launcher binary | Yes, one per platform |
| Source package (`packages/<name>-cli`) | TypeScript source, dev-only | No (`private: true`) |

The main package declares platform packages as `optionalDependencies`:

```json
"optionalDependencies": {
  "@wadeck/flow-cli-win32-x64": ">=0.0.0-0",
  "@wadeck/flow-cli-darwin-arm64": ">=0.0.0-0",
  "@wadeck/flow-cli-darwin-x64": ">=0.0.0-0"
}
```

**JS shim** (`bin/<name>.js`): resolves the platform package via `require.resolve()`, falls back to `npm install -g <platform-pkg>` if the optionalDependency was not installed (GitLab registry does not expose `os`/`cpu` fields in the packument). Exits with a clear error if the platform is unsupported.

**Why not GitHub Releases or custom servers**: npm provides registry, versioning, and install UX at zero operational cost.

---

## 2. Config directory

Use `ConfigDir` from `@wadeck/shared-cli`. Always `~/.config/<appName>` on all platforms, including Windows. `%APPDATA%` is not used.

```ts
import { ConfigDir } from '@wadeck/shared-cli';

// Startup sequence:
ConfigDir.migrateIfNeeded(appName);   // once, before any reads
const dir = ConfigDir.get(appName);
```

`migrateIfNeeded` checks `%APPDATA%\<appName>` and `~/.<appName>`, renames to `~/.config/<appName>` if found, and logs to stderr. Non-fatal if rename fails (warns the user with the old path).

All CLI components (Go launcher, Node bundle, updater) must use the same directory. Two directories for one tool is a debugging anti-pattern (see P-1 in guiding-principles).

Go launcher: set `defaultConfigDir` to the bare `appName` (not a full path) in `launcher.config.json` — the Go SDK appends it under `~/.config/` automatically.

---

## 3. Auto-update

Use `UpdateManager` from `@wadeck/shared-cli`. The update runs in a detached Node process (the updater bundle) so it does not block the CLI.

```ts
const mgr = new UpdateManager('@wadeck/flow-cli');

// Called once at startup, after the main flow completes:
mgr.scheduleBackgroundUpdate(__filename, 'flow-updater.cjs');

// Called on the NEXT startup to surface the result:
const state = mgr.readAndClearState();
```

**Update sequence** (inside the updater bundle):
1. Acquire a file lock (`~/.config/<appName>/.update.lock`) — exit silently if locked.
2. Check update cache (`update-cache.json`) — skip if checked within `checkIntervalMs`.
3. Fetch latest version from npm registry.
4. Compare with current version; skip if already up to date.
5. Run `npm install -g <pkg>@<latest>`.
6. Run `<name>.cjs cli self-check` (health check) on the new bundle.
7. If self-check passes: write `update-state.json` with `status: success`.
8. If self-check fails: reinstall the previous version, write `status: rolled-back`.

The updater bundle must set `UPDATER_PKG_NAME` to control which package is updated. The same updater bundle can serve multiple CLIs via this env var.

**Windows**: the detached process must be spawned without a terminal popup. Use `spawn` with `detached: true, stdio: 'ignore'` then `child.unref()`. For VBScript-based hiding (SW_HIDE), see `docs/windows-hidden-process.md` in agent-fleet.

---

## 4. Versioning (CalVer)

Format: `YYYY.MM.DD-BUILD-SHA` (edge) or `X.Y.Z` (stable via workflow_dispatch).

Examples:
- Edge: `2026.08.20-142-a3f2b1c4` — pushed to `edge` dist-tag
- Stable: `1.2.0` — pushed to `latest` dist-tag
- Breaking stable: pushed to `breaking-edge` dist-tag

**Never bump manually.** The `preversion` script blocks it:

```json
"preversion": "node -e \"if (!process.env.CI) { console.error('ERROR: version is CI-managed. Do not run npm version manually.'); process.exit(1); }\""
```

CI injects the version with `npm pkg set version="<computed>"` before building, then publishes. See `ci/scripts/compute-version.sh` for the full logic.

---

## 5. Bundling

Each CLI produces two CJS bundles via esbuild:
- `<name>.cjs` — main CLI entry point
- `<name>-updater.cjs` — updater entry point (no CLI runtime imports)

Build sequence: `tsc` compiles TypeScript to `dist/`, then `esbuild` bundles from `dist/` to `dist-bundle/`. Do not bundle from TypeScript source directly.

Key esbuild options:

```ts
{
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: [],                          // bundle everything
  supported: { 'top-level-await': false },
  define: {
    'import.meta.url': '__importMetaUrl',
    __CLI_VERSION__: JSON.stringify(version),
  },
  banner: { js: `const __importMetaUrl = require('url').pathToFileURL(__filename).href;` },
}
```

- `external: []` — no runtime deps; the bundle is fully self-contained.
- `top-level-await: false` — required for CJS compatibility.
- `__importMetaUrl` shim — required because esbuild CJS output does not provide `import.meta.url`.

If the bundle uses `createRequire`-based resolution for JSON files (e.g., extension points), add an explicit esbuild plugin to resolve those paths. See `packages/flow-cli/scripts/bundle.ts`.

---

## 6. Go launcher

The Go launcher is built with the `singleton-daemon-kit` SDK and configured via `launcher.config.json` at the package root.

Key config fields:

```json
{
  "defaultConfigDir": "flow",
  "bundleFile": "flow.cjs"
}
```

- `defaultConfigDir`: bare app name, not a full path. The SDK resolves it to `~/.config/<appName>` on all platforms.
- The launcher looks for the Node bundle relative to its own executable path (platform package install dir).

Do not hardcode absolute paths or use `%APPDATA%` in launcher config.

---

## 7. Self-check (`cli self-check`)

Every CLI must implement a `cli self-check` command that validates the bundle is functional. The updater calls it after installing a new version; if it exits non-zero, the update is rolled back.

Minimum checks (adapt to the CLI's actual components):

| # | Check | What it validates |
|---|-------|-------------------|
| 1 | Bundle integrity | Core class from main package is importable |
| 2 | Config loading | Default config resolves without error |
| 3 | YAML parsing | yaml library is present and functional |
| 4 | Core runtime init | Main runtime class constructs without error |
| 5 | Plugin/extension system | Loader constructs and resolves registry path |
| 6 | HookDispatcher | Instantiates and dispatches a no-op event |
| 7 | Workspace config | Config schema validates a known-good fixture |

Exit 0 on all passed, exit 1 if any failed. When `CLI_SELF_CHECK_QUIET=1` is set, suppress stdout. Always print failures to stderr.

---

## 8. Registry

All packages are published to the GitLab npm registry under the `@wadeck` scope.

**Read access** (developers, CI install step):
```
@wadeck:registry=https://gitlab.com/api/v4/packages/npm/
//gitlab.com/api/v4/packages/npm/:_authToken=<read_api token>
```

Copy `.npmrc.example` to `~/.npmrc` and fill in the token.

**Write access** (CI publish step only):
- Token must be a deploy token starting with `gldt-`.
- Validated in CI via a PyPI probe (package registry scope check) before publish.
- Never commit a write token.

**Scope validation**: the publish workflow probes the PyPI endpoint to verify the write token has `write_package_registry` scope before attempting `npm publish`. A 401 or 403 from that probe fails the workflow immediately.

---

## 9. Windows specifics

- **Config directory**: always `~/.config/<appName>` (resolves to `C:\Users\<user>\.config\<appName>`). Do not use `%APPDATA%`.
- **Background processes**: `spawn` with `detached: true, stdio: 'ignore'` prevents a terminal popup on Windows. For processes that must be completely hidden (no taskbar entry), use VBScript with `SW_HIDE` — see `docs/windows-hidden-process.md` in the agent-fleet repo.
- **Path separators**: use `path.join` throughout; never hardcode `/` or `\`.
- **Shell commands in hooks**: CLI hooks use `execFile` (not `exec`), so shell built-ins are not available. Users must invoke `cmd.exe` explicitly if needed.
