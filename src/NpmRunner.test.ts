import { describe, it, expect, vi, beforeEach } from 'vitest';

// NpmRunner has a module-level constant USE_NPM_CLI set from existsSync at import time.
// We use vi.resetModules() + vi.doMock() to test each branch in isolation.

describe('execNpm — bundled npm branch (NPM_CLI_JS exists)', () => {
	beforeEach(() => { vi.resetModules(); });

	it('calls execFileSync with process.execPath and windowsHide:true', async () => {
		vi.doMock('node:fs', () => ({ existsSync: () => true }));
		vi.doMock('node:child_process', () => ({
			execFileSync: vi.fn().mockReturnValue('1.2.3\n'),
			execSync: vi.fn(),
		}));
		const { execNpm } = await import('./NpmRunner.js');
		const { execFileSync } = await import('node:child_process');

		const result = execNpm(['view', 'pkg', 'version']);

		expect(vi.mocked(execFileSync)).toHaveBeenCalledWith(
			process.execPath,
			expect.arrayContaining(['view', 'pkg', 'version']),
			expect.objectContaining({ windowsHide: true }),
		);
		expect(result).toBe('1.2.3\n');
	});
});

describe('execNpm — system npm branch (NPM_CLI_JS absent)', () => {
	beforeEach(() => { vi.resetModules(); });

	it('calls execSync with npm command and windowsHide:true', async () => {
		vi.doMock('node:fs', () => ({ existsSync: () => false }));
		vi.doMock('node:child_process', () => ({
			execFileSync: vi.fn(),
			execSync: vi.fn().mockReturnValue('1.2.3\n'),
		}));
		const { execNpm } = await import('./NpmRunner.js');
		const { execSync } = await import('node:child_process');

		const result = execNpm(['view', 'pkg', 'version']);

		expect(vi.mocked(execSync)).toHaveBeenCalledWith(
			expect.stringContaining('npm'),
			expect.objectContaining({ windowsHide: true }),
		);
		expect(result).toBe('1.2.3\n');
	});
});
