import { describe, it, expect, vi, afterEach } from 'vitest';
import { runSelfCheck } from './SelfCheck.js';

describe('runSelfCheck', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['CLI_SELF_CHECK_QUIET'];
  });

  it('exits 0 when all checks pass', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await runSelfCheck([
      async () => ({ name: 'check-a', ok: true }),
      async () => ({ name: 'check-b', ok: true }),
    ]);

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits 1 when any check fails', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit:1'); });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(runSelfCheck([
      async () => ({ name: 'ok-check', ok: true }),
      async () => ({ name: 'fail-check', ok: false, detail: 'reason' }),
    ])).rejects.toThrow('exit:1');

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('writes [ok] prefix for passing checks', async () => {
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((s) => { writes.push(String(s)); return true; });

    await runSelfCheck([async () => ({ name: 'my-check', ok: true })]);

    expect(writes.some(w => w.includes('[ok]') && w.includes('my-check'))).toBe(true);
  });

  it('writes [fail] prefix with detail for failing checks', async () => {
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error(); });
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((s) => { writes.push(String(s)); return true; });

    await expect(runSelfCheck([
      async () => ({ name: 'bad-check', ok: false, detail: 'specific reason' }),
    ])).rejects.toThrow();

    expect(writes.some(w => w.includes('[fail]') && w.includes('bad-check') && w.includes('specific reason'))).toBe(true);
  });

  it('suppresses [ok] lines in quiet mode (CLI_SELF_CHECK_QUIET=1)', async () => {
    process.env['CLI_SELF_CHECK_QUIET'] = '1';
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error(); });
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((s) => { writes.push(String(s)); return true; });

    await runSelfCheck([async () => ({ name: 'ok-check', ok: true })]);

    expect(writes.filter(w => w.includes('[ok]')).length).toBe(0);
  });

  it('still shows [fail] lines in quiet mode', async () => {
    process.env['CLI_SELF_CHECK_QUIET'] = '1';
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error(); });
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((s) => { writes.push(String(s)); return true; });

    await expect(runSelfCheck([
      async () => ({ name: 'fail-check', ok: false }),
    ])).rejects.toThrow();

    expect(writes.some(w => w.includes('[fail]'))).toBe(true);
  });

  it('runs all checks even if early ones fail', async () => {
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error(); });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const ran: string[] = [];

    await expect(runSelfCheck([
      async () => { ran.push('a'); return { name: 'a', ok: false }; },
      async () => { ran.push('b'); return { name: 'b', ok: true }; },
      async () => { ran.push('c'); return { name: 'c', ok: true }; },
    ])).rejects.toThrow();

    expect(ran).toEqual(['a', 'b', 'c']); // all ran despite 'a' failing
  });
});
