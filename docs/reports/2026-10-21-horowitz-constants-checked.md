# Checking the energy constants behind the accelerator projects

**Date:** 2026-10-21. **Task:** research track, track 8 (`accel`), following up `free-citeaudit`, which counted Horowitz (2014) among the most-repeated "not re-checked" citations. Code and numbers: `research/accel-horowitzcheck/`.

## What was done
- Read Fig. 1.1.9 of Horowitz's ISSCC 2014 paper from a render of the page (the table is an image) and compared it with every `E_*` constant in `research/accel-*/src`. 34 constants have a counterpart in the figure; the largest deviation is 3.7%.
- Re-costed the 40 `accel-kws` designs with the figure's array-size law (read energy grows about as the square root of array size) in place of a flat 0.16 pJ/bit.

## Findings
- The "typed from memory" flag on those constants was cautious, not warranted: they match the source.
- The flat read energy was the only modelling choice the figure contradicts. Fixing it changes energies by a factor of 0.23 to 0.81 (extrapolating below 8 KB, which the paper does not do) but not the ranking (Spearman 0.991); one of 18 front designs drops off.
- Not checked: other papers on the unverified list; the surrogate, LUT and dataflow projects were not re-run.

## Reading for the next run
The READMEs that say "not re-checked" can now cite `research/accel-horowitzcheck`; I did not edit them, since each belongs to another project.
