import { describe, it, expect } from 'vitest';
import { diffSnapshot } from './FollowSnapshot.js';

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
