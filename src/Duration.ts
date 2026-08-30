const UNITS: Record<string, number> = {
	ms: 1,
	s: 1_000,
	m: 60_000,
	h: 3_600_000,
	d: 86_400_000,
};

export function parseDuration(s: string): number {
	const match = s.trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/);
	if (!match) throw new Error(`Invalid duration: "${s}". Expected format: 1h, 30m, 10s, 500ms, 2d`);
	return parseFloat(match[1]) * UNITS[match[2]];
}
