// Strip-packing benchmark on the ESICUP nesting instances, as JSON in the
// sparrow repository (github.com/JeroenGar/sparrow, MIT, data/input and
// data/records). Each instance is a strip of fixed height; the score is
// density = parts' area / (height x used length). sparrow's best published
// strip length (its data/records SVGs, bin bbox x_max) is the reference.
//
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/JeroenGar/sparrow
//   (cd sparrow && git sparse-checkout set --skip-checks data/input data/records)
//   node eval/esicup-strip.mjs sparrow/data [--cells 500] [--orders 4] [--only swim,albano] [--json out.json]
//
// Continuous-rotation (_c) instances run at every 15 degrees.
import fs from "node:fs";
import path from "node:path";
import { finishPart, polyEdges } from "../geom.mjs";
import { nest, verify } from "../nest.mjs";

const args = process.argv.slice(2);
const dir = args[0];
const opt = (name, dflt) => {
  const i = args.indexOf("--" + name);
  return i < 0 ? dflt : args[i + 1];
};
const cells = Number(opt("cells", 500));
const orders = Number(opt("orders", 4));
const timeLimitMs = Number(opt("time", 60000));
const only = opt("only", "") ? opt("only", "").split(",") : null;
const skip = opt("skip", "") ? opt("skip", "").split(",") : [];
const jsonOut = opt("json", "");
const extra = JSON.parse(opt("opts", "{}"));

function record(name) {
  const f = path.join(dir, "records", `final_best_${name.replace(/_c$/, "")}.svg`);
  if (!fs.existsSync(f) || name.endsWith("_c")) return null;
  const m = fs.readFileSync(f, "utf8").match(/x_max: ([\d.]+), y_max: ([\d.]+)/);
  return m ? Number(m[1]) : null;
}

const files = fs.readdirSync(path.join(dir, "input")).filter((f) => f.endsWith(".json")).sort();
const rows = [];
for (const f of files) {
  const name = f.replace(/\.json$/, "");
  if (only && !only.includes(name)) continue;
  if (skip.includes(name)) continue;
  const inst = JSON.parse(fs.readFileSync(path.join(dir, "input", f), "utf8"));
  const H = inst.strip_height;
  const tol = H * 1e-6;
  let area = 0;
  const items = inst.items.map((it) => {
    const pts = it.shape.data;
    const part = finishPart({ outer: polyEdges(pts), holes: [], marks: [] }, tol);
    area += part.area * it.demand;
    const rot = it.orientation?.rotation ?? it.allowed_orientations;
    const rotations = rot?.mode === "continuous" ? Array.from({ length: 24 }, (_, i) => i * 15) : rot?.angles ?? [0];
    return { id: it.id, name: String(it.id), qty: it.demand, part, rotations };
  });
  // one rotation set per instance (they are uniform in this set)
  const rotations = items[0].rotations;
  const res = H / cells;
  const L = Math.ceil((area / H) * 3 + Math.max(...items.map((x) => Math.max(x.part.width, x.part.height))) * 2);
  const t0 = Date.now();
  const r = nest(items, { sheetW: L, sheetH: H, gap: 0, margin: 0, tol, res, rotations, maxSheets: 1, orders, timeLimitMs, ...extra });
  const ms = Date.now() - t0;
  if (!r.ok) { console.log(name, "error", r.error); continue; }
  const placed = r.sheets[0]?.placements.length ?? 0;
  const total = items.reduce((s, x) => s + x.qty, 0);
  // exact used length: max x of the placed rings, not the raster extent
  const parts = new Map(items.map((x) => [x.id, x.part]));
  const check = verify(r, parts);
  const len = r.sheets[0].usedLength;
  const best = record(name);
  const row = { name, parts: total, placed, H, length: +len.toFixed(4), density: +(area / (H * len)).toFixed(4), record: best, recordDensity: best ? +(area / (H * best)).toFixed(4) : null, ratio: best ? +(best / len).toFixed(4) : null, ms, ordersTried: r.ordersTried, check: check.ok };
  rows.push(row);
  console.log([name.padEnd(12), `${placed}/${total}`.padStart(7), String(row.density).padStart(7), String(row.recordDensity ?? "-").padStart(7), String(row.ratio ?? "-").padStart(7), `${ms} ms`.padStart(9), row.check ? "check ok" : "CHECK FAILED"].join(" "));
}
const withRec = rows.filter((x) => x.ratio);
if (withRec.length) {
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  console.log(`mean density ${mean(rows.map((x) => x.density)).toFixed(4)}; on ${withRec.length} with a record: ours ${mean(withRec.map((x) => x.density)).toFixed(4)} vs record ${mean(withRec.map((x) => x.recordDensity)).toFixed(4)}, length ratio ${mean(withRec.map((x) => x.ratio)).toFixed(4)}`);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1) + "\n");
