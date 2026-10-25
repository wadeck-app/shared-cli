// A release published to GitHub Packages is stamped by CI as YYYY.MM.DD-BBB-xxxxxxxx: zero-padded
// build number (3+ digits) and an 8-char lowercase hex commit hash. Anything else (0.1.0, 0.0.0,
// a local bundler's YYYY.MM.DD-HHMMSS-count-HASH fallback) is a repo-built dev bundle. Strict on
// purpose: a false "release" lets a dev build run `npm install -g`, a false "dev" only makes an
// update refuse loudly. Stable X.Y.Z releases are never published, so they are not accepted.
// Month and day are accepted padded OR unpadded: npm strips leading zeros when publishing, so the
// registry holds 2026.9.1-028-247c1709 and 2026.10.3-035-1e4adce3 while the CI stamp is 2026.09.01-...
const RELEASE_VERSION_RE = /^\d{4}\.(0?[1-9]|1[0-2])\.(0?[1-9]|[12]\d|3[01])-\d{3,}-[0-9a-f]{8}$/;

export function isReleaseVersion(version: string | undefined | null): boolean {
	return typeof version === 'string' && RELEASE_VERSION_RE.test(version);
}

/**
 * Actionable message for a dev build asked to update. Such a build must never touch the global
 * install: an interrupted `npm install -g` leaves the CLI uninstalled (incident 2026-10-24).
 *
 * `updateCommand` is what the user types to update the installed binary; it defaults to
 * `<binary> cli update` and must be given by CLIs whose command is different (e.g. `app-core-cli update`).
 */
export function devBuildRefusalMessage(binary: string, version: string, updateCommand = `${binary} cli update`): string {
	return `dev build ${version}: refusing to update the global install of ${binary}; ` +
		'only versions installed from GitHub Packages (CalVer YYYY.MM.DD-BBB-hash) auto-update. ' +
		`Use the installed binary instead: ${updateCommand}`;
}
