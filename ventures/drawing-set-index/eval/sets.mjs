// Read whole drawing sets and check each page's answer two ways:
//  1. Truth from file names: the sets that were also exported one sheet per
//     file (eval/set-truth.tsv: set, page, number, title).
//  2. On every page of every set: are the number and title the tool reports
//     really printed on that page? Checked against poppler's pdftotext, an
//     independent text extractor (a check that nothing is invented; it cannot
//     tell a right title from another real phrase on the sheet).
//   node eval/sets.mjs <dir of set PDFs>
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readRuns } from "../read.mjs";
import { indexSet, checkSet, canonicalId } from "../engine.mjs";

const dir = process.argv[2];
const words = (t) => t.toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim();
const truth = readFileSync(new URL("./set-truth.tsv", import.meta.url), "utf8").trim().split("\n").slice(1).map((l) => l.split("\t"));
let pages = 0, numbered = 0, textless = 0, onPage = 0, titled = 0, titleOnPage = 0, tN = 0, tNum = 0, tBoth = 0;
const lines = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith(".pdf")).sort()) {
  const { pages: ps } = await readRuns(new Uint8Array(readFileSync(join(dir, f))));
  const ix = indexSet(ps);
  const findings = checkSet(ix);
  lines.push(`${f}: ${ix.pageCount} pages, ${ix.sheets.filter((s) => s.number).length} numbers${ix.drawingIndex ? `, drawing index on page ${ix.drawingIndex.page}` : ""}; findings: ${findings.map((x) => x.kind).join(", ") || "none"}`);
  for (const s of ix.sheets) {
    pages++;
    if (!s.textPhrases) { textless++; continue; }
    if (!s.number) continue;
    numbered++;
    const pt = words(execFileSync("pdftotext", ["-f", String(s.page), "-l", String(s.page), join(dir, f), "-"], { encoding: "utf8" }));
    if (pt.includes(words(s.number.replace(/^_+/, "")))) onPage++;
    if (s.title) { titled++; if (pt.includes(words(s.title))) titleOnPage++; }
  }
  for (const [set, page, num, title] of truth.filter((t) => t[0] === f)) {
    const s = ix.sheets[Number(page) - 1];
    tN++;
    const okN = s.canonical === canonicalId(num), okT = words(s.title) === words(title);
    if (okN) tNum++;
    if (okN && okT) tBoth++;
    if (!okN || !okT) lines.push(`  truth miss ${set} p${page}: want ${num} | ${title} -- got ${s.number} | ${s.title}`);
  }
}
console.log(lines.join("\n"));
console.log(`\n${pages} pages in ${readdirSync(dir).filter((x) => x.endsWith(".pdf")).length} sets; ${textless} have no text layer; ${numbered} of the other ${pages - textless} got a sheet number.`);
console.log(`number printed on its page (pdftotext): ${onPage} of ${numbered}; title printed on its page: ${titleOnPage} of ${titled} titled.`);
console.log(`against file-name truth: number ${tNum} of ${tN}, number and title ${tBoth} of ${tN}.`);
