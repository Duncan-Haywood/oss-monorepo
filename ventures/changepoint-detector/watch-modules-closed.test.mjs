// A deployer's watch repository gets exactly MODULES (deploy/make-watch-repo.sh). Every relative import those files
// make must be in the list too, or the repository fails on its first run in someone else's account.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODULES } from './watch-repo-files.mjs';

test('every relative import of a watch-repository module is itself copied', () => {
  const missing = [];
  for (const f of MODULES) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"]\.\/([^'"]+)['"]/g)) {
      if (!MODULES.includes(m[1])) missing.push(`${f} -> ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});
