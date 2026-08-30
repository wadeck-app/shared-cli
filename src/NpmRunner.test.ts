import { describe, it, expect, vi, afterEach } from 'vitest';

// execNpm delegates to child_process — we test the module can be imported and exports the function.
// Integration-level invocation is tested in each CLI's own test suite.
describe('NpmRunner', () => {
	it('exports execNpm function', async () => {
		const mod = await import('./NpmRunner.js');
		expect(typeof mod.execNpm).toBe('function');
	});
});
