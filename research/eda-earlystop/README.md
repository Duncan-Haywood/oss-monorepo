# eda-earlystop: when can a check cascade stop formal verification early? (follow-up to `eda-checkorder`, track 7)

Why it seemed worth doing: `eda-checkorder` found that after random and directed simulation, the remaining ~7,400 CPU-s is formal working on mutants that no simulation kills, and listed "let the cascade stop formal early" as its next step. The `eda-verify` log has the formal seconds and outcome for every mutant, so a time cap on the formal stage can be costed exactly, without re-running any tool. Produced with AI assistance (Claude). Stylised and preliminary: a re-analysis of one design (the `chip-accel` MAC engine, p = 8, 4-bit), 91 mutants, one solver.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-earlystop/

**Builds on.** `research/eda-checkorder` (the cascade replay; this project imports its loader and cost model), `research/eda-verify` (the log `experiments/mutants.jsonl`), `research/chip-accel`. No CU Boulder lab's work is built on and no affiliation is implied.

## Method
Cascade: random-N vectors, then the 16 directed vectors, then formal capped at T seconds. A mutant reaches formal only if the cheap stages did not kill it. With the cap, a mutant whose logged formal run took at most T seconds keeps its logged outcome (killed, equivalent or undecided); otherwise it is unresolved and T seconds are charged. This is exact only if the solver's time does not depend on the cap, which holds for one deterministic run (an assumption: the log was not produced with varying caps). Random outcomes use the logged first-failing-vector index per seed; results are means over 20 seeds. A held-out check sets T = 1.1 x the longest formal kill among training mutants that reach formal, and scores it on the other half (split by log index parity).

## Reproduce
```bash
cd research/eda-earlystop
python experiments/run.py          # stdlib only, about a second; writes experiments/results.txt
python experiments/figure.py       # writes experiments/figure.svg from results.txt
python -m unittest discover -s tests
```

## Results (`experiments/results.txt`)
- Logged formal seconds separate by outcome: kills 21 to 164 s (median 41), equivalence proofs 221 to 402 s (median 223), undecided runs 55 to 451 s (most hit the timeout).
- A 170 s cap finds 66 of 66 killable mutants (N = 4, 16 or 64) and cuts the cascade's CPU by 41% (7,404 to 4,334 CPU-s at N = 16), but gives up all 16 equivalence proofs. A 230 s cap keeps 15 of 16 proofs and saves 23%. Between 230 and 200 s the cap crosses the proof times, and every proof is lost.
- Caps of 60 s save 79% with no kill lost; at 30 s the cap starts losing kills (64.4 to 65.8 of 66, depending on N), and a cap of 0 (skip formal) loses 0.2 to 1.6 kills.
- So the cap is a price on equivalence proofs: from 230 s down to 170 s, about 1,400 CPU-s buys back 15 proofs, roughly 93 s each. Whether proofs are worth that depends on the loop; this project only prices them.
- Held-out: a cap learned on one half worked on the other when the training half contained formal kills (cap 58 s, no kills lost, 7 proofs lost, 80% CPU saved on the test half), and failed when it contained none (cap 0; 1.1 to 1.6 kills lost of 28 to 29). A cap set from few formal kills is fragile.

Figure: `experiments/figure.svg`.

## Limitations
- A replay on one design, one solver (Yosys' built-in SAT, 22-cycle bound), one mutant set. The tight gap between kill times and proof times may be specific to this solver and design family; nothing here shows it transfers.
- The 170 s cap is chosen with the log in view, so the sweep is descriptive, not a validated rule. The held-out check has two folds of about 45 mutants each.
- "Killable" is defined by the checkers themselves (`eda-verify`), so cap results that depend on formal kills are not independent of that definition. In this log every formal kill is also found by a cheap stage in some seed, so formal adds no kill beyond simulation here; the cap's only cost is proofs.
- CPU time is as logged, with no sharing between runs; random-vector cost below 64 vectors is scaled linearly (as in `eda-checkorder`).

## Next steps
Run `eda-harness` with a formal cap on a second design family (`chip-systolic`) to see whether kills and proofs separate in time there; log formal at several caps to test the exactness assumption; predict from cheap-stage features which survivors are equivalent and spend formal only on those.

## Owner steps
None.

## Outside dependencies
None to run. The log was produced with Yosys 0.33 and Icarus Verilog 12.0 in `eda-verify`. All code original, MIT.
