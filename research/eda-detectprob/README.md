# eda-detectprob: how many random vectors does it take to see a bug, and how rare a bug can they not rule out?

Why it seemed worth doing: `eda-verify` reported that 64 random vectors kill 99% of killable mutants, but a kill rate says nothing about the bugs random testing is *least* likely to find. The same log holds, per mutant, the first failing vector in 20 independent seeds, which is enough to estimate a per-vector detection probability for each mutant, check whether the simple "each vector is an independent draw" model fits, and put a number on what 1,280 clean vectors do and do not rule out. Produced with AI assistance (Claude). Stylised and preliminary: a re-analysis of one design (the `chip-accel` MAC engine, p = 8, 4-bit) and 91 mutants; nothing new was simulated.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/eda-detectprob/

**Builds on.** `research/eda-verify` (the mutation log `experiments/mutants.jsonl`, read in place). No CU Boulder lab's work is built on and no affiliation is implied.

## Method
- For each compiling mutant, a seed that first mismatches at vector *k* contributes *k*+1 trials and one detection; a seed with no mismatch in 64 vectors contributes 64 trials and none. The geometric maximum-likelihood estimate is detections / trials.
- Mutants are sorted by how random vectors behave: caught by vector 0 in every seed (`first-vector`), the same later index in every seed (`fixed-index`), detections that vary with the seed (`sampled`) and never caught (`never`).
- For `never` mutants: 20 seeds × 64 vectors = 1,280 clean vectors bound the per-vector detection probability below 1 − 0.05<sup>1/1280</sup> ≈ 3/1280 at 95%.
- The fitted model's predicted miss rate at each budget is compared with the observed one.

## Reproduce
```bash
cd research/eda-detectprob
python experiments/analyse.py   # stdlib only, under a second; writes results.txt and results.json
python experiments/figure.py    # writes miss_curve.svg
python -m unittest discover -s tests
```

## Results (`experiments/results.txt`)
- Of 91 compiling mutants, random vectors catch 41 on vector 0 in every seed, 1 at a fixed index, 24 with a seed-dependent index and 25 never (16 proved equivalent by `eda-verify`, 9 formal timeouts).
- Among the 24 seed-dependent mutants, per-vector detection probability ranges from 0.03 to 0.95. The hardest are `rom@101:+1` (0.028) and `lit@125:0+1` (0.030), which need about 100 vectors for 95% confidence of a catch; 8 of the 24 are below 0.2. The rare end is made of ROM-weight and literal mutants, not operator swaps.
- The geometric model fits: observed and fitted miss rates agree within 0.005 at every budget from 1 to 64 vectors (e.g. 0.236 vs 0.235 at n = 1, 0.006 vs 0.005 at n = 64). This is an in-sample check, because the same data fit it.
- The 25 never-caught mutants had 1,280 clean vectors each, so a bug of this kind can have per-vector detection probability up to 0.0023 and still look the same as an equivalent mutant. Seeing such a bug with 95% confidence would take about 1,280 vectors, and 29,956 for p = 10<sup>-4</sup>.
- Extrapolating the fit, the expected miss rate among detectable mutants falls to 1% at 45 vectors and 0.1% at 118. Beyond 64 vectors this rests on the model alone, driven by just 2 or 3 mutants with p near 0.03.
- One mutant, `del@122:delete`, fails at vector 54 in all 20 seeds; its seeds do not behave as independent draws (the checker also returns the number of output rows when fewer than expected appear, so a simulation that ends after 54 vectors would look like this; not confirmed), so the model is not applied to it and it counts as a miss until n reaches 54.
- Figure: `experiments/miss_curve.svg`.

## Limitations
- One design and one small mutant set; the tail estimate rests on a handful of mutants. Mutants were sampled, not enumerated (ROM entries only 15 of 86).
- Uniform random inputs only; a directed or biased generator would change the p values.
- Detection probability is assumed constant over the 64 vectors and independent between vectors; the fit supports it for this data but cannot test it past 64.
- "Never caught" cannot separate a bug from an equivalent mutant; only the formal verdict does.

## Next steps
Draw 1,000 or more vectors for the 25 survivors to tighten the bound, or find a mutant in the tail that formal can kill and random cannot; repeat on `chip-systolic`; compare against a biased input generator.

## Owner steps
None.

## Outside dependencies
None to run (Python standard library). The log was produced with Yosys 0.33 and Icarus Verilog 12.0 in `eda-verify`. All code original, MIT.
