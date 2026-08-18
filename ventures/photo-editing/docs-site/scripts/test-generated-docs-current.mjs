/**
 * Regression test: the committed generated pages must match what the current
 * source documents and converter produce.
 *
 * `src/generated/` is committed so the site builds without a pre-step in every
 * environment, which means it can silently drift from `../docs`. Drift shows up
 * as documentation that is live on the site but no longer matches the
 * repository source. This regenerates into a temporary directory and compares.
 *
 * Run: node --test scripts/test-generated-docs-current.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, '..');
const COMMITTED = path.join(SITE_ROOT, 'src', 'generated');

/** Relative path -> contents, for every file under `dir`. */
function readTree(dir) {
  const files = {};
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    const full = path.join(entry.parentPath ?? entry.path, entry.name);
    if (entry.isFile()) {
      files[path.relative(dir, full)] = fs.readFileSync(full, 'utf8');
    }
  }
  return files;
}

test('committed generated docs match a fresh build from source', () => {
  const committed = readTree(COMMITTED);
  assert.ok(
    Object.keys(committed).length > 0,
    'no committed generated output found — src/generated should be committed',
  );

  // Regenerate into scratch copies so the working tree is never mutated by a
  // test run.
  const scratchGenerated = fs.mkdtempSync(path.join(os.tmpdir(), 'shootflow-docs-gen-'));
  const scratchApp = fs.mkdtempSync(path.join(os.tmpdir(), 'shootflow-docs-app-'));
  let rebuilt;
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'build-docs.mjs')], {
      cwd: SITE_ROOT,
      stdio: 'pipe',
      env: {
        ...process.env,
        DOCS_GENERATED_ROOT: scratchGenerated,
        DOCS_APP_ROOT: scratchApp,
      },
    });
    rebuilt = readTree(scratchGenerated);
  } finally {
    fs.rmSync(scratchGenerated, { recursive: true, force: true });
    fs.rmSync(scratchApp, { recursive: true, force: true });
  }

  const stale = Object.keys(committed).filter((f) => committed[f] !== rebuilt[f]);
  const missing = Object.keys(rebuilt).filter((f) => !(f in committed));
  const orphaned = Object.keys(committed).filter((f) => !(f in rebuilt));

  assert.deepEqual(
    { stale, missing, orphaned },
    { stale: [], missing: [], orphaned: [] },
    'src/generated is out of date — run `node scripts/build-docs.mjs` and commit the result',
  );
});
