export interface SelfCheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

/**
 * Runs an array of check functions, prints results to stderr, and exits 1 if any fail.
 * Each check function returns a SelfCheckResult.
 */
export async function runSelfCheck(
  checks: Array<() => Promise<SelfCheckResult>>,
  opts: { quiet?: boolean } = {}
): Promise<void> {
  const quiet = opts.quiet ?? process.env['CLI_SELF_CHECK_QUIET'] === '1';
  let allOk = true;

  for (const check of checks) {
    const result = await check();
    if (!result.ok) allOk = false;
    if (!quiet || !result.ok) {
      const prefix = result.ok ? '[ok] ' : '[fail]';
      const detail = !result.ok && result.detail ? ` — ${result.detail}` : '';
      process.stderr.write(`${prefix} ${result.name}${detail}\n`);
    }
  }

  if (!allOk) process.exit(1);
}
