/**
 * The date each source file last changed, for `<lastmod>` in the sitemaps.
 *
 * A crawler given 1,300 URLs with no change signal recrawls them in its own
 * order. A `<lastmod>` helps only while it is accurate, so this module answers
 * "when did this file last change" from history and answers nothing where
 * history cannot say: an omitted `<lastmod>` is harmless, one that always says
 * today teaches crawlers to ignore the field.
 *
 * The one-pass `git log --name-only` is deliberate: one process rather than
 * one per page. The Pages workflow checks out 3,000 commits on main (see
 * `fetch-depth` in `portfolio-pages.yml`), and a pull-request build is depth 1.
 * In a shallow clone the oldest commit appears to touch every file it
 * contains, so dates from the shallow boundary are dropped, not trusted.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Parse `git log --name-only --format=%x00%H %cI` output into `Map<path, W3C datetime>`, newest commit first wins. */
export function parseLastChanged(log, boundary = new Set()) {
  const dates = new Map();
  for (const block of log.split('\0')) {
    const [header, ...files] = block.split('\n').filter(Boolean);
    if (!header) continue;
    const [hash, date] = header.split(' ');
    if (boundary.has(hash)) continue;
    for (const file of files) if (!dates.has(file)) dates.set(file, date);
  }
  return dates;
}

/** `Map<repo-relative path, commit date>` for everything under `pathspec`; empty when git cannot answer. */
export async function loadLastChanged(repoRoot, pathspec = 'ventures') {
  try {
    const git = (...args) => execFileAsync('git', ['-C', repoRoot, ...args], { maxBuffer: 256 * 1024 * 1024 });
    const { stdout } = await git('log', '--name-only', '--no-renames', '--format=%x00%H %cI', '--', pathspec);
    const shallow = (await git('rev-parse', '--is-shallow-repository')).stdout.trim() === 'true';
    let boundary = new Set();
    if (shallow) {
      const { stdout: file } = await git('rev-parse', '--git-path', 'shallow');
      const listed = await fs.readFile(new URL(file.trim(), `file://${repoRoot}/`).pathname, 'utf8').catch(() => '');
      boundary = new Set(listed.split('\n').filter(Boolean));
    }
    const dates = parseLastChanged(stdout, boundary);
    // A file with no date here last changed at or before the shallow boundary,
    // so the boundary's date is a true upper bound (`historyStart`); null when
    // history is complete or git cannot answer.
    dates.historyStart = null;
    if (boundary.size) {
      const { stdout: when } = await git('show', '-s', '--format=%cI', ...boundary);
      dates.historyStart = when.split('\n').filter(Boolean).sort().pop() ?? null;
    }
    return dates;
  } catch {
    return new Map();
  }
}
