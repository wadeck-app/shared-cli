import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logCliInvocation } from '@wadeck-app/shared-cli/CliLogger';

function makeTempDir(): string {
	const dir = join(tmpdir(), `test-cli-logger-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

describe('logCliInvocation', () => {
	const dirs: string[] = [];

	afterEach(() => {
		for (const d of dirs.splice(0)) {
			rmSync(d, { recursive: true, force: true });
		}
	});

	it('creates log file with correct NDJSON entry', () => {
		const dir = makeTempDir();
		dirs.push(dir);

		logCliInvocation(dir, 'my-cmd', ['--foo', 'bar']);

		const today = new Date().toISOString().slice(0, 10);
		const logFile = join(dir, 'logs', `${today}.ndjson`);

		expect(existsSync(logFile)).toBe(true);

		const line: Record<string, unknown> = JSON.parse(readFileSync(logFile, 'utf8').trim());
		expect(typeof line['ts']).toBe('string');
		expect(line['level']).toBe('info');
		expect(line['msg']).toContain('my-cmd');
		expect(line['msg']).toContain('--foo');
	});

	it('appends a new entry on each call', () => {
		const dir = makeTempDir();
		dirs.push(dir);

		logCliInvocation(dir, 'cmd', ['first']);
		logCliInvocation(dir, 'cmd', ['second']);

		const today = new Date().toISOString().slice(0, 10);
		const logFile = join(dir, 'logs', `${today}.ndjson`);
		const lines = readFileSync(logFile, 'utf8').trim().split('\n');
		expect(lines).toHaveLength(2);
	});

	it('works with no args', () => {
		const dir = makeTempDir();
		dirs.push(dir);

		logCliInvocation(dir, 'bare-cmd', []);

		const today = new Date().toISOString().slice(0, 10);
		const logFile = join(dir, 'logs', `${today}.ndjson`);
		const line: Record<string, unknown> = JSON.parse(readFileSync(logFile, 'utf8').trim());
		expect(line['msg']).toBe('cmd: bare-cmd');
	});
});
