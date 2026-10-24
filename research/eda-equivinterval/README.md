# eda-equivinterval: how sure is the 93% nearest-line equivalence predictor? (follow-up to `eda-equivpredict`, track 7)

Why it seemed worth doing: `eda-equivpredict` reports that predicting provable equivalence from the mutated source line is 93% accurate on 27 simulation survivors, and says "no interval is claimed" because the survivors cluster on few lines. This project supplies the missing interval and a null test, from the same log, so the headline can be quoted with its uncertainty. Produced with AI assistance (Claude). Stylised and preliminary: 27 mutants of one design, nothing new simulated (Yosys and Icarus Verilog are not installed in this environment).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-equivinterval/

**Builds on.** `research/eda-equivpredict` (predictors and leave-one-line-out score), `research/eda-checkorder` (log loader), `research/eda-verify` (the log). No CU Boulder lab's work is built on and no affiliation is implied.

## Method
- The 27 survivors sit on 11 distinct source lines (largest groups: 8 on line 151, 6 on line 123). Mutants on one line mostly share an outcome, so the effective sample is nearer 11 than 27.
- **Cluster bootstrap.** Take the nearest-line (1-NN) leave-one-line-out hit or miss for every survivor, resample whole lines with replacement 10,000 times, and read the 2.5th and 97.5th percentiles of accuracy.
- **Permutation test.** Keep each line's group of mutants (size and outcome pattern) but shuffle which source-line position carries which group, re-run the full leave-one-line-out predictor, and count how often it scores at least as well as observed (5,000 shuffles, add-one p-value). This breaks the link between position and outcome while keeping duplication.
- **Baseline.** Always guessing the majority class.

## Reproduce
```bash
cd research/eda-equivinterval
python experiments/run.py          # stdlib only, a few seconds; writes experiments/results.txt
python -m unittest discover -s tests
```

## Results (`experiments/results.txt`)
- Observed: 25 of 27 survivors predicted correctly (92.6%) under leave-one-line-out. Majority-class baseline: 59.3%.
- Line-cluster bootstrap 95% interval: **[76.5%, 100%]**. The upper end is trivial, since a resample can contain only lines that were all hit; the lower end says a fair reading is "somewhere above three quarters", not "93%".
- Counting each line once (majority hit per line) gives 10 of 11 lines, 90.9%: the one miss is line 127 (one equivalent mutant between undecided neighbours); line 137 is the mixed group (EUU) with 2 of 3 hits.
- Permutation test: one-sided p = 0.0124. If outcomes were unrelated to position, shuffling would match 25 of 27 about 1% of the time. So on this design the position signal is probably not chance, but that is one test on one design with predictors chosen after seeing the log.

## Limitations
- Eleven clusters is a small base for a percentile bootstrap; the interval is itself approximate and the upper bound is uninformative.
- The permutation null permutes whole line groups, so it respects duplication but treats line positions as exchangeable; real code regions are not.
- Same single design, same solver timeouts (150 s and 240 s) as `eda-verify`. A rule keyed on line number says nothing about another file; the open question from `eda-equivpredict`, structural features on a second design family, stays open and needs the Yosys flow to answer.
- The predictor family was picked with this log in view (as `eda-equivpredict` notes), so even the interval is optimistic about generalisation.

## Next steps
Log cone size and depth per mutant in `eda-harness` and repeat on `chip-systolic` once the tools are available; then a held-out-design score replaces this within-design interval.

## Owner steps
None.

## Outside dependencies
None to run. The log came from Yosys 0.33 and Icarus Verilog 12.0 in `eda-verify`. All code original, MIT.
