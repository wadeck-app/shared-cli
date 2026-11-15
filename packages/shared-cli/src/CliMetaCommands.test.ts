import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('./NpmRunner.js', () => ({ execNpm: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('node:fs', async () => {
	const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
	return { ...actual, watchFile: vi.fn(), unwatchFile: vi.fn() };
});

let tmpDir: string;
afterEach(() => {
	if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
	vi.restoreAllMocks();
});

describe('cliLogsCommand', () => {
	it('prints nothing and returns when no log file and no follow', async () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'cli-meta-'));
		const { cliLogsCommand } = await import('./CliMetaCommands.js');
		const out: string[] = [];
		vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true; });
		await cliLogsCommand(tmpDir, { follow: false });
		expect(out.some(l => l.includes('No log file'))).toBe(true);
	});

	it('prints existing log content', async () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'cli-meta-'));
		const today = new Date().toISOString().slice(0, 10);
		const logsDir = join(tmpDir, 'logs');
		rmSync(logsDir, { recursive: true, force: true });
		const { mkdirSync } = await import('node:fs');
		mkdirSync(logsDir, { recursive: true });
		writeFileSync(join(logsDir, `${today}.ndjson`), '{"ts":"2026-01-01","level":"info","msg":"test"}\n');
		const { cliLogsCommand } = await import('./CliMetaCommands.js');
		const out: string[] = [];
		vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true; });
		await cliLogsCommand(tmpDir, { follow: false });
		expect(out.join('')).toContain('"msg":"test"');
	});

	it('follow mode: shows newly appended content when file changes', async () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'cli-meta-'));
		const today = new Date().toISOString().slice(0, 10);
		const logsDir = join(tmpDir, 'logs');
		const { mkdirSync } = await import('node:fs');
		mkdirSync(logsDir, { recursive: true });
		const logFile = join(logsDir, `${today}.ndjson`);
		const initial = '{"ts":"2026-01-01","msg":"first"}\n';
		writeFileSync(logFile, initial);

		const fs = await import('node:fs');
		let watchCb: (() => void) | undefined;
		vi.spyOn(fs, 'watchFile').mockImplementation((_f: any, _opts: any, cb: any) => {
			watchCb = cb;
			// violations-suppress: ts/no-unsafe-type-cast test mock return value - StatWatcher is never used
			return {} as any;
		});
		vi.spyOn(fs, 'unwatchFile').mockImplementation(() => {});

		let sigintHandler: (() => void) | undefined;
		vi.spyOn(process, 'on').mockImplementation((event: string, cb: () => void) => {
			if (event === 'SIGINT') sigintHandler = cb;
			return process;
		});

		const { cliLogsCommand } = await import('./CliMetaCommands.js');
		const out: string[] = [];
		vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true; });

		const promise = cliLogsCommand(tmpDir, { follow: true });

		// Append new content and simulate file-change event
		const appended = '{"ts":"2026-01-02","msg":"appended"}\n';
		writeFileSync(logFile, initial + appended);
		watchCb!();

		// Resolve the follow-mode promise via the captured SIGINT handler
		sigintHandler!();
		await promise;

		expect(out.join('')).toContain('"msg":"appended"');
	});

	it('follow mode: resets offset when file shrinks (rotation)', async () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'cli-meta-'));
		const today = new Date().toISOString().slice(0, 10);
		const logsDir = join(tmpDir, 'logs');
		const { mkdirSync } = await import('node:fs');
		mkdirSync(logsDir, { recursive: true });
		const logFile = join(logsDir, `${today}.ndjson`);
		const initial = '{"ts":"2026-01-01","msg":"before-rotation"}\n';
		writeFileSync(logFile, initial);

		const fs = await import('node:fs');
		let watchCb: (() => void) | undefined;
		vi.spyOn(fs, 'watchFile').mockImplementation((_f: any, _opts: any, cb: any) => {
			watchCb = cb;
			// violations-suppress: ts/no-unsafe-type-cast test mock return value - StatWatcher is never used
			return {} as any;
		});
		vi.spyOn(fs, 'unwatchFile').mockImplementation(() => {});

		let sigintHandler: (() => void) | undefined;
		vi.spyOn(process, 'on').mockImplementation((event: string, cb: () => void) => {
			if (event === 'SIGINT') sigintHandler = cb;
			return process;
		});

		const { cliLogsCommand } = await import('./CliMetaCommands.js');
		const out: string[] = [];
		vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true; });

		const promise = cliLogsCommand(tmpDir, { follow: true });

		// Overwrite with shorter content (simulate rotation/truncation)
		const rotated = '{"ts":"2026-01-03","msg":"after-rotation"}\n';
		writeFileSync(logFile, rotated);
		watchCb!();

		sigintHandler!();
		await promise;

		// After rotation, offset resets to 0 so the new content is read from start
		expect(out.join('')).toContain('"msg":"after-rotation"');
	});
});

