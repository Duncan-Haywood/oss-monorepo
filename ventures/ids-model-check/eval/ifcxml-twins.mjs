#!/usr/bin/env node
// Reads each ifcXML file that has a STEP twin from the same exporter, and
// compares the two models without relying on ids (an IFC4 ifcXML file nests
// entities and numbers them differently, or not at all, so #N cannot be
// mapped to an xml id as eval/ifcxml-xbim.mjs does for xBIM's files).
//
// The comparison: every entity gets a structural hash, its class plus each
// attribute value with references replaced by the hash of what they point at
// (so a whole subgraph, not an id, is compared). Then:
// - "STEP-only" / "XML-only": distinct hashes found in one model and not the
//   other (a nested ifcXML file repeats shared entities, so counts of
//   entities differ while the sets of distinct hashes should not);
// - entities with a GlobalId are paired by GlobalId and compared attribute by
//   attribute (references by the hash of their target), so a difference is
//   named as class.attribute;
// - each sample IDS is checked on both files and the verdicts compared.
//
//   node eval/ifcxml-twins.mjs <dir> [<dir> ...]   (exit 1 when any IDS verdict differs)
//   node eval/ifcxml-twins.mjs --ext .json <dir> ...  the same for ifcJSON twins
//     (X.json next to X.ifc; eval/ifcjson-twins-2026-11-21.md)
//   --deep  also reads every directory below each one named
//   --ids-dir DIR  also checks every .ids file in DIR (eval/fetch-audit-corpus.sh
//     puts 65 public ones in eval/corpus/real) on both forms
//   (pairs: every X.ifcxml with an X.ifc next to it; see eval/fetch-ifcxml-twins.sh)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { resources, check, parseModel } from "../node.mjs";

const argv = process.argv.slice(2);
const extAt = argv.indexOf("--ext");
const EXT = extAt >= 0 ? argv.splice(extAt, 2)[1] : ".ifcxml";
// A plain case-insensitive suffix test: EXT comes from the command line, so it is never turned into a RegExp.
const hasExt = (f) => f.toLowerCase().endsWith(EXT.toLowerCase());
const stripExt = (f) => (hasExt(f) ? f.slice(0, f.length - EXT.length) : f);
const idsAt = argv.indexOf("--ids-dir");
const IDS_DIR = idsAt >= 0 ? argv.splice(idsAt, 2)[1] : null;
const deepAt = argv.indexOf("--deep");
if (deepAt >= 0) argv.splice(deepAt, 1);
const dirs = [];
const addDir = (d) => { dirs.push(d); if (deepAt >= 0) for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) if (e.isDirectory() && !e.name.startsWith(".")) addDir(join(d, e.name)); };
for (const d of argv) { if (!existsSync(d)) { console.error(`no files at ${d}; run the fetch script first`); process.exit(2); } addDir(d); }
if (!dirs.length) { console.error("usage: node eval/ifcxml-twins.mjs <dir> [<dir> ...]"); process.exit(2); }
const { schemas } = resources();
const idsFiles = ["coordination-basics.ids.xml", "quantities-and-naming.ids.xml", "infrastructure-and-mep.ids.xml"]
  .map((f) => [f, readFileSync(new URL("../samples/" + f, import.meta.url), "utf8")]);
if (IDS_DIR) for (const f of readdirSync(IDS_DIR).filter((f) => /\.ids$/i.test(f)).sort()) idsFiles.push([f, readFileSync(join(IDS_DIR, f), "utf8")]);
const idsDiffs = [];

// A number is compared at 12 significant digits: STEP writes 0.0001 as
// "0.0001" and "1.E-4"; both parse to the same double, but a writer that
// prints shortest-round-trip and one that prints 15 digits can differ in the
// last place.
const numKey = (n) => (Number.isInteger(n) ? String(n) : Number(n).toPrecision(12));

function hasher(model) {
  const memo = new Map(), busy = new Set();
  const val = (v) => {
    if (v === null || v === undefined) return "$";
    if (typeof v === "number") return "n" + numKey(v);
    if (typeof v === "string") return "s" + JSON.stringify(v);
    if (typeof v === "boolean") return "b" + v;
    if (Array.isArray(v)) return "[" + v.map(val).join(",") + "]";
    if ("ref" in v) return "#" + hash(v.ref);
    if ("typed" in v) return "t" + v.typed + "(" + val(v.value) + ")";
    if ("enum" in v) return "e" + v.enum;
    if (v.derived) return "*";
    return "?" + JSON.stringify(v);
  };
  const hash = (id) => {
    if (memo.has(id)) return memo.get(id);
    const e = model.entities.get(id);
    if (!e) return "missing";
    if (busy.has(id)) return "cycle:" + e.type;
    busy.add(id);
    const h = createHash("sha1").update(e.type + "(" + e.args.map(val).join(",") + ")").digest("hex").slice(0, 16);
    busy.delete(id);
    memo.set(id, h);
    return h;
  };
  return { hash, val };
}

