#!/usr/bin/env node
// Property set template types (schema/psets-*.json `tt`, IFC4 and IFC4X3):
// where the standard says a set may sit, and whether the audit and the editor
// agree on every class/set pair the editor offered before `tt` was read.
//
//   - an occurrence set (PSET_/QTO_OCCURRENCEDRIVEN) on a type object: the
//     audit warns pset-occurrence, the editor no longer offers it, and the
//     occurrence class the warning names audits without it;
//   - a performance set (PSET_PERFORMANCEDRIVEN) on its element: warned
//     pset-performance; on IFCPERFORMANCEHISTORY: no pset-class error (there
//     was one before) and the editor offers it there;
//   - every pair the editor offers now draws neither warning.
//
// "Before" is the same code with `tt` stripped from the templates.
//
//   node eval/template-types.mjs > eval/template-types.txt
import { resources } from "../node.mjs";
import { parseIds } from "../ids.mjs";
import { auditIds } from "../audit.mjs";
import { classesWithSets, setsFor, propertiesOf } from "../editor.mjs";

const R = resources();
const strip = (ps) => Object.fromEntries(Object.entries(ps).map(([k, v]) => { const { tt, ...rest } = v; return [k, rest]; }));
const R0 = { ...R, psets: Object.fromEntries(Object.entries(R.psets).map(([id, ps]) => [id, strip(ps)])) };
const V = { IFC4: "IFC4", IFC4X3: "IFC4X3_ADD2" };
const xml = (ver, cls, set, prop) => `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications><specification name="s" ifcVersion="${ver}"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>${cls}</simpleValue></name></entity></applicability><requirements><property${prop.dataType ? ` dataType="${prop.dataType}"` : ""}><propertySet><simpleValue>${set}</simpleValue></propertySet><baseName><simpleValue>${prop.name}</simpleValue></baseName></property></requirements></specification></specifications></ids>`;
const codes = (res, t) => auditIds(parseIds(t), res).map((x) => x.code);
const audit = (res, ver, cls, set, prop) => codes(res, xml(ver, cls, set, prop));
const pairsOf = (ps, S) => classesWithSets(ps, S).flatMap((c) => setsFor(ps, S, c).map((s) => [c, s]));

for (const id of ["IFC4", "IFC4X3"]) {
  const S = R.schemas[id], ps = R.psets[id], ps0 = R0.psets[id];
  const tally = {};
  for (const s of Object.values(ps)) if (s.tt) tally[s.tt] = (tally[s.tt] || 0) + 1;
  console.log(`${id}: ${Object.keys(ps).length} standard sets; template types kept: ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  const before = pairsOf(ps0, S), now = pairsOf(ps, S);
  const nowKey = new Set(now.map((p) => p.join(" ")));
  const bad = [];
  let occPairs = 0, occWarned = 0, occWarnedBefore = 0, occHidden = 0, occFix = 0, occFixClean = 0;
  let perfPairs = 0, perfWarned = 0, perfHistBefore = 0, perfHistClean = 0, perfOffered = 0;
  const perfSets = new Set();
  for (const [cls, set] of before) {
    const tt = ps[set].tt || "";
    const prop = propertiesOf(ps, S, set)[0];
    if (!prop) continue;
    if (/OCCURRENCEDRIVEN$/.test(tt) && cls.endsWith("TYPE")) {
      occPairs++;
      const c = audit(R, V[id], cls, set, prop);
      if (c.includes("pset-occurrence")) occWarned++; else bad.push(`${cls} ${set}: not warned (${c.join(",") || "nothing"})`);
      if (audit(R0, V[id], cls, set, prop).includes("pset-occurrence")) occWarnedBefore++;
      if (!nowKey.has(`${cls} ${set}`)) occHidden++; else bad.push(`${cls} ${set}: still offered`);
      const occ = cls.replace(/TYPE$/, "");
      if (S.has(occ) && setsFor(ps, S, occ).includes(set)) {
        occFix++;
        const f = audit(R, V[id], occ, set, prop);
        if (!f.some((x) => ["pset-occurrence", "pset-class"].includes(x))) occFixClean++; else bad.push(`${occ} ${set}: ${f.join(",")}`);
      }
    }
    if (tt === "PSET_PERFORMANCEDRIVEN") {
      perfPairs++;
      const c = audit(R, V[id], cls, set, prop);
      if (c.includes("pset-performance")) perfWarned++; else bad.push(`${cls} ${set}: not warned (${c.join(",") || "nothing"})`);
      if (!perfSets.has(set)) {
        perfSets.add(set);
        if (audit(R0, V[id], "IFCPERFORMANCEHISTORY", set, prop).includes("pset-class")) perfHistBefore++;
        const h = audit(R, V[id], "IFCPERFORMANCEHISTORY", set, prop);
        if (!h.some((x) => x.startsWith("pset-"))) perfHistClean++; else bad.push(`IFCPERFORMANCEHISTORY ${set}: ${h.join(",")}`);
        if (nowKey.has(`IFCPERFORMANCEHISTORY ${set}`)) perfOffered++; else bad.push(`IFCPERFORMANCEHISTORY ${set}: not offered`);
      }
    }
  }
  let nowWarned = 0, nowAudited = 0;
  for (const [cls, set] of now) {
    if (!ps[set].tt) continue;
    const prop = propertiesOf(ps, S, set)[0];
    if (!prop) continue;
    nowAudited++;
    const c = audit(R, V[id], cls, set, prop);
    if (c.some((x) => ["pset-occurrence", "pset-performance", "pset-class"].includes(x))) { nowWarned++; bad.push(`offered now ${cls} ${set}: ${c.join(",")}`); }
  }
  console.log(`  editor offered ${before.length} class/set pairs before, ${now.length} now`);
  console.log(`  occurrence set on a type object: ${occPairs} pairs offered before; warned ${occWarned} (before: ${occWarnedBefore}); no longer offered ${occHidden}; the occurrence class audits clean ${occFixClean} of ${occFix}`);
  console.log(`  performance set on its element: ${perfPairs} pairs offered before; warned ${perfWarned}`);
  console.log(`  performance set on IFCPERFORMANCEHISTORY: ${perfSets.size} sets; pset-class error before ${perfHistBefore}, audit clean now ${perfHistClean}, offered now ${perfOffered}`);
  console.log(`  pairs offered now with a template type: ${nowAudited}; drawing pset-occurrence, pset-performance or pset-class: ${nowWarned}`);
  for (const b of bad.slice(0, 20)) console.log("  MISMATCH " + b);
  if (bad.length > 20) console.log(`  ... ${bad.length - 20} more`);
}
