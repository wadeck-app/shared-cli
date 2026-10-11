/**
 * Default poll interval for a `--follow`/`-f` loop built on {@link diffSnapshot}.
 *
 * Shared so every CLI's follow loop polls at the same cadence rather than each
 * picking its own number -- `task list -f` and `queue history -f` both already used
 * 500ms independently before this constant existed.
 */
export const FOLLOW_POLL_INTERVAL_MS = 500;

/**
 * Diffs a fresh snapshot of a mutable collection against a prior one, for a
 * `--follow`/`-f` loop: print the initial state once, then on each poll print only
 * what is new or changed since the last tick -- never redraw/reprint the unchanged
 * majority of the collection. A `tail -f` on a list, not a periodically refreshed
 * screen.
 *
 * "Changed" means new OR mutated, not just new -- an item that was already seen can
 * still have a different signature now (e.g. a task's status, a queue entry's
 * outcome), and a plain key-presence check would miss that.
 *
 * `keyOf` identifies an item across polls (its id); the signature compared for
 * change is `JSON.stringify(item)`, so any field change is caught without the
 * caller having to enumerate which fields matter.
 */
export function diffSnapshot<T>(
	previous: Map<string, string>,
	current: T[],
	keyOf: (item: T) => string
): { changed: T[]; snapshot: Map<string, string> } {
	const snapshot = new Map<string, string>();
	const changed: T[] = [];

	for (const item of current) {
		const key = keyOf(item);
		const signature = JSON.stringify(item);
		snapshot.set(key, signature);
		if (previous.get(key) !== signature) {
			changed.push(item);
		}
	}

	return { changed, snapshot };
}
