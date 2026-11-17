// Duplicate GlobalIds in real exports: every .ifc/.ifczip/.ifcxml under the
// directories given, through duplicateGlobalIds() (ids.mjs). Prints one JSON
// line per file and a total. eval/duplicate-globalids-2026-11-17.md.
//   node --max-old-space-size=8000 eval/duplicate-globalids.mjs DIR [DIR...]
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readModel, parseModel } from "../node.mjs";
import { duplicateGlobalIds } from "../ids.mjs";

const walk = (d, out = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === ".git") continue;
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ifc|ifczip|ifcxml)$/i.test(e.name)) out.push(p);
  }
  return out;
};
const tot = { files: 0, read: 0, withDups: 0, dupGids: 0, rooted: 0 };
for (const dir of process.argv.slice(2)) {
  for (const f of walk(dir).sort()) {
    tot.files++;
    let m;
    try { m = parseModel((await readModel(f)).text); } catch (e) { console.log(JSON.stringify({ file: f, error: e.message.slice(0, 120) })); continue; }
    tot.read++;
    const t0 = performance.now();
    const d = duplicateGlobalIds(m);
    const ms = performance.now() - t0;
    let rooted = 0;
    for (const [t, l] of m.byType) if (m.schema.isA(t, "IFCROOT")) rooted += l.length;
    tot.rooted += rooted;
    if (d.length) { tot.withDups++; tot.dupGids += d.length; }
    const kinds = {};
    for (const x of d) { const k = x.elements.map((e) => e.type).join("+"); kinds[k] = (kinds[k] || 0) + 1; }
    console.log(JSON.stringify({ file: f, schema: m.schemaRaw, size: statSync(f).size, rooted, dupGids: d.length, ms: Math.round(ms), kinds, first: d[0] ? `${d[0].globalId}: ${d[0].elements.map((e) => `#${e.id} ${e.type}`).join(", ")}` : undefined }));
  }
}
console.log(JSON.stringify({ total: tot }));
