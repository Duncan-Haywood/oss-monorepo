// Cycles of wholes seeded into real files (eval/decomposition-cycles-2026-11-24.md).
// For each file, closes a loop of two records four ways and runs the full
// conformance check (schema faults, inverse counts, WHERE rules) on the
// original and the seeded copy:
//   assembly-cycle     a part of a non-spatial whole (a stair, an assembly, a
//                      curtain wall) made to aggregate its whole
//   spatial-cycle      a storey (or other spatial part) made to aggregate its
//                      building (spatial whole)
//   nest-cycle         a nested part made to nest its host (IFC4, IFC4X3)
//   containment-cycle  an element contained in a storey made to aggregate the storey
// and says what the seed added. Before conformance.mjs's decomposition-cycle
// check, nothing named the assembly cycle; the others could be caught only
// where the whole already had a parent (a [0:1] inverse count).
//   node --stack-size=8000 eval/decomposition-cycles.mjs OUTDIR FILE.ifc...
// writes OUTDIR/<file>~<family>.ifc and OUTDIR/manifest.json (each seed's
// part, whole and the relationship's id) for eval/decomposition_cycles_ifctester.py.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { indexRecords, splitArgs } from "./where-rules-seeded.mjs";
import { resources } from "../node.mjs";
import { conformance } from "../conformance.mjs";
import { Schema } from "../ids.mjs";

