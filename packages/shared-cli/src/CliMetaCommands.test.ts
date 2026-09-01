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

	it('prints error and returns (no crash) when fetch fails', async () => {
		const { execNpm } = await import('./NpmRunner.js');
		vi.mocked(execNpm).mockImplementation(() => { throw new Error('network error'); });
		const { cliVersionCommand } = await import('./CliMetaCommands.js');
		const err: string[] = [];
		vi.spyOn(process.stderr, 'write').mockImplementation((s) => { err.push(String(s)); return true; });

		await expect(cliVersionCommand('@test/pkg', '1.0.0')).resolves.toBeUndefined();
		expect(err.join('')).toContain('Failed to fetch');
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
});
