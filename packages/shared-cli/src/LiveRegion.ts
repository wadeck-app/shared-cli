/**
 * Redraws a block of terminal output in place, for a `--follow`/`-f` loop over a
 * *live state* view -- "what currently exists" (e.g. `flow worker list`'s connected
 * workers), where an item disappearing is itself meaningful information, as opposed to
 * an *event log* (`task list`, `queue history`) where entries only ever get appended.
 *
 * Do not use this for an event log -- that case is {@link diffSnapshot} (see
 * `FollowSnapshot.ts`): printing only new/changed entries there is correct because
 * nothing already shown is ever invalidated. A live state view is the opposite: the
 * full current state must stay visible and correct even when something is removed, so
 * the previous render is erased and replaced each tick rather than appended to.
 *
 * Erases exactly the lines this instance last wrote (tracked line count, not a full
 * screen clear) by moving the cursor up and clearing from there to the end of the
 * screen, then writes the new lines -- so the terminal never scrolls on its own and
 * nothing above the region is disturbed.
 */
export class LiveRegion {
	private lineCount = 0;

	constructor(private readonly stream: NodeJS.WriteStream = process.stdout) {}

	/** Replaces the previously rendered lines (if any) with `lines`. */
	render(lines: string[]): void {
		if (this.lineCount > 0) {
			// Move the cursor up `lineCount` rows, then clear from there to the end of the
			// screen -- handles both a shorter and a longer new render correctly.
			this.stream.write(`\x1b[${String(this.lineCount)}A\x1b[0J`);
		}
		for (const line of lines) this.stream.write(line + '\n');
		this.lineCount = lines.length;
	}
}
