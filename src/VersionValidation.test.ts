import { describe, expect, it } from 'vitest';

import { VersionValidation } from './VersionValidation.js';

// ---------------------------------------------------------------------------
// VERSION_RE — pattern matching
// ---------------------------------------------------------------------------
describe('VersionValidation.VERSION_RE', () => {
	it.each([
		'1.0.0',
		'2.3.4',
		'0.0.0',
		'10.20.30',
		'2026.08.20',
		'1.0.0-alpha',
		'1.0.0-alpha.1',
		'2026.08.20-319-abc1234',
		'1.0.0+build.123',
		'2026.08.20-142-a3f2b1c4',
	])('matches valid version: %s', (v) => {
		expect(VersionValidation.VERSION_RE.test(v)).toBe(true);
	});

	it.each([
		'dev',
		'',
		'1.0',
		'1',
		'v1.0.0',
		'1.0.0.0',
		'1.0.0 ',
		' 1.0.0',
	])('rejects invalid version: %s', (v) => {
		expect(VersionValidation.VERSION_RE.test(v)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// validate() — return value and error throwing
// ---------------------------------------------------------------------------
describe('VersionValidation.validate', () => {
	it('returns the version string for valid semver', () => {
		expect(VersionValidation.validate('1.2.3')).toBe('1.2.3');
	});

	it('returns the version string for valid CalVer (YYYY.MM.DD-BUILD-SHA)', () => {
		expect(VersionValidation.validate('2026.08.20-142-a3f2b1c4')).toBe('2026.08.20-142-a3f2b1c4');
	});

	it('returns the version string for semver with pre-release suffix', () => {
		expect(VersionValidation.validate('1.0.0-alpha.1')).toBe('1.0.0-alpha.1');
	});

	it.each(['dev', '', '1.0', 'v1.0.0', '1.0.0.0'])('throws for invalid string: %s', (v) => {
		expect(() => VersionValidation.validate(v)).toThrow(`Invalid version string: "${v}"`);
	});
});
