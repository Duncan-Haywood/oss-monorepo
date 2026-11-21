// The middle setting for counts (README "A middle setting for over-dispersed counts", eval/gsc-middle.prereg.md):
// PELT with the negative-binomial cost, between the count default (Quiet) and plain PELT (Eager).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { replayWatch, COUNT_MIDDLE, settingWords } from './watch-core.mjs';
import { labels, series, FROM, AT } from './eval/gsc-sites.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const at = (r) => r.alerts.map((a) => [labels.indexOf(String(a.label)), a.reportedAt]);

test('the middle for counts is PELT with the negative-binomial cost, and says so', () => {
  assert.deepEqual(COUNT_MIDDLE, { detector: 'pelt', overdispersion: 'nb' });
  assert.equal(settingWords(COUNT_MIDDLE), 'pelt, negative-binomial cost');
});

test('on a fresh simulated site it hears the 20% fall Quiet misses, and stays quiet with no fall', () => {
  // Stage B's first seed, 400 clicks a day, cv 15% (eval/gsc-middle-out/B-*-cv0.15.jsonl).
  const opts = { model: 'poisson', from: FROM, step: 1, budget: Infinity };
  const fell = series(301, 400, 0.2, 0.15), flat = series(301, 400, 0, 0.15);
  assert.deepEqual(at(replayWatch(fell, labels, { ...opts, ...COUNT_MIDDLE })), [[AT, AT + 8]]);
  assert.deepEqual(at(replayWatch(fell, labels, opts)), []);
  assert.deepEqual(at(replayWatch(flat, labels, { ...opts, ...COUNT_MIDDLE })), []);
  assert.deepEqual(at(replayWatch(flat, labels, opts)), []);
});

test('the page runs Middle on counts as the middle setting, not plain bocpd', () => {
  const html = readFileSync(join(here, 'index.html'), 'utf8');
  assert.match(html, /import \{[^}]*COUNT_MIDDLE[^}]*\} from "\.\/watch-core\.mjs"/);
  assert.match(html, /const how = model === "poisson" && det === "bocpd" \? COUNT_MIDDLE : \{ detector: det \};/);
  assert.match(html, /watchCheck\(\{ csv, state, column: col \|\| null, model, \.\.\.how,/);
});

test('the workflow line for Search Console columns takes it: clicks alert on the third daily check', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gsc-middle-'));
  try {
    const c = series(301, 400, 0.2, 0.15), i = series(302, 4000, 0.2, 0.15);
    const rows = labels.map((d, k) => `${d},${c[k]},${i[k]}`);
    const run = (n, extra) => {
      writeFileSync(join(dir, 'gsc.csv'), `date,clicks,impressions\n${rows.slice(0, n).join('\n')}\n`);
      return spawnSync(process.execPath, [join(here, 'watch.mjs'), join(dir, 'gsc.csv'), '--state', join(dir, `state${extra.length}.json`), '--columns', 'clicks:poisson,impressions:poisson', ...extra], { encoding: 'utf8' });
    };
    for (const extra of [['--detector', 'pelt', '--overdispersion', 'nb'], []]) {
      run(175, extra); run(195, extra);
      const r = run(196, extra);
      assert.equal(r.status, 0, r.stderr);
      const clicks = r.stdout.slice(r.stdout.indexOf('== clicks =='), r.stdout.indexOf('== impressions =='));
      if (extra.length) assert.match(clicks, /2026-02-28/, r.stdout);
      else assert.match(clicks, /No new confirmed change/, r.stdout);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
