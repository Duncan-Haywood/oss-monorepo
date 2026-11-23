// node eval/corpus-summary.mjs <file>...  Counts findings by severity and id over real pyproject.toml files (no file list).
import { readFileSync } from "node:fs";
import { analyze } from "../engine.mjs";
const files = process.argv.slice(2);
const by = {};
const withSev = { high: new Set(), medium: new Set() };
for (const f of files) {
  const r = analyze(readFileSync(f, "utf8"));
  for (const x of r.findings) {
    const k = `${x.severity} ${x.id}`;
    (by[k] ??= new Set()).add(f.split("/").pop());
    if (withSev[x.severity]) withSev[x.severity].add(f);
  }
}
console.log(`${files.length} files; ${withSev.high.size} with a high finding, ${withSev.medium.size} with a medium one`);
for (const [k, s] of Object.entries(by).sort((a, b) => b[1].size - a[1].size)) console.log(String(s.size).padStart(4), k, [...s].slice(0, 6).join(" "));
