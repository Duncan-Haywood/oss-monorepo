// Plain meanvar vs --bootstrap on every real series in data/ with a numeric column.
// Real data, no labels: reports how many changes each returns and the bootstrap penalty.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (file, extra) => {
  try {
    const out = execFileSync('node', ['cli.mjs', file, '--model', 'meanvar', ...extra, '--json'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000 });
    const j = JSON.parse(out);
    return { n: j.n, k: (j.pelt?.changepoints || []).length, bp: j.pelt?.bootstrapPenalty ?? j.bootstrapPenalty };
  } catch { return null; }
};
const rows = [];
for (const f of readdirSync(path.join(root, 'data')).filter(f => f.endsWith('.csv')).sort()) {
  const file = 'data/' + f;
  if (readFileSync(path.join(root, file), 'utf8').split('\n').length < 20) continue;
  const a = run(file, []), b = run(file, ['--bootstrap']);
  if (a && b) rows.push({ f, n: a.n, plain: a.k, boot: b.k, penalty: b.bp });
}
console.log('series\tn\tplain\tbootstrap\tbootstrapPenalty');
for (const r of rows) console.log([r.f, r.n, r.plain, r.boot, r.penalty].join('\t'));
const dropped = rows.filter(r => r.boot < r.plain).length, more = rows.filter(r => r.boot > r.plain).length;
console.log(`# ${rows.length} series; bootstrap returns fewer changes on ${dropped}, more on ${more}`);
