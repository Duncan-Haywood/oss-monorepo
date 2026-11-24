#!/usr/bin/env node
// Find comparator-less sorts of numbers that the venture tests actually run.
//
//     node platform/ci/check_numeric_sort.mjs                 # every venture's tests
//     node platform/ci/check_numeric_sort.mjs slug-a slug-b   # named ventures
//     node platform/ci/check_numeric_sort.mjs --log FILE      # summarise an existing log
//     node platform/ci/check_numeric_sort.mjs --tests         # also list sorts in test files
//     node platform/ci/check_numeric_sort.mjs --pages         # load every venture index.html instead
//
// `[10, 9, 1].sort()` is `[1, 10, 9]`: the default comparator compares
// strings. Grepping `.sort()` finds ~450 call sites in ventures/, nearly all
// correct string sorts (keys, names, ISO dates). This runs the suites through
// run_venture_tests.py with numeric_sort_hook.mjs preloaded (NODE_OPTIONS
// --import reaches every `node --test` child), so it reports only call sites
// whose elements really were numbers, or decimal strings, at run time.
//
// --pages loads every ventures/**/index.html in headless Chromium (as
// page_js_errors.mjs does) with the same patch as an init script, so inline
// page scripts that sort on load (a default example rendered at start) are
// covered too; tests never reach those. Needs playwright.
//
// Output: one line per call site, "WRONG" when a call produced a different
// order than a numeric sort would have, "latent" when every call so far
// happened to agree (4-digit years, single digits). Exit 1 when any non-test
// call site is WRONG, else 0. Test suites that fail under the hook are
// reported by run_venture_tests.py as usual and do not change this exit code.
import { execSync, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const HOOK = join(HERE, "numeric_sort_hook.mjs");

const TEST_FILE = /(\.test\.[cm]?js|\/test\/|\/tests\/|\/eval\/|eval-[^/]*\.mjs)/;

/** Group JSONL lines into one entry per call site and kind. */
export function summarise(lines, { tests = false } = {}) {
  const sites = new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!r.site || !r.site.startsWith(ROOT + "/")) continue;
    const site = relative(ROOT, r.site);
    if (!tests && TEST_FILE.test(site)) continue;
    const key = `${site}|${r.kind}`;
    const cur = sites.get(key) || { site, kind: r.kind, wrong: false, sample: r.sample };
    if (r.wrong && !cur.wrong) { cur.wrong = true; cur.sample = r.sample; }
    sites.set(key, cur);
  }
  return [...sites.values()].sort((a, b) => Number(b.wrong) - Number(a.wrong) || a.site.localeCompare(b.site));
}

// The browser copy of numeric_sort_hook.mjs: same test, results kept on
// window.__numericSorts with the caller's "url:line:col".
const PAGE_PATCH = `(() => {
  const nativeSort = Array.prototype.sort;
  const DECIMAL = /^[-+]?(\\d+\\.?\\d*|\\.\\d+)([eE][-+]?\\d+)?$/;
  const out = (window.__numericSorts = []);
  const seen = new Set();
  const kindOf = (a) => {
    if (!Array.isArray(a) || a.length < 2) return null;
    let n = true, s = true;
    for (const v of a) {
      if (typeof v !== "number") n = false;
      if (typeof v !== "string" || !DECIMAL.test(v.trim())) s = false;
      if (!n && !s) return null;
    }
    return n ? "number" : "decimal-string";
  };
  Array.prototype.sort = function (cmp) {
    if (cmp !== undefined || !Array.isArray(this)) return nativeSort.call(this, cmp);
    const kind = kindOf(this);
    if (!kind) return nativeSort.call(this);
    const before = this.slice();
    const res = nativeSort.call(this);
    const num = nativeSort.call(before.slice(), (a, b) => Number(a) - Number(b));
    const wrong = res.some((v, i) => Number(v) !== Number(num[i]) && !(Number.isNaN(Number(v)) && Number.isNaN(Number(num[i]))));
    const frame = String(new Error().stack).split("\\n").slice(2).find((l) => /https?:/.test(l)) || "";
    const m = frame.match(/(https?:\\/\\/[^\\s()]+):(\\d+):(\\d+)/);
    const site = m ? m[1].replace(/^https?:\\/\\/[^/]+\\//, "") + ":" + m[2] + ":" + m[3] : "?";
    const key = site + "|" + kind + "|" + wrong;
    if (!seen.has(key)) { seen.add(key); out.push({ site, kind, wrong, n: before.length, sample: before.slice(0, 8) }); }
    return res;
  };
})();`;

