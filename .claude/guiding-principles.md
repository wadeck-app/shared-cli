# Guiding Principles — shared-cli

- ESM-first output with dual CJS fallback; no runtime dependencies — `package.json` `dependencies` must stay empty.
- Canonical config dir is `~/.config/<appName>` on ALL platforms including Windows — `%APPDATA%` is not used after migration; `migrateIfNeeded` handles one-time move.
- Versioning is CI-only — `preversion` script blocks manual `npm version`; version format is CalVer (`YYYY.MM.DD-BBB-sha` for edge, `X.Y.Z` for stable).
- Hook env isolation: only `PATH`, `HOME`, `TMPDIR`, `TEMP`, `TMP`, `SystemRoot`, `USERPROFILE` forwarded to hook processes — daemon credentials (e.g. `ANTHROPIC_API_KEY`) must never be inherited.
- Hook failures are silently swallowed in v1 — errors are passed to optional `onError` callback only; `on-failure: fail-task` is deferred to v2.
- CLI hook timeout: 10 seconds; HTTP hook timeout: 10 seconds — both are hard limits, not configurable per-hook in v1.
- `NpmRunner` must prefer bundled `npm-cli.js` over system npm — `execFileSync` with bundled path first, `execSync` fallback with `windowsHide:true`.
- `CliMetaCommands.warnUnknownArgs` must warn to stderr for unknown flags — not silently ignore them.
- `UpdateManager` must NOT clear state file when `status === 'applying'` — updater process may still be running.
- `UpdateManager.readAndClearState()` normalizes legacy field names: `update-failed`→`failed`, `newVersion`→`targetVersion`, `reason`→`error` — must maintain for backward compat.
- Published as `@wadeck-app/shared-cli` to GitHub Packages registry — not npm public registry.
- `--follow`/`-f` on any CLI subcommand must behave like `tail -f`, not a periodically refreshed screen: print the initial state once, then on each poll print only what is new or changed since the last tick. Never clear the terminal or reprint the unchanged majority of a list every tick — that scrolls the operator's terminal continuously for no reason. Use `diffSnapshot` (`FollowSnapshot.ts`) for a mutable collection polled from a store (`task list -f`, `queue history -f`, `flow worker list -f`); use a file-offset tail (`CliMetaCommands.cliLogsCommand`'s pattern) for an append-only log file. Poll at `FOLLOW_POLL_INTERVAL_MS` (500ms) unless a command has a specific reason to differ. Print a one-line `[tool] Following X -- Ctrl+C to stop` banner to stderr before the loop starts, and resolve cleanly on `SIGINT`.
