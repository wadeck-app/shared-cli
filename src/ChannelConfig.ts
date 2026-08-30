import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function readChannelFromConfig(configDir: string): string {
	const configFile = join(configDir, 'config.yml');
	if (!existsSync(configFile)) return 'latest';
	const raw = readFileSync(configFile, 'utf8');
	return raw.match(/^channel:\s*(\S+)/m)?.[1] ?? 'latest';
}
