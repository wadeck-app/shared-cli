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
- `--follow`/`-f` on any CLI subcommand splits into two cases by what the command is a view of — pick the wrong one and removal/disappearance becomes invisible, or append-only state scrolls the terminal for no reason:
  - **Event log** (entries are only ever appended, never removed — `task list -f`, `task history -f`, `queue history -f`): behave like `tail -f`. Print the initial state once, then on each poll print only what is new or changed since the last tick; never reprint the unchanged majority. Use `diffSnapshot` (`FollowSnapshot.ts`) when existing entries can still change in place (e.g. a task's status); use `diffAppendOnlyLog` (`FollowSnapshot.ts`) when past entries are truly immutable (e.g. a status-change history) — it trusts a prior count instead of re-signaturing every entry each poll. Use a file-offset tail (`CliMetaCommands.cliLogsCommand`'s pattern) for an append-only log file.
  - **Live state view** (the question is "what currently exists" and an item disappearing is itself meaningful — `flow worker list -f`): redraw the full current state in place on each poll with `LiveRegion` (`LiveRegion.ts`), which erases exactly its own last render (tracked line count, cursor-up + clear-to-end) before writing the new one. A diff-only approach is wrong here: a worker disconnecting would simply never be reported, since nothing "new or changed" happened to it from the diff's point of view — the list would silently drift from reality.
  - Both cases: poll at `FOLLOW_POLL_INTERVAL_MS` (500ms, from `FollowSnapshot.ts`) unless a command has a specific reason to differ. Print a one-line `[tool] Following X -- Ctrl+C to stop` banner to stderr before the loop starts, and resolve cleanly on `SIGINT`.
