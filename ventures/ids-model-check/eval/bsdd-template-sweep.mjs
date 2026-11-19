#!/usr/bin/env node
// Is every IFC 4.3 template property where bsdd-suggest.mjs's rule says it is?
// The rule links <IFC 4.3 dictionary>/prop/<name> for any property of a
// Pset_/Qto_ template (schema/psets-ifc4x3.json). bSDD's IFC 4.3 dictionary
// also holds each template set as a GroupOfProperties class with its
// properties, so this asks bSDD for all 760 sets (/api/Class/v1 with
// IncludeClassProperties) and compares, pair by pair:
//   same      bSDD lists the property in that set, at the rule's link
//   other     bSDD lists it in that set, at a different link (printed)
//   absent    the set is in bSDD but this property is not in it
//   no set    bSDD has no class for the set
// For each absent pair whose name is in no bSDD set at all, it then asks the
// rule's property link itself, so a name bSDD codes nowhere is told apart
// from a name bSDD has under other sets only.
//   node eval/bsdd-template-sweep.mjs [--sets Pset_A,Pset_B]
// The names whose rule link bSDD does not resolve must be exactly
// BSDD_UNLINKED in bsdd-suggest.mjs (the suggester skips them); the last line
// says whether they are, and the exit code is 1 when they are not.
// Goes on the network: about 800 GETs to api.bsdd.buildingsmart.org.
import { readFileSync } from "node:fs";
import { getJson, BSDD_API } from "../bsdd.mjs";
import { IFC43_DICTIONARY, ifc43PropUri, BSDD_UNLINKED } from "../bsdd-suggest.mjs";

const schemaDir = new URL("../schema/", import.meta.url);
const psets = JSON.parse(readFileSync(new URL("psets-ifc4x3.json", schemaDir), "utf8"));
// --sets A,B,...: only those sets (a quicker rerun of a part, e.g. the sets
// bSDD lacks; the BSDD_UNLINKED comparison then covers only their names).
const only = process.argv.includes("--sets") ? process.argv[process.argv.indexOf("--sets") + 1].split(",") : null;
const sets = Object.keys(psets).sort().filter((s) => !only || only.includes(s));

const ask = (path) => getJson(fetch, `${BSDD_API}${path}`);
// bSDD answers bursts with 429 even after getJson's retries, so lookups go 3
// at a time and the ones that still failed are asked again in later rounds.
async function askAll(keys, pathOf) {
  const out = new Map();
  let todo = keys;
  for (let round = 0; todo.length && round < 6; round++) {
    if (round) await new Promise((ok) => setTimeout(ok, 30000));
    for (let i = 0; i < todo.length; i += 3) await Promise.all(todo.slice(i, i + 3).map(async (k) => out.set(k, await ask(pathOf(k)))));
    todo = todo.filter((k) => out.get(k).failed);
  }
  return out;
}
const bySet = await askAll(sets, (s) => `/api/Class/v1?Uri=${encodeURIComponent(`${IFC43_DICTIONARY}/class/${s}`)}&IncludeClassProperties=true`);
const failed = [...bySet].filter(([, r]) => r.failed);
if (failed.length) { console.error(`bSDD did not answer for ${failed.length} sets (first: ${failed[0][0]}: ${failed[0][1].failed}); rerun`); process.exit(1); }

const inAnySet = new Map(); // lower-case code -> uri bSDD gives it
for (const [, r] of bySet) for (const p of (r.json && r.json.classProperties) || []) inAnySet.set((p.propertyCode || p.code || "").toLowerCase(), p.propertyUri);

const n = { same: 0, other: 0, absent: 0, noSet: 0 };
const other = [], absent = [], noSet = [];
for (const s of sets) {
  const r = bySet.get(s);
  if (r.notFound) { n.noSet += Object.keys(psets[s].props).length; noSet.push(s); continue; }
  const listed = new Map(((r.json && r.json.classProperties) || []).map((p) => [p.propertyCode || p.code, p.propertyUri]));
  for (const name of Object.keys(psets[s].props)) {
    const rule = ifc43PropUri(name);
    if (!listed.has(name)) { n.absent++; absent.push({ set: s, name }); continue; }
    if (listed.get(name) === rule) n.same++;
    else { n.other++; other.push(`${s}.${name}: bSDD ${listed.get(name)}; rule ${rule}`); }
  }
}

// Absent pairs: does the rule's link resolve anyway (the property exists in
// the dictionary, just not under this set)?
// Pairs in a set bSDD lacks count too: the rule's link may still resolve
// when the name is a property of other sets.
const orphan = noSet.flatMap((s) => Object.keys(psets[s].props).map((name) => ({ set: s, name })));
const orphanAsk = [...new Set(orphan.map((a) => a.name))].filter((x) => !inAnySet.has(x.toLowerCase()));
const names = [...new Set([...absent.map((a) => a.name), ...orphanAsk])].sort();
const props = await askAll(names, (name) => `/api/Property/v5?Uri=${encodeURIComponent(ifc43PropUri(name))}`);
const stuck = [...props].filter(([, r]) => r.failed);
if (stuck.length) { console.error(`bSDD did not answer for ${stuck.length} properties (first: prop/${stuck[0][0]}: ${stuck[0][1].failed}); rerun`); process.exit(1); }
const resolves = new Map([...props].map(([k, r]) => [k, !!r.json]));
const known = (name) => inAnySet.has(name.toLowerCase()) || resolves.get(name);
const unlinked = names.filter((x) => !known(x));
const pairsUnlinked = absent.filter((a) => !resolves.get(a.name));
const orphanUnlinked = orphan.filter((a) => !known(a.name));

console.log(`${sets.length} IFC 4.3 template sets, ${Object.values(psets).reduce((t, s) => t + Object.keys(s.props).length, 0)} set-property pairs; ${bySet.size - noSet.length} sets found in bSDD (${noSet.length} not: ${noSet.join(", ") || "none"})`);
console.log(`pairs bSDD lists in that set at the rule's link: ${n.same}; at another link: ${n.other}; not in bSDD's set: ${n.absent}; set not in bSDD: ${n.noSet}`);
for (const o of other) console.log(`  other  ${o}`);
console.log(`of the ${n.absent} absent pairs (${new Set(absent.map((a) => a.name)).size} distinct names), the rule's link still resolves for ${absent.length - pairsUnlinked.length}; it does not for ${pairsUnlinked.length} (${new Set(pairsUnlinked.map((a) => a.name)).size} names)`);
console.log(`of the ${orphan.length} pairs in sets bSDD lacks, the rule's link resolves for ${orphan.length - orphanUnlinked.length} (${orphanAsk.length} names asked one by one, the rest listed under other sets); it does not for ${orphanUnlinked.length}`);
for (const name of unlinked) console.log(`  unlinked  ${name}: ${[...absent, ...orphan].filter((a) => a.name === name && !known(a.name)).map((a) => a.set).join(", ")}`);
const want = [...BSDD_UNLINKED].sort().filter((x) => !only || names.includes(x));
const missing = unlinked.filter((x) => !BSDD_UNLINKED.has(x)), stale = want.filter((x) => !unlinked.includes(x));
if (!missing.length && !stale.length) console.log(`BSDD_UNLINKED in bsdd-suggest.mjs matches: ${want.length} names`);
else { console.log(`BSDD_UNLINKED in bsdd-suggest.mjs is out of date: add ${JSON.stringify(missing)}, remove ${JSON.stringify(stale)}`); process.exitCode = 1; }
