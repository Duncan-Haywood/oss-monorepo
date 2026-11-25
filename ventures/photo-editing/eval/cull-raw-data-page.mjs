// The cull page in Chromium on a folder of raws: how many get a preview, how
// many were developed from raw data, timings, errors, and screenshots of the
// grid and of the large view of the first developed frame.
//   node eval/cull-raw-data-page.mjs DIR OUT
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const [dir, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const site = join(dirname(fileURLToPath(import.meta.url)), "..", "site");
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".webp": "image/webp" };
const files = [];
(function walk(d) { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(nef|cr3|cr2|arw|raf|orf|rw2|pef|srw|dng)$/i.test(n)) files.push(p); } })(dir);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.route("**/*", (route) => {
  const u = new URL(route.request().url());
  if (u.hostname !== "site.local") return route.abort();
  const f = join(site, u.pathname === "/" ? "cull.html" : u.pathname.slice(1));
  route.fulfill({ body: readFileSync(f), contentType: types[extname(f)] || "application/octet-stream" });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://site.local/cull.html");
const t0 = Date.now();
await page.setInputFiles("#pickFiles", files);
await page.waitForFunction(() => /^\d+ files/.test(document.querySelector("#status")?.textContent || ""), null, { timeout: 600000 });
const secs = (Date.now() - t0) / 1000;
const status = await page.textContent("#status");
await page.screenshot({ path: join(out, "grid.png") });
// The CSV says which frames have a preview and its size.
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click("#dlCsv", { timeout: 30000 })]);
const csv = readFileSync(await dl.path(), "utf8");
// The large view of the first frame developed from raw data.
const developed = csv.split("\n").slice(1).map((l) => l.split(",")[0]).filter(Boolean);
const pick = developed.find((n) => /LG Nexus 5X/.test(n)) || developed[0];
await page.locator("#grid > *", { hasText: pick.slice(0, 20) }).first().dblclick();
await page.waitForTimeout(1500);
await page.screenshot({ path: join(out, "loupe.png") });
console.log(JSON.stringify({ files: files.length, seconds: secs, status, errors }));
console.log(csv);
await browser.close();
