#!/usr/bin/env node
// Every railing in the given models with the Uniformat II code the rules give
// it and why, grouped (eval/railings-2026-11-20.md):
//
//   node eval/railings-check.mjs model.ifc [more.ifc ...]

import { readFileSync } from "node:fs";
import { basename } from "node:path";
const V = new URL("../", import.meta.url).href;
const { parseStep } = await import(V + "step.mjs");
const { takeoff } = await import(V + "qto.mjs");
for (const f of process.argv.slice(2)) {
  const res = takeoff(parseStep(readFileSync(f)), { geometry: true });
  const rails = res.rows.filter(r => (r.effectiveClass||r.ifcType) === "IFCRAILING" && !r.isAssembly);
  if (!rails.length) continue;
  const cnt = {};
  for (const r of rails) {
    const b = r.box;
    const k = `${r.uniformat.code ?? "none"} | ${(r.type||r.name||"").replace(/:\d+$/,"").slice(0,38)} | h=${b ? (b[5]-b[2]).toFixed(1) : "?"} | ${r.uniformat.why.replace(/"[^"]*"/,'"..."')}`;
    cnt[k] = (cnt[k]||0)+1;
  }
  console.log(`== ${basename(f)}: ${rails.length}`);
  for (const [k,n] of Object.entries(cnt).sort((a,b)=>b[1]-a[1])) console.log(`  ${n} x ${k}`);
}
