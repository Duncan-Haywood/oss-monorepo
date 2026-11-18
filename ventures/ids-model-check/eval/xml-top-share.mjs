// How much of an ifcXML file sits under its largest top-level element (a
// direct child of the root): the part a reader that streams by top-level
// element must hold at once. eval/ifc4-layout-scale-2026-11-18.md.
//   node eval/xml-top-share.mjs file.ifcxml ...
import { readFileSync } from "node:fs";
for (const f of process.argv.slice(2)) {
  const t = readFileSync(f, "utf8");
  const re = /<(\/?)([A-Za-z][^\s>\/]*)[^>]*?(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g;
  let m, d = 0, start = 0, n = 0, max = 0;
  while ((m = re.exec(t))) {
    if (m[2] === undefined) continue;
    if (m[1]) { d--; if (d === 1) { n++; max = Math.max(max, re.lastIndex - start); } }
    else if (!m[3]) { if (d === 1) start = m.index; d++; }
    else if (d === 1) { n++; max = Math.max(max, m[0].length); }
  }
  console.log(JSON.stringify({ file: f.split("/").pop(), MB: +(t.length / 1e6).toFixed(1), topLevel: n, largestShare: +(max / t.length).toFixed(3) }));
}
