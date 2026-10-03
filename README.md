# @wadeck-app/shared-cli

Shared CLI infrastructure for `@wadeck-app` CLIs — config directory resolution, update management, hook dispatch, logging, and meta-commands.

## Install

```
npm install @wadeck-app/shared-cli
```

## API

| Export | Description |
|---|---|
| `ConfigDir.get(appName)` | Returns `~/.config/<appName>` (respects `XDG_CONFIG_HOME`). |
| `ConfigDir.migrateIfNeeded(appName)` | One-time migration from `%APPDATA%/<appName>` or `~/.<appName>` to the canonical path. |
| `UpdateManager` | Schedules a background updater process and reads/clears the `update-state.json` written by `shared-updater`. |
| `runSelfCheck(checks, opts?)` | Runs an array of check functions, prints results to stderr, exits 1 on any failure. |
| `HookDispatcher` | Fires CLI or HTTP hooks on lifecycle events (`onFlowStart`, `onFlowEnd`, `onStepStart`, etc.). |
| `VersionValidation.validate(v)` | Throws if `v` is not a valid semver string (`x.y.z[-+suffix]`). |
| `logCliInvocation(configDir, cmd, args)` | Appends an NDJSON entry to `<configDir>/logs/<date>.ndjson`. |
| `cliLogsCommand(configDir, opts?)` | Prints today's log file; `opts.follow` tails new lines until SIGINT. |
| `cliVersionCommand(pkgName, current, channel?)` | Prints current vs. latest version from npm registry. |
| `cliUpdateCommand(updaterPath, pkgName, opts?)` | Runs the updater bundle synchronously with `UPDATER_FORCE=1`. |
| `cliRollbackCommand(pkgName, configDir)` | Reinstalls `previousVersion` from `update-state.json` and removes the state file. |
| `warnUnknownArgs(rawArgs, knownArgs, cmdName, valueFlags?)` | Writes a warning to stderr for each unrecognized argument; `valueFlags` marks flags whose next token is a value, not a separate argument. |
| `execNpm(args, opts?)` | Runs npm synchronously via `npm-cli.js` (bundled node) or `execSync`. |
| `readChannelFromConfig(configDir)` | Reads `channel:` from `config.yml`; returns `'latest'` if absent. |
| `parseDuration(s)` | Parses a duration string (`1h`, `30m`, `10s`, `500ms`, `2d`) to milliseconds. |

## Integration notes

- `UpdateManager.scheduleBackgroundUpdate(bundlePath, updaterName?)` detaches a Node.js child process; `updaterName` defaults to `flow-updater.cjs`. In dev mode (no bundled updater), it exits silently.
- `UpdateManager.readAndClearState()` normalizes legacy field names (`update-failed` → `failed`, `newVersion` → `targetVersion`, `reason` → `error`) written by older `shared-updater` versions.
- `HookDispatcher` silently swallows hook errors by default; pass an `onError` callback to log them. Hook commands receive payload fields as `UPPER_CASE` env vars. Daemon credentials are not forwarded.
- `CliHook.debug: true` pipes the hook's stdio to the calling terminal — do not enable in production.

## Workspace structure

```
shared-cli/
  packages/
    shared-cli/     # published package (@wadeck-app/shared-cli)
    test-cli/       # private integration tests (exercises shared-cli + shared-updater)
```

Run tests:

```bash
npm test --workspace packages/test-cli
```
