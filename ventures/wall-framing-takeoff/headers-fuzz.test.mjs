import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePlan, DEPTH } from "./engine.mjs";
import { resolveHeaders, validateHeaderTable } from "./headers.mjs";

// Property test: random span tables and openings. A valid table fills every
// "auto" header from the first row that covers the width, never mutates the
// input, and flags only hand-picked headers lighter than the table asks.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const sizes = Object.keys(DEPTH).sort((a, b) => DEPTH[a] - DEPTH[b]);

test("fuzz: header tables resolve to the first covering row and flag only lighter hand picks", () => {
  const failures = [];
  let tables = 0, under = 0, tooWide = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const n = 1 + Math.floor(rand() * 5);
    let span = 0, si = 0;
    const table = [];
    for (let i = 0; i < n; i++) {
      span += 8 + rand() * 40;
      si = Math.min(sizes.length - 1, si + Math.floor(rand() * 2));
      table.push({ upTo: span, header: sizes[si], plies: 1 + Math.min(3, Math.floor(rand() * 3)) });
    }
    // keep plies non-decreasing within equal depth so the table is valid
    for (let i = 1; i < n; i++) if (table[i].header === table[i - 1].header) table[i].plies = Math.max(table[i].plies, table[i - 1].plies);
    if (validateHeaderTable(table).length) { failures.push(`seed ${seed}: generated table invalid`); continue; }
    tables++;
    const plan = { ...samplePlan(), headerTable: table };
    for (const o of plan.walls.slice(1)) o.openings = [];
    const w = plan.walls[0];
    w.openings = [];
    let off = 6;
    for (let k = 0; k < 4; k++) {
      const width = 12 + rand() * (span + 20);
      const hand = rand() < 0.4;
      const op = { kind: "window", label: "o" + k, offset: off, width, height: 36 };
      if (hand) { op.header = sizes[Math.floor(rand() * sizes.length)]; if (rand() < 0.5) op.headerPlies = 1 + Math.floor(rand() * 3); }
      w.openings.push(op);
      off += width + 6;
    }
    const before = JSON.stringify(plan);
    const r = resolveHeaders(plan);
    if (JSON.stringify(plan) !== before) failures.push(`seed ${seed}: input mutated`);
    const wide = w.openings.some((o) => o.width > span + 1e-6);
    if (wide) { tooWide++; if (r.ok || !r.errors.length) failures.push(`seed ${seed}: wider than table accepted`); continue; }
    if (!r.ok) { failures.push(`seed ${seed}: refused ${r.errors[0]}`); continue; }
    r.plan.walls[0].openings.forEach((o, k) => {
      const src = w.openings[k];
      const row = table.find((x) => x.upTo + 1e-6 >= src.width);
      if (!src.header) {
        if (o.header !== row.header || o.headerPlies !== row.plies) failures.push(`seed ${seed}: auto opening ${k} got ${o.header}x${o.headerPlies}, wanted ${row.header}x${row.plies}`);
      } else if (o.header !== src.header) failures.push(`seed ${seed}: hand pick changed`);
    });
    for (const x of r.rows) {
      if (x.status === "under") under++;
      if (x.status === "set" && x.required !== x.chosen) failures.push(`seed ${seed}: set row mismatch`);
    }
    if (r.notes.length !== r.rows.filter((x) => x.status === "under").length) failures.push(`seed ${seed}: notes do not match under rows`);
  }
  assert.deepEqual(failures, []);
  assert.ok(tables > 250 && under > 20 && tooWide > 10, `coverage: tables ${tables}, under ${under}, tooWide ${tooWide}`);
});
