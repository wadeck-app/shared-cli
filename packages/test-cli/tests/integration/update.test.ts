/**
 * Integration tests for the without-daemon update strategy.
 *
 * Design: node:child_process is mocked so no real npm process is spawned.
 * The mock reads version state from mockNpmState, allowing each test to
 * configure what npm view would return and verify what npm install was called with.
 *
 * MockRegistry (HTTP) is available as a companion utility but is not wired
 * into the child_process mock here — it is exercised in MockRegistry.test.ts.
 * If you want to test with a real npm pointing to MockRegistry, set
 * npm_config_registry=registry.url in beforeEach and remove the child_process mock.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Shared mock state — must be declared BEFORE vi.mock hoisting
// ---------------------------------------------------------------------------

interface MockNpmState {
	versions: Map<string, string>;
	installCalls: string[];
	viewCallCount: number;
}

const mockNpmState: MockNpmState = {
	versions: new Map(),
	installCalls: [],
	viewCallCount: 0,
};

// ---------------------------------------------------------------------------
// Mock node:child_process — hoisted above all imports by vitest
// ---------------------------------------------------------------------------

vi.mock('node:child_process', () => {
	/**
	 * Resolves npm args regardless of whether execFileSync (USE_NPM_CLI=true path)
	 * or execSync (USE_NPM_CLI=false path) is invoked.
	 *
	 * execFileSync(node, [npm-cli.js, ...npmArgs], opts) → npmArgs starts at index 1
	 * execSync('npm install -g ...', opts)               → plain string, split on space
	 */
	function resolveNpmArgs(cmdOrFile: string, args?: string[]): string[] {
		if (Array.isArray(args) && args.length > 0) {
			// execFileSync path: args[0] is npm-cli.js, rest are the real npm args
			return args.slice(1);
		}
		// execSync path: cmdOrFile is "npm view <pkg> ..."
		const parts = (cmdOrFile as string).split(/\s+/);
		// parts[0] is 'npm'
		return parts.slice(1);
	}

	const execFileSync = (file: string, args: string[], _opts?: unknown): string => {
		const npmArgs = resolveNpmArgs(file, args);
		return handleNpmArgs(npmArgs);
	};

	const execSync = (cmd: string, _opts?: unknown): string => {
		const npmArgs = resolveNpmArgs(cmd);
		return handleNpmArgs(npmArgs);
	};

	function handleNpmArgs(npmArgs: string[]): string {
		const subcommand = npmArgs[0];

		if (subcommand === 'view') {
			// npm view <pkg> dist-tags.<channel>
			const pkg = npmArgs[1] ?? '';
			mockNpmState.viewCallCount++;
			const version = mockNpmState.versions.get(pkg);
			if (version === undefined) {
				throw new Error(`Mock npm: no version configured for "${pkg}"`);
			}
			return version + '\n';
		}

		if (subcommand === 'install') {
			// npm install -g <pkg>@<version>
			// Record the full pkg@version arg (last arg)
			const pkgAtVersion = npmArgs[npmArgs.length - 1] ?? '';
			mockNpmState.installCalls.push(pkgAtVersion);

			// Optionally write a sentinel file if __mockNpmTmpDir is set
			const sentinelDir = (globalThis as Record<string, unknown>)['__mockNpmTmpDir'] as string | undefined;
			if (sentinelDir) {
				const record = { args: npmArgs, calledAt: Date.now() };
				writeFileSync(
					join(sentinelDir, 'npm-install-called.json'),
					JSON.stringify(record, null, 2),
					'utf8',
				);
			}
			return '';
		}

		if (subcommand === 'root') {
			// npm root -g → return tmpdir so npm thinks global dir is tmpdir
			const sentinelDir = (globalThis as Record<string, unknown>)['__mockNpmTmpDir'] as string | undefined;
			return (sentinelDir ?? tmpdir()) + '\n';
		}

		// Any other subcommand: succeed silently
		return '';
	}

	return { execFileSync, execSync };
});

// ---------------------------------------------------------------------------
// Import runUpdater AFTER vi.mock is set up
// ---------------------------------------------------------------------------

import { runUpdater } from '@wadeck-app/shared-updater';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'updater-test-'));
	return dir;
}

