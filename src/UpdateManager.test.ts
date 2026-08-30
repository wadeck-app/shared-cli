import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpdateManager } from './UpdateManager.js';
import type { UpdateState } from './UpdateManager.js';

// vi.mock is hoisted before imports — spawn is mocked when UpdateManager loads.
vi.mock('node:child_process', () => ({
	spawn: vi.fn(),
}));

// ---------------------------------------------------------------------------
// scheduleBackgroundUpdate
// ---------------------------------------------------------------------------
describe('UpdateManager.scheduleBackgroundUpdate', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-cli-test-'));
		vi.mocked(spawn).mockReset();
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('does nothing when no updater bundle exists in the bundle dir', () => {
		const mgr = new UpdateManager('@wadeck/flow-cli', tmpDir);

		// bundlePath is inside tmpDir; no updater CJS files exist there
		mgr.scheduleBackgroundUpdate(path.join(tmpDir, 'flow.cjs'));

		expect(vi.mocked(spawn)).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// readAndClearState
// ---------------------------------------------------------------------------
describe('UpdateManager.readAndClearState', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-cli-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('returns null when no state file exists', () => {
		const mgr = new UpdateManager('@wadeck/flow-cli', tmpDir);

		expect(mgr.readAndClearState()).toBeNull();
	});

	it('reads and clears a terminal success state (legacy newVersion)', () => {
		const state = {
			status: 'success',
			newVersion: '2.0.0',
			previousVersion: '1.0.0',
			timestamp: new Date().toISOString(),
		};
		const stateFile = path.join(tmpDir, 'update-state.json');
		fs.writeFileSync(stateFile, JSON.stringify(state), 'utf-8');

		const mgr = new UpdateManager('@wadeck/flow-cli', tmpDir);
		const result = mgr.readAndClearState();

		// newVersion is normalized to targetVersion on read
		expect(result).toMatchObject({ status: 'success', newVersion: '2.0.0', targetVersion: '2.0.0' });
		expect(fs.existsSync(stateFile)).toBe(false);
	});

	it('normalizes legacy update-failed status to failed', () => {
		const state = { status: 'update-failed', newVersion: '2.0.0', reason: 'npm error', timestamp: Date.now() };
		const stateFile = path.join(tmpDir, 'update-state.json');
		fs.writeFileSync(stateFile, JSON.stringify(state), 'utf-8');

		const mgr = new UpdateManager('@wadeck/flow-cli', tmpDir);
		const result = mgr.readAndClearState();

		expect(result).toMatchObject({ status: 'failed', targetVersion: '2.0.0', error: 'npm error' });
		expect(fs.existsSync(stateFile)).toBe(false);
	});

	it('reads and clears a rolled-back state', () => {
		const state: UpdateState = {
			status: 'rolled-back',
			newVersion: '2.0.0',
			previousVersion: '1.0.0',
			timestamp: new Date().toISOString(),
		};
		const stateFile = path.join(tmpDir, 'update-state.json');
		fs.writeFileSync(stateFile, JSON.stringify(state), 'utf-8');

		const mgr = new UpdateManager('@wadeck/flow-cli', tmpDir);
		const result = mgr.readAndClearState();

		expect(result).toMatchObject({ status: 'rolled-back' });
		expect(fs.existsSync(stateFile)).toBe(false);
	});

	it('does NOT clear the state file when status is "applying"', () => {
		const state: UpdateState = {
			status: 'applying',
			targetVersion: '2.0.0',
			timestamp: new Date().toISOString(),
		};
		const stateFile = path.join(tmpDir, 'update-state.json');
		fs.writeFileSync(stateFile, JSON.stringify(state), 'utf-8');

		const mgr = new UpdateManager('@wadeck/flow-cli', tmpDir);
		const result = mgr.readAndClearState();

		expect(result).toMatchObject({ status: 'applying' });
		// File must remain so the next startup can still see the in-progress state
		expect(fs.existsSync(stateFile)).toBe(true);
	});
});