describe('cliVersionCommand', () => {
	it('reports up to date when latest matches current', async () => {
		const { execNpm } = await import('./NpmRunner.js');
		vi.mocked(execNpm).mockReturnValue('1.2.3\n');
		const { cliVersionCommand } = await import('./CliMetaCommands.js');
		const out: string[] = [];
		vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true; });

		await cliVersionCommand('@test/pkg', '1.2.3');

		expect(out.join('')).toContain('up to date');
	});

	it('reports available update when latest is newer', async () => {
		const { execNpm } = await import('./NpmRunner.js');
		vi.mocked(execNpm).mockReturnValue('2.0.0\n');
		const { cliVersionCommand } = await import('./CliMetaCommands.js');
		const out: string[] = [];
		vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true; });

		await cliVersionCommand('@test/pkg', '1.0.0');

		expect(out.join('')).toContain('2.0.0');
		expect(out.join('')).toContain('1.0.0');
	});

	describe('when the latest version cannot be fetched', () => {
		const npmFailure = (message: string, extra: Record<string, unknown> = {}) =>
			Object.assign(new Error(message), extra);

		async function run(failure: unknown): Promise<{ out: string; err: string; result: unknown }> {
			const { execNpm } = await import('./NpmRunner.js');
			vi.mocked(execNpm).mockImplementation(() => { throw failure; });
			const { cliVersionCommand } = await import('./CliMetaCommands.js');
			const out: string[] = [];
			const err: string[] = [];
			vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true; });
			vi.spyOn(process.stderr, 'write').mockImplementation((s) => { err.push(String(s)); return true; });
			const result = await cliVersionCommand('@test/pkg', '1.0.0', 'latest');
			return { out: out.join(''), err: err.join(''), result };
		}
		const UNKNOWN_LINE = '@test/pkg: current=1.0.0 latest=unknown (channel: latest)\n';

		it('ECONNREFUSED: stdout keeps the installed version, stderr names the cause', async () => {
			const r = await run(npmFailure('Command failed', { stderr: 'npm error code ECONNREFUSED\nnpm error errno ECONNREFUSED\nnpm error request to https://npm.pkg.github.com/x failed' }));
			expect(r.result).toBeUndefined();
			expect(r.out).toBe(UNKNOWN_LINE);
			expect(r.err.trim().split('\n')).toHaveLength(1);
			expect(r.err).toContain('warning');
			expect(r.err).toContain('network unreachable');
			expect(r.err).toContain('ECONNREFUSED');
			expect(r.err).toContain('registry URL');
		});

		it('timeout', async () => {
			const r = await run(npmFailure('spawnSync node ETIMEDOUT', { code: 'ETIMEDOUT', killed: true }));
			expect(r.out).toBe(UNKNOWN_LINE);
			expect(r.err).toContain('timed out');
			expect(r.err).toContain('registry URL');
		});

		it('401 names authentication and the token', async () => {
			const r = await run(npmFailure('Command failed', { stderr: 'npm error code E401\nnpm error 401 Unauthorized - GET https://npm.pkg.github.com/@test%2fpkg' }));
			expect(r.out).toBe(UNKNOWN_LINE);
			expect(r.err).toContain('authentication');
			expect(r.err).toContain('401');
			expect(r.err).toContain('token');
		});

		it('403 names authentication', async () => {
			const r = await run(npmFailure('Command failed', { stderr: 'npm error code E403\nnpm error 403 Forbidden' }));
			expect(r.err).toContain('authentication');
			expect(r.err).toContain('403');
		});

		it('404 keeps the HTTP status', async () => {
			const r = await run(npmFailure('Command failed', { stderr: 'npm error code E404\nnpm error 404 Not Found - GET https://npm.pkg.github.com/@test%2fpkg' }));
			expect(r.out).toBe(UNKNOWN_LINE);
			expect(r.err).toContain('HTTP 404');
			expect(r.err).toContain('registry URL');
		});

		it('503 keeps the HTTP status', async () => {
			const r = await run(npmFailure('Command failed', { stderr: 'npm error code E503\nnpm error 503 Service Unavailable' }));
			expect(r.err).toContain('HTTP 503');
		});

		it('an unrecognized error keeps its real text', async () => {
			const r = await run(npmFailure('something odd happened'));
			expect(r.out).toBe(UNKNOWN_LINE);
			expect(r.err).toContain('something odd happened');
		});

		it('a non-Error throw is still reported', async () => {
			const r = await run('boom');
			expect(r.err).toContain('boom');
			expect(r.out).toBe(UNKNOWN_LINE);
		});
	});

	describe('malformed answers', () => {
		for (const [name, answer] of [['empty', '\n'], ['html', '<html>oops</html>'], ['json object', '{"error":"x"}'], ['several lines', '1.0.0\n2.0.0']] as const) {
			it(`${name}: reported, not printed as a version`, async () => {
				const { execNpm } = await import('./NpmRunner.js');
				vi.mocked(execNpm).mockReturnValue(answer);
				const { cliVersionCommand } = await import('./CliMetaCommands.js');
				const out: string[] = [];
				const err: string[] = [];
				vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true; });
				vi.spyOn(process.stderr, 'write').mockImplementation((s) => { err.push(String(s)); return true; });
				await cliVersionCommand('@test/pkg', '1.0.0');
				expect(out.join('')).toBe('@test/pkg: current=1.0.0 latest=unknown (channel: latest)\n');
				expect(err.join('')).toContain('unexpected answer');
			});
		}
	});

	it('online output is unchanged and writes nothing on stderr', async () => {
		const { execNpm } = await import('./NpmRunner.js');
		vi.mocked(execNpm).mockReturnValue('2.0.0\n');
		const { cliVersionCommand } = await import('./CliMetaCommands.js');
		const out: string[] = [];
		const err: string[] = [];
		vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true; });
		vi.spyOn(process.stderr, 'write').mockImplementation((s) => { err.push(String(s)); return true; });
		await cliVersionCommand('@test/pkg', '1.0.0');
		expect(out.join('')).toBe('@test/pkg: current=1.0.0 latest=2.0.0 (channel: latest)\n');
		expect(err).toEqual([]);
	});

	it('queries dist-tags.edge when channel is edge', async () => {
		const { execNpm } = await import('./NpmRunner.js');
		vi.mocked(execNpm).mockReturnValue('"1.0.0"');
		const { cliVersionCommand } = await import('./CliMetaCommands.js');
		vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

		await cliVersionCommand('@test/pkg', '1.0.0', 'edge');

		expect(vi.mocked(execNpm)).toHaveBeenCalledWith(
			expect.arrayContaining(['view', '@test/pkg', 'dist-tags.edge']),
			expect.anything(),
		);
	});
});

