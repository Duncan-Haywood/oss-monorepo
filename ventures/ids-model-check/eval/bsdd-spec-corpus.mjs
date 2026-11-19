// Builds an IDS from bSDD classes (bsdd-spec.mjs) for a sample of every
// Active, latest-version public bSDD dictionary, then checks each IDS three
// ways: ids.xsd structure and the audit (audit.mjs, the IFC templates), and
// the bSDD link check (bsdd.mjs) against the dictionary it came from.
//   node eval/bsdd-spec-corpus.mjs [--per-dict N] [--ifc N] [--json out.json] [--cache DIR]
// Goes on the network (api.bsdd.buildingsmart.org): one dictionary list, one
// class list per dictionary, one GET per class, then the link lookups.
// --cache DIR keeps every answer on disk so a rerun asks nothing.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { bsddIds } from "../bsdd-spec.mjs";
import { checkBsdd, getJson, BSDD_API } from "../bsdd.mjs";
import { auditIds } from "../audit.mjs";
import { parseIds } from "../ids.mjs";
import { resources } from "../node.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const perDict = Number(opt("--per-dict", 4));
const ifcN = Number(opt("--ifc", 40));
const jsonOut = opt("--json", null);
const cacheDir = opt("--cache", null);
if (cacheDir) mkdirSync(cacheDir, { recursive: true });

const answers = new Map();
let requests = 0;
const cachedFetch = (url, init) => {
  if (!answers.has(url)) {
    const file = cacheDir && join(cacheDir, createHash("sha1").update(url).digest("hex") + ".json");
    const p = (file && existsSync(file) ? Promise.resolve(JSON.parse(readFileSync(file, "utf8"))) : (requests++, fetch(url, { ...init, signal: AbortSignal.timeout(30000) }).then(async (r) => {
      const a = { ok: r.ok, status: r.status, retryAfter: r.headers.get("retry-after"), body: await r.text() };
      if (a.status === 429 || a.status >= 500) answers.delete(url);
      else if (file) writeFileSync(file, JSON.stringify(a));
      return a;
    })));
    answers.set(url, p);
  }
  return answers.get(url).then((a) => ({ ok: a.ok, status: a.status, headers: { get: (k) => (k === "retry-after" ? a.retryAfter : null) }, text: async () => a.body }));
};
const R = resources();

const list = await getJson(cachedFetch, `${BSDD_API}/api/Dictionary/v1?Limit=1000`);
const dicts = list.json.dictionaries.filter((d) => d.isLatestVersion && d.status === "Active" && !d.isPrivate);
const IFC = "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3";
if (!dicts.some((d) => d.uri === IFC)) dicts.push({ uri: IFC, name: "IFC", version: "4.3" });

