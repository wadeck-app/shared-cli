import { describe, it, expect } from 'vitest';
import { parseDuration } from './Duration.js';

describe('parseDuration', () => {
	it('parses milliseconds', () => expect(parseDuration('500ms')).toBe(500));
	it('parses seconds', () => expect(parseDuration('10s')).toBe(10_000));
	it('parses minutes', () => expect(parseDuration('30m')).toBe(1_800_000));
	it('parses hours', () => expect(parseDuration('1h')).toBe(3_600_000));
	it('parses days', () => expect(parseDuration('2d')).toBe(172_800_000));
	it('parses decimal', () => expect(parseDuration('1.5h')).toBe(5_400_000));
	it('throws on invalid', () => expect(() => parseDuration('abc')).toThrow('Invalid duration'));
	it('throws on bare number', () => expect(() => parseDuration('100')).toThrow('Invalid duration'));
	it('returns 0 for "0ms"', () => expect(parseDuration('0ms')).toBe(0));
	it('throws for negative values', () => expect(() => parseDuration('-1s')).toThrow());
	it('handles very large values without overflow', () => {
		expect(parseDuration('999999h')).toBe(999999 * 3600 * 1000);
	});
	it('throws for empty string', () => expect(() => parseDuration('')).toThrow());
	it('throws for number without unit', () => expect(() => parseDuration('42')).toThrow());
});
