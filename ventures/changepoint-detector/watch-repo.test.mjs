// The watch page's "no terminal" set-up: the zip it builds in the browser must be the folder
// deploy/make-watch-repo.sh writes (less the workflow, which a prefilled GitHub link adds), and the links must point
// where GitHub expects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32, makeZip, metricCsv, parseRepo, runLink, uploadLink, variablesLink, watchRepoFiles, workflowLink } from './watch-repo.mjs';
import { WORKFLOW } from './watch-repo-files.mjs';

const here = (p) => new URL(`./${p}`, import.meta.url).pathname;
const readLocal = async (name) => readFileSync(here(name), 'utf8');

function walk(dir, prefix = '') {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, `${prefix}${e}/`));
    else out.push(`${prefix}${e}`);
  }
  return out.sort();
}

test('watch-repo-files.mjs is regenerated from make-watch-repo.sh, the workflow and LICENSE', () => {
  execFileSync(process.execPath, [here('deploy/build-watch-repo-files.mjs'), '--check']);
  assert.equal(WORKFLOW, readFileSync(here('deploy/watch-metric.yml'), 'utf8'));
});

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('the zip unpacks to exactly the folder make-watch-repo.sh makes, less the workflow', async () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'watch-repo-'));
  const bySh = path.join(tmp, 'by-script');
  execFileSync('sh', [here('deploy/make-watch-repo.sh'), bySh], { encoding: 'utf8' });
  const zipPath = path.join(tmp, 'metric-watch.zip');
  writeFileSync(zipPath, makeZip(await watchRepoFiles(readLocal)));
  const byZip = path.join(tmp, 'by-zip');
  execFileSync('unzip', ['-q', zipPath, '-d', byZip]);
  assert.match(execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' }), /No errors detected/);

  const want = walk(bySh).filter((f) => f !== '.github/workflows/watch-metric.yml');
  assert.deepEqual(walk(byZip), want);
  for (const f of want) assert.ok(readFileSync(path.join(byZip, f)).equals(readFileSync(path.join(bySh, f))), f);
  // A regular, readable file once unpacked (the central directory's Unix mode).
  assert.equal(statSync(path.join(byZip, 'watch.mjs')).mode & 0o777, 0o644);
  // The same inputs give the same bytes.
  assert.deepEqual(makeZip(await watchRepoFiles(readLocal)), makeZip(await watchRepoFiles(readLocal)));
});

test('the unpacked folder runs the watch on pasted rows', async () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'watch-repo-run-'));
  const rows = [];
  for (let i = 0; i < 130; i++) {
    const d = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    rows.push(`${d}\t${(i < 120 ? 50 : 55) + ((i * 7919) % 13 - 6) / 6}`);
  }
  const zipPath = path.join(tmp, 'w.zip');
  writeFileSync(zipPath, makeZip(await watchRepoFiles(readLocal, { csv: rows.join('\n') })));
  execFileSync('unzip', ['-q', zipPath, '-d', path.join(tmp, 'w')]);
  const csv = readFileSync(path.join(tmp, 'w/data/metric.csv'), 'utf8');
  assert.match(csv, /^date,value\n2026-01-01,/);
  const out = execFileSync(process.execPath, ['watch.mjs', 'data/metric.csv', '--state', 'watch-state.json'], { cwd: path.join(tmp, 'w'), encoding: 'utf8' });
  assert.match(out, /2026-05-01/);
});

test('pasted rows become data/metric.csv', () => {
  assert.equal(metricCsv(''), 'date,value\n');
  assert.equal(metricCsv('  \n'), 'date,value\n');
  assert.equal(metricCsv('2026-01-01,5\r\n2026-01-02,6'), 'date,value\n2026-01-01,5\n2026-01-02,6\n');
  assert.equal(metricCsv('day,orders\n2026-01-01,5'), 'day,orders\n2026-01-01,5\n');
  assert.equal(metricCsv('2026-01-01\t5\n\n2026-01-02\t6\n'), 'date,value\n2026-01-01,5\n2026-01-02,6\n');
});

test('repository names and links', () => {
  for (const s of ['jane/metric-watch', 'https://github.com/jane/metric-watch', 'github.com/jane/metric-watch.git', 'https://github.com/jane/metric-watch/tree/main', ' jane/metric-watch ']) {
    assert.deepEqual(parseRepo(s), { owner: 'jane', name: 'metric-watch' }, s);
  }
  for (const s of ['', 'jane', 'jane/', '-jane/x', 'ja--ne/x', 'jane/..', 'https://gitlab.com/jane/x', 'jane/x y']) assert.equal(parseRepo(s), null, s);

  const repo = parseRepo('jane/metric-watch');
  const link = new URL(workflowLink(repo));
  assert.equal(link.origin + link.pathname, 'https://github.com/jane/metric-watch/new/main');
  assert.equal(link.searchParams.get('filename'), '.github/workflows/watch-metric.yml');
  assert.equal(link.searchParams.get('value'), readFileSync(here('deploy/watch-metric.yml'), 'utf8'));
  assert.ok(workflowLink(repo).length < 16000, 'GitHub serves URLs well past this; browsers take 32k+');
  assert.equal(new URL(workflowLink(repo, 'master')).pathname, '/jane/metric-watch/new/master');
  assert.equal(uploadLink(repo), 'https://github.com/jane/metric-watch/upload/main');
  assert.equal(variablesLink(repo), 'https://github.com/jane/metric-watch/settings/variables/actions/new');
  assert.equal(runLink(repo), 'https://github.com/jane/metric-watch/actions/workflows/watch-metric.yml');
});