const rows = [];
const tally = { audit: {}, bsdd: {}, notes: {} };
const bump = (m, k) => { m[k] = (m[k] || 0) + 1; };
const noteKind = (n) => n.replace(/^https?:\S+: /, "").replace(/^[^:]*: /, "").replace(/"[^"]*"/g, '"…"').replace(/\b(IFC[A-Z0-9_]+|Ifc\w+)\b/g, "X").replace(/value kind \w+/, "value kind K").slice(0, 70);
async function one(d) {
  const isIfc = d.uri === IFC;
  console.error(`${d.name} ${d.version} (${requests} requests so far)`);
  const want = isIfc ? ifcN : perDict;
  // The first classes in the dictionary's own order that list properties.
  const cl = await getJson(cachedFetch, `${BSDD_API}/api/Dictionary/v1/Classes?Uri=${encodeURIComponent(d.uri)}&Limit=${isIfc ? 1000 : 24}`);
  let classes = (cl.json && cl.json.classes) || [];
  if (isIfc) classes = classes.filter((c) => /^Ifc[A-Z][a-z]/.test(c.code)).filter((_, i) => i % 7 === 0);
  const picked = [];
  for (let i = 0; i < classes.length && picked.length < want; i += 6) {
    const got = await Promise.all(classes.slice(i, i + 6).map((c) => getJson(cachedFetch, `${BSDD_API}/api/Class/v1?Uri=${encodeURIComponent(c.uri)}&IncludeClassProperties=true`).then((r) => [c, r])));
    for (const [c, r] of got) if (picked.length < want && r.json && (r.json.classProperties || []).length) picked.push(c.uri);
  }
  if (!picked.length) { rows.push({ dictionary: `${d.name} ${d.version}`, classes: 0 }); return; }
  const built = await bsddIds(picked, { fetch: cachedFetch, schemas: R.schemas, psets: R.psets, schema: R.schemas.IFC4X3 });
  const ids = parseIds(built.text);
  const issues = auditIds(ids, { schemas: R.schemas, typeMap: R.typeMap, psets: R.psets });
  const b = await checkBsdd(built.text, { fetch: cachedFetch, schemas: R.schemas });
  for (const x of issues) bump(tally.audit, `${x.level} ${x.code || x.message.slice(0, 50)}`);
  for (const x of b.findings) bump(tally.bsdd, `${x.level} ${x.code}`);
  for (const n of built.notes) bump(tally.notes, noteKind(n));
  const facets = built.specs.reduce((a, s) => a + s.requirements.length, 0);
  rows.push({
    dictionary: `${d.name} ${d.version}`, classes: picked.length, facets,
    properties: built.specs.reduce((a, s) => a + s.requirements.filter((f) => f.kind === "property").length, 0),
    auditErrors: issues.filter((x) => x.level === "error").length, auditWarnings: issues.filter((x) => x.level === "warning").length,
    bsddErrors: b.findings.filter((x) => x.level === "error").length, bsddWarnings: b.findings.filter((x) => x.level === "warning").length,
    notes: built.notes.length,
    detail: { audit: issues.map((x) => `${x.level} ${x.code}: ${x.message}`), bsdd: b.findings.filter((x) => x.level !== "note").map((x) => `${x.level} ${x.code}: ${x.message} ${x.uri}`) },
  });
}

// Four dictionaries at a time; rows are sorted back into list order.
const order = new Map(dicts.map((d, i) => [`${d.name} ${d.version}`, i]));
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => { while (next < dicts.length) await one(dicts[next++]); }));
rows.sort((a, b) => order.get(a.dictionary) - order.get(b.dictionary));

const built = rows.filter((r) => r.classes);
const sum = (k) => built.reduce((a, r) => a + r[k], 0);
console.log(`dictionaries: ${dicts.length} Active latest-version (with IFC 4.3); ${built.length} with a class that lists properties`);
console.log(`classes: ${sum("classes")}; requirement facets: ${sum("facets")}; property facets: ${sum("properties")}`);
console.log(`IDS files audit-clean (0 errors): ${built.filter((r) => !r.auditErrors).length} of ${built.length}; with 0 warnings too: ${built.filter((r) => !r.auditErrors && !r.auditWarnings).length}`);
console.log(`bSDD link check, 0 errors: ${built.filter((r) => !r.bsddErrors).length} of ${built.length}; 0 warnings too: ${built.filter((r) => !r.bsddErrors && !r.bsddWarnings).length}`);
console.log(`requests sent: ${requests}`);
console.log("\naudit findings by code:"); for (const [k, v] of Object.entries(tally.audit).sort((a, b) => b[1] - a[1])) console.log(`  ${v}  ${k}`);
console.log("\nbSDD findings by code:"); for (const [k, v] of Object.entries(tally.bsdd).sort((a, b) => b[1] - a[1])) console.log(`  ${v}  ${k}`);
console.log("\nnotes (what could not be carried over), by kind:"); for (const [k, v] of Object.entries(tally.notes).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${v}  ${k}`);
console.log("\nper dictionary: classes facets props | audit E/W | bSDD E/W | notes");
for (const r of rows) console.log(r.classes ? `  ${r.dictionary}: ${r.classes} ${r.facets} ${r.properties} | ${r.auditErrors}/${r.auditWarnings} | ${r.bsddErrors}/${r.bsddWarnings} | ${r.notes}` : `  ${r.dictionary}: no class with properties in the first 24`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 2));
