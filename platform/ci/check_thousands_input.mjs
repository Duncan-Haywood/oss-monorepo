#!/usr/bin/env node
// Thousands-separator sweep: does a venture page read "1,200" the way it reads "1200"?
//
// Text inputs marked inputmode="decimal"/"numeric" let people type a comma
// (a number input does not). A page that parses with parseFloat or Number
// and never strips separators reads "1,200" as 1 (parseFloat) or as nothing
// (Number -> NaN), so the answer changes or vanishes without a word.
//
// For each page with such inputs, for up to --per-page inputs, the sweep fills
// the input with "1200" and with "1,200" on a fresh load, nudges the page
// (input/change events, then the form's submit button if there is one), and
// compares the visible text with commas removed. A control run fills "1200"
// twice, so pages whose text changes on its own are skipped, not flagged.
//
// Usage: node platform/ci/check_thousands_input.mjs [--out report.json]
//        [--per-page 3] [--only <venture>] [--dir <path>] [--pool 6]
// Exit 1 if any input reads the two values differently.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = opt("--out", null);
const PER_PAGE = Number(opt("--per-page", "3"));
const ONLY = opt("--only", null);
const POOL = Number(opt("--pool", "6"));
const root = process.cwd();

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  let f = p;
  try { if (fs.statSync(f).isDirectory()) f = path.join(f, "index.html"); } catch { res.writeHead(404); return res.end(); }
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

const scope = opt("--dir", ONLY ? `ventures/${ONLY}` : "ventures");
const files = execSync(`grep -rlE 'inputmode="(decimal|numeric)"' ${scope} --include=*.html || true`)
  .toString().trim().split("\n").filter((f) => f && !f.includes("node_modules"));

// Runs inside the page: list candidate inputs (visible, enabled text inputs with a numeric inputmode).
const LIST = () => [...document.querySelectorAll('input[inputmode="decimal"],input[inputmode="numeric"]')]
  .filter((el) => (!el.type || el.type === "text") && !el.disabled && !el.readOnly && el.offsetParent !== null)
  .map((el, i) => ({ i, id: el.id || el.name || `#${i}`, label: (el.labels?.[0]?.innerText || el.placeholder || "").trim().slice(0, 80) }));

async function probe(page, url, idx, value) {
  await page.goto(url, { timeout: 15000, waitUntil: "load" });
  await page.waitForTimeout(120);
  // Load the page's own example first when it has one, so the other fields are
  // filled and the result depends on the input under test.
  const ok = await page.evaluate(([idx, value]) => {
    const vis = (el) => el.offsetParent !== null && !el.disabled;
    const label = (b) => (b.innerText || b.value || "").trim();
    const buttons = [...document.querySelectorAll('button,input[type="button"],input[type="submit"]')].filter(vis);
    const example = buttons.find((b) => /\b(example|sample|demo)\b/i.test(label(b)));
    if (example) example.click();
    const els = [...document.querySelectorAll('input[inputmode="decimal"],input[inputmode="numeric"]')]
      .filter((el) => (!el.type || el.type === "text") && !el.disabled && !el.readOnly && el.offsetParent !== null);
    const el = els[idx]; if (!el) return false;
    el.focus(); el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
    const form = el.form;
    // Stay on the page: a form with no script handler would navigate away.
    if (form) form.addEventListener("submit", (e) => e.preventDefault());
    const submit = form && form.querySelector('button:not([type]),button[type="submit"],input[type="submit"]');
    const action = submit || buttons.find((b) => b !== example &&
      /^(calculate|check|compute|estimate|run|compare|work out|get|show|see|find|plan|analy[sz]e|score|test|price|quote|update|go|build|size|convert|solve|evaluate)\b/i.test(label(b)));
    if (action) action.click(); else if (form) form.requestSubmit?.();
    return true;
  }, [idx, value]);
  if (!ok) return null;
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    // Visible text with the inputs' own text and every comma taken out.
    const t = document.body ? document.body.innerText : "";
    return t.replace(/,/g, "");
  });
}

const findings = [], skipped = [];
let probed = 0, inert = 0;
const queue = [...files];
const browser = await chromium.launch();
async function worker() {
  const ctx = await browser.newContext();
  await ctx.route("**/*", (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  while (queue.length) {
    const f = queue.shift();
    const url = base + f;
    try {
      await page.goto(url, { timeout: 15000, waitUntil: "load" });
      const inputs = (await page.evaluate(LIST)).slice(0, PER_PAGE);
      for (const inp of inputs) {
        const a = await probe(page, url, inp.i, "1200");
        const a2 = await probe(page, url, inp.i, "1200");
        if (a == null || a !== a2) { skipped.push({ f, input: inp.id, why: a == null ? "gone" : "text changes on its own" }); continue; }
        // Sensitivity: an input whose value never reaches the visible text proves nothing either way.
        const z = await probe(page, url, inp.i, "");
        if (z === a) { inert++; continue; }
        const b = await probe(page, url, inp.i, "1,200");
        probed++;
        if (a !== b) {
          // First differing line on each side, for the report.
          const la = a.split("\n"), lb = b.split("\n");
          let k = 0; while (k < la.length && la[k] === lb[k]) k++;
          findings.push({ f, input: inp.id, label: inp.label, plain: (la[k] || "").slice(0, 160), comma: (lb[k] || "").slice(0, 160) });
        }
      }
    } catch (e) { skipped.push({ f, why: String(e.message).split("\n")[0].slice(0, 120) }); }
  }
  await ctx.close();
}
await Promise.all(Array.from({ length: POOL }, worker));
await browser.close(); server.close();

const report = { pages: files.length, inputs_probed: probed, inputs_without_visible_effect: inert, findings, skipped };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(`${files.length} pages, ${probed} inputs probed (${inert} more changed nothing visible), ${findings.length} read "1,200" differently from "1200", ${skipped.length} skipped`);
for (const x of findings) console.log(`  ${x.f} [${x.input}] ${x.label}\n    1200 : ${x.plain}\n    1,200: ${x.comma}`);
process.exit(findings.length ? 1 : 0);