describe('cliUpdateCommand', () => {
	it('reports error and exits when updater file does not exist', async () => {
		const { cliUpdateCommand } = await import('./CliMetaCommands.js');
		const err: string[] = [];
		vi.spyOn(process.stderr, 'write').mockImplementation((s) => { err.push(String(s)); return true; });
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });

		await expect(cliUpdateCommand('/nonexistent/updater.cjs', '@test/pkg')).rejects.toThrow('exit');

		expect(err.join('')).toContain('Updater not found');
		expect(exitSpy).toHaveBeenCalledWith(1);
		exitSpy.mockRestore();
	});

	it('warns when --force is passed (it is not needed)', async () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'cli-meta-'));
		const updaterPath = join(tmpDir, 'updater.cjs');
		writeFileSync(updaterPath, '');
		const { spawn } = await import('node:child_process');
		const mockChild = { on: vi.fn((event: string, cb: (code: number) => void) => { if (event === 'close') cb(0); }), };
		vi.mocked(spawn).mockReturnValue(mockChild as never);
		const { cliUpdateCommand } = await import('./CliMetaCommands.js');
		const err: string[] = [];
		vi.spyOn(process.stderr, 'write').mockImplementation((s) => { err.push(String(s)); return true; });
		vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

		await cliUpdateCommand(updaterPath, '@test/pkg', { rawArgs: ['--force'] });

		expect(err.join('')).toContain('--force is not needed');
	});

	it('spawns updater with UPDATER_FORCE=1 when file exists', async () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'cli-meta-'));
		const updaterPath = join(tmpDir, 'updater.cjs');
		writeFileSync(updaterPath, '');
		const { spawn } = await import('node:child_process');
		const mockChild = { on: vi.fn((event: string, cb: (code: number) => void) => { if (event === 'close') cb(0); }), };
		vi.mocked(spawn).mockReturnValue(mockChild as never);
		const { cliUpdateCommand } = await import('./CliMetaCommands.js');
		vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

		await cliUpdateCommand(updaterPath, '@test/pkg');

		expect(vi.mocked(spawn)).toHaveBeenCalledWith(
			process.execPath,
			[updaterPath],
			expect.objectContaining({ env: expect.objectContaining({ UPDATER_FORCE: '1' }) }),
		);
	});

	// The updater prints why it failed (shared-updater, UPDATER_FORCE=1). A rejection here ended as an unhandled-rejection stack trace of
	// "Updater exited with code 1" under those lines in every CLI that does not catch it.
	it('a failed update is one line and the exit code, not an exception', async () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'cli-meta-'));
		const updaterPath = join(tmpDir, 'updater.cjs');
		writeFileSync(updaterPath, '');
		const { spawn } = await import('node:child_process');
		const mockChild = { on: vi.fn((event: string, cb: (code: number) => void) => { if (event === 'close') cb(1); }), };
		vi.mocked(spawn).mockReturnValue(mockChild as never);
		const { cliUpdateCommand } = await import('./CliMetaCommands.js');
		const err: string[] = [];
		vi.spyOn(process.stderr, 'write').mockImplementation((s) => { err.push(String(s)); return true; });
		vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		const previous = process.exitCode;
		process.exitCode = undefined;

		await expect(cliUpdateCommand(updaterPath, '@test/pkg')).resolves.toBeUndefined();

		expect(err.join('')).toContain('Update of @test/pkg failed (the updater exited with code 1): the lines above say why');
		expect(process.exitCode).toBe(1);
		process.exitCode = previous;
	});
});

