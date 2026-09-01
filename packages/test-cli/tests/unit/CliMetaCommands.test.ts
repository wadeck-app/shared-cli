import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Intercept node:child_process so execNpm (used by cliVersionCommand) does not
// hit the real npm registry. Both execFileSync and execSync are mocked because
// NpmRunner selects one or the other at module-load time depending on the
// execution environment.
vi.mock('node:child_process', () => ({
	execFileSync: vi.fn().mockReturnValue('2.0.0\n'),
	execSync: vi.fn().mockReturnValue('2.0.0\n'),
	spawn: vi.fn(),
}));

describe('cliRollbackCommand', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), 'rollback-test-'));
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	it('calls npm install with previousVersion and removes state file', async () => {
		const { cliRollbackCommand } = await import('@wadeck-app/shared-cli/CliMetaCommands');
		const { execFileSync } = await import('node:child_process');
		const mockExec = vi.mocked(execFileSync);

		writeFileSync(join(tmpDir, 'update-state.json'), JSON.stringify({
			status: 'rolled-back',
			previousVersion: '2026.8.31-010-abc12345',
			targetVersion: '2026.9.1-011-def67890',
		}));

		const out: string[] = [];
		vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true; });

		await cliRollbackCommand('@test/pkg', tmpDir);

		expect(mockExec).toHaveBeenCalledWith(
			expect.anything(),
			expect.arrayContaining(['install', '-g', '@test/pkg@2026.8.31-010-abc12345']),
			expect.anything()
		);
		expect(existsSync(join(tmpDir, 'update-state.json'))).toBe(false);
		expect(out.join('')).toContain('2026.8.31-010-abc12345');
	});

	it('exits 1 when state file is absent', async () => {
		const { cliRollbackCommand } = await import('@wadeck-app/shared-cli/CliMetaCommands');
		const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1'); });
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

		await expect(cliRollbackCommand('@test/pkg', tmpDir)).rejects.toThrow('exit:1');
		expect(mockExit).toHaveBeenCalledWith(1);
	});

	it('exits 1 when previousVersion is missing from state', async () => {
		const { cliRollbackCommand } = await import('@wadeck-app/shared-cli/CliMetaCommands');
		const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1'); });
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

		writeFileSync(join(tmpDir, 'update-state.json'), JSON.stringify({ status: 'rolled-back' }));

		await expect(cliRollbackCommand('@test/pkg', tmpDir)).rejects.toThrow('exit:1');
		expect(mockExit).toHaveBeenCalledWith(1);
	});
});

describe('cliVersionCommand', () => {
	afterEach(() => vi.restoreAllMocks());

	it('reports update available when a newer version exists', async () => {
		const { cliVersionCommand } = await import('@wadeck-app/shared-cli/CliMetaCommands');
		const out: string[] = [];
		vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true; });

		await cliVersionCommand('@test/pkg', '1.0.0', 'latest');

		const combined = out.join('');
		expect(combined).toContain('2.0.0');
		expect(combined).toContain('1.0.0');
	});

	it('reports up to date when current version matches remote', async () => {
		const cp = await import('node:child_process');
		vi.mocked(cp.execFileSync).mockReturnValue('1.0.0\n');
		vi.mocked(cp.execSync).mockReturnValue('1.0.0\n');
		const { cliVersionCommand } = await import('@wadeck-app/shared-cli/CliMetaCommands');
		const out: string[] = [];
		vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true; });

		await cliVersionCommand('@test/pkg', '1.0.0', 'latest');

		expect(out.join('')).toContain('up to date');
	});
});
