import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Ventures that write some of their pages from their own engine at build time
// rather than committing them. shed-designer's per-size lumber pages print
// prices and board counts, and a +/-5% move in lumber prices changes the board
// count on 188 of 240 page builds (2026-10-30), so a committed copy went stale
// whenever any PR moved a price, and the next PR inherited a red drift test.
// The script runs with `node` in the venture's directory before discovery and
// writes its pages beside itself (they are gitignored), so every later step,
// including the self-deploy catalogue, sees them as ordinary source files.
// Every reader of ventures/ that publishes or packs pages calls it first:
// platform/pages/build.mjs, the front-door mirror and the Python mirror build.
export const GENERATED_PAGES = {
  'shed-designer': 'make-size-pages.mjs',
};

/** Run each venture's page generator (GENERATED_PAGES) that exists under `venturesDir`. */
export function generateVenturePages(venturesDir, generators = GENERATED_PAGES) {
  const ran = [];
  for (const [slug, script] of Object.entries(generators)) {
    const dir = path.join(venturesDir, slug);
    if (!existsSync(path.join(dir, script))) continue;
    execFileSync(process.execPath, [script], { cwd: dir, stdio: 'pipe' });
    ran.push(slug);
  }
  return ran;
}
