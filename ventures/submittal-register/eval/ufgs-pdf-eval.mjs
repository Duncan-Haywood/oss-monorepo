// The same score as ufgs-eval.mjs, but through a real PDF: the rendered
// sections are printed to PDF by Chromium (Playwright; embedded subset
// TrueType fonts with ToUnicode maps, as most PDF writers make), read back with
// pdf-text.mjs, and scored. Usage: node eval/ufgs-pdf-eval.mjs <dir> [count] [--font serif|sans]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync, constants as zlibConstants } from "node:zlib";
import { createRequire } from "node:module";
import { renderSec } from "./ufgs.mjs";
import { extractPdfLines } from "../pdf-text.mjs";
import { buildRegister, linesFromPdf } from "../engine.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const dir = process.argv[2];
const count = Number(process.argv[3] || 60);
const font = process.argv.includes("serif") ? "'Times New Roman', serif" : "Arial, Helvetica, sans-serif";
const files = readdirSync(dir).filter((f) => /\.sec$/i.test(f)).sort();
// An even spread across the divisions rather than the first N files.
const pick = files.filter((_, i) => i % Math.max(1, Math.floor(files.length / count)) === 0).slice(0, count);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const truthBy = new Map();
let html = `<!doctype html><meta charset="utf-8"><style>@page{size:letter;margin:0.75in}body{font:10pt/1.25 ${font}}.s{break-before:page}p{margin:0;white-space:pre-wrap}.ind{padding-left:0.4in}footer{}</style>`;
for (const f of pick) {
  const r = renderSec(readFileSync(join(dir, f), "latin1"));
  if (!r.number) continue;
  truthBy.set(r.number, r.truth);
  html += `<div class="s">` + r.text.split("\n").map((l) => (l.startsWith("    ") ? `<p class="ind">${esc(l.trim())}</p>` : `<p>${esc(l) || "&nbsp;"}</p>`)).join("") + `</div>`;
}
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
const pdf = await page.pdf({ format: "Letter", displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: `<div style="font-size:8pt;width:100%;text-align:center">UFGS SAMPLE BOOK <span class="pageNumber"></span></div>`, margin: { top: "0.75in", bottom: "0.75in", left: "0.75in", right: "0.75in" } });
await browser.close();
writeFileSync(process.env.PDF_OUT || "/tmp/ufgs-sample-book.pdf", pdf);
const t0 = Date.now();
const { pages, flags } = await extractPdfLines(new Uint8Array(pdf), async (b) => { try { return new Uint8Array(inflateSync(b, { finishFlush: zlibConstants.Z_SYNC_FLUSH })); } catch { return null; } });
const reg = buildRegister(linesFromPdf(pages));
const ms = Date.now() - t0;
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
let tp = 0, fp = 0, fn = 0, sdRight = 0, gRight = 0;
const misses = [];
for (const [num, truth] of truthBy) {
  const pool = reg.items.filter((i) => i.section === num).map((g) => ({ g, key: norm(g.label), used: false }));
  for (const t of truth) {
    const k = norm(t.name);
    const hit = pool.find((p) => !p.used && p.key === k) || pool.find((p) => !p.used && (p.key.startsWith(k) || k.startsWith(p.key)) && Math.min(p.key.length, k.length) > 6);
    if (hit) { hit.used = true; tp++; if (hit.g.sd === t.sd) sdRight++; if ((hit.g.approval === "G") === t.g) gRight++; }
    else { fn++; misses.push(`${num} ${t.sd} ${t.name}`); }
  }
  for (const p of pool) if (!p.used) { fp++; misses.push(`EXTRA ${num} ${p.g.sd} ${p.g.label}`); }
}
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : "-") + "%";
console.log(`PDF ${(pdf.length / 1024).toFixed(0)} KB, ${flags.pageCount} pages (${flags.pagesWithText} with text), read and parsed in ${ms} ms`);
console.log(`sections ${truthBy.size}, found ${reg.sections.filter((s) => truthBy.has(s.number)).length}`);
console.log(`recall ${pct(tp, tp + fn)} (${tp}/${tp + fn}), precision ${pct(tp, tp + fp)} (${tp}/${tp + fp}), SD right ${pct(sdRight, tp)}, G right ${pct(gRight, tp)}`);
if (process.argv.includes("--show")) console.log(misses.slice(0, 30).join("\n"));
