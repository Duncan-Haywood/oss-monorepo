// Do bSDD links survive the editor? Opens each public IDS file with facet
// uris (sh eval/fetch-bsdd-ids.sh first) the way editor.html does (importIds,
// repair on open), writes it back (stateToDoc + buildIds) and compares the
// (specification, facet kind, uri) triples before and after.
//   node eval/editor-uri-roundtrip.mjs [DIR]
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { importIds, stateToDoc, buildIds, repairOnOpen } from "../editor.mjs";
import { parseIds } from "../ids.mjs";
import { bsddLinks } from "../bsdd.mjs";
import { resources } from "../node.mjs";

const dir = process.argv[2] || new URL("corpus/bsdd", import.meta.url).pathname;
const R = resources();
const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: id === "IFC2X3" ? R.typeMap : null });
const seen = new Set();
let files = 0, before = 0, after = 0, whole = 0, failed = 0;
const lost = [];
for (const name of readdirSync(dir).sort()) {
  const raw = readFileSync(join(dir, name), "utf8");
  const h = createHash("sha1").update(raw).digest("hex");
  if (seen.has(h)) continue;
  seen.add(h);
  let text = raw;
  try { const rep = repairOnOpen(raw); if (rep && rep.text) text = rep.text; } catch { /* opened as is */ }
  let links;
  try { links = bsddLinks(text).filter((l) => l.section === "requirements"); } catch { continue; }
  if (!links.length) continue;
  files++;
  const key = (l) => `${l.spec} ${l.kind} ${l.uri}`;
  const want = links.map(key);
  let back;
  try {
    const imp = importIds(parseIds(text), loadFor);
    const L = loadFor(imp.state.schema);
    back = bsddLinks(buildIds(stateToDoc(imp.state, L), L.S)).map(key);
  } catch (e) { failed++; console.log(`${name}: did not open (${e.message})`); continue; }
  const left = [...back];
  let kept = 0;
  for (const k of want) { const i = left.indexOf(k); if (i >= 0) { kept++; left.splice(i, 1); } else lost.push(`${name}: ${k}`); }
  before += want.length; after += kept;
  if (kept === want.length) whole++;
}
console.log(`${files} distinct files with requirement-facet uris; ${before} uris; ${after} written back by the editor; ${whole} files with every uri kept; ${failed} did not open`);
for (const x of lost.slice(0, 20)) console.log(`  lost ${x}`);
