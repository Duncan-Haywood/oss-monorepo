# eda-checkorder: in what order should an automated design loop run its checks? (follow-up to milestone 6 of track 7)

Why it seemed worth doing: `eda-verify` ended with the open step "feed the cheapest effective check order (random, then directed, then formal on survivors) into `eda-harness`". Its per-mutant log is enough to cost every ordering without re-running any tool, so this project does that replay. Produced with AI assistance (Claude). Stylised and preliminary: it is a re-analysis of one design (the `chip-accel` MAC engine, p = 8, 4-bit) and 91 mutants; nothing new was simulated.

**Builds on.** `research/eda-verify` (the log `experiments/mutants.jsonl`, its definition of killable / equivalent / undecided), `research/chip-accel`, `research/eda-harness`. No CU Boulder lab's work is built on and no affiliation is implied.

## Method
A cascade is a list of stages. A mutant leaves it when a stage kills it or formal proves it equivalent; whatever remains is unresolved. CPU cost is the logged seconds of every stage a mutant actually reaches. Random-vector cost for n < 64 vectors is the logged 64-vector time scaled by n/64 (an assumption: it slightly over-charges small n because the log includes compile time). Random outcomes use the logged first-failing-vector index per seed; results are means over the 20 seeds.

## Reproduce
```bash
cd research/eda-checkorder
python experiments/run.py          # stdlib only, under a second; writes experiments/results.txt
python -m unittest discover -s tests
```

## Results (`experiments/results.txt`)
- Formal alone costs 16,354 CPU-s on the 91 mutants for 47 kills and 16 equivalence proofs. Running random-64 first and formal only on the survivors costs about 7,500 CPU-s and adds 19 more kills (65.8 vs 47), a 54% saving with strictly more kills.
- Adding directed or extra random stages before formal changes the total by under 2% (7,404 to 7,518 CPU-s). The cheap stages cost about 100 s in total, so the order among them barely matters.
- The remaining ~7,400 s is formal working on mutants that no simulation kills: the 16 equivalents (about 234 s each) and the undecided ones that time out. No ordering of these stages reduces it. A cascade only removes the formal time that would have been spent on killable mutants (9,033 s of 16,354 s).
- Unresolved after the best cascade: 9 mutants, the same 9 `eda-verify` lists as undecided. Cascades add no knowledge about them.

Figure: `experiments/figure.svg` (from `figure.py`).

## Limitations
- A replay, not an experiment: no new tool runs, one design, one solver (Yosys' built-in SAT, 22-cycle bound, 150 s and 240 s timeouts), one mutant set. The timeouts set most of the formal cost, so the 54% figure would move with them.
- Linear random-vector cost is assumed. Formal time is charged per mutant as logged, with no sharing between runs.
- Killable is defined by the checkers themselves, so the kill counts of cascades that include formal are not independent of that definition.
- The cascade never needs the random stage to be correct about equivalence: only formal certifies "no bug of this kind".

## Next steps
Give `eda-harness` a cascade option and measure it on a second design family (`chip-systolic`); lower the formal timeouts and see how many kills survive; let the cascade stop formal early when the random stage has seen N clean vectors, and score that against the equivalents it would skip.

## Owner steps
None.

## Outside dependencies
None to run. The log was produced with Yosys 0.33 and Icarus Verilog 12.0 in `eda-verify`. All code original, MIT.
