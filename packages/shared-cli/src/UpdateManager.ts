import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { ConfigDir } from './ConfigDir.js';

export interface UpdateState {
	// 'failed' replaces legacy 'update-failed'; both are accepted on read.
	// 'applying' is legacy (shared-updater no longer writes it); kept for compat.
	status: 'update-available' | 'success' | 'failed' | 'rolled-back' | 'applying' | 'update-failed';
	currentVersion?: string;
	targetVersion?: string;
	newVersion?: string;        // @deprecated — use targetVersion
	previousVersion?: string;
	error?: string;
	reason?: string;            // @deprecated — use error
	// Call-site note: old updater versions may write a string timestamp in JSON; coerce with Number(state.timestamp) if needed.
	timestamp: number;
}

export class UpdateManager {
	private readonly configDir: string;
	private readonly pkgName: string;

	constructor(pkgName: string, configDir?: string) {
		this.pkgName = pkgName;
		this.configDir = configDir ?? ConfigDir.get(pkgName.replace(/^@[^/]+\//, '').replace(/-cli$/, ''));
	}

	// Prefer the named updater; fall back to flow-updater.cjs (shared bundle handles both CLIs via UPDATER_PKG_NAME).
	scheduleBackgroundUpdate(bundlePath: string, updaterName = 'flow-updater.cjs'): void {
		const dir = path.dirname(bundlePath);
		const updaterPath = fs.existsSync(path.join(dir, updaterName))
			? path.join(dir, updaterName)
			: fs.existsSync(path.join(dir, 'flow-updater.cjs'))
				? path.join(dir, 'flow-updater.cjs')
				: null;
		// dev mode: no updater bundle built
		if (!updaterPath) return;
		const child = spawn(process.execPath, [updaterPath], {
			detached: true,
			stdio: 'ignore',
			windowsHide: true,
			env: { ...process.env, LAUNCHER_BUNDLE_OVERRIDE: bundlePath, UPDATER_PKG_NAME: this.pkgName },
		});
		child.unref();
	}

	readAndClearState(): UpdateState | null {
		const stateFile = path.join(this.configDir, 'update-state.json');
		try {
			const raw = fs.readFileSync(stateFile, 'utf-8');
			const state = JSON.parse(raw) as UpdateState;
			// Normalize legacy field names written by old updaters.
			if (state.status === 'update-failed') state.status = 'failed';
			if (!state.targetVersion && state.newVersion) state.targetVersion = state.newVersion;
			if (!state.error && state.reason) state.error = state.reason;
			// Only clear terminal states ('applying' means the updater is still running).
			if (state.status !== 'applying') {
				try { fs.unlinkSync(stateFile); } catch { /* ignore */ }
			}
			return state;
		} catch {
			return null;
		}
	}
}