/** Load every venture page with PAGE_PATCH and write its findings as JSONL. */
async function sweepPages(log) {
  const require = createRequire(import.meta.url);
  const { chromium } = require("playwright");
  const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
  const server = createServer((req, res) => {
    // Serve only files inside the repository: resolve the request path and refuse anything outside ROOT.
    const notFound = () => { res.statusCode = 404; return res.end(); };
    let file;
    try { file = resolve(ROOT, "." + decodeURIComponent(req.url.split("?")[0])); } catch { return notFound(); }
    if (file === ROOT) file = join(ROOT, "index.html");
    if (!file.startsWith(ROOT + sep)) return notFound();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return notFound();
    res.setHeader("content-type", types[file.slice(file.lastIndexOf("."))] || "application/octet-stream");
    createReadStream(file).pipe(res);
  }).listen(0);
  await new Promise((r) => server.on("listening", r));
  const port = server.address().port;
  const files = execSync("find ventures -name index.html -not -path '*/node_modules/*' -not -path '*/test*'", { cwd: ROOT })
    .toString().trim().split("\n");
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(PAGE_PATCH);
  await ctx.route((url) => url.hostname !== "localhost", (route) => route.abort());
  const rows = [];
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const f = files[next++];
      const page = await ctx.newPage();
      try {
        await page.goto(`http://localhost:${port}/${f}`, { waitUntil: "load", timeout: 15000 });
        await page.waitForTimeout(150);
        for (const r of await page.evaluate(() => window.__numericSorts || [])) rows.push({ ...r, site: join(ROOT, r.site), page: f });
      } catch { /* a page that fails to load is page_js_errors.mjs's business */ }
      await page.close();
    }
  };
  await Promise.all([1, 2, 3, 4].map(worker));
  await browser.close();
  server.close();
  writeFileSync(log, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.error(`${files.length} pages loaded`);
}

async function main(argv) {
  const tests = argv.includes("--tests");
  const li = argv.indexOf("--log");
  let log;
  let tmp;
  if (li >= 0) {
    log = argv[li + 1];
  } else if (argv.includes("--pages")) {
    tmp = mkdtempSync(join(tmpdir(), "numeric-sort-"));
    log = join(tmp, "sorts.jsonl");
    await sweepPages(log);
  } else {
    const slugs = argv.filter((a) => !a.startsWith("--"));
    tmp = mkdtempSync(join(tmpdir(), "numeric-sort-"));
    log = join(tmp, "sorts.jsonl");
    const env = {
      ...process.env,
      NUMERIC_SORT_LOG: log,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import=${HOOK}`.trim(),
    };
    spawnSync("python3", [join(HERE, "run_venture_tests.py"), "--no-elsewhere", "--no-unwired", ...slugs], {
      cwd: ROOT, env, stdio: ["ignore", "ignore", "inherit"],
    });
  }
  const lines = existsSync(log) ? readFileSync(log, "utf8").split("\n") : [];
  const rows = summarise(lines, { tests });
  for (const r of rows) {
    console.log(`${r.wrong ? "WRONG " : "latent"}  ${r.site}  ${r.kind}  e.g. [${r.sample.map((v) => JSON.stringify(v)).join(", ")}]`);
  }
  const wrong = rows.filter((r) => r.wrong).length;
  console.log(`${rows.length} call site(s) sorted numbers with no comparator; ${wrong} produced a non-numeric order.`);
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  return wrong ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
