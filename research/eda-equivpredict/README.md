# eda-equivpredict: can cheap features say which simulation survivors formal can prove equivalent? (follow-up to `eda-earlystop`, track 7)

Why it seemed worth doing: `eda-earlystop` showed that after simulation the remaining formal CPU buys equivalence proofs at about 93 s each, and listed "predict which survivors are equivalent and spend formal only on those" as its open step. The `eda-verify` log is enough to try that without running a tool. Produced with AI assistance (Claude). Stylised and preliminary: 27 mutants of one design (the `chip-accel` MAC engine, p = 8, 4-bit), one solver, nothing new simulated.

**Builds on.** `research/eda-earlystop`, `research/eda-checkorder` (loader and cascade), `research/eda-verify` (the log `experiments/mutants.jsonl`), `research/chip-accel`. No CU Boulder lab's work is built on and no affiliation is implied.

## Method
Survivors are the 27 mutants the 16 deterministic directed vectors do not kill: 16 formal-equivalent, 9 undecided (timeouts), 2 formal kills. Features are those known before formal runs and that describe the mutation: operator or literal kind, and the mutated source line parsed from the mutant id. Timing fields are excluded because they reflect machine load, not the mutation. Four predictors are scored by leave-one-out and by leave-one-line-out (every mutant on the held-out line leaves training; several lines carry six to eight near-identical mutants, so plain leave-one-out lets a twin vote for its twin): same-kind majority, nearest line (1-NN), 3-NN, and the best one-split rule on line. The policy runs formal only where the predictor says "equivalent" and is charged the logged formal seconds. An oracle that knows the label bounds the saving.

## Reproduce
```bash
cd research/eda-equivpredict
python experiments/run.py          # stdlib only, under a second; writes experiments/results.txt
python experiments/figure.py       # writes experiments/figure.svg from results.txt
python -m unittest discover -s tests
```

## Results (`experiments/results.txt`)
- Always running formal on the 27 survivors costs 7,414 CPU-s and finds 16/16 proofs. The oracle would spend 3,746 CPU-s on the 16 equivalents alone, so at most about half of formal's cost on survivors is avoidable by prediction.
- Nearest-line prediction spends 3,298 CPU-s (55% less), finds 14 of 16 proofs, and is right on 93% of survivors under both scores. It beats the oracle's cost only because it skips two equivalents (and two formal kills).
- The smoother rules do worse once twins are held out: 3-NN finds 12/16 for 3,753 CPU-s (78% accurate) and the best one-split rule 12/16 for 4,204 CPU-s (74%). Same-kind majority is worse than guessing (33%): operator versus literal says nothing about provability here.
- The signal is where the mutation sits. On this file, survivors on lines 123 to 137 are mostly timeouts (9 of 12, with 2 equivalent and 1 formal kill) and those on lines 140 to 151 are all provably equivalent (14 of 14). That is a statement about the solver on this one design, not a rule.
- Skipping formal on predicted-undecided survivors also skips 2 formal kills. `eda-earlystop` found every formal kill is also found by a cheap stage in some seed, so in the full cascade they are not lost.

Figure: `experiments/figure.svg`.

## Limitations
- 27 survivors from one design, with heavy duplication (eight survivors on line 151, six on line 123). Leave-one-line-out removes twins but the effective sample is about a dozen distinct lines; the 93% has wide uncertainty and no interval is claimed.
- Line number is a proxy for a design region the solver finds hard (probably deep arithmetic cones). It will not transfer to another file; a predictor for a new design needs structural features (cone size, depth, fanout), which this log does not hold.
- Equivalent-versus-undecided depends on the 150 s and 240 s solver timeouts, as in `eda-earlystop`.
- The tuning of the one-split rule uses the training fold only, but the choice of predictors was made with the log in view.

## Next steps
Log structural features of each mutated cone (gate count, depth) in `eda-harness` and repeat on a second design family (`chip-systolic`), where line number carries no information across designs; test whether the 93% survives a design the predictor was not fit on.

## Owner steps
None.

## Outside dependencies
None to run. The log was produced with Yosys 0.33 and Icarus Verilog 12.0 in `eda-verify`. All code original, MIT.