describe('cliRollbackCommand', () => {
	it('errors when no update-state.json', async () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'cli-meta-'));
		const { cliRollbackCommand } = await import('./CliMetaCommands.js');
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		await expect(cliRollbackCommand('@test/pkg', tmpDir)).rejects.toThrow('exit');
		exitSpy.mockRestore();
	});

	it('errors when previousVersion is missing', async () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'cli-meta-'));
		writeFileSync(join(tmpDir, 'update-state.json'), JSON.stringify({ status: 'success' }));
		const { cliRollbackCommand } = await import('./CliMetaCommands.js');
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		await expect(cliRollbackCommand('@test/pkg', tmpDir)).rejects.toThrow('exit');
		exitSpy.mockRestore();
	});

	it('happy path: calls execNpm install, removes state file, and shows success', async () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'cli-meta-'));
		const stateFile = join(tmpDir, 'update-state.json');
		writeFileSync(stateFile, JSON.stringify({ previousVersion: '1.0.0' }));

		const { execNpm } = await import('./NpmRunner.js');
		vi.mocked(execNpm).mockReturnValue('');

		const { cliRollbackCommand } = await import('./CliMetaCommands.js');
		const out: string[] = [];
		vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true; });

		await cliRollbackCommand('@test/pkg', tmpDir);

		expect(vi.mocked(execNpm)).toHaveBeenCalledWith(
			['install', '-g', '@test/pkg@1.0.0'],
			expect.anything(),
		);
		expect(existsSync(stateFile)).toBe(false);
		expect(out.join('')).toContain('Rolled back to 1.0.0');
	});
});

describe('warnUnknownArgs', () => {
	it('warns for each unrecognized argument', async () => {
		const { warnUnknownArgs } = await import('./CliMetaCommands.js');
		const err: string[] = [];
		vi.spyOn(process.stderr, 'write').mockImplementation((s) => { err.push(String(s)); return true; });

		warnUnknownArgs(['--follow', '--unknown', '--foo'], ['--follow'], 'cli logs');

		expect(err.join('')).toContain("unknown argument '--unknown'");
		expect(err.join('')).toContain("unknown argument '--foo'");
		expect(err.join('')).not.toContain("'--follow'");
	});

	it('does nothing when all args are recognized', async () => {
		const { warnUnknownArgs } = await import('./CliMetaCommands.js');
		const err: string[] = [];
		vi.spyOn(process.stderr, 'write').mockImplementation((s) => { err.push(String(s)); return true; });

		warnUnknownArgs(['--follow'], ['--follow'], 'cli logs');

		expect(err).toHaveLength(0);
	});

	it('does not flag the value of a value-taking flag as unknown', async () => {
		const { warnUnknownArgs } = await import('./CliMetaCommands.js');
		const err: string[] = [];
		vi.spyOn(process.stderr, 'write').mockImplementation((s) => { err.push(String(s)); return true; });

		warnUnknownArgs(['--job', 'codex-update', '--tail', '150'], ['--job', '--tail'], 'orch logs', new Set(['--job', '--tail']));

		expect(err).toHaveLength(0);
	});

	it('still flags unknown args alongside value-taking flags', async () => {
		const { warnUnknownArgs } = await import('./CliMetaCommands.js');
		const err: string[] = [];
		vi.spyOn(process.stderr, 'write').mockImplementation((s) => { err.push(String(s)); return true; });

		warnUnknownArgs(['--job', 'codex-update', '--bogus'], ['--job'], 'orch logs', new Set(['--job']));

		expect(err.join('')).toContain("unknown argument '--bogus'");
		expect(err.join('')).not.toContain("'codex-update'");
	});
});
