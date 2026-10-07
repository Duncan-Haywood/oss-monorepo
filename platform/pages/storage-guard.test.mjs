import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { GUARD_SLUGS, GUARD_SCRIPT, GUARD_PARAGRAPH, BACKUP_KEY, applyGuard } from './storage-guard.mjs';

const html = (slug) => readFileSync(new URL(`../../ventures/${slug}/index.html`, import.meta.url), 'utf8');

test('every suite page carries the identical guard script and its status line', () => {
  for (const slug of GUARD_SLUGS) {
    const h = html(slug);
    assert.ok(h.includes(GUARD_SCRIPT), `${slug}: guard script differs or is missing`);
    assert.equal(h.split(GUARD_PARAGRAPH).length - 1, 1, `${slug}: status line`);
    assert.equal(applyGuard(h), h, `${slug}: applyGuard is not idempotent`);
  }
});

function run({ stored = {}, persist, persisted = false, noStorageApi = false }) {
  const store = { ...stored };
  const el = { textContent: '' };
  let onClick;
  const ctx = {
    document: { getElementById: () => el, addEventListener: (_, f) => { onClick = f; } },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    navigator: noStorageApi ? {} : { storage: { persisted: async () => persisted, persist: async () => persist } },
  };
  vm.runInNewContext(GUARD_SCRIPT.replace(/^<script[^>]*>|<\/script>$/g, ''), ctx);
  return { el, store, click: () => onClick({ target: { closest: () => ({}) } }) };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('reports protection granted and a fresh backup click', async () => {
  const r = run({ persist: true });
  await tick();
  assert.match(r.el.textContent, /Storage protection: on/);
  assert.match(r.el.textContent, /No backup downloaded/);
  r.click();
  assert.ok(Number(r.store[BACKUP_KEY]) > 0);
  assert.match(r.el.textContent, /Last backup: today/);
});

test('says plainly when protection is refused or unsupported, and flags an old backup', async () => {
  const old = String(Date.now() - 45 * 86400000);
  const refused = run({ persist: false, stored: { [BACKUP_KEY]: old } });
  await tick();
  assert.match(refused.el.textContent, /not granted/);
  assert.match(refused.el.textContent, /45 days ago - download a new one/);
  const none = run({ noStorageApi: true });
  assert.match(none.el.textContent, /not supported here/);
});
