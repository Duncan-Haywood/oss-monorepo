import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unreachable, scan, ALLOW } from './venture-reachability.mjs';

const VENTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ventures');

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-'));
  for (const [p, html] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), html);
  }
  return dir;
}

test('follows relative, ./, folder and extensionless links; ignores external and anchors', () => {
  const dir = fixture({
    'index.html': '<a href="./a.html">a</a> <a href="guide/">g</a> <a href="https://x.test/c.html">x</a> <a href="#top">t</a>',
    'a.html': "<a href='b.html?x=1#y'>b</a>",
    'b.html': '<a href="sub">sub</a>',
    'guide/index.html': '<a href="../index.html">home</a>',
    'sub/index.html': '',
    'c.html': '',
    'tests/fixture.html': '',
  });
  assert.deepEqual(unreachable(dir), ['c.html']);
});

test('a venture without index.html is skipped', () => {
  assert.deepEqual(unreachable(fixture({ 'a.html': '' })), []);
});

test('every allowlisted page exists and still needs the exemption', () => {
  for (const key of Object.keys(ALLOW)) {
    const [v, p] = key.split('/');
    assert.ok(fs.existsSync(path.join(VENTURES, v, p)), `${key} is gone: drop it from ALLOW`);
    assert.ok(unreachable(path.join(VENTURES, v)).includes(p), `${key} is now linked: drop it from ALLOW`);
  }
});

test("every venture page is reachable from its own index.html", () => {
  assert.deepEqual(scan(VENTURES), []);
});
