import { appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export function logCliInvocation(configDir: string, cmdName: string, args: string[]): void {
	const today = new Date().toISOString().slice(0, 10);
	const logFile = join(configDir, 'logs', `${today}.ndjson`);
	mkdirSync(dirname(logFile), { recursive: true });
	const line = JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: `cmd: ${cmdName} ${args.join(' ')}`.trimEnd() });
	appendFileSync(logFile, line + '\n');
}
