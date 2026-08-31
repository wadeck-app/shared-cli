import { describe, it, expect } from 'vitest';
import { parseDuration } from '@wadeck-app/shared-cli/Duration';

describe('parseDuration', () => {
	it.each([
		['500ms', 500],
		['1s', 1_000],
		['30s', 30_000],
		['2m', 120_000],
		['1h', 3_600_000],
		['1d', 86_400_000],
		['1.5h', 5_400_000],
		['0.5s', 500],
	])('parseDuration("%s") === %d', (input, expected) => {
		expect(parseDuration(input)).toBe(expected);
	});

	it.each(['', 'abc', '1x', '1 h', '-1s', '1', '1 s', 'h', '1H'])(
		'throws for invalid input "%s"',
		(input) => {
			expect(() => parseDuration(input)).toThrow(/Invalid duration/);
		},
	);
});
