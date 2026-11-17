// GlobalIds shared between models, on real exports: reads every .ifc/.ifczip/
// .ifcxml under the directories given, indexes each (ids.mjs globalIdIndex)
// and runs ci.mjs crossModelGlobalIds over all of them as one set, so a pair
// of unrelated files sharing an element GlobalId would show as a false alarm.
// Prints the pairs that share anything, then every revision pair and conflict.
// eval/federated-globalids-2026-11-17.md.
//   node --max-old-space-size=8000 eval/federated-globalids.mjs DIR [DIR...]
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { readModel, parseModel } from "../node.mjs";
import { globalIdIndex } from "../ids.mjs";
import { crossModelGlobalIds, sharedLine, revisionLine } from "../ci.mjs";

const walk = (d, out = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === ".git") continue;
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ifc|ifczip|ifcxml)$/i.test(e.name)) out.push(p);
  }
  return out;
};
const indexes = [];
let unread = 0, rooted = 0;
for (const dir of process.argv.slice(2)) {
  for (const f of walk(dir).sort()) {
    try {
      const index = globalIdIndex(parseModel((await readModel(f)).text));
      indexes.push({ model: relative(join(dir, ".."), f), index });
      rooted += index.size;
    } catch { unread++; }
  }
}
const t0 = performance.now();
const fed = crossModelGlobalIds(indexes);
const ms = Math.round(performance.now() - t0);
console.log(JSON.stringify({ models: indexes.length, unread, distinctGlobalIdsPerModelSum: rooted, ms, pairsSharing: fed.pairs.length, revisions: fed.revisions.length, conflicts: fed.conflicts.length, frame: fed.frame.length }));
const by = {};
for (const c of fed.conflicts) { const k = `${c.sameClass ? "same" : "diff"}:${c.holders[0].kind}:${c.holders[0].type}`; by[k] = (by[k] || 0) + 1; }
console.log(JSON.stringify({ conflictsByKind: by }));
for (const p of fed.pairs) console.log(`pair: ${p.a} | ${p.b}: ${p.shared} shared, ${p.frame} frame${p.revision ? ", REVISION" : ""}`);
for (const p of fed.revisions) console.log(`revision: ${revisionLine(p)}`);
for (const c of fed.conflicts) console.log(`conflict: ${sharedLine(c)}`);
