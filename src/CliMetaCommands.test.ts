import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
