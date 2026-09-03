// The real first-load numbers a visitor sees, read out of the rendered page.
//
// Why this exists
// ---------------
// FAQ and landing copy has to quote the figure the calculator actually shows on
// first load — a wrong number there is also the wrong number in the `FAQPage`
// schema search engines and assistants quote. `venture-defaults.mjs` grounds
// that figure without a browser, and for most tools it is exact. But it cannot
// be for the ones that build their inputs in the DOM at load time:
//
//   - repeater tools seed their rows from a `STARTING_*` array, and the row's
//     own <select> (a siding wall's material, a roof section's type) defaults
//     from the option list, not from that array; and
//   - kit tools (`stair-lift`, `epoxy-garage-floor`, `standby-generator`) leave
//     rate fields blank in the markup and fill them from JS on load.
//
// Reproducing those headlessly means re-deriving what the page's own
// `addRow`/`readInput`/kit code does, and getting it subtly wrong is worse than
// not answering: it puts a number nobody has seen into the copy. Verified on
// 2026-08-31 against a browser: a headless seed reproduction diverged from the
// rendered price on `painting`, `siding`, `flooring`, `junk-removal`,
// `lawn-care` and `window-cleaning` while matching exactly on `roofing`,
// `deck`, `concrete`, `janitorial`, `moving` and others.
//
// This tool sidesteps all of that by being the page: it loads the built site in
// a real browser, lets the tool's own code run, and reads the headline figures
// back. What it reports is what the visitor sees, by construction — so it is the
// grounding source to trust for a row- or kit-based tool, and a check on
// `venture-defaults.mjs` for the rest.
//
//   node platform/pages/build.mjs --out=platform/pages/dist
//   node platform/pages/price-oracle.mjs --dist=platform/pages/dist deck-bid-calculator
//   node platform/pages/price-oracle.mjs --dist=platform/pages/dist            # every tool
//   node platform/pages/price-oracle.mjs --dist=platform/pages/dist --json roofing-bid-calculator
//
// Report-only, like `guide-coverage.mjs` and `faq-coverage.mjs`: it prints the
// numbers, it does not gate a build. A default that legitimately changes moves
// these figures, and pinning them would fail CI on honest edits.
//
// Not part of CI: it needs Playwright, which is not a dependency of this repo.
// It ships at `/opt/pw-browsers` in a Claude-on-the-web session; `PLAYWRIGHT`
// (or `PW`) overrides the module path for a global install elsewhere. The same
// caveats as `sweep.mjs` apply — see its header for the version-pin trap.

import http from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function loadPlaywright() {
  const override = process.env.PLAYWRIGHT || process.env.PW;
  const candidates = [
    override,
    'playwright',
    process.env.NODE_PATH && path.join(process.env.NODE_PATH, 'playwright'),
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      return require(c);
    } catch {
      /* try the next */
    }
  }
  throw new Error(
    'playwright not found. Set PLAYWRIGHT=/path/to/playwright (a global install ' +
      'works: PLAYWRIGHT=$(npm root -g)/playwright). See sweep.mjs for the ' +
      'version-pin trap when installing it fresh.',
  );
}

const MIME = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
};

// Serve the built site the way nginx does: try the path, then index.html, then
// a `.html` sibling. .mjs must be JavaScript or a browser refuses the module.
function serve(dist) {
  return http.createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      let fp = path.join(dist, rel);
      try {
        if ((await stat(fp)).isDirectory()) fp = path.join(fp, 'index.html');
      } catch {
        if (!path.extname(fp)) fp += '.html';
      }
      const body = await readFile(fp);
      res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
}

// Which built directories are tool pages: a directory with an index.html that
// carries the site's price element or a hero number. Cheap prefilter — the
// browser is the real test.
async function discoverSlugs(dist) {
  const entries = await readdir(dist, { withFileTypes: true });
  const slugs = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const html = await readFile(path.join(dist, e.name, 'index.html'), 'utf8');
      if (/class="hero-number"|id="price"|id="[a-zA-Z]*[Pp]rice"/.test(html)) slugs.push(e.name);
    } catch {
      /* not a page */
    }
  }
  return slugs.sort();
}