const isGuid = (s) => typeof s === "string" && /^[0-9A-Za-z_$]{22}$/.test(s);

const pairs = [];
for (const dir of dirs) {
  if (!existsSync(dir)) { console.error(`no files at ${dir}; run eval/fetch-ifcxml-twins.sh first`); process.exit(2); }
  for (const f of readdirSync(dir).filter(hasExt).sort()) {
    const step = join(dir, stripExt(f) + ".ifc");
    if (existsSync(step)) pairs.push([step, join(dir, f)]);
  }
}

console.log("| pair | XML schema | STEP schema | entities STEP / XML | distinct STEP / XML | STEP-only | XML-only | GlobalIds paired | attributes same / different | IDS verdicts |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
let bad = 0;
const diffKinds = new Map(), rootKinds = new Map(), rootSample = new Map();
const totals = { orphans: 0, pairs: 0, clean: 0, attrsSame: 0, attrsDiff: 0, idsSame: 0, idsRuns: 0 };
for (const [stepPath, xmlPath] of pairs) {
  totals.pairs++;
  const name = stripExt(basename(xmlPath));
  let S, X;
  try {
    S = parseModel(readFileSync(stepPath, "utf8"));
    X = parseModel(readFileSync(xmlPath, "utf8"));
  } catch (e) {
    bad++;
    console.log(`| ${name} | ERROR ${e.message} | | | | | | | | |`);
    continue;
  }
  const hs = hasher(S), hx = hasher(X);
  const setS = new Set([...S.entities.keys()].map(hs.hash)), setX = new Set([...X.entities.keys()].map(hx.hash));
  const onlyS = [...S.entities.values()].filter((e) => !setX.has(hs.hash(e.id)));
  const onlyX = [...X.entities.values()].filter((e) => !setS.has(hx.hash(e.id)));
  // Root differences: a STEP-only entity none of whose references is itself
  // STEP-only (everything above it differs only because it does).
  const refsOf = (v, out = []) => { if (Array.isArray(v)) v.forEach((x) => refsOf(x, out)); else if (v && typeof v === "object") { if ("ref" in v) out.push(v.ref); else if ("value" in v) refsOf(v.value, out); } return out; };
  // Reachable: from any entity with a GlobalId, following references. An
  // ifcXML file is written from its root objects down, so a STEP entity that
  // nothing rooted points at (an unused direction, a spare unit) has no place
  // in it; those are counted apart.
  const reach = new Set(), stack = [...S.entities.values()].filter((e) => isGuid(e.args[0])).map((e) => e.id);
  while (stack.length) { const id = stack.pop(); if (reach.has(id)) continue; reach.add(id); const e = S.entities.get(id); if (e) stack.push(...refsOf(e.args)); }
  const orphans = onlyS.filter((e) => !reach.has(e.id));
  totals.orphans += orphans.length;
  const roots = onlyS.filter((e) => reach.has(e.id) && refsOf(e.args).every((r) => setX.has(hs.hash(r))));
  for (const e of roots) {
    rootKinds.set(e.type, (rootKinds.get(e.type) || 0) + 1);
    if (!rootSample.has(e.type)) rootSample.set(e.type, `${name} #${e.id} ${JSON.stringify(e.args).slice(0, 160)}`);
  }
  const onlySd = new Set(onlyS.map((e) => hs.hash(e.id))).size, onlyXd = new Set(onlyX.map((e) => hx.hash(e.id))).size;

  // Pair rooted entities by GlobalId and compare attribute by attribute.
  const byGuid = (M) => new Map([...M.entities.values()].filter((e) => isGuid(e.args[0])).map((e) => [e.args[0], e]));
  const gS = byGuid(S), gX = byGuid(X);
  let paired = 0, same = 0, diff = 0;
  const notes = [];
  for (const [g, e] of gS) {
    const x = gX.get(g);
    if (!x) { notes.push(`${e.type} ${g} not in XML`); continue; }
    paired++;
    if (x.type !== e.type) { diff++; notes.push(`${e.type} read as ${x.type}`); continue; }
    e.args.forEach((v, i) => {
      if (hs.val(v) === hx.val(x.args[i])) { same++; return; }
      diff++;
      const attr = S.schema.attrs(e.type)[i]?.name ?? `#${i}`;
      const k = `${e.type}.${attr}`;
      diffKinds.set(k, (diffKinds.get(k) || 0) + 1);
      if (notes.length < 3) notes.push(`${k}: STEP ${hs.val(v).slice(0, 40)} XML ${hx.val(x.args[i]).slice(0, 40)}`);
    });
  }
  for (const g of gX.keys()) if (!gS.has(g)) notes.push(`${gX.get(g).type} ${g} not in STEP`);
  totals.attrsSame += same; totals.attrsDiff += diff;

  // The checker's verdicts on both.
  const v = (r) => JSON.stringify(r.specs.map((s) => [s.status, s.applicable, s.failed.map((f) => f.globalId).sort()]));
  let idsSame = 0;
  for (const [f, ids] of idsFiles) {
    totals.idsRuns++;
    let a, b;
    try { a = v(check(ids, S, { maxFailed: Infinity })); } catch (e) { a = "error " + e.message; }
    try { b = v(check(ids, X, { maxFailed: Infinity })); } catch (e) { b = "error " + e.message; }
    if (a === b) { idsSame++; totals.idsSame++; }
    else {
      // What a BIM user sees: each specification's status and the
      // GlobalIds that fail it (the BCF issues). Counts of entities with no
      // GlobalId can differ when a STEP file holds duplicate or unreferenced
      // geometry that a tree-shaped file has no place for.
      const rooted = (r) => JSON.stringify(r.specs.map((s) => [s.status, s.failed.map((x) => x.globalId).filter(Boolean).sort()]));
      let ra, rb;
      try { ra = rooted(check(ids, S, { maxFailed: Infinity })); rb = rooted(check(ids, X, { maxFailed: Infinity })); } catch { ra = "a"; rb = "b"; }
      if (ra === rb) totals.rootedSame = (totals.rootedSame || 0) + 1;
      idsDiffs.push(`${ra === rb ? "(counts only) " : ""}${name} x ${f}: STEP ${a.slice(0, 200)} / other ${b.slice(0, 200)}`);
    }
  }
  const onlyReach = onlyS.filter((e) => reach.has(e.id));
  const cleanGraph = !onlyReach.length && !onlyXd;
  if (cleanGraph) totals.cleanGraph = (totals.cleanGraph || 0) + 1;
  const clean = !onlySd && !onlyXd && !diff && idsSame === idsFiles.length && paired === gS.size && gS.size === gX.size;
  // The exit code tracks the verdicts: a graph difference may be the
  // exporter's (the measurement note names each kind), a verdict difference
  // is what a user would see.
  if (clean) totals.clean++;
  if (idsSame !== idsFiles.length) bad++;
  const errs = [...S.parseErrors, ...X.parseErrors];
  console.log(`| ${name} | ${X.schemaRaw} | ${S.schemaRaw} | ${S.entities.size} / ${X.entities.size} | ${setS.size} / ${setX.size} | ${onlySd} | ${onlyXd} | ${paired} of ${gS.size} | ${same} / ${diff} | ${idsSame} of ${idsFiles.length} same |${errs.length ? " reader: " + errs.slice(0, 2).join("; ") : ""}${!clean && notes.length ? " " + notes.slice(0, 3).join("; ") : ""}`);
  if (process.env.TWINS_VERBOSE && (onlyS.length || onlyX.length)) {
    for (const e of onlyS.slice(0, 6)) console.error(`  ${name} STEP-only #${e.id} ${e.type} ${JSON.stringify(e.args).slice(0, 200)}`);
    for (const e of onlyX.slice(0, 6)) console.error(`  ${name} XML-only ${e.xmlId ?? e.id} ${e.type} ${JSON.stringify(e.args).slice(0, 200)}`);
  }
}
console.log(`\n${totals.pairs} pairs; ${totals.clean} identical as graphs with identical verdicts; ${totals.cleanGraph || 0} identical once ${totals.orphans} STEP entities nothing rooted points at are set aside; GlobalId-paired attribute values ${totals.attrsSame} identical, ${totals.attrsDiff} different; IDS verdicts ${totals.idsSame} of ${totals.idsRuns} identical`);
if (idsDiffs.length) {
  console.log(`\nIDS verdicts that differ: ${idsDiffs.length}, of which ${totals.rootedSame || 0} only in counts (same status and failing GlobalIds)`);
  const byIds = new Map();
  for (const d of idsDiffs) { const k = (d.startsWith("(counts only)") ? "counts only: " : "status or GlobalIds: ") + d.split(" x ")[1].split(":")[0]; byIds.set(k, (byIds.get(k) || 0) + 1); }
  for (const [k, n] of byIds) console.log(`- ${k} ${n}`);
  for (const d of idsDiffs.filter((d) => !d.startsWith("(counts only)"))) console.log("  " + d.slice(0, 600));
}
if (diffKinds.size) console.log("differences by attribute: " + [...diffKinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", "));
if (rootKinds.size) {
  console.log("\nroot differences (STEP-only entities reachable from a rooted object whose references all match), by class:");
  for (const [k, n] of [...rootKinds].sort((a, b) => b[1] - a[1])) console.log(`- ${k} ${n}: e.g. ${rootSample.get(k)}`);
}
process.exitCode = bad ? 1 : 0;
