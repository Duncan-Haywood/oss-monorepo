// The exact repair on its own, from one fixed start per week: the end-to-end generator's weeks (eval/repair-guide.mjs), a guided
// plateau walk of a fixed step count from an empty roster (deterministic, so every repair starts from the same roster), then
// coverRepair under the same node budget: main's version before this change (MAIN_ENGINE, below), this one with no
// guide, and this one guided. Prints one JSON line per (week, repair).   node eval/repair-alone.mjs P S week
// Results: eval/repair-alone.jsonl, README "The clique LP picks the repair's people".
// MAIN_ENGINE: path to a copy of the engine before this change (git show b92b1c892:ventures/shift-roster-builder/calc.mjs, saved
// next to calc.mjs, with coverRepair added to _internals); without it the "main k3" rows are skipped.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const cur = await import("../calc.mjs"), old = process.env.MAIN_ENGINE ? await import(pathToFileURL(resolve(process.env.MAIN_ENGINE)).href) : null;
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const [P, S, week] = [2, 3, 4].map((i) => Number(process.argv[i]));
const startSeed = Number(process.argv[5] || 1), only = process.argv[6] ? process.argv[6].replaceAll("_", " ").split(",") : null; // only: repair names to run
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
for (let c = 0; c <= week; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  if (c < week) continue;
  const staff = cur.parseStaff(st).staff, slots = cur.parseShifts(sh).slots;
  const { buildContext, coverPass, coverRepair, cliqueOpenFloor, ownerValid } = cur._internals;
  const ctx = buildContext(staff, slots, { exact: true });
  const lp = cliqueOpenFloor(ctx, {});
  const start = coverPass(ctx, new Array(ctx.S).fill(-1), startSeed, 400000, { guide: lp.xs }).owner; // startSeed picks the walk
  const hrs = (o) => o.reduce((t, p, i) => t + (p < 0 ? (slots[i].end - slots[i].start) / 60 : 0), 0);
  const runs = [
    ["main k3", () => old._internals.coverRepair(old._internals.buildContext(staff, slots, { exact: true }), start, 7919, { k: 3, rounds: 60 })],
    ["new k3 unguided", () => coverRepair(ctx, start, 7919, { k: 3, rounds: 60 })],
    ["new k3 guided", () => coverRepair(ctx, start, 7919, { k: 3, rounds: 60, guide: lp.xs })],
    ["new k5 unguided", () => coverRepair(ctx, start, 7919, { k: 5, rounds: 60 })],
    ["new k5 guided", () => coverRepair(ctx, start, 7919, { k: 5, rounds: 60, guide: lp.xs })],
    ["new k3 guided p1", () => coverRepair(ctx, start, 7919, { k: 3, rounds: 60, guide: lp.xs, guideProb: 1 })],
  ];
  for (const [name, f] of runs) {
    if (only && !only.includes(name)) continue;
    if (name.startsWith("main") && !old) continue;
    const t0 = Date.now(), r = f();
    console.log(JSON.stringify({ P, S, week, copies: slots.length, startSeed, floor: Math.round(lp.floor * 100) / 100, start: hrs(start), repair: name, open: hrs(r.owner), valid: ownerValid(ctx, r.owner), gains: r.gains ?? null, guidedGains: r.guidedGains ?? null, ms: Date.now() - t0 }));
  }
}
