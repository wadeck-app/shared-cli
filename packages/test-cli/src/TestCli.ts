#!/usr/bin/env node
/**
 * test-cli — integration test surface for @wadeck-app/shared-cli.
 *
 * Each subcommand exercises one or more features end-to-end and prints:
 *   [ok]   <test description>
 *   [fail] <test description> — <error detail>
 *
 * Exits 1 if any test fails.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDuration } from '@wadeck-app/shared-cli/Duration';
import { logCliInvocation } from '@wadeck-app/shared-cli/CliLogger';
import { runSelfCheck } from '@wadeck-app/shared-cli';
import type { SelfCheckResult } from '@wadeck-app/shared-cli';
import { cliVersionCommand, cliLogsCommand } from '@wadeck-app/shared-cli/CliMetaCommands';
import { ConfigDir } from '@wadeck-app/shared-cli/ConfigDir';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let failed = false;

function ok(label: string): void {
	process.stdout.write(`[ok]   ${label}\n`);
}

function fail(label: string, detail: string): void {
	process.stdout.write(`[fail] ${label} — ${detail}\n`);
	failed = true;
}

function assert(label: string, condition: boolean, detail?: string): void {
	if (condition) {
		ok(label);
	} else {
		fail(label, detail ?? 'assertion failed');
	}
}

function makeTempDir(): string {
	const dir = join(tmpdir(), `test-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

async function cmdDuration(): Promise<void> {
	process.stdout.write('=== duration ===\n');

	const cases: Array<[string, number]> = [
		['500ms', 500],
		['1s', 1_000],
		['2m', 120_000],
		['1h', 3_600_000],
		['1d', 86_400_000],
		['1.5h', 5_400_000],
	];

	for (const [input, expected] of cases) {
		try {
			const result = parseDuration(input);
			assert(`parseDuration("${input}") === ${expected}`, result === expected, `got ${result}`);
		} catch (err) {
			fail(`parseDuration("${input}")`, (err as Error).message);
		}
	}

	// Invalid inputs must throw
	const invalids = ['', 'abc', '1x', '1 h', '-1s', '1'];
	for (const input of invalids) {
		try {
			parseDuration(input);
			fail(`parseDuration("${input}") should throw`, 'no error was thrown');
		} catch {
			ok(`parseDuration("${input}") throws as expected`);
		}
	}
}

async function cmdLogInvocation(): Promise<void> {
	process.stdout.write('=== log-invocation ===\n');
	const dir = makeTempDir();
	try {
		const today = new Date().toISOString().slice(0, 10);
		const logFile = join(dir, 'logs', `${today}.ndjson`);

		// Write via logCliInvocation
		logCliInvocation(dir, 'test-cmd', ['--flag', 'value']);

		assert('log file created', existsSync(logFile), `missing: ${logFile}`);

		const raw = readFileSync(logFile, 'utf8').trim();
		assert('log file is non-empty', raw.length > 0);

		const line = JSON.parse(raw) as Record<string, unknown>;
		assert('entry has ts field', typeof line['ts'] === 'string');
		assert('entry has level=info', line['level'] === 'info');
		assert(
			'entry msg contains cmd name',
			typeof line['msg'] === 'string' && (line['msg'] as string).includes('test-cmd'),
			`msg was: ${line['msg']}`,
		);

		// Write a second entry
		logCliInvocation(dir, 'test-cmd', ['second-call']);
		const lines = readFileSync(logFile, 'utf8').trim().split('\n');
		assert('two entries after two calls', lines.length === 2, `got ${lines.length}`);
	} finally {
		rmSync(dir, { recursive: true });
	}
}

async function cmdLogs(): Promise<void> {
	process.stdout.write('=== logs ===\n');
	const dir = makeTempDir();
	try {
		const today = new Date().toISOString().slice(0, 10);
		const logDir = join(dir, 'logs');
		mkdirSync(logDir, { recursive: true });
		const logFile = join(logDir, `${today}.ndjson`);

		const entry = JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: 'hello test' });
		appendFileSync(logFile, entry + '\n');

		// Capture stdout from cliLogsCommand
		let captured = '';
		const orig = process.stdout.write.bind(process.stdout);
		(process.stdout as NodeJS.WriteStream).write = (chunk: unknown) => {
			captured += String(chunk);
			return true;
		};
		try {
			await cliLogsCommand(dir, { follow: false });
		} finally {
			(process.stdout as NodeJS.WriteStream).write = orig;
		}

		assert('cliLogsCommand outputs log content', captured.includes('hello test'), `got: ${captured.slice(0, 200)}`);
	} finally {
		rmSync(dir, { recursive: true });
	}
}

async function cmdSelfCheck(): Promise<void> {
	process.stdout.write('=== self-check ===\n');

	// Test 1: all pass
	let exitCalled = false;
	const origExit = process.exit.bind(process);
	// @ts-ignore — patching for test
	process.exit = (_code?: number) => { exitCalled = true; };

	let stderrOutput = '';
	const origStderr = process.stderr.write.bind(process.stderr);
	// @ts-ignore — patching for test
	process.stderr.write = (chunk: unknown) => { stderrOutput += String(chunk); return true; };

	try {
		await runSelfCheck([
			async (): Promise<SelfCheckResult> => ({ name: 'node version', ok: true }),
			async (): Promise<SelfCheckResult> => ({ name: 'config dir', ok: true }),
		], { quiet: false });

		assert('runSelfCheck all-pass: no exit(1)', !exitCalled);
		assert('runSelfCheck all-pass: stderr contains [ok]', stderrOutput.includes('[ok]'), `stderr: ${stderrOutput}`);

		// Test 2: one failure
		exitCalled = false;
		stderrOutput = '';
		await runSelfCheck([
			async (): Promise<SelfCheckResult> => ({ name: 'always-fail', ok: false, detail: 'intentional' }),
		], { quiet: false });

		assert('runSelfCheck with-fail: exit was called', exitCalled);
		assert('runSelfCheck with-fail: stderr contains [fail]', stderrOutput.includes('[fail]'), `stderr: ${stderrOutput}`);
	} finally {
		process.exit = origExit;
		// @ts-ignore
		process.stderr.write = origStderr;
	}
}

async function cmdVersion(): Promise<void> {
	process.stdout.write('=== version ===\n');
	process.stdout.write('[info] cliVersionCommand requires npm registry access — running with fake version\n');

	// Only verify the function exists and is callable without crashing on the type check
	assert('cliVersionCommand is a function', typeof cliVersionCommand === 'function');

	// Verify ConfigDir.get returns a non-empty path
	const configPath = ConfigDir.get('test-cli');
	assert('ConfigDir.get returns non-empty path', typeof configPath === 'string' && configPath.length > 0, `got: ${configPath}`);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const subcommand = process.argv[2];

const commands: Record<string, () => Promise<void>> = {
	duration: cmdDuration,
	'log-invocation': cmdLogInvocation,
	logs: cmdLogs,
	'self-check': cmdSelfCheck,
	version: cmdVersion,
};

if (!subcommand || subcommand === 'help' || subcommand === '--help') {
	process.stdout.write('Usage: test-cli <command>\n\nCommands:\n');
	for (const name of Object.keys(commands)) {
		process.stdout.write(`  ${name}\n`);
	}
	process.exit(0);
}

if (!(subcommand in commands)) {
	process.stderr.write(`Unknown command: "${subcommand}". Run "test-cli help" for usage.\n`);
	process.exit(1);
}

commands[subcommand]!()
	.then(() => {
		if (failed) {
			process.stderr.write('\nOne or more tests failed.\n');
			process.exit(1);
		}
	})
	.catch((err: unknown) => {
		process.stderr.write(`Unexpected error: ${(err as Error).message}\n`);
		process.exit(1);
	});
