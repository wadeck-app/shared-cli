import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigDir } from './ConfigDir.js';

vi.mock('node:fs');

// ---------------------------------------------------------------------------
// ConfigDir.get
// ---------------------------------------------------------------------------
describe('ConfigDir.get', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('returns XDG_CONFIG_HOME/appName when XDG_CONFIG_HOME is set', () => {
		vi.stubEnv('XDG_CONFIG_HOME', '/custom/config');

		expect(ConfigDir.get('myapp')).toBe(path.join('/custom/config', 'myapp'));
	});

	it('returns a path ending in .config/myapp when XDG_CONFIG_HOME is not set', () => {
		vi.stubEnv('XDG_CONFIG_HOME', '');

		const result = ConfigDir.get('myapp');
		expect(result).toMatch(/[/\\]\.config[/\\]myapp$/);
	});

	it('uses os.homedir() as base when XDG_CONFIG_HOME is not set', () => {
		vi.stubEnv('XDG_CONFIG_HOME', '');

		const result = ConfigDir.get('myapp');
		expect(result).toBe(path.join(os.homedir(), '.config', 'myapp'));
	});
});

// ---------------------------------------------------------------------------
// ConfigDir.migrateIfNeeded
// ---------------------------------------------------------------------------
describe('ConfigDir.migrateIfNeeded', () => {
	beforeEach(() => {
		// Default: all fs operations succeed silently
		vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
		vi.mocked(fs.renameSync).mockReturnValue(undefined);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		// Reset all mocked fs functions to clear call counts between tests
		vi.mocked(fs.existsSync).mockReset();
		vi.mocked(fs.mkdirSync).mockReset();
		vi.mocked(fs.renameSync).mockReset();
	});

	it('no-op if target dir already exists', () => {
		// First existsSync call (for newDir) returns true → early return
		vi.mocked(fs.existsSync).mockReturnValue(true);

		ConfigDir.migrateIfNeeded('myapp');

		expect(vi.mocked(fs.existsSync)).toHaveBeenCalledOnce();
		expect(vi.mocked(fs.renameSync)).not.toHaveBeenCalled();
	});

	it('migrates from APPDATA path when it exists', () => {
		vi.stubEnv('XDG_CONFIG_HOME', '');
		vi.stubEnv('APPDATA', 'C:\\Users\\test\\AppData\\Roaming');
		// Target does not exist; APPDATA candidate does exist
		vi.mocked(fs.existsSync)
			.mockReturnValueOnce(false) // newDir (~/.config/myapp)
			.mockReturnValueOnce(true); // APPDATA/myapp
		const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		ConfigDir.migrateIfNeeded('myapp');

		expect(vi.mocked(fs.renameSync)).toHaveBeenCalledOnce();
		const [oldPath] = vi.mocked(fs.renameSync).mock.calls[0]!;
		expect(String(oldPath)).toContain('AppData');
		expect(stderrSpy).toHaveBeenCalledOnce();
		expect(String(stderrSpy.mock.calls[0]![0])).toContain('Config migrated');
	});

	it('migrates from ~/.appName when APPDATA is not set', () => {
		vi.stubEnv('XDG_CONFIG_HOME', '');
		// Empty string is falsy → APPDATA candidate is skipped
		vi.stubEnv('APPDATA', '');
		// Target does not exist; ~/.myapp does exist
		vi.mocked(fs.existsSync)
			.mockReturnValueOnce(false) // newDir
			.mockReturnValueOnce(true); // ~/.myapp
		const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		ConfigDir.migrateIfNeeded('myapp');

		expect(vi.mocked(fs.renameSync)).toHaveBeenCalledOnce();
		const [oldPath] = vi.mocked(fs.renameSync).mock.calls[0]!;
		expect(String(oldPath)).toMatch(/[/\\]\.myapp$/);
		expect(stderrSpy).toHaveBeenCalledOnce();
	});

	it('prints stderr warning on migration failure', () => {
		vi.stubEnv('XDG_CONFIG_HOME', '');
		vi.stubEnv('APPDATA', 'C:\\Users\\test\\AppData\\Roaming');
		vi.mocked(fs.existsSync)
			.mockReturnValueOnce(false)
			.mockReturnValueOnce(true);
		// mkdirSync throws to simulate a permission error
		vi.mocked(fs.mkdirSync).mockImplementation(() => {
			throw new Error('permission denied');
		});
		const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		ConfigDir.migrateIfNeeded('myapp');

		expect(stderrSpy).toHaveBeenCalledOnce();
		const msg = String(stderrSpy.mock.calls[0]![0]);
		expect(msg).toContain('migration failed');
		// renameSync should not have been reached
		expect(vi.mocked(fs.renameSync)).not.toHaveBeenCalled();
	});
});
