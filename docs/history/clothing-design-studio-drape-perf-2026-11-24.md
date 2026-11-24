# Clothing Design Studio: the drape's torso push without allocations, and a money() lead that was noise (2026-11-24)

Perf track, version 0. Both open perf backlog items (P063, P064) touch workflow
files in `.github/CODEOWNERS` and wait for the owner. This run tried item 4
("what visitors wait on") first, found the obvious lead was noise, then took
item 2 of `ci-perf-2026-11-18-clothing-drape-arm-boxes.md`'s "not changed" list.

## 1. Not landed: `money()` builds an `Intl.NumberFormat` per call

`node platform/perf/module-weight.mjs .` put clothing-design-studio at 153 kB
gzip over 37 files with no page-perf pass. A throttled load of `index.html`
(local gzip server, Chromium, 150 ms RTT, 1.6 Mbit/s, CPU 4x, service workers
blocked; 5 runs) took a median **2,123 ms**, 38 requests. A CDP sampling
profile of the first load put **135 ms self in `money` (`costing.mjs:171`)**,
the largest JavaScript line. `money` constructs a new
`Intl.NumberFormat` on every call.

A per-currency cache gave byte-identical strings on 5,108 inputs (odd
currencies, NaN, null, -0, Infinity included), and the profile line fell to
70 ms. But the load median moved only from 2,144 to 2,080 ms (7 runs each),
within noise. Two measurements explain why:

- Wrapping `Intl.NumberFormat` in the page shows **9 amounts formatted at load**,
  not hundreds.
- In headless Chromium, unthrottled: the **first** construction costs about
  **10.8 ms** (ICU set-up, paid once per page either way); each later one
  **13 µs**; `format` on a kept formatter 0.5 µs;
  `toLocaleString("en-US", {minimumFractionDigits: 2, ...})` 19 µs.

So the 135 ms line was the one-off ICU set-up at 4x, and the cache saves about
0.1 ms per load. **Reverted.** This also ranks item 1 of
`sales-export-to-journal-perf-2026-11-24.md` (`toLocaleString` with options in 314
files) down: at 13 to 19 µs a call it matters only past about 10,000 amounts in
one go, so a repo-wide sweep would not pay off.

## 2. Landed: `pushOut` reads the body section into two scalars

### Reading (before, `37ba719b4`)

Bench (script below): six `drapeGarment` calls (the cases in
`drape-sleeves.test.mjs` plus a larger body and a hoodie), 3 repetitions, median,
Node 22, this container; the first repetition's results are hashed. Three
alternating before/after rounds:

| round | before | after |
|---|---:|---:|
| 1 | 12,440 ms | 12,094 ms |
| 2 | 12,598 ms | 11,742 ms |
| 3 | 12,426 ms | 11,310 ms |

`node --cpu-prof`, self time over one repetition: `simulate` 6,945 ms,
`pushOutArm` 2,141, `pushOut` 1,984, `sectionAt` 693, `pushAlong` 449,
GC 304. `pushOut` calls `sectionAt` up to five times per vertex per substep
(the first check, then 3 Newton steps of 3 calls each, then the final scale),
and each call returns a fresh `{a, b}` object.

### Change (`drape.mjs` only)

`sectionInto(body, y)` has the same branches and arithmetic as `sectionAt`,
writes a and b into a module scratch array, and returns false where
`sectionAt` returns null. `pushOut` uses it for all five lookups, copying the
values into locals before the next call overwrites them. A missing section
at `y ± e` falls back to the section at `y`, as `|| s0` did. `sectionAt`
stays for its other callers. Item 2's binary search over the levels was not
done: it is exact only if every body's levels are sorted, and the 12-level
walk is not where the time goes.

### Verification

- **Same answers:** bench hash `d174f2adad39cb1c` before and after, over the
  full JSON of all six drapes (positions, strains, levels, notes) on every round.
- `python3 platform/ci/run_venture_tests.py clothing-design-studio`:
  **755 tests, 0 failed**, plus the site page checks.

### After

- Node bench (above): median of the three rounds **12,440 → 11,742 ms (−5.6%)**.
  Three-case run (tee M, slim XS, lowered arms), two alternating rounds:
  7,766 / 7,749 → 7,253 / 7,249 ms (−6.5%).
- Chromium, the same three cases from `import('./drape.mjs')` on a blank page,
  3 alternating rounds: 7,487 / 7,599 / 7,734 → 7,840 / 7,399 / 7,391 ms, medians
  7,599 → 7,399 (about −3%, within noise).
- The page's own readout on `drape.html` (`Settled in N ms`, default form,
  5 loads each): median 2,158 → 2,176 ms. No visible change for a visitor.
  Chrome's V8 seems to remove most of these short-lived objects already.

This is a small, exact win, and mostly a test-time one (the four drape test
files are about 25 s of the suite's 51 s summed file time).

## Not changed, ranked for the next run

1. **`simulate`'s XPBD edge loop, about 6.8 s self**, still the majority. The order
   of the arithmetic is the output, so any change needs a tolerance argument
   (the 11-18 note's item 1).
2. **`pushOutArm`, 1.9 s self.** It already rejects arms by box. It calls
   `armBoxes` (a WeakMap lookup, 126 ms) per vertex; hoisting that per substep
   would need the arms array passed down from `simulate`, and arms change only
   in `setArmAngle`. Small.
3. **`pushOut`'s first check, 1.8 s self**: most vertices end it at `f >= 1`.
   A per-substep bound (the largest a + thick over the levels) would skip the
   section walk for points far outside, but most cloth points sit close to the
   body, so measure the hit rate first.
4. **`money()` / `toLocaleString` caches**: not worth it (section 1).
5. P063 and P064 remain owner-gated (workflow files).

## Bench script

`node drape.mjs <venture dir> [reps]`

```js
// node drape.mjs <venture dir> [reps]
import { createHash } from "node:crypto";
const dir = process.argv[2], reps = +process.argv[3] || 3;
const { drapeGarment } = await import(dir + "/drape.mjs");
const me = { chest: 100, waist: 88, hip: 98, height: 178 };
const cases = [
  [me, { garment: "tee", size: "M" }],
  [me, { garment: "tee", size: "M", pattern: { bicepCm: 12 } }],
  [me, { garment: "tee", size: "XS", fit: "slim" }],
  [me, { garment: "tee", size: "M", sleeves: false, gridCm: 3.5 }],
  [{ chest: 112, waist: 104, hip: 108, height: 170 }, { garment: "tee", size: "L" }],
  [me, { garment: "hoodie", size: "M" }],
];
const h = createHash("sha256"); const t = [];
for (let r = 0; r < reps; r++) { const t0 = performance.now(); for (const [b, o] of cases) { let out; try { out = drapeGarment(b, o); } catch (e) { out = String(e); } if (r === 0) h.update(JSON.stringify(out, (k, v) => v instanceof Float64Array || v instanceof Float32Array ? Array.from(v) : v)); } t.push(performance.now() - t0); }
t.sort((a, b) => a - b);
console.log(`median ${t[t.length >> 1].toFixed(0)} ms min ${t[0].toFixed(0)} hash ${h.digest("hex").slice(0, 16)}`);
```
