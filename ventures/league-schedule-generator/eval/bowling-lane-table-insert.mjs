// Add answers to bowling-lane-table.mjs without regenerating its header (2026-11-23).
// node eval/bowling-lane-table-insert.mjs bowling-lane-table.mjs part.json [comment line ...]
import { readFileSync, writeFileSync } from "node:fs";
const [file, part] = process.argv.slice(2);
const add = JSON.parse(readFileSync(part, "utf8"));
const lines = readFileSync(file, "utf8").split("\n");
const start = lines.findIndex((l) => l.startsWith("export const LANE_TABLE"));
const end = lines.indexOf("};", start);
const entries = {};
for (const l of lines.slice(start + 1, end)) { const m = l.match(/^\s*"([^"]+)": "([^"]+)",?$/); if (m) entries[m[1]] = m[2]; }
for (const [k, v] of Object.entries(add)) { if (entries[k]) throw new Error(`${k} already stored`); entries[k] = v; }
const keys = Object.keys(entries).sort((a, b) => { const [n1, w1] = a.split(",").map(Number), [n2, w2] = b.split(",").map(Number); return n1 - n2 || w1 - w2; });
const out = [...lines.slice(0, start), ...process.argv.slice(4).map((c) => `// ${c}`), lines[start], ...keys.map((k) => `  "${k}": "${entries[k]}",`), ...lines.slice(end)];
writeFileSync(file, out.join("\n"));
