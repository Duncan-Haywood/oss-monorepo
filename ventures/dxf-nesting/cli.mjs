#!/usr/bin/env node
// Nest DXF parts from the command line.
//
//   node cli.mjs bracket.dxf:20 flange.dxf:8 --sheet 2500x1250 --gap 5 --margin 10 --out nest.dxf
//
// Each file may hold several parts; ":N" sets the quantity of every part in it.
// Prints a report per sheet; --out writes all sheets to one DXF (stacked),
// --out-dir writes sheet-1.dxf, sheet-2.dxf, ...; --json prints the full result.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { partsFromDxf, runJob, allSheetsDxf, sheetDxf, exampleParts } from "./job.mjs";

const HELP = `Usage: node cli.mjs FILE.dxf[:QTY] ... --sheet WxL [options]
       node cli.mjs --example            (the built-in mm example on 2500x1250)

Options:
  --sheet WxL        sheet size in drawing units, length first (e.g. 2500x1250 or 96x48)
  --gap G            minimum distance between parts (default 0)
  --margin M         minimum distance from the sheet edge (default 0)
  --rot LIST         allowed turns in degrees, e.g. 0,180 or 0,90,180,270 (default) or every 15
  --res R            grid cell size (default: about 1/1250 of the sheet's long side)
  --tol T            arc flattening tolerance (default 0.01)
  --max-sheets N     stop opening sheets after N (default 50)
  --skip-layers RE   ignore layers whose names match RE (e.g. "^(DIM|TEXT|NOTES)$")
  --out FILE.dxf     write every sheet to one DXF, stacked
  --out-dir DIR      write one DXF per sheet
  --json             print the full result as JSON

No warranty: check every nest in your CAM before cutting. Not engineering advice.`;

function args(argv) {
  const o = { files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { o.files.push(a); continue; }
    const k = a.slice(2);
    if (["json", "example", "help"].includes(k)) o[k] = true;
    else o[k] = argv[++i];
  }
  return o;
}

function rotations(s) {
  if (!s) return [0, 90, 180, 270];
  const m = /^every\s*(\d+(?:\.\d+)?)$/i.exec(s.trim());
  if (m) {
    const step = parseFloat(m[1]), out = [];
    for (let a = 0; a < 360 - 1e-9; a += step) out.push(Math.round(a * 1e6) / 1e6);
    return out;
  }
  return s.split(",").map((x) => parseFloat(x)).filter((x) => Number.isFinite(x));
}

function main() {
  const o = args(process.argv.slice(2));
  if (o.help || (!o.files.length && !o.example)) {
    console.log(HELP);
    process.exit(o.help ? 0 : 1);
  }
  const tol = o.tol ? parseFloat(o.tol) : 0.01;
  let items = [], insunits = 0;
  if (o.example) {
    items = exampleParts(tol);
    insunits = 4;
    o.sheet = o.sheet || "2500x1250";
    o.gap = o.gap ?? "5";
    o.margin = o.margin ?? "10";
  }
  for (const f of o.files) {
    const m = /^(.*?)(?::(\d+))?$/.exec(f);
    const path = m[1], qty = m[2] ? parseInt(m[2], 10) : 1;
    const r = partsFromDxf(readFileSync(path, "utf8"), basename(path), { tol, skipLayers: o["skip-layers"] || null });
    for (const w of r.warnings || []) console.error(`${path}: ${w}`);
    if (!r.ok) { console.error(`${path}: ${r.error}`); process.exit(1); }
    insunits = insunits || r.insunits;
    for (const p of r.parts) items.push({ ...p, qty });
  }
  const sm = /^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)$/i.exec(o.sheet || "");
  if (!sm) { console.error("Give the sheet as --sheet LENGTHxWIDTH, e.g. 2500x1250."); process.exit(1); }
  const job = runJob(items, {
    sheetW: parseFloat(sm[1]), sheetH: parseFloat(sm[2]),
    gap: o.gap ? parseFloat(o.gap) : 0, margin: o.margin ? parseFloat(o.margin) : 0,
    rotations: rotations(o.rot), res: o.res ? parseFloat(o.res) : undefined, tol,
    maxSheets: o["max-sheets"] ? parseInt(o["max-sheets"], 10) : 50,
  });
  if (!job.ok) { console.error(job.error); process.exit(1); }
  if (o.json) {
    console.log(JSON.stringify({ result: job.result, check: job.check, report: job.report }, null, 2));
  } else {
    const r = job.report;
    console.log(`${r.totalParts} parts on ${r.totalSheets} sheet(s) (area bound: at least ${r.sheetLowerBound}); ${(r.utilisation * 100).toFixed(1)}% of the sheets bought; cut ${r.cutLength.toFixed(1)}, ${r.pierces} pierces. Grid ${job.result.res}, ${job.result.ordersTried} orders, ${job.result.ms} ms.`);
    for (const s of r.sheets) console.log(`  sheet ${s.sheet}: ${s.parts} parts, uses ${s.usedLength.toFixed(1)} of ${job.result.sheetW} (${(s.utilisationOfUsed * 100).toFixed(1)}% of that), cut ${s.cutLength.toFixed(1)}, ${s.pierces} pierces`);
    for (const u of job.result.unplaced) console.log(`  NOT PLACED: ${u.count} x ${u.name} (${u.reason})`);
    console.log(job.check.ok ? `Check: every gap >= ${job.result.gap}, every part >= ${job.result.margin} from the edge (closest ${job.check.minGap === Infinity ? "-" : job.check.minGap.toFixed(3)}).` : "CHECK FAILED:\n  " + job.check.problems.join("\n  "));
  }
  if (o.out) writeFileSync(o.out, allSheetsDxf(job, insunits));
  if (o["out-dir"]) {
    mkdirSync(o["out-dir"], { recursive: true });
    job.result.sheets.forEach((_, i) => writeFileSync(join(o["out-dir"], `sheet-${i + 1}.dxf`), sheetDxf(job, i, insunits)));
  }
  process.exit(job.check.ok ? 0 : 2);
}

main();
