# eda-biasdraw: do input-biased random vectors (extreme, sparse, one-hot) catch RTL bugs that uniform random vectors never did?

Why it seemed worth doing: `eda-deepdraw` ended with 21,280 clean uniform vectors per survivor but warned that a bug needing a rare input pattern is invisible to uniform draws, and listed "run a biased generator (extreme values, sparse inputs)" and "inspect the `del@122` output rows" as next steps. This project does both. Produced with AI assistance (Claude). Stylised and negative: one design (the `chip-accel` MAC engine, p = 8, 4-bit), one mutant set, no bug found.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-biasdraw/

**Builds on.** `research/eda-deepdraw` (its 26 targets, loaded through its `targets()`), `research/eda-verify` (mutants and the Icarus checker) and `research/eda-detectprob`. No CU Boulder lab's work is built on and no affiliation is implied.

## Method
- Targets: the 26 `eda-deepdraw` targets (25 survivors of uniform testing, 16 proved equivalent and 9 formal timeouts, plus `del@122:delete`).
- Four generators over the 4-bit input range [-8, 7], 5,000 vectors each per target, same seed for every target: **extreme** (every input -8 or 7), **sparse** (each input 0 with probability 0.8, else uniform), **onehot** (one random input at -8 or 7, rest 0), **mixed** (per-vector random pick of uniform, extreme, sparse, onehot).
- Same bit- and cycle-exact comparison with the integer reference as `eda-verify`.
- `del@122` row check: simulate 100 vectors and count the `OUT` rows printed.

## Reproduce
```bash
sudo apt-get install -y iverilog && pip install numpy scikit-learn
cd research/eda-biasdraw
python experiments/run.py 5000    # a few minutes on 4 cores; writes bias.jsonl, rows.json
python experiments/analyse.py     # stdlib only; writes results.txt
python -m unittest discover -s tests
```

## Results (`experiments/results.txt`, logs `experiments/bias.jsonl`, `experiments/rows.json`)
- None of the 26 targets yields a real mismatch under any of the four generators (20,000 biased vectors per target in all). No biased vector contradicts any of the 16 formal equivalence proofs.
- For the 9 formal timeouts, a bug visible to one generator has a per-vector detection probability below 6 × 10<sup>-4</sup> at 95% under that generator (5,000 clean vectors each). This is an upper bound, not a proof of equivalence.
- `del@122:delete` is confirmed as truncation: for 100 vectors the simulation prints 90 output rows, exactly 10 short, and no value is wrong. The checker reports the row count as a "mismatch", which is the 10-short pattern seen in `eda-verify` and `eda-deepdraw`.

## Limitations
- The generators are hand-chosen heuristics, not coverage-directed; they hit the corners of the input range but not necessarily the specific input a particular mutant needs.
- 5,000 vectors per generator is a smaller budget than `eda-deepdraw`'s 20,000, so the per-generator bound is looser.
- One design and one mutant set; a negative result here says nothing about other designs.
- Stronger formal solving (SymbiYosys with Boolector) on the 9 timeouts was not tried.

## Next steps
Give the 9 timeouts a stronger formal check (SymbiYosys with Boolector, or a bounded-depth unrolled proof) so they can be classified as equivalent or killable instead of bounded.

## Owner steps
None.

## Outside dependencies
Icarus Verilog 12.0 (apt); NumPy and scikit-learn via `eda-verify`, `chip-accel` and `eda-harness` in this repository. All code original, MIT.
