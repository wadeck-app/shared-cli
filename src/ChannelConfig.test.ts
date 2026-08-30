import { describe, it, expect, afterEach } from 'vitest';
import { readChannelFromConfig } from './ChannelConfig.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tmpDir: string;
afterEach(() => { if (tmpDir) rmSync(tmpDir, { recursive: true, force: true }); });

describe('readChannelFromConfig', () => {
	it('returns latest when no config.yml', () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'channel-cfg-'));
		expect(readChannelFromConfig(tmpDir)).toBe('latest');
	});

	it('reads channel from config.yml', () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'channel-cfg-'));
		writeFileSync(join(tmpDir, 'config.yml'), 'channel: edge\n');
		expect(readChannelFromConfig(tmpDir)).toBe('edge');
	});

	it('returns latest when channel key absent', () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'channel-cfg-'));
		writeFileSync(join(tmpDir, 'config.yml'), 'autoUpdate: false\n');
		expect(readChannelFromConfig(tmpDir)).toBe('latest');
	});
});
