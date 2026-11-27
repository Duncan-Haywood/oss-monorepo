// Every page a venture ships should be reachable from that venture's own index.html by plain links,
// without going through the site hub. check.mjs's hub reachability passes when the hub links a page some
// other way, so a buyer page or guide can sit with no route from the product it belongs to (24 pages in
// 8 ventures on 2026-11-18; docs/reports/polish-2026-11-18-framing-more-tools.md). Search engines and
// readers both find a page through its product's links; an orphan gets neither.
//
// usage: node platform/pages/venture-reachability.mjs [ventures-dir]   (exit 1 when a page is unreachable)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKIP_DIRS = new Set(['node_modules', 'test', 'tests', '.git', 'fixtures', 'dist']);

// Pages that are fine without a static link from their index, each with its reason.
export const ALLOW = {
  'babysitting-business-kit/admin.html': 'noindex status page of a kit server, opened by its operator',
  'changepoint-detector/watch-a-metric-for-changes.html': 'withdrawal notice kept at the old URL so links from posts still land (2026-11-27)',
  'error-keeper/dashboard.html': 'the app dashboard, reached after setup rather than from the landing page',
  'shed-designer/hoa-packet.html': "opened by the 'HOA packet' button with the design in the URL hash; a bare link shows an empty packet",
};

function htmlPages(dir) {
  const pages = new Set();
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      if (SKIP_DIRS.has(f.name)) continue;
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.html')) pages.add(path.relative(dir, p).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return pages;
}

/** Pages of one venture with no in-venture link route from its index.html. */
export function unreachable(dir) {
  const pages = htmlPages(dir);
  if (!pages.has('index.html')) return [];
  const seen = new Set(['index.html']);
  const queue = ['index.html'];
  while (queue.length) {
    const cur = queue.shift();
    const html = fs.readFileSync(path.join(dir, cur), 'utf8');
    for (const m of html.matchAll(/href\s*=\s*["']([^"'#?]*)/g)) {
      const h = m[1];
      if (!h || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(h)) continue;
      let t = path.posix.normalize(path.posix.join(path.posix.dirname(cur), h));
      if (h.endsWith('/') || t === '.') t = path.posix.join(t, 'index.html');
      else if (!t.endsWith('.html') && pages.has(`${t}/index.html`)) t = `${t}/index.html`;
      if (pages.has(t) && !seen.has(t)) { seen.add(t); queue.push(t); }
    }
  }
  return [...pages].filter((p) => !seen.has(p)).sort();
}

/** Every unreachable page across ventures/, minus ALLOW: [`venture/page.html`]. */
export function scan(root, allow = ALLOW) {
  const out = [];
  for (const v of fs.readdirSync(root).sort()) {
    const dir = path.join(root, v);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const p of unreachable(dir)) if (!allow[`${v}/${p}`]) out.push(`${v}/${p}`);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ventures');
  const bad = scan(root);
  for (const p of bad) console.log(`unreachable from its venture's index.html: ${p}`);
  console.log(bad.length ? `${bad.length} page(s): link each from its index (or a page it reaches), or add it to ALLOW with a reason.` : 'every venture page is reachable from its index.html');
  process.exit(bad.length ? 1 : 0);
}
