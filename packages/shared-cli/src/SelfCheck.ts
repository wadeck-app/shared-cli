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
    let result: SelfCheckResult = { name: '(threw)', ok: false, detail: 'threw an error' };
    try {
      result = await check();
    } catch (err) {
      result = { name: '(threw)', ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
    if (!result.ok) allOk = false;
    if (!quiet || !result.ok) {
      const prefix = result.ok ? '[ok] ' : '[fail]';
      const detail = !result.ok && result.detail ? ` — ${result.detail}` : '';
      process.stderr.write(`${prefix} ${result.name}${detail}\n`);
    }
  }

  if (!allOk) process.exit(1);
}
