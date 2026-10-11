import { describe, it, expect } from 'vitest';
import { diffAppendOnlyLog, diffSnapshot } from './FollowSnapshot.js';

describe('diffSnapshot', () => {
	it('reports every item as changed against an empty previous snapshot', () => {
		const { changed } = diffSnapshot(new Map(), [{ id: 'a' }, { id: 'b' }], item => item.id);
		expect(changed).toEqual([{ id: 'a' }, { id: 'b' }]);
	});

	it('reports nothing changed when nothing differs from the previous snapshot', () => {
		const items = [{ id: 'a', status: 'pending' }];
		const first = diffSnapshot(new Map(), items, item => item.id);
		const second = diffSnapshot(first.snapshot, items, item => item.id);
		expect(second.changed).toEqual([]);
	});

	it('reports a mutated item as changed even though its key already existed', () => {
		const first = diffSnapshot(new Map(), [{ id: 'a', status: 'pending' }], item => item.id);
		const second = diffSnapshot(first.snapshot, [{ id: 'a', status: 'done' }], item => item.id);
		expect(second.changed).toEqual([{ id: 'a', status: 'done' }]);
	});

	it('reports only the new item when one is appended to an unchanged set', () => {
		const first = diffSnapshot(new Map(), [{ id: 'a' }], item => item.id);
		const second = diffSnapshot(first.snapshot, [{ id: 'a' }, { id: 'b' }], item => item.id);
		expect(second.changed).toEqual([{ id: 'b' }]);
	});

	it('drops a removed item from the returned snapshot without reporting it as changed', () => {
		const first = diffSnapshot(new Map(), [{ id: 'a' }, { id: 'b' }], item => item.id);
		const second = diffSnapshot(first.snapshot, [{ id: 'a' }], item => item.id);
		expect(second.changed).toEqual([]);
		expect(second.snapshot.has('b')).toBe(false);
	});
});

describe('diffAppendOnlyLog', () => {
	it('reports every entry as changed against a zero count', () => {
		const current = [{ status: 'backlog', timestamp: '2026-01-01T00:00:00.000Z' }];
		const { changed, count } = diffAppendOnlyLog(0, current);
		expect(changed).toEqual(current);
		expect(count).toBe(1);
	});

	it('reports only entries appended after the previous count', () => {
		const current = [
			{ status: 'backlog', timestamp: '2026-01-01T00:00:00.000Z' },
			{ status: 'in-progress', timestamp: '2026-01-01T00:00:01.000Z' },
		];
		const { changed, count } = diffAppendOnlyLog(1, current);
		expect(changed).toEqual([current[1]]);
		expect(count).toBe(2);
	});

	it('reports nothing new when the count is unchanged', () => {
		const current = [{ status: 'backlog', timestamp: '2026-01-01T00:00:00.000Z' }];
		const { changed } = diffAppendOnlyLog(1, current);
		expect(changed).toEqual([]);
	});
});