const R = resources();
const SS = {};
const schemaOf = (text) => {
  const m = /FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i.exec(text);
  const raw = (m ? m[1] : "").toUpperCase();
  const id = raw.startsWith("IFC4X3") ? "IFC4X3" : raw.startsWith("IFC4") ? "IFC4" : raw.startsWith("IFC2X3") ? "IFC2X3" : null;
  if (id && !SS[id]) SS[id] = R.schemas[id] instanceof Schema ? R.schemas[id] : new Schema(R.schemas[id]);
  return id;
};
const refs = (a) => [...(a || "").matchAll(/#(\d+)/g)].map((m) => Number(m[1]));

export const FAMILIES = ["assembly-cycle", "spatial-cycle", "nest-cycle", "containment-cycle"];

// Returns { text, part, whole, rel, wholeHadParent } or null.
export function seedCycle(text, family) {
  const sid = schemaOf(text);
  if (!sid) return null;
  const S = SS[sid];
  const recs = indexRecords(text);
  const args = (r) => splitArgs(text.slice(r.open + 1, r.close));
  let max = 0;
  for (const k of recs.keys()) if (k > max) max = k;
  const parentOf = new Set(); // ids that are already someone's part through aggregation or nesting
  for (const r of recs.values()) if (r.type === "IFCRELAGGREGATES" || r.type === "IFCRELNESTS") for (const p of refs(args(r)[5])) parentOf.add(p);
  const ok = (r) => r && S.has(r.type);
  const spatial = (r) => S.isA(r.type, "IFCSPATIALSTRUCTUREELEMENT") || (S.has("IFCSPATIALELEMENT") && S.isA(r.type, "IFCSPATIALELEMENT"));
  let pick = null;
  if (family === "containment-cycle") {
    for (const r of recs.values()) {
      if (r.type !== "IFCRELCONTAINEDINSPATIALSTRUCTURE") continue;
      const a = args(r);
      const whole = recs.get(refs(a[5])[0]);
      const part = refs(a[4]).map((x) => recs.get(x)).find((x) => ok(x) && !spatial(x));
      if (ok(whole) && part) { pick = { part, whole, rel: "IFCRELAGGREGATES" }; break; }
    }
  } else {
    const relType = family === "nest-cycle" ? "IFCRELNESTS" : "IFCRELAGGREGATES";
    if (!S.has(relType) || (family === "nest-cycle" && sid === "IFC2X3")) return null;
    for (const r of recs.values()) {
      if (r.type !== relType) continue;
      const a = args(r);
      const whole = recs.get(refs(a[4])[0]);
      if (!ok(whole) || whole.type === "IFCPROJECT") continue;
      const parts = refs(a[5]).map((x) => recs.get(x)).filter(ok);
      let part;
      if (family === "assembly-cycle") { if (spatial(whole)) continue; part = parts.find((x) => !spatial(x)); }
      else if (family === "spatial-cycle") { if (!spatial(whole)) continue; part = parts.find(spatial); }
      else part = parts[0];
      if (part) { pick = { part, whole, rel: relType }; break; }
    }
  }
  if (!pick) return null;
  const oh = [...recs.values()].find((r) => r.type === "IFCOWNERHISTORY");
  const rid = ++max;
  const line = `#${rid}=${pick.rel}('3SeedCycle${String(rid % 1e12).padStart(12, "0")}',${oh ? "#" + oh.id : "$"},$,$,#${pick.part.id},(#${pick.whole.id}));`;
  const data = text.search(/\bDATA\s*;/);
  const end = text.slice(data).search(/\bENDSEC\s*;/) + data;
  return {
    text: text.slice(0, end) + line + "\n" + text.slice(end),
    schema: sid, part: pick.part.id, partType: pick.part.type, whole: pick.whole.id, wholeType: pick.whole.type, rel: rid,
    wholeHadParent: parentOf.has(pick.whole.id),
  };
}

const keyed = (c) => c.findings.map((f) => `${f.code}|${f.id}|${f.attr}`);
export function seedAndConform(text, family, before = null) {
  const s = seedCycle(text, family);
  if (!s) return null;
  before ||= new Set(keyed(conformance(text, R.schemas, { rules: R.rules })));
  const after = keyed(conformance(s.text, R.schemas, { rules: R.rules }));
  const afterSet = new Set(after);
  return { ...s, added: after.filter((k) => !before.has(k)), lost: [...before].filter((k) => !afterSet.has(k)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [outDir, ...files] = process.argv.slice(2);
  mkdirSync(outDir, { recursive: true });
  const manifest = [];
  const tally = {};
  const used = new Set();
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    let base = basename(f).replace(/\.ifc$/i, "");
    for (let n = 2; used.has(base); n++) base = basename(f).replace(/\.ifc$/i, "") + "-" + n;
    used.add(base);
    if (!schemaOf(text)) { console.log(`${base}: schema not read, skipped`); continue; }
    let before;
    try { before = new Set(keyed(conformance(text, R.schemas, { rules: R.rules }))); }
    catch (e) { console.log(`${base}: ${e.message}`); continue; }
    const orig = join(outDir, `${base}~original.ifc`);
    writeFileSync(orig, text);
    for (const fam of FAMILIES) {
      const r = seedAndConform(text, fam, before);
      if (!r) continue;
      const out = join(outDir, `${base}~${fam}.ifc`);
      writeFileSync(out, r.text);
      const codes = r.added.map((k) => k.split("|")[0]);
      const cycle = codes.includes("decomposition-cycle");
      const other = [...new Set(r.added.filter((k) => !k.startsWith("decomposition-cycle|")))];
      const t = (tally[fam] ||= { files: 0, cycle: 0, otherCatch: 0, nothingElse: 0, hadParent: 0, lost: 0 });
      t.files++;
      if (cycle) t.cycle++;
      if (other.length) t.otherCatch++; else t.nothingElse++;
      if (r.wholeHadParent) t.hadParent++;
      if (r.lost.length) t.lost++;
      console.log(`${base} ${fam} (${r.schema}): #${r.part} ${r.partType} now holds #${r.whole} ${r.wholeType}${r.wholeHadParent ? " (whole had a parent)" : ""}: ${cycle ? "cycle named" : "CYCLE NOT NAMED"}; other findings added: ${other.length ? other.join("; ") : "none"}${r.lost.length ? `; LOST ${r.lost.join("; ")}` : ""}`);
      manifest.push({ original: orig, seeded: out, family: fam, schema: r.schema, part: r.part, partType: r.partType, whole: r.whole, wholeType: r.wholeType, rel: r.rel, wholeHadParent: r.wholeHadParent, added: r.added });
    }
  }
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log("\nfamily              files  cycle-named  caught-otherwise  nothing-else  whole-had-parent  lost");
  for (const [k, v] of Object.entries(tally)) console.log(`${k.padEnd(19)} ${String(v.files).padStart(5)} ${String(v.cycle).padStart(12)} ${String(v.otherCatch).padStart(17)} ${String(v.nothingElse).padStart(13)} ${String(v.hadParent).padStart(17)} ${String(v.lost).padStart(5)}`);
}
