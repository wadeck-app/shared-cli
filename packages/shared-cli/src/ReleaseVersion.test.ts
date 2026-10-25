import { describe, expect, it } from 'vitest';

import { devBuildRefusalMessage, isReleaseVersion } from './ReleaseVersion.js';

describe('isReleaseVersion', () => {
	it('accepts the CI-stamped GitHub Packages format', () => {
		expect(isReleaseVersion('2026.10.24-143-a4606f23')).toBe(true);
		expect(isReleaseVersion('2026.08.23-009-0123abcd')).toBe(true);
	});

	it.each(['0.1.0', '0.0.0', '0.0.0-dev', '1.2.0', '2026.10.25-143012-512-a1b2c3d4', '2026.10.25-143012-0-DEV', '2026.13.01-143-a4606f23', '2026.10.24-14-a4606f23', '2026.10.24-143-A4606F23'])(
		'rejects %s',
		(v) => {
			expect(isReleaseVersion(v)).toBe(false);
		},
	);

	it('rejects empty and missing values', () => {
		expect(isReleaseVersion('')).toBe(false);
		expect(isReleaseVersion(undefined)).toBe(false);
		expect(isReleaseVersion(null)).toBe(false);
	});
});

describe('devBuildRefusalMessage', () => {
	it('names the binary, the version and the actionable alternative', () => {
		const msg = devBuildRefusalMessage('violations', '0.1.0');
		expect(msg).toContain('dev build 0.1.0');
		expect(msg).toContain('violations cli update');
	});
});
