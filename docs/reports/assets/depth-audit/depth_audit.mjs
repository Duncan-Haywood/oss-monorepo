// Depth and distribution audit of ventures/ for
// docs/reports/2026-10-20-depth-and-distribution.md.
// Usage: node docs/reports/assets/depth-audit/depth_audit.mjs [--rows out.json]
// Prints a JSON summary. All measures are proxies; the report says what each misses.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const V = path.join(ROOT, 'ventures');
const { engines } = await import(path.join(ROOT, 'platform/agents/tools.mjs'));
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.venv']);
const SRC = /\.(mjs|js|py|ts|tsx|rs)$/;
// Links that are not evidence of cited outside data.
const NOT_CITE = /github\.(com|io)|localhost|example\.|w3\.org|schema/;
const SURFACES = ['web', 'cli', 'mcp', 'npm', 'pyproject', 'server'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const isTest = (f) => /test/i.test(path.basename(f)) || f.includes(`${path.sep}tests${path.sep}`);

const rows = [];
for (const e of fs.readdirSync(V, { withFileTypes: true })) {
  if (!e.isDirectory()) continue;
  const dir = path.join(V, e.name);
  const files = walk(dir);
  const logic = files.filter((f) => SRC.test(f) && !isTest(f) && !f.endsWith('.min.js'));
  let lines = 0;
  const cites = new Set();
  for (const f of logic) {
    const s = fs.readFileSync(f, 'utf8');
    lines += s.split('\n').length;
    for (const m of s.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) if (!NOT_CITE.test(m[0])) cites.add(m[0]);
  }
  const has = (n) => fs.existsSync(path.join(dir, n));
  let pkg = null;
  try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch {}
  let mcp = false;
  if (has('index.html')) {
    try { mcp = (await engines(e.name, ROOT)).some((x) => !x.skip); } catch {}
  }
  const r = {
    slug: e.name, lines, tests: files.filter(isTest).length, cites: cites.size,
    // A static page (flat or under site/) or a Next.js app someone can deploy.
    web: has('index.html') || has('site/index.html') || ['next.config.js', 'next.config.mjs', 'next.config.ts'].some(has),
    cli: fs.readdirSync(dir).some((f) => /cli\.(mjs|py)$/.test(f)) || Boolean(pkg?.bin),
    mcp,
    npm: Boolean(pkg && !pkg.private && pkg.name),
    pyproject: has('pyproject.toml'),
    server: has('server.mjs') || has('Dockerfile'),
  };
  r.surfaces = SURFACES.filter((k) => r[k]).length;
  rows.push(r);
}
rows.sort((a, b) => b.lines - a.lines);

const n = rows.length;
const L = rows.map((r) => r.lines).sort((a, b) => a - b);
const count = (f) => rows.filter(f).length;
const top20 = rows.slice(0, 20);
const summary = {
  ventures: n,
  lines: { median: L[Math.floor(n / 2)], p90: L[Math.floor(n * 0.9)],
    under200: count((r) => r.lines < 200), under500: count((r) => r.lines < 500),
    from500to3000: count((r) => r.lines >= 500 && r.lines < 3000), atLeast3000: count((r) => r.lines >= 3000) },
  surfaces: Object.fromEntries(SURFACES.map((k) => [k, count((r) => r[k])])),
  surfaceCountHistogram: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((k) => [k, count((r) => r.surfaces === k)]).filter(([, v]) => v)),
  cites: { none: count((r) => r.cites === 0), atLeast3: count((r) => r.cites >= 3),
    lightAndNone: count((r) => r.lines < 500 && r.cites === 0) },
  largest20: { notInAgentCatalogue: top20.filter((r) => !r.mcp).map((r) => r.slug),
    noSurfaceFound: top20.filter((r) => r.surfaces === 0).map((r) => r.slug),
    rows: top20.map(({ slug, lines, tests, cites, surfaces }) => ({ slug, lines, tests, cites, surfaces })) },
};
const i = process.argv.indexOf('--rows');
if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(rows, null, 1));
console.log(JSON.stringify(summary, null, 2));
