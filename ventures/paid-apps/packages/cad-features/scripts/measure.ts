// Print the PartFeatures of one or more CAD files: node scripts/measure.ts <file>...
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { extractFeatures } from "../src/index.ts";

for (const file of process.argv.slice(2)) {
  const t0 = performance.now();
  const f = extractFeatures(readFileSync(file), basename(file));
  const ms = Math.round(performance.now() - t0);
  console.log(JSON.stringify({ file: basename(file), ms, ...f }, null, 2));
}
