#!/usr/bin/env node
// Builds the hosted hub's Lambda bundle with the starter's builder, then copies the two browser modules the admin page
// imports (calc.mjs, bnp.mjs) beside it, where aws/app.mjs looks first.
//   node ventures/shift-roster-builder/aws/build.mjs   -> platform/aws/stacks/saas-starter/runtime/dist/app-roster_hub
// (run `npm ci` in that runtime directory first). The stack's build_dir points there.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const runtime = here("../../../platform/aws/stacks/saas-starter/runtime/");
execFileSync(process.execPath, [runtime + "build.mjs", "product", "roster_hub", here("./app.mjs"), here("./migrations")], { cwd: runtime, stdio: "inherit" });
const out = runtime + "dist/app-roster_hub/static";
mkdirSync(out, { recursive: true });
for (const f of ["calc.mjs", "bnp.mjs"]) cpSync(here("../" + f), `${out}/${f}`);
console.log(`copied calc.mjs, bnp.mjs to ${out}`);
