#!/usr/bin/env node
// Looks up, in bSDD itself, every link bsdd-suggest.mjs writes offline.
// eval/bsdd-suggest-2026-11-19.md measured the rule against the links people
// wrote (196 of 198 the same) but could not reach bSDD's API, so the 619
// suggested links were never resolved one by one. This does that: for each
// distinct public IDS (eval/corpus/real and eval/corpus/bsdd, as in
// bsdd-suggest-corpus.mjs) it adds the suggested links (addBsddLinks), runs
// the same check `cli.mjs --audit OUT.ids --bsdd` runs (checkBsdd with the
// schemas and the bSDD unit table), and reports the findings on the inserted
// links only, split by level and code, with every non-note one listed.
//   sh eval/fetch-audit-corpus.sh && sh eval/fetch-bsdd-ids.sh
//   node eval/bsdd-suggest-live.mjs [--json out.json]
// Goes on the network: one GET to api.bsdd.buildingsmart.org per distinct
// link (shared across files) and per dictionary.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { suggestBsddLinks, addBsddLinks } from "../bsdd-suggest.mjs";
import { checkBsdd } from "../bsdd.mjs";
import { resources } from "../node.mjs";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const here = new URL(".", import.meta.url).pathname;
const dirs = ["corpus/real", "corpus/bsdd"].map((d) => join(here, d));
if (!dirs.every(existsSync)) { console.error("run eval/fetch-audit-corpus.sh and eval/fetch-bsdd-ids.sh first"); process.exit(2); }
const R = resources();

const answers = new Map();
let requests = 0;
const cachedFetch = (url, init) => {
  if (!answers.has(url)) {
    requests++;
    const p = fetch(url, init).then(async (r) => {
      const a = { ok: r.ok, status: r.status, headers: r.headers, body: await r.text() };
      if (a.status === 429) answers.delete(url);
      return a;
    });
    answers.set(url, p);
  }
  return answers.get(url).then((a) => ({ ok: a.ok, status: a.status, headers: a.headers, text: async () => a.body }));
};

const seen = new Set();
const byCode = {};
const rows = [];
const uniq = new Set();
let files = 0, inserted = 0, clean = 0, filesClean = 0, preexisting = 0;
const typeNamed = { warned: 0, total: 0 };
for (const dir of dirs) for (const f of readdirSync(dir).filter((f) => f.endsWith(".ids")).sort()) {
  const text = readFileSync(join(dir, f), "utf8");
  const h = createHash("sha1").update(text).digest("hex");
  if (seen.has(h)) continue;
  seen.add(h);
  let list;
  try { list = suggestBsddLinks(text, { psets: R.psets }); } catch { continue; }
  if (!list.length) continue;
  files++;
  inserted += list.length;
  for (const x of list) uniq.add(x.uri.toLowerCase());
  const out = addBsddLinks(text, list);
  const r = await checkBsdd(out, { schemas: R.schemas, units: R.bsddUnits, fetch: cachedFetch });
  // The inserted attributes sit inside each facet's start tag, so lines do not
  // move: a finding is on an inserted link when its line and uri are one of ours.
  const ours = new Map(list.map((x) => [`${x.line} ${x.uri}`, x]));
  const hit = new Map();
  for (const fd of r.findings) {
    const x = ours.get(`${fd.line} ${fd.uri}`);
    if (!x) { preexisting++; continue; }
    byCode[`${fd.level} ${fd.code}`] = (byCode[`${fd.level} ${fd.code}`] || 0) + 1;
    if (!hit.has(x)) hit.set(x, []);
    hit.get(x).push(fd);
    rows.push({ file: f, line: fd.line, propertySet: x.propertySet, baseName: x.baseName, dataType: x.dataType, ifcType: x.ifcType || null, level: fd.level, code: fd.code, message: fd.message });
  }
  let fileClean = true;
  for (const x of list) {
    const fs = hit.get(x) || [];
    if (x.ifcType) { typeNamed.total++; if (fs.some((fd) => fd.code === "bsdd-datatype")) typeNamed.warned++; }
    if (fs.every((fd) => fd.level === "note")) clean++; else fileClean = false;
  }
  if (fileClean) filesClean++;
}
console.log(`${files} distinct public IDS files get suggested links; ${inserted} links inserted (${uniq.size} distinct); ${answers.size} distinct bSDD requests (${requests} sent, retries included)`);
console.log(`inserted links with no error or warning: ${clean} of ${inserted}; files whose inserted links are all clean: ${filesClean} of ${files}`);
console.log(`inserted links where the suggester named the template's type (facet dataType differs): ${typeNamed.total}; of those, bSDD check also gives bsdd-datatype: ${typeNamed.warned}`);
console.log(`findings on links the files already had (not counted above): ${preexisting}`);
console.log("findings on inserted links, by level and code:");
for (const [k, n] of Object.entries(byCode).sort()) console.log(`  ${k}: ${n}`);
console.log("every error and warning on an inserted link:");
for (const r of rows.filter((r) => r.level !== "note")) console.log(`  ${r.file}:${r.line} ${r.propertySet}.${r.baseName} [${r.dataType || "-"}] ${r.level} ${r.code}: ${r.message}`);
const notes = new Map();
for (const r of rows.filter((r) => r.level === "note")) notes.set(r.code + ": " + r.message, (notes.get(r.code + ": " + r.message) || 0) + 1);
console.log("notes on inserted links (distinct message, count):");
for (const [m, n] of [...notes].sort((a, b) => b[1] - a[1])) console.log(`  ${n} x ${m}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 2));
