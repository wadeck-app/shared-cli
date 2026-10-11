import { describe, it, expect, vi } from 'vitest';
import { LiveRegion } from './LiveRegion.js';

function fakeStream(): { write: ReturnType<typeof vi.fn>; stream: NodeJS.WriteStream } {
	const write = vi.fn().mockReturnValue(true);
	return { write, stream: { write } as unknown as NodeJS.WriteStream };
}

describe('LiveRegion', () => {
	it('writes lines without a cursor-clear sequence on the first render', () => {
		const { write, stream } = fakeStream();
		new LiveRegion(stream).render(['a', 'b']);
		expect(write.mock.calls.map(call => call[0])).toEqual(['a\n', 'b\n']);
	});

	it('clears exactly the previous line count before the next render', () => {
		const { write, stream } = fakeStream();
		const region = new LiveRegion(stream);
		region.render(['a', 'b']);
		write.mockClear();
		region.render(['c']);
		expect(write.mock.calls[0][0]).toBe('\x1b[2A\x1b[0J');
		expect(write.mock.calls.slice(1).map(call => call[0])).toEqual(['c\n']);
	});

	it('tracks a shrinking render so the next clear only moves up by the new count', () => {
		const { write, stream } = fakeStream();
		const region = new LiveRegion(stream);
		region.render(['a', 'b', 'c']);
		region.render(['a']);
		write.mockClear();
		region.render(['a', 'b']);
		expect(write.mock.calls[0][0]).toBe('\x1b[1A\x1b[0J');
	});

	it('renders an empty list as no lines, clearing the prior render', () => {
		const { write, stream } = fakeStream();
		const region = new LiveRegion(stream);
		region.render(['a']);
		write.mockClear();
		region.render([]);
		expect(write.mock.calls).toEqual([['\x1b[1A\x1b[0J']]);
	});
});
