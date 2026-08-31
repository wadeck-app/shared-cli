import { describe, it, expect, afterEach } from 'vitest';
import { logCliInvocation } from './CliLogger.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tmpDir: string;

afterEach(() => { if (tmpDir) rmSync(tmpDir, { recursive: true, force: true }); });

describe('logCliInvocation', () => {
	it('writes ndjson entry to daily log file', () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'cli-logger-'));
		logCliInvocation(tmpDir, 'queue', ['push', '--data', 'foo']);
		const today = new Date().toISOString().slice(0, 10);
		const content = readFileSync(join(tmpDir, 'logs', `${today}.ndjson`), 'utf8');
		const entry = JSON.parse(content.trim());
		expect(entry.level).toBe('info');
		expect(entry.msg).toBe('cmd: queue push --data foo');
		expect(entry.ts).toBeDefined();
	});

	it('creates logs dir if absent', () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'cli-logger-'));
		expect(() => logCliInvocation(tmpDir, 'test', [])).not.toThrow();
	});

	it('trims trailing space when args is empty', () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'cli-logger-'));
		logCliInvocation(tmpDir, 'myapp', []);
		const today = new Date().toISOString().slice(0, 10);
		const content = readFileSync(join(tmpDir, 'logs', `${today}.ndjson`), 'utf8');
		const entry = JSON.parse(content.trim());
		expect(entry.msg).toBe('cmd: myapp');
	});
});