// Read the headline money figures the page renders: every hero number plus any
// element whose id ends in "price" (initialPrice, recurringPrice, monthlyPrice,
// …). Skips the placeholder dash so a tool that needs a button press reads
// nothing rather than "$—". Runs in the page via page.evaluate, so it is
// self-contained and references no Node-side binding.
function readFigures() {
  const out = {};
  const seen = new Set();
  const push = (key, node) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    const text = (node.textContent || '').trim();
    if (!text || /^\$?\s*[—–-]?\s*$/.test(text)) return;
    out[key] = text;
  };
  for (const node of document.querySelectorAll('.hero-number')) {
    push(node.id || 'hero', node);
  }
  for (const node of document.querySelectorAll('[id]')) {
    if (/[Pp]rice$/.test(node.id)) push(node.id, node);
  }
  return out;
}

async function readSlug(browser, base, slug) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  try {
    await page.goto(`${base}/${slug}/`, { waitUntil: 'networkidle', timeout: 20000 });
    // Wait for a non-placeholder hero number, but never fail the read on it:
    // a button-press tool legitimately shows the dash until pressed.
    await page
      .waitForFunction(() => {
        const el = document.querySelector('.hero-number');
        return el && !/^\$?\s*[—–-]?\s*$/.test((el.textContent || '').trim());
      }, { timeout: 8000 })
      .catch(() => {});
    const figures = await page.evaluate(readFigures);
    return { figures, errors };
  } catch (e) {
    return { figures: {}, errors: [...errors, String(e)] };
  } finally {
    await page.close();
  }
}

async function oracle(dist, slugs, { concurrency = 4 } = {}) {
  const { chromium } = loadPlaywright();
  const server = serve(dist);
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  const results = {};
  try {
    // A fixed pool of workers pulling from one queue — one browser, N pages —
    // so 169 tools finish in minutes rather than one-at-a-time.
    const queue = [...slugs];
    const worker = async () => {
      for (let slug = queue.shift(); slug !== undefined; slug = queue.shift()) {
        results[slug] = await readSlug(browser, base, slug);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, slugs.length) }, worker));
  } finally {
    await browser.close();
    server.close();
  }
  return results;
}

function parseArgs(argv) {
  let dist = 'platform/pages/dist';
  let json = false;
  const slugs = [];
  for (const a of argv) {
    if (a.startsWith('--dist=')) dist = a.slice('--dist='.length);
    else if (a === '--json') json = true;
    else if (!a.startsWith('--')) slugs.push(a);
  }
  return { dist, json, slugs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { dist, json, slugs } = parseArgs(process.argv.slice(2));
  const distAbs = path.resolve(dist);
  try {
    await stat(path.join(distAbs, 'index.html'));
  } catch {
    console.error(`No built site at ${distAbs}. Run: node platform/pages/build.mjs --out=${dist}`);
    process.exit(2);
  }
  const targets = slugs.length ? slugs : await discoverSlugs(distAbs);
  const results = await oracle(distAbs, targets);

  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    let broken = 0;
    let quiet = 0;
    for (const slug of targets) {
      const r = results[slug];
      const figs = Object.entries(r.figures);
      if (r.errors.length) broken++;
      if (!figs.length) quiet++;
      const shown = figs.map(([k, v]) => `${k}=${v}`).join('  ');
      const flag = r.errors.length ? '  !! ' + r.errors[0].slice(0, 80) : '';
      console.log(`${slug.padEnd(40)} ${shown || '(no figure on first load)'}${flag}`);
    }
    console.log(
      `\n${targets.length} tool(s): ${targets.length - quiet} showed a first-load figure, ` +
        `${quiet} needed interaction, ${broken} logged an error.`,
    );
  }
}

export { oracle, discoverSlugs };
