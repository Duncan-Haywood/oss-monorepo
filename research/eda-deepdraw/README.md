# eda-deepdraw: do 20,000 random vectors catch any of the RTL bugs that 64 random vectors missed, and do they contradict the formal equivalence proofs?

Why it seemed worth doing: `eda-detectprob` could only say that 1,280 clean vectors bound a hidden bug's per-vector detection probability below 0.0023, and listed "draw 1,000 or more vectors for the survivors" as its next step. `eda-verify` also noted that its 16 "equivalent" verdicts (Yosys induction) had no independent check. A 20,000-vector random draw is that check, and it tightens the bound about sixteen-fold. Produced with AI assistance (Claude). Stylised and preliminary: one design (the `chip-accel` MAC engine, p = 8, 4-bit), one mutant set, uniform random inputs.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/eda-deepdraw/

**Builds on.** `research/eda-verify` (mutants regenerated with the same sampling seed; every regenerated id is asserted equal to the committed log) and `research/eda-detectprob` (the survivors and the bound). No CU Boulder lab's work is built on and no affiliation is implied.

## Method
- Targets: the 25 compiling mutants no seed caught in 64 vectors (16 proved equivalent by `eda-verify`, 9 formal timeouts), plus `del@122:delete`, which `eda-verify` reported failing at vector 54 in all 20 seeds. 26 simulations in all (six literal mutants share the id `lit@123:0+1`, at different sites).
- Each target gets the same 20,000 uniform random vectors (seed 777), simulated in Icarus in chunks of 2,000 and compared bit- and cycle-exactly with the integer reference, as in `eda-verify`.
- Bound: 20 × 64 earlier clean vectors + 20,000 here = 21,280 per clean survivor, giving a 95% upper bound 1 − 0.05<sup>1/n</sup> on the per-vector detection probability.

## Reproduce
```bash
sudo apt-get install -y iverilog && pip install numpy scikit-learn
cd research/eda-deepdraw
python experiments/run.py 20000   # about 12 minutes on 4 cores; writes draws.jsonl
python experiments/analyse.py     # stdlib only; writes results.txt
python experiments/figure.py      # writes bound.svg
python -m unittest discover -s tests
```

## Results (`experiments/results.txt`, per-mutant log `experiments/draws.jsonl`)
- None of the 25 survivors was caught in 20,000 further vectors. Including the 16 proved equivalent: no random vector contradicts a formal equivalence proof (consistency, not independent proof).
- The 9 formal timeouts also stay clean. For each, a bug that random testing could see has per-vector detection probability below 1.4 × 10<sup>-4</sup> at 95% (21,280 clean vectors). That is an upper bound; it does not show these 9 are equivalent.
- `del@122:delete` first "fails" at vector 1,990 of 2,000. In `eda-verify` it failed at 54 of 64. Both are exactly 10 short of the vectors drawn, so this mutant returns 10 fewer output rows than vectors, not a wrong value, which the checker reports as the row count. This fits the truncation explanation `eda-detectprob` suggested; the rows were not inspected, so it is consistent with that, not confirmed. The analysis counts it as truncation, not a detection.
- Figure: `experiments/bound.svg`.

## Limitations
- Uniform random inputs only. A bug that needs a rare input pattern (a specific weight-by-input product, saturation in several neurons at once) has a far lower probability under uniform draws than under a directed generator, and 21,280 uniform vectors say nothing about it.
- Same vector stream for every mutant, so the 25 clean results are not independent evidence about the generator.
- Inputs are 8 four-bit values (32 bits), so 21,280 vectors cover 5 × 10<sup>-6</sup> of the input space.
- No new bug was found, so this shows nothing about whether the 9 timeouts are killable.

## Next steps
Run a biased generator (extreme values, sparse inputs) against the 9 timeouts; give the formal check a stronger solver (SymbiYosys with Boolector) and compare on the same 9; inspect the `del@122` output rows to confirm the truncation.

## Owner steps
None.

## Outside dependencies
Icarus Verilog 12.0 (apt); NumPy and scikit-learn via `eda-verify`, `chip-accel` and `eda-harness` in this repository. All code original, MIT.