function readState(configDir: string): Record<string, unknown> {
	const path = join(configDir, 'update-state.json');
	if (!existsSync(path)) throw new Error(`update-state.json not found in ${configDir}`);
	return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function readCache(configDir: string): Record<string, unknown> {
	const path = join(configDir, 'update-cache.json');
	if (!existsSync(path)) throw new Error(`update-cache.json not found in ${configDir}`);
	return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

const PKG = '@test/my-cli';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('without-daemon strategy', () => {
	let configDir: string;

	beforeEach(() => {
		configDir = makeTmpDir();
		// Expose tmpDir for install sentinel writes
		(globalThis as Record<string, unknown>)['__mockNpmTmpDir'] = configDir;
		// Reset mock state
		mockNpmState.versions.clear();
		mockNpmState.installCalls.length = 0;
		mockNpmState.viewCallCount = 0;
		// Ensure self-check is disabled (no UPDATER_SELF_CHECK_CMD → returns true)
		delete process.env['UPDATER_SELF_CHECK_CMD'];
		// Ensure force mode is off
		delete process.env['UPDATER_FORCE'];
	});

	afterEach(() => {
		rmSync(configDir, { recursive: true, force: true });
		delete (globalThis as Record<string, unknown>)['__mockNpmTmpDir'];
	});

	// -------------------------------------------------------------------------
	describe('version detection', () => {
		it('detects newer version via npm view', { timeout: 5000 }, async () => {
			mockNpmState.versions.set(PKG, '2.0.0');

			await runUpdater({
				pkgName: PKG,
				configDir,
				currentVersion: '1.0.0',
				strategy: 'without-daemon',
			});

			expect(mockNpmState.viewCallCount).toBe(1);
			const state = readState(configDir);
			expect(state['status']).toBe('success');
			expect(state['targetVersion']).toBe('2.0.0');
			expect(state['currentVersion']).toBe('1.0.0');
		});

		it('considers itself up-to-date when versions match', { timeout: 5000 }, async () => {
			mockNpmState.versions.set(PKG, '1.0.0');

			await runUpdater({
				pkgName: PKG,
				configDir,
				currentVersion: '1.0.0',
				strategy: 'without-daemon',
			});

			expect(mockNpmState.viewCallCount).toBe(1);
			// No state file written when up-to-date
			expect(existsSync(join(configDir, 'update-state.json'))).toBe(false);
			// Cache should still be written
			const cache = readCache(configDir);
			expect(cache['latestVersion']).toBe('1.0.0');
		});

		it('handles npm view failure gracefully (no state written)', { timeout: 5000 }, async () => {
			// Do NOT set a version → mock throws "no version configured"
			// The runUpdater should catch the error and return without writing state

			await runUpdater({
				pkgName: PKG,
				configDir,
				currentVersion: '1.0.0',
				strategy: 'without-daemon',
			});

			expect(existsSync(join(configDir, 'update-state.json'))).toBe(false);
		});
	});

	// -------------------------------------------------------------------------
	describe('installation', () => {
		it('calls npm install with correct args when update available', { timeout: 5000 }, async () => {
			mockNpmState.versions.set(PKG, '3.0.0');

			await runUpdater({
				pkgName: PKG,
				configDir,
				currentVersion: '1.0.0',
				strategy: 'without-daemon',
			});

			expect(mockNpmState.installCalls).toHaveLength(1);
			expect(mockNpmState.installCalls[0]).toBe(`${PKG}@3.0.0`);
		});

		it('writes success state after install', { timeout: 5000 }, async () => {
			mockNpmState.versions.set(PKG, '2.5.0');

			await runUpdater({
				pkgName: PKG,
				configDir,
				currentVersion: '2.0.0',
				strategy: 'without-daemon',
			});

			const state = readState(configDir);
			expect(state['status']).toBe('success');
			expect(state['targetVersion']).toBe('2.5.0');
			expect(state['previousVersion']).toBe('2.0.0');
			expect(typeof state['timestamp']).toBe('number');

			// sentinel file created
			expect(existsSync(join(configDir, 'npm-install-called.json'))).toBe(true);
			const sentinel = JSON.parse(
				readFileSync(join(configDir, 'npm-install-called.json'), 'utf8'),
			) as Record<string, unknown>;
			expect((sentinel['args'] as string[]).join(' ')).toContain('install');
		});

		it('does not call npm install when up to date', { timeout: 5000 }, async () => {
			mockNpmState.versions.set(PKG, '1.0.0');

			await runUpdater({
				pkgName: PKG,
				configDir,
				currentVersion: '1.0.0',
				strategy: 'without-daemon',
			});

			expect(mockNpmState.installCalls).toHaveLength(0);
		});
	});

	// -------------------------------------------------------------------------
	describe('onUpdateAvailable callback', () => {
		it('calls callback before install', { timeout: 5000 }, async () => {
			mockNpmState.versions.set(PKG, '2.0.0');
			let callbackVersion: string | null = null;

			await runUpdater({
				pkgName: PKG,
				configDir,
				currentVersion: '1.0.0',
				strategy: 'without-daemon',
				onUpdateAvailable: async (v) => {
					callbackVersion = v;
					return 'apply-now';
				},
			});

			expect(callbackVersion).toBe('2.0.0');
			expect(mockNpmState.installCalls).toHaveLength(1);
		});

		it('defers when callback returns defer', { timeout: 5000 }, async () => {
			mockNpmState.versions.set(PKG, '2.0.0');

			await runUpdater({
				pkgName: PKG,
				configDir,
				currentVersion: '1.0.0',
				strategy: 'without-daemon',
				onUpdateAvailable: async () => ({ defer: true, retryIn: 60_000 }),
			});

			// No npm install called
			expect(mockNpmState.installCalls).toHaveLength(0);

			const state = readState(configDir);
			expect(state['status']).toBe('deferred');
			expect(state['targetVersion']).toBe('2.0.0');
		});

		it('writes deferred state with correct retryAt', { timeout: 5000 }, async () => {
			mockNpmState.versions.set(PKG, '2.0.0');
			const before = Date.now();

			await runUpdater({
				pkgName: PKG,
				configDir,
				currentVersion: '1.0.0',
				strategy: 'without-daemon',
				onUpdateAvailable: async () => ({ defer: true, retryIn: 60_000 }),
			});

			const after = Date.now();
			const state = readState(configDir);
			expect(state['status']).toBe('deferred');
			expect(state['targetVersion']).toBe('2.0.0');
			// retryAt = now + 60_000, give 5s slack
			expect(state['retryAt']).toBeGreaterThanOrEqual(before + 60_000);
			expect(state['retryAt']).toBeLessThanOrEqual(after + 60_000 + 5_000);
		});

		it('proceeds with apply-now result', { timeout: 5000 }, async () => {
			mockNpmState.versions.set(PKG, '2.0.0');

			await runUpdater({
				pkgName: PKG,
				configDir,
				currentVersion: '1.0.0',
				strategy: 'without-daemon',
				onUpdateAvailable: async () => 'apply-now',
			});

			expect(mockNpmState.installCalls).toHaveLength(1);
			const state = readState(configDir);
			expect(state['status']).toBe('success');
		});
	});

	// -------------------------------------------------------------------------
	describe('cache', () => {
		it('skips npm view if cache is fresh', { timeout: 5000 }, async () => {
			mockNpmState.versions.set(PKG, '1.0.0');

			// Write a fresh cache: lastCheckedAt = now, so interval (4h default) not exceeded
			const cacheData = {
				lastCheckedAt: Date.now(),
				latestVersion: '1.0.0',
			};
			writeFileSync(join(configDir, 'update-cache.json'), JSON.stringify(cacheData), 'utf8');

			await runUpdater({
				pkgName: PKG,
				configDir,
				currentVersion: '1.0.0',
				strategy: 'without-daemon',
			});

			// npm view NOT called because cache is fresh
			expect(mockNpmState.viewCallCount).toBe(0);
		});

		it('re-checks when cache is expired', { timeout: 5000 }, async () => {
			mockNpmState.versions.set(PKG, '2.0.0');

			// Write an expired cache: lastCheckedAt = 5 hours ago (> 4h default interval)
			const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
			const cacheData = {
				lastCheckedAt: fiveHoursAgo,
				latestVersion: '1.0.0',
			};
			writeFileSync(join(configDir, 'update-cache.json'), JSON.stringify(cacheData), 'utf8');

			await runUpdater({
				pkgName: PKG,
				configDir,
				currentVersion: '1.0.0',
				strategy: 'without-daemon',
			});

			// npm view called because cache was expired
			expect(mockNpmState.viewCallCount).toBe(1);
			// Update installed because new version available
			expect(mockNpmState.installCalls).toHaveLength(1);
		});
	});
});
