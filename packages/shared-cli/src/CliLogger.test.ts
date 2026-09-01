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

	it('writes ISO 8601 timestamp', () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'cli-logger-'));
		logCliInvocation(tmpDir, 'test', ['cmd']);
		const today = new Date().toISOString().slice(0, 10);
		const content = readFileSync(join(tmpDir, 'logs', `${today}.ndjson`), 'utf8');
		const entry = JSON.parse(content.trim().split('\n')[0]!) as Record<string, unknown>;
		expect(() => new Date(entry['ts'] as string).toISOString()).not.toThrow();
		expect(new Date(entry['ts'] as string).getTime()).toBeGreaterThan(0);
		// Format matches YYYY-MM-DDTHH:mm:ss.sssZ
		expect(entry['ts']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
	});
});
