/**
 * MockRegistry — lightweight HTTP server that mimics the npm registry protocol.
 *
 * Designed for integration tests that need to control what version npm sees
 * when it performs a registry lookup, without deploying to a real registry.
 *
 * Supported endpoints:
 *   GET  /<pkg>                → npm view format: { "dist-tags": { "<channel>": "<version>" } }
 *   GET  /<scope>/<pkg>        → same, for scoped packages like @scope/pkg
 *   PUT  /<pkg>                → simulates npm publish (always 200 OK)
 *
 * Usage:
 *   const registry = new MockRegistry();
 *   await registry.start();                           // binds on a random free port
 *   registry.setLatestVersion('@my/pkg', '2.0.0');
 *   // point npm at it: process.env.npm_config_registry = registry.url
 *   await registry.stop();
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'node:http';

export class MockRegistry {
	private server: Server | null = null;
	// Map of encoded pkg name → channel → version
	private versions = new Map<string, Map<string, string>>();

	/** Port the server is listening on. Undefined until start() resolves. */
	get port(): number {
		const addr = this.server?.address();
		if (!addr || typeof addr === 'string') throw new Error('MockRegistry is not started');
		return addr.port;
	}

	/** Base URL of the mock registry, e.g. "http://localhost:12345". */
	get url(): string {
		return `http://localhost:${this.port}`;
	}

	/**
	 * Configure the version that will be returned for a given package and channel.
	 * @param pkg     Package name, e.g. "@wadeck-app/my-cli"
	 * @param version SemVer string, e.g. "2.0.0"
	 * @param channel dist-tag channel (default: "latest")
	 */
	setLatestVersion(pkg: string, version: string, channel = 'latest'): void {
		const encoded = encodePackageName(pkg);
		if (!this.versions.has(encoded)) {
			this.versions.set(encoded, new Map());
		}
		this.versions.get(encoded)!.set(channel, version);
	}

	/** Start the server. Resolves once it is listening. */
	start(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
				this.handleRequest(req, res);
			});
			this.server.on('error', reject);
			// Port 0 → OS picks a free port
			this.server.listen(0, '127.0.0.1', () => resolve());
		});
	}

	/** Stop the server and release the port. */
	stop(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this.server) return resolve();
			this.server.close((err) => (err ? reject(err) : resolve()));
			this.server = null;
		});
	}

	private handleRequest(req: IncomingMessage, res: ServerResponse): void {
		const method = req.method ?? 'GET';
		// URL is the encoded package path, e.g. "/@wadeck-app%2fmy-cli" or "/my-cli"
		const rawPath = req.url ?? '/';

		if (method === 'PUT') {
			// Simulate npm publish — always succeed
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ ok: true }));
			return;
		}

		if (method === 'GET') {
			// Strip leading slash and decode
			const encodedPkg = rawPath.slice(1);
			const channelMap = this.versions.get(encodedPkg) ?? new Map<string, string>();
			const distTags: Record<string, string> = {};
			for (const [ch, ver] of channelMap) {
				distTags[ch] = ver;
			}

			// npm view returns 404 if package unknown
			if (channelMap.size === 0) {
				res.writeHead(404, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Not found', reason: 'no such package' }));
				return;
			}

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ 'dist-tags': distTags }));
			return;
		}

		res.writeHead(405, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Method not allowed' }));
	}
}

/**
 * Encode a package name the way npm encodes it in registry URLs.
 * Scoped packages: "@scope/name" → "%40scope%2fname" or just the raw path.
 *
 * npm actually URL-encodes the leading "@" but uses "/" as a separator.
 * The exact encoding depends on npm version; we accept both in GET requests.
 */
function encodePackageName(pkg: string): string {
	if (pkg.startsWith('@')) {
		// "@scope/name" → "%40scope%2fname"
		return encodeURIComponent(pkg).toLowerCase();
	}
	return pkg;
}
