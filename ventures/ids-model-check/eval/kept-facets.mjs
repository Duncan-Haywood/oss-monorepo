// Why the editor holds facets as written: tallies each kept facet by where it
// sits (applicability or requirement), whether its specification names a class,
// and its kind. Run after eval/fetch-audit-corpus.sh: node eval/kept-facets.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const base = new URL("..", import.meta.url).pathname;
const { parseIds } = await import(base + "/ids.mjs");
const { resources } = await import(base + "/node.mjs");
const { importIds } = await import(base + "/editor.mjs");
const R = resources();
const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: id === "IFC2X3" ? R.typeMap : null });
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.ids$/i.test(n) ? [p] : []; });
for (const [label, dir] of [["public", base + "eval/corpus/real"], ["audit", base + "eval/corpus/IDS-Audit-tool/testing.shared/ValidFiles"]]) {
  const t = {};
  for (const f of walk(dir)) {
    let p; try { p = parseIds(readFileSync(f, "utf8")); } catch { continue; }
    const { state } = importIds(p, loadFor);
    state.specs.forEach((s) => {
      const where = s.cls ? "class" : "noclass";
      for (const x of s.fixedApp || []) { const k = `app ${where} ${x.kind}`; t[k] = (t[k] || 0) + 1; }
      for (const r of s.reqs) if (r.fixed) { const k = `req ${where} ${r.kind}${r.fixed.value ? "+value" : ""}`; t[k] = (t[k] || 0) + 1; }
    });
  }
  console.log(label, Object.entries(t).sort((a, b) => b[1] - a[1]));
}
