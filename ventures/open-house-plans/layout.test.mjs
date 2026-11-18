import { test } from "node:test";
import assert from "node:assert/strict";
import { fitOrderedRow, fitRow, rowSplits, program } from "./layout.mjs";
import { normalizeBrief } from "./brief.mjs";

// skeletonGate reads wing rows through fitOrderedRow, memoised on the row
// array. It must give exactly what ordering, fitting and the linen fallback
// give when computed fresh, at every length, for both ends of the hall.
function fresh(row0, wetAt, L) {
  const rank = ["half", "abath", "bath", "laundry"];
  const wet = row0.filter((c) => c !== "bed" && c !== "primary").sort((a, b) => rank.indexOf(a) - rank.indexOf(b));
  const dry = row0.filter((c) => c === "bed" || c === "primary");
  let row = wetAt === "start" ? [...wet, ...dry] : [...dry, ...wet.reverse()];
  let widths = fitRow(row, L);
  if (!widths) { row = wetAt === "start" ? ["linen", ...row] : [...row, "linen"]; widths = fitRow(row, L); }
  return widths ? { row, widths } : null;
}

test("fitOrderedRow matches a fresh order-and-fit, memoised and read-only", () => {
  let fits = 0, misses = 0, linen = 0;
  for (const [beds, baths, accessible] of [[2, 1, false], [3, 2, true], [4, 2.5, false], [5, 3, true]]) {
    const { brief } = normalizeBrief({ beds, baths, accessible });
    for (const split of rowSplits(program(brief).cells, 3)) for (const row0 of [split.front, split.back]) {
      if (!row0.length) continue;
      for (const wetAt of ["start", "end"]) for (let L = 3; L <= 70; L += 0.5) {
        const got = fitOrderedRow(row0, wetAt, L);
        assert.equal(fitOrderedRow(row0, wetAt, L), got, "the second ask returns the memoised object");
        assert.deepEqual(got, fresh(row0, wetAt, L), `${row0} ${wetAt} ${L}`);
        if (!got) { misses++; continue; }
        fits++;
        if (got.row.includes("linen")) linen++;
        assert.ok(Object.isFrozen(got) && Object.isFrozen(got.row) && Object.isFrozen(got.widths));
      }
    }
  }
  assert.ok(fits > 100 && misses > 100 && linen > 10, `${fits} fit, ${misses} miss, ${linen} with linen`);
});
