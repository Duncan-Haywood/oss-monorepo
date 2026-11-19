// Runs the bSDD link check (bsdd.mjs) over public IDS files that carry bSDD links:
//   sh eval/fetch-bsdd-ids.sh && node eval/bsdd-corpus.mjs [DIR] [--json out.json]
// DIR defaults to eval/corpus/bsdd. Files with identical bytes are counted
// once. Goes on the network: one GET to api.bsdd.buildingsmart.org per
// distinct link (and one per dictionary).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { checkBsdd } from "../bsdd.mjs";
import { resources } from "../node.mjs";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const dir = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--json") || new URL("corpus/bsdd", import.meta.url).pathname;

// One shared cache of answers across files: the same link is asked once. A
// 429 is dropped from the cache, so bsdd.mjs's retry really asks again.
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
const rows = [];
const byCode = {};
const distinct = new Map();
let files = 0, dupes = 0, uris = 0, withLinks = 0, filesWithError = 0, filesWithWarning = 0;
for (const name of readdirSync(dir).sort()) {
  const text = readFileSync(join(dir, name), "utf8");
  const h = createHash("sha1").update(text).digest("hex");
  if (seen.has(h)) { dupes++; continue; }
  seen.add(h);
  let r;
  try { r = await checkBsdd(text, { schemas: resources().schemas, fetch: cachedFetch }); } catch (e) { console.error(`${name}: ${e.message}`); continue; }
  files++;
  uris += r.uris;
  if (r.uris) withLinks++;
  if (r.findings.some((f) => f.level === "error")) filesWithError++;
  if (r.findings.some((f) => f.level === "warning")) filesWithWarning++;
  for (const f of r.findings) {
    byCode[`${f.level} ${f.code}`] = (byCode[`${f.level} ${f.code}`] || 0) + 1;
    const k = f.uri.toLowerCase() + " " + f.code + " " + f.message;
    if (!distinct.has(k)) distinct.set(k, { ...f, file: name, n: 0 });
    distinct.get(k).n++;
    rows.push({ file: name, ...f });
  }
}
console.log(`${files} distinct IDS files (${dupes} byte-identical copies skipped), ${withLinks} with a facet uri, ${uris} uri attributes; ${answers.size} distinct bSDD requests (${requests} sent, retries included)`);
console.log(`files with a bSDD error: ${filesWithError}; with a warning: ${filesWithWarning}`);
console.log("findings by level and code (every occurrence):");
for (const [c, n] of Object.entries(byCode).sort((a, b) => b[1] - a[1])) console.log(`  ${c}: ${n}`);
console.log("distinct findings (uri, code, message), with how often each occurs:");
for (const f of [...distinct.values()].sort((a, b) => a.code.localeCompare(b.code) || a.uri.localeCompare(b.uri))) console.log(`  [${f.level}] ${f.code} x${f.n} ${f.uri}\n      ${f.message}  (first: ${f.file}, line ${f.line})`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
