// Refresh the "launch path" block on every tool page: node linkjourney.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { withJourney, NOT_TOOLS } from "./journey.mjs";
let n = 0;
for (const f of readdirSync(new URL(".", import.meta.url)).filter(f => f.endsWith(".html"))) {
  if (NOT_TOOLS.has(f)) continue;
  const p = new URL(f, import.meta.url), old = readFileSync(p, "utf8");
  const href = f === "index.html" ? "./" : f;
  const next = withJourney(old, href);
  if (next !== old) { writeFileSync(p, next); n++; }
}
console.log(`${n} page(s) updated`);
