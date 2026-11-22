// The bar schedule (rebar.mjs) over real exports, against the author's own figures.
//
//   node eval/rebar-schedule.mjs file.ifc [...]
//
// Tekla and Allplan write their own schedule on every bar: the mark, shape
// code, bars in the group, the length and the group's weight (Tekla), the
// mass per metre and bending diameter (Allplan). Per file this prints the
// bars read, then each schedule line beside those figures, and a tally of
// how many lines agree: count, cut length within 1%, mass within 1%, and
// the leg dimensions within 2 mm where the file states them.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseStep } from "../step.mjs";
import { takeoff } from "../qto.mjs";
import { rebarSchedule } from "../rebar.mjs";

const tally = { files: 0, bars: 0, read: 0, lines: 0, count: [0, 0], position: [0, 0], weight: [0, 0], length: [0, 0], dims: [0, 0], mpm: [0, 0], mandrel: [0, 0] };
for (const p of process.argv.slice(2)) {
  const res = takeoff(parseStep(readFileSync(p)), { rooms: false });
  const bars = res.rows.filter((r) => /^IFCREINFORCINGBAR$/.test(r.ifcType));
  const read = bars.filter((r) => r.bars?.length);
  const why = {};
  for (const r of bars) if (!r.bars?.length) { const k = r.computed?.reason ?? r.computed?.status ?? "no body"; why[k] = (why[k] ?? 0) + 1; }
  const s = rebarSchedule(res.rows);
  tally.files++; tally.bars += bars.length; tally.read += read.length; tally.lines += s.lines.length;
  console.log(`\n== ${basename(p)}: ${read.length} of ${bars.length} bar elements read${Object.keys(why).length ? " (not read: " + JSON.stringify(why) + ")" : ""}; ${s.total.bars} bars in ${s.lines.length} lines, ${s.total.mass.toFixed(2)} kg`);
  // Allplan: bars of the whole position, against the bars of that mark here
  const byMark = new Map();
  for (const l of s.lines) if (l.author.positionCount != null && l.markFrom === "file") { const m = byMark.get(l.mark) ?? { ours: 0, theirs: l.author.positionCount }; m.ours += l.count; byMark.set(l.mark, m); }
  for (const [mark, m] of byMark) { const ok = m.ours === m.theirs; tally.position[ok ? 0 : 1]++; console.log(`  position ${mark}: ${m.ours} bars here vs ${m.theirs} in the file${ok ? "" : " !"}`); }
  for (const l of s.lines) {
    const a = l.author, out = [];
    // Allplan's bending diameter (the mandrel) against the inside of our bends:
    // as a diameter (Allplan's own file), or as a radius (the FreeCAD rebar2
    // files write the inside radius under that name)
    if (a.bendingDiameter != null && l.bends.some((b) => b.r != null)) {
      const inside = l.bends.filter((b) => b.r != null).map((b) => 2 * b.r * 1000 - l.size);
      const close = (x, y) => Math.abs(x - y) <= Math.max(1, 0.03 * y);
      const asD = inside.every((x) => close(x, a.bendingDiameter)), asR = inside.every((x) => close(x / 2, a.bendingDiameter));
      tally.mandrel[asD || asR ? 0 : 1]++;
      out.push(`inside diameter ${inside.map((x) => x.toFixed(1)).join("/")} vs ${a.bendingDiameter} mm${asD ? " = diameter" : asR ? " = as radius" : " !"}`);
    }
    if (a.massPerMetre != null) { const ok = Math.abs(l.massPerMetre - a.massPerMetre) <= 0.01 * a.massPerMetre; tally.mpm[ok ? 0 : 1]++; if (!ok) out.push(`kg/m ${l.massPerMetre.toFixed(3)} vs ${a.massPerMetre} !`); }
    if (a.count != null) { const ok = a.count === l.count; tally.count[ok ? 0 : 1]++; out.push(`count ${l.count} vs ${a.count}${ok ? "" : " !"}`); }
    if (a.weight != null) { const ok = Math.abs(l.mass - a.weight) <= 0.01 * a.weight; tally.weight[ok ? 0 : 1]++; out.push(`mass ${l.mass.toFixed(2)} vs ${a.weight.toFixed(2)} kg${ok ? "" : " !"}`); }
    const dimSum = l.dims.reduce((x, y) => x + y, 0);
    // Tekla's DIM_L is its legs summed and rounded down to 10 mm; others state the cut length
    if (a.length != null) {
      const okCut = Math.abs(l.length - a.length) <= 0.01 * a.length;
      const okSum = Math.abs(Math.floor(dimSum * 100 + 0.02) / 100 - a.length) <= 0.0005;
      tally.length[okCut || okSum ? 0 : 1]++;
      out.push(`length ${Math.round(l.length * 1000)} (legs ${Math.round(dimSum * 1000)}) vs ${Math.round(a.length * 1000)} mm${okSum ? " = legs to 10 mm" : okCut ? " = cut" : " !"}`);
    }
    const fd = Object.values(a.dims ?? {});
    if (fd.length) {
      const ours = l.dims.map((x) => x * 1000).sort((x, y) => x - y), theirs = fd.filter((x) => x > 0).sort((x, y) => x - y);
      // every stated dimension matched by one of ours within 2 mm
      const ok = theirs.every((t) => ours.some((o) => Math.abs(o - t) <= 2));
      tally.dims[ok ? 0 : 1]++;
      out.push(`dims ${l.dims.map((x) => Math.round(x * 1000)).join("/")} vs ${Object.entries(a.dims).map(([k, v]) => k + "=" + Math.round(v)).join(" ")}${ok ? "" : " !"}`);
    }
    console.log(`  ${l.member} | ${l.mark} | ${l.size} mm x ${l.count} | ${Math.round(l.length * 1000)} mm | ${l.shape}${l.bs8666 ? " (" + l.bs8666 + ")" : ""} | file ${l.fileShape ?? "-"} | ${out.join("; ")}${l.notes.length ? " | " + l.notes.join("; ") : ""}`);
  }
}
const pc = ([a, b]) => `${a} of ${a + b}`;
console.log(`\n${tally.files} files: ${tally.read} of ${tally.bars} bar elements read, ${tally.lines} schedule lines; agree with the file: bars in the group ${pc(tally.count)}, bars in the position ${pc(tally.position)}, mass ${pc(tally.weight)}, mass per metre ${pc(tally.mpm)}, bending diameter ${pc(tally.mandrel)}, length ${pc(tally.length)}, leg dimensions ${pc(tally.dims)}`);
