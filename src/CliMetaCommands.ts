import { readFileSync, existsSync, statSync, openSync, readSync, closeSync, watchFile, unwatchFile, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { execNpm } from './NpmRunner.js';
import { VersionValidation } from './VersionValidation.js';

export async function cliLogsCommand(configDir: string, opts: { follow?: boolean } = {}): Promise<void> {
	const today = new Date().toISOString().slice(0, 10);
	const logFile = join(configDir, 'logs', `${today}.ndjson`);

	if (!existsSync(logFile)) {
		process.stdout.write(`No log file for today: ${logFile}\n`);
		if (!opts.follow) return;
	}

	let offset = 0;

	if (existsSync(logFile)) {
		const content = readFileSync(logFile, 'utf8');
		process.stdout.write(content);
		offset = Buffer.byteLength(content, 'utf8');
	}

	if (!opts.follow) return;

	await new Promise<void>((resolve) => {
		watchFile(logFile, { interval: 250 }, () => {
			if (!existsSync(logFile)) return;
			const size = statSync(logFile).size;
			if (size <= offset) return;
			const buf = Buffer.alloc(size - offset);
			const fd = openSync(logFile, 'r');
			readSync(fd, buf, 0, buf.length, offset);
			closeSync(fd);
			offset = size;
			process.stdout.write(buf.toString('utf8'));
		});
		process.on('SIGINT', () => { unwatchFile(logFile); resolve(); });
	});
}

export async function cliVersionCommand(pkgName: string, current: string, channel = 'latest'): Promise<void> {
	let latest: string;
	try {
		latest = execNpm(['view', pkgName, `dist-tags.${channel}`], { timeout: 15_000 }).trim();
	} catch {
		process.stderr.write(`Failed to fetch latest version for ${pkgName}\n`);
		return;
	}
	if (latest === current) {
		process.stdout.write(`${pkgName}@${current} is up to date\n`);
	} else {
		process.stdout.write(`${pkgName}: current=${current} latest=${latest} (channel: ${channel})\n`);
	}
}

export async function cliUpdateCommand(updaterPath: string, pkgName: string): Promise<void> {
	if (!existsSync(updaterPath)) {
		process.stderr.write(`Updater not found: ${updaterPath}\n`);
		process.exit(1);
	}
	process.stdout.write(`Running updater for ${pkgName}...\n`);
	await new Promise<void>((resolve, reject) => {
		const child = spawn(process.execPath, [updaterPath], {
			env: { ...process.env, UPDATER_FORCE: '1' },
			stdio: 'inherit',
			windowsHide: true,
		});
		child.on('close', code => code === 0 ? resolve() : reject(new Error(`Updater exited with code ${code}`)));
	});
}

export async function cliRollbackCommand(pkgName: string, configDir: string): Promise<void> {
	const stateFile = join(configDir, 'update-state.json');
	if (!existsSync(stateFile)) {
		process.stderr.write('No update-state.json found — nothing to roll back\n');
		process.exit(1);
	}
	let state: { previousVersion?: string };
	try {
		state = JSON.parse(readFileSync(stateFile, 'utf8'));
	} catch {
		process.stderr.write('update-state.json is corrupt\n');
		process.exit(1);
	}
	const prev = state.previousVersion;
	if (!prev || !VersionValidation.VERSION_RE.test(prev)) {
		process.stderr.write(`Invalid or missing previousVersion in update-state.json\n`);
		process.exit(1);
	}
	process.stdout.write(`Rolling back ${pkgName} to ${prev}...\n`);
	execNpm(['install', '-g', `${pkgName}@${prev}`], { timeout: 5 * 60_000 });
	rmSync(stateFile);
	process.stdout.write(`Rolled back to ${prev}\n`);
}
