import { readFileSync, existsSync, statSync, openSync, readSync, closeSync, watchFile, unwatchFile, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { execNpm } from './NpmRunner.js';
import { VersionValidation } from './VersionValidation.js';

/**
 * Warns about unrecognized arguments passed to a CLI subcommand.
 * Prevents silent failure when users pass typos or unsupported flags.
 * `valueFlags` lists flags that consume the following token as their value
 * (e.g. `--job <id>`), so that value is not itself flagged as unknown.
 */
export function warnUnknownArgs(rawArgs: string[], knownArgs: string[], cmdName: string, valueFlags: Set<string> = new Set()): void {
	for (let i = 0; i < rawArgs.length; i++) {
		const arg = rawArgs[i];
		if (valueFlags.has(arg)) {
			i++;
			continue;
		}
		if (!knownArgs.includes(arg)) {
			process.stderr.write(`[warning] ${cmdName}: unknown argument '${arg}' — ignored\n`);
		}
	}
}

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
			// Reset offset if file was truncated or rotated to avoid stale position
			if (size < offset) offset = 0;
			if (size === offset) return;
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

const REGISTRY_CHECK_HINT = 'check the registry URL and the auth token in your user .npmrc, then try again';

/** Turns a failed `npm view` into one actionable sentence that keeps the real error text. */
function describeFetchFailure(error: unknown): string {
	const err = error as { stderr?: unknown; code?: unknown } | null;
	const stderr = err && typeof err.stderr !== 'undefined' ? String(err.stderr).trim() : '';
	const message = String(error);
	const detail = (stderr || message).split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 4).join(' | ');
	const code = err && typeof err.code === 'string' ? err.code : '';
	const text = `${stderr}\n${message}`;

	if (code === 'ETIMEDOUT' || /ETIMEDOUT|timed out/i.test(text)) {
		return `the registry did not answer in time (timed out) [${detail}]; ${REGISTRY_CHECK_HINT}`;
	}
	if (/\bE?40[13]\b/.test(text)) {
		const status = /\bE?(40[13])\b/.exec(text)?.[1];
		return `registry refused the authentication (HTTP ${status}) [${detail}]; ${REGISTRY_CHECK_HINT}`;
	}
	const http = /\bE?([45]\d\d)\b/.exec(text)?.[1];
	if (http) {
		return `registry answered HTTP ${http} [${detail}]; ${REGISTRY_CHECK_HINT}`;
	}
	if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ENETUNREACH|EHOSTUNREACH|network/i.test(text)) {
		return `network unreachable [${detail}]; ${REGISTRY_CHECK_HINT}`;
	}
	return `${detail}; ${REGISTRY_CHECK_HINT}`;
}

/**
 * Prints the installed version always (stdout); the latest one only when the registry answers.
 * A registry failure is a warning on stderr with the cause, never a failure of the command (exit code unchanged).
 */
export async function cliVersionCommand(pkgName: string, current: string, channel = 'latest'): Promise<void> {
	let latest: string | undefined;
	let problem: string | undefined;
	try {
		const answer = execNpm(['view', pkgName, `dist-tags.${channel}`], { timeout: 15_000 }).trim();
		if (answer === '' || /[\s<>{}[\]]/.test(answer)) {
			const shown = answer === '' ? '(empty)' : JSON.stringify(answer.length > 80 ? `${answer.slice(0, 80)}...` : answer);
			problem = `unexpected answer from the registry for dist-tags.${channel}: ${shown}; ${REGISTRY_CHECK_HINT}`;
		} else {
			latest = answer;
		}
	} catch (error) {
		problem = describeFetchFailure(error);
	}
	if (latest === undefined) {
		process.stdout.write(`${pkgName}: current=${current} latest=unknown (channel: ${channel})\n`);
		process.stderr.write(`[warning] could not fetch the latest version of ${pkgName}: ${problem}\n`);
		return;
	}
	if (latest === current) {
		process.stdout.write(`${pkgName}@${current} is up to date\n`);
	} else {
		process.stdout.write(`${pkgName}: current=${current} latest=${latest} (channel: ${channel})\n`);
	}
}

export async function cliUpdateCommand(
	updaterPath: string,
	pkgName: string,
	opts?: { rawArgs?: string[] },
): Promise<void> {
	if (opts?.rawArgs?.includes('--force')) {
		process.stderr.write(`[warning] --force is not needed — 'cli update' always checks immediately\n`);
	}
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
