# @wadeck-app/shared-cli

Shared infrastructure for Wadeck CLIs (flow-cli, task-cli, violations-cli). Provides config directory resolution, auto-update scheduling, hook dispatch, and version validation.

## Installation

```
npm install @wadeck-app/shared-cli
```

Add to `~/.npmrc` (see `docs/npmrc.example`):

```
@wadeck-app:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=<your GitHub PAT with read:packages scope>
```

## Exports

### `ConfigDir`

Resolves `~/.config/<appName>` on all platforms. Respects `XDG_CONFIG_HOME`.

```ts
import { ConfigDir } from '@wadeck-app/shared-cli';

const dir = ConfigDir.get('flow');          // ~/.config/flow
ConfigDir.migrateIfNeeded('flow');          // one-time migration from %APPDATA%\flow or ~/.flow
```

Call `migrateIfNeeded` once at startup, before any config reads.

### `UpdateManager`

Schedules a background update by spawning a detached Node process running the updater bundle. Reads the result on next startup.

```ts
import { UpdateManager } from '@wadeck-app/shared-cli';

const mgr = new UpdateManager('@wadeck/flow-cli');
mgr.scheduleBackgroundUpdate(__filename, 'flow-updater.cjs');

const state = mgr.readAndClearState(); // null if no update ran
if (state?.status === 'rolled-back') console.warn('Update rolled back:', state.reason);
```

The updater bundle receives `UPDATER_PKG_NAME` and `LAUNCHER_BUNDLE_OVERRIDE` via env. The configDir defaults to `ConfigDir.get(<appName derived from pkgName>)`.

### `HookDispatcher`

Dispatches lifecycle events to user-configured `cli` or `http` hooks. Hook failures are swallowed by default; pass `onError` to log them.

```ts
import { HookDispatcher } from '@wadeck-app/shared-cli';

const dispatcher = new HookDispatcher({ onFlowEnd: [{ type: 'http', url: 'https://...' }] });
await dispatcher.dispatch('onFlowEnd', { executionId: '123', status: 'success' }, console.error);
```

Payload fields are forwarded to CLI hooks as `UPPER_CASE` env vars. The daemon's credentials are not forwarded; declare explicit vars in `hook.env`.

### `VersionValidation`

Validates that a string matches semver format (`\d+\.\d+\.\d+` with optional pre-release/build suffix). Throws on invalid input.

```ts
import { VersionValidation } from '@wadeck-app/shared-cli';

VersionValidation.validate('2026.08.20-142-a3f2b1c4'); // ok
VersionValidation.validate('dev');                      // throws Error
```

## CLI best practices

See [docs/cli-best-practices.md](docs/cli-best-practices.md) for the full guide: distribution pattern, bundling, auto-update, versioning, Go launcher, self-check, and registry setup.

## Publishing

Versions are CI-managed. `npm version` is blocked locally via the `preversion` script. CI calls `npm pkg set version=<computed>` before publishing. See `ci/scripts/compute-version.sh`.
