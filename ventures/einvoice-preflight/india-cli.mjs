#!/usr/bin/env node
// node india-cli.mjs payload.json [--json]
// Pre-checks an IRP INV-01 (v1.1) e-invoice JSON payload and names the field
// for each fault (india-inv01.mjs). Reads stdin with "-". Exit 0 no findings,
// 1 findings, 2 usage or unreadable file. Not the IRP: a pass is not an IRN.
import { readFileSync } from "node:fs";
import { checkInv01 } from "./india-inv01.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const file = args.find((a) => a === "-" || !a.startsWith("-"));
if (!file) {
  console.error("usage: node india-cli.mjs payload.json [--json]");
  process.exit(2);
}
let src;
try {
  src = readFileSync(file === "-" ? 0 : file, "utf8");
} catch (e) {
  console.error(`Cannot read payload: ${e.message}`);
  process.exit(2);
}
const r = checkInv01(src);
if (asJson) console.log(JSON.stringify(r, null, 2));
else {
  for (const p of r.problems) console.log(`${p.path || "(document)"}: ${p.message}`);
  console.log(r.ok ? "No findings. The IRP has the final say." : `${r.problems.length} finding${r.problems.length === 1 ? "" : "s"}.`);
}
process.exit(r.ok ? 0 : 1);
