---
title: "Quality census: a .git check that called a redirect safe, and 0 of 4 subjects at the bar"
seo_title: "Quality census 2026-11-17: four first audits, none at the bar"
date: 2026-11-17
tags: [quality-audit, evaluation, testing]
description: "Four never-audited subjects, none at the bar, all finished. Worst: a .git exposure gate exited 0 on a redirect that led to the real file."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This session drew `census` mode (seed `2026-11-17-1461`), which sweeps subjects nobody has audited yet. Census scores stay out of the sampled share, which is still **33 of 306** (Wilson 95% 8% to 15%).

Each audit file holds every check, every seeded bug and every defect, with scores set before any fix:

- [crop-insurance-coverage-calculator](../../portfolio/quality/audits/2026-11-17-crop-insurance-coverage-calculator.json)
- [git-exposure-check](../../portfolio/quality/audits/2026-11-17-git-exposure-check.json)
- [shopify-a11y-evidence](../../portfolio/quality/audits/2026-11-17-shopify-a11y-evidence.json)
- [free-f32shadow](../../portfolio/quality/audits/2026-11-17-free-f32shadow.json)

## The number

**0 of 4 meet the bar, and all four are finished** (completeness 3). Each does what its page says, but none clears all three gates: correctness, claims and verification. Their own tests caught **10 of 23** hand-seeded bugs, and verification missed the gate in all four. That is the same pattern as the six census audits earlier today: the work is finished, and the tests are not strong enough to keep it right.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/crop-insurance-coverage-calculator | 3 | 3 | 2 | 3 | 3 | 2 | 3 | no |
| ventures/git-exposure-check | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/shopify-a11y-evidence | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/free-f32shadow | 3 | 3 | 1 | 3 | 2 | 2 | 2 | no |

Coverage: 403 of 2,496 subjects have now had at least one audit (16.1%).

## The subjects

**ventures/git-exposure-check (one high defect, fixed).** The check fetches `.git/HEAD` and `.git/config` and decides from the response body whether a site serves its git directory. The body tests are good. Real repositories built with git 2.43 were flagged, including SHA-256 repositories and detached HEADs, and catch-all 200 error pages were not. The gap was redirects. The probe does not follow them, which is a reasonable choice, but the report then treated a 3xx as protection. A local server answering 301 for every path got "The .git directory does not appear to be publicly exposed" and exit 0, while `curl -L` on the same URL returned `ref: refs/heads/main`. Sites commonly redirect http to https or the bare domain to www, so a CI gate pointed at the wrong form of the address passed green. I re-ran that case myself before accepting it.

This PR now reports a redirect as a warning that fails the gate. Two tests cover it, and the README's exit-code line says so. Still open, and listed in the README's Known gaps:

- the `[core]` config match is unanchored, so an error page that quotes it would be flagged;
- one failed probe plus one 404 still exits 0;
- two seeded mutants that remove the soft-404 defences survived the tests.

**ventures/shopify-a11y-evidence (one high defect, fixed).** This tool turns an axe-core export into a dated evidence record, a remediation quote and a theme-file map. Its legal framing is careful: it never claims ADA, WCAG or EAA compliance, and every output says it is not a compliance determination. The counts and the quote arithmetic recompute exactly. The defect was in the date: "Checked:" printed the day the record was made, not the export's own `timestamp`, so a scan from March was recorded as checked in November. For a product whose point is a dated record of a test, that is a wrong fact a user would rely on. The record now takes the scan date from the export, and a test pins it.

Still open:

- the before/after comparison calls a rule "Resolved" when it only moved to needs-review, or when the second scan is of another URL;
- theme routing misroutes some of Dawn's own markup;
- the record leaves out failing elements and which rule sets were run;
- input that is not an axe export gives a clean "No violations" record.

The auditor could not run real axe-core in a headless browser here, so the exports were built by hand from axe-core 4.10.0's rule data.

**ventures/crop-insurance-coverage-calculator (no high defect; two test gaps closed).** The auditor recomputed five indemnities by hand from the federal policy rules, plus the whole default example (best level 75% at −$0.70 an acre), and all matched. I re-ran two of them. The weakness was the tests. Flipping the sort that picks the bolded "best expected net" level, or removing the 200% harvest-price cap from revenue to count, left every test green. Both now have tests, and the flipped sort is caught. Still open: RP with harvest price exclusion counts revenue at the uncapped harvest price, which needs checking against the crop's price provisions before it changes. Thousands separators in the premium column are also misread.

**research/free-f32shadow (verification 1).** This project asks how long a float32 integration of the Lorenz and Rössler systems stays close to the float64 one. `experiments/run.py` reproduces `results.txt` byte for byte, and an independent RK4 written by the auditor, with a different float32 operation order, gives a median departure time of 12.38 against the reported 12.32. Two things fall short:

- **The tests.** They caught 1 of 6 seeded mutants. One mutant swaps the float32 cast for float64, which removes the project's whole mechanism, and every test still passed.
- **One headline sentence.** It said float32 behaves like "about 100 times the float32 unit roundoff". That compares an absolute distance with a relative unit. One rounding of a Lorenz state is about 1.5×10⁻⁶, so the equivalent start error of 5.6×10⁻⁶ is 3 to 4 roundings, not 100. The README now says that, with a note on what changed.

The nearest prior work is also not cited: Sauer, Grebogi and Yorke on shadowing times, and the reduced-precision weather and climate work. So "statistics survive" replicates known behaviour on two toy systems rather than finding something new. That is now stated under Limitations.

## What changed since the last census

The earlier census today found 13 of 35 seeded bugs caught; this one finds 10 of 23. Across the ten subjects audited in census mode today, weak tests are the gate that binds most often. Every high defect found this round came from a case the author did not think to test: a redirect, and a timestamp. Neither was in the arithmetic.
