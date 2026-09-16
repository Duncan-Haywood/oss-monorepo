import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runCheck } from './check.mjs';
import { buildPdf, accessiblePdfObjects, ACCESSIBLE_TRAILER } from './fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'pdf-a11y-check-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('runCheck reads a real file from disk and returns the engine report', async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, 'accessible.pdf');
    await writeFile(file, Buffer.from(buildPdf(accessiblePdfObjects(), ACCESSIBLE_TRAILER)));
    const report = await runCheck(file);
    assert.equal(report.ok, true);
    assert.equal(report.parsed, true);
  });
});

test('runCheck reports the untagged/no-metadata case as not ok', async () => {
  await withTempDir(async (dir) => {
    const objects = [
      { num: 1, dict: '<< /Type /Catalog /Pages 2 0 R >>' },
      { num: 2, dict: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
      { num: 3, dict: '<< /Type /Page /Parent 2 0 R /Resources << >> /Contents 4 0 R /MediaBox [0 0 612 792] >>' },
      { num: 4, dict: '<< /Length 5 >>', stream: 'BT ET' },
    ];
    const file = path.join(dir, 'bad.pdf');
    await writeFile(file, Buffer.from(buildPdf(objects, '<< /Root 1 0 R >>')));
    const report = await runCheck(file);
    assert.equal(report.ok, false);
  });
});

test('CLI: a directory of PDFs is scanned and exits 1 when any file has a danger finding', async () => {
  await withTempDir(async (dir) => {
    const goodObjects = accessiblePdfObjects();
    const badObjects = [
      { num: 1, dict: '<< /Type /Catalog /Pages 2 0 R >>' },
      { num: 2, dict: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
      { num: 3, dict: '<< /Type /Page /Parent 2 0 R /Resources << >> /Contents 4 0 R /MediaBox [0 0 612 792] >>' },
      { num: 4, dict: '<< /Length 5 >>', stream: 'BT ET' },
    ];
    await writeFile(path.join(dir, 'good.pdf'), Buffer.from(buildPdf(goodObjects, ACCESSIBLE_TRAILER)));
    await writeFile(path.join(dir, 'bad.pdf'), Buffer.from(buildPdf(badObjects, '<< /Root 1 0 R >>')));

    const checkScript = path.join(HERE, 'check.mjs');
    let stdout;
    let status;
    try {
      stdout = execFileSync('node', [checkScript, dir, '--json'], { encoding: 'utf8', cwd: HERE });
      status = 0;
    } catch (err) {
      stdout = err.stdout;
      status = err.status;
    }
    assert.equal(status, 1, 'one of the two files has a danger finding');
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.length, 2);
    const byPath = Object.fromEntries(parsed.map((r) => [path.basename(r.path), r]));
    assert.equal(byPath['good.pdf'].report.ok, true);
    assert.equal(byPath['bad.pdf'].report.ok, false);
  });
});

test('CLI: exits non-zero when a file has a danger finding', async () => {
  await withTempDir(async (dir) => {
    const badObjects = [
      { num: 1, dict: '<< /Type /Catalog /Pages 2 0 R >>' },
      { num: 2, dict: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
      { num: 3, dict: '<< /Type /Page /Parent 2 0 R /Resources << >> /Contents 4 0 R /MediaBox [0 0 612 792] >>' },
      { num: 4, dict: '<< /Length 5 >>', stream: 'BT ET' },
    ];
    const file = path.join(dir, 'bad.pdf');
    await writeFile(file, Buffer.from(buildPdf(badObjects, '<< /Root 1 0 R >>')));
    const checkScript = path.join(HERE, 'check.mjs');
    assert.throws(() => execFileSync('node', [checkScript, file], { encoding: 'utf8' }));
  });
});

test('CLI: exits 0 for a clean file', async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, 'good.pdf');
    await writeFile(file, Buffer.from(buildPdf(accessiblePdfObjects(), ACCESSIBLE_TRAILER)));
    const checkScript = path.join(HERE, 'check.mjs');
    const out = execFileSync('node', [checkScript, file], { encoding: 'utf8' });
    assert.match(out, /No findings/);
  });
});

test('CLI: reports a missing file without crashing, and still exits non-zero', async () => {
  const checkScript = path.join(HERE, 'check.mjs');
  assert.throws(() => execFileSync('node', [checkScript, '/nonexistent/does-not-exist.pdf'], { encoding: 'utf8' }));
});
