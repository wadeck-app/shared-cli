import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('./NpmRunner.js', () => ({ execNpm: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

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
});
