# Blind pair: round 69, seed 2026-11-13-o

On 2026-11-13, two scheduled quality sessions drew the same seed (`2026-11-13-o`) and the same four subjects within minutes of each other. This is the third time that day, after [`2026-11-13-e`](../2026-11-13-e/README.md) and [`2026-11-13-h`](../2026-11-13-h/README.md). Neither session read the other's files:

- Session `01AcxTtGzKokhrcy9iABYiUf` landed first, in PR #15569. Its files are the canonical audits in [`../../audits/`](../../audits/).
- Session `01AcxTtKgAUpaMjTsuViBVf9` opened PR #15570 one number later and found the conflict at merge time. Its files are kept here.

As in the earlier pairs, this directory is outside `audits/` so `quality_audit.py summary` does not count one round's subjects twice.

## Scores (canonical / this pair)

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/3d-print-price-calculator | 3 / 3 | 3 / 3 | 3 / 2 | 3 / 3 | 2 / 2 | 3 / 3 | 2 / 2 | no / no |
| ventures/mortgage-escrow-analysis-checker | 2 / 2 | 3 / 3 | 2 / 2 | 3 / 3 | 2 / 2 | 3 / 3 | 2 / 2 | no / no |
| research/energy-store-modelprice | 3 / 3 | 3 / 3 | 2 / 2 | 3 / 3 | 2 / 3 | 2 / 2 | 2 / 2 | no / no |
| research/garment-twonodeheld | 3 / 3 | 3 / 3 | 1 / 2 | 2 / 3 | 3 / 3 | 1 / 2 | 2 / 2 | no / no |

**Agreement:**

- 23 of 28 dimension scores are identical (82%), and all 28 are within one.
- The bar verdict agrees on 4 of 4 subjects.
- Of the 5 disagreements, this pair scored 1 lower and 4 higher. Garment alone accounts for 3 of them: the canonical audit seeded 7 bugs and saw 5 survive, against 3 of 5 here, and it also counted the slug's place outside any programme against fitness.
- **Pooled over all three blind pairs:** 67 of 84 identical (80%, Wilson 95% 70% to 87%), 84 of 84 within one, and 12 of 12 bar verdicts. Of 17 disagreements, the second audit scored lower 8 times and higher 9 times.

## Findings

**The most consequential defect was found by both.** Both audits independently filed the same high-severity escrow defect. "Deficiency" was computed from the projected low point (`neededZero - startBalance`), not from 12 CFR 1024.17(b)'s "amount of a negative balance". Because of that, the 12-month shortage-spread rule went silent. Both proposed the same one-line fix, and #15569's version of it is on main.

**Defects found by both** (severity can differ):

- 3D print: the uncited 8.5% fee with no per-order fixed part; the README's "nothing is saved" claim; a blank field read as 0; the Bambu/Orca header time not read; the failure model as an upper bound.
- Energy: the untested leave-one-year-out split; the store priced year-round against a heating-season pump; prior work (Sioshansi et al. 2009) not cited; the pump-win count; the runtime.
- Garment: the near-circular carry-over; the fixed 33.7 C target against ISO 7730 / Fanger; unpinned headline numbers; sibling imports by `sys.path`.
- Escrow: the page's wrong definition; the test that pins it; unpinned regulatory thresholds; (f)(4)(i) not modelled.

**Canonical audit only:**

- **Energy (medium):** the inherited cost model bills each recharge for heating the store from 10 C to 500 C, though it only discharges to 100 C. That overstates the store's electricity by about 22%. Corrected, the store wins weekly cycling in 4 of 5 years. This is the round's largest finding on a research result, and this pair missed it.
- **Escrow:** the "most in question over a year" total sums overlapping findings.
- **3D print:** no parts-per-plate quantity, so an imported multi-part plate is priced as one part. The Bambu test fixture is not Bambu's real format.
- **Garment:** the README's "lag was not run" is stale, because `garment-twonodelag` ran it. The slug sits in no programme.
- **Energy and garment:** tests are bare pytest functions, so `unittest discover` runs none.

**This pair only:**

- 3D print: the comparison page says the tool "does not read your slicer", but it imports G-code. The privacy text lists 3 of 6 counted events.
- Escrow: the spread text adds an "only while current" condition that (f)(3) does not have. The cushion check ignores the servicer's own projected total.
- Garment: a test is named for a bound the README says does not hold. The README does not say whether the grid was widened before or after the held-out scores were seen.

**Seeded bugs:**

| subject | canonical: caught | this pair: caught |
|---|---|---|
| 3d-print-price-calculator | 5 of 6 | 5 of 8 |
| mortgage-escrow-analysis-checker | 2 of 5 | 3 of 5 |
| energy-store-modelprice | 2 of 6 | 2 of 4 |
| garment-twonodeheld | 2 of 7 | 2 of 5 |

Both audits seeded removing the leave-one-year-out split in energy-store-modelprice, and both saw it survive.

## What landed from this pair

The follow-up PR kept everything #15569 landed and added:

- **energy-store-modelprice:** a test that the residual fit never sees the held-out year. The leakage mutant now fails it. Limitations now name the store-versus-pump demand mismatch.
- **garment-twonodeheld:** a test that pins the headline band and scores. The band-grid and oracle-mean mutants now fail it.
- **3d-print-price-calculator:** a test that pins the default total, the suggested price and the break-even price to a hand calculation. The slicer comparison page no longer says the tool does not read the slicer, and the privacy text lists all six events.
- **`quality_audit.py sample`:** a random tail on the seed, so two sessions that start at once draw different subjects. This is the third collision in one day.

## Reading

Three blind pairs now agree on four in five dimension scores and on every bar verdict. The defect lists again differ in what matters most. Here both auditors found the escrow defect, but only one found the 22% heat-accounting error that reverses a research verdict. Two blind audits catch more than one. The collisions that produced these pairs were accidental, and the seed tail ends them. A deliberate blind re-audit, at a low rate, is the way to keep this measurement going.
