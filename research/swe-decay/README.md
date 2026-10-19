# Do track-allocation gains survive when tracks run out of projects? Sequential replay of four policies (preliminary, stylised)

Pure Python, no dependencies. A follow-up to `swe-allocate` (track 10, the software-engineering loop, in `PROJECTS.md`), taking its first "Next steps" item: its replay drew projects with replacement, so a track never ran dry and never got worse, yet value per line falls with order in most tracks. Here each pull yields the track's **next project in commit order**, and an empty track leaves the choice set. All numbers come from `experiments/results.txt`. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/swe-decay/

## Question

Does a smarter track-picking policy (greedy, Thompson, knapsack-UCB) still beat the current uniform draw when the replay respects history order and finite pools?

## Results

- **Setup.** Same 7 arms, value scores (`pass_A`, `pass_B`, 1 to 3) and cost (lines added) as `swe-allocate`; budgets 5,000, 10,000 and 20,000 lines; 300 seeds. The reference is a hindsight-greedy walk that knows the future order and always takes the best next value per line. It is a yardstick, not a bound.
- **At 20,000 lines the gain mostly survives.** Pass A: uniform 114.0 (95% CI 113.3 to 114.7), greedy 134.0, Thompson 129.9 (129.5 to 130.2), knapsack-UCB 116.0; against `swe-allocate`'s stationary 98.9, 136.9, 130.5 and 109.2. Pass B: uniform 101.3, greedy 107.0, Thompson 112.5, UCB 105.0. Greedy and Thompson are 94% to 97% (pass A) and 82% to 87% (pass B) of hindsight, uniform 83% and 78%. The gain over uniform is 14% to 18% in pass A but only 6% to 11% in pass B.
- **At small budgets the smart policies lose.** At 5,000 lines (pass A) uniform scores 30.0 and greedy, Thompson and UCB all score 24.0 (the two forced pulls of each of 7 arms are the first, often large, projects and eat the budget). At 10,000 lines the four are within about 3% in pass A; in pass B greedy leads (62.0 against uniform 51.9).
- **Finite pools bite.** Greedy exhausts one track in every 20,000-line run and Thompson in 81% to 84%; uniform in 53%. The "best" track cannot be farmed indefinitely, and the fitted per-track decay (slope of ln value per 1000 lines on pull index) is negative in 5 of 7 tracks in pass A (`chip` −0.055, `robofab` −0.028) and positive in `accel` and `selfrep`.
- **Greedy's interval is degenerate.** With a deterministic environment and deterministic greedy and UCB rules, every seed gives the same total, so their zero-width CIs say nothing about uncertainty in the underlying history; they reflect only the policies' own randomness (uniform and Thompson).

## Why this must not drive a policy yet

The weaknesses of `swe-allocate` stand: the value scores agree only weakly (`swe-value`, kappa 0.07), lines are a proxy for cost, there is one history (no resampling of it), and no live trial was run. Greedy would also collapse the track mix the owner set on purpose. The small-budget loss suggests any adopted policy needs a cheaper exploration phase than two pulls per arm. No figure is drawn yet.

## Method

`src/swe_decay/seq.py`: `run_seq` replays a policy class imported unchanged from `swe-allocate` and removes an arm when its sequence ends; `hindsight` is the reference walk; `fit_decay` is the log-linear slope. Seven unit tests cover budget and exhaustion, order, the hindsight and fixed-arm references, the decay sign and policy behaviour on toy sequences.

## Reproduce

```bash
cd research/swe-decay
python3 -m unittest discover -s tests -v   # 7 tests
python3 experiments/run.py                 # seconds; writes experiments/results.txt
```

`experiments/scores.csv` is a copy of `swe-allocate`'s.

## Builds on

`swe-allocate` (policies, data), `swe-value` (scores). Badanidiyuru, Kleinberg and Slivkins (2018), "Bandits with knapsacks", *Journal of the ACM* 65(3). No lab's work is built on, and no lab is affiliated with or endorses this project.

## Next steps

Replace the two-pulls-each start with a cheap prior; resample the history order (block bootstrap) to get real intervals; replace lines with tokens once the ledger records them.

## Owner steps

None beyond `swe-allocate`'s (decide whether to trial a weighted track draw).

## Outside dependencies

None (standard library only). No language-model proposer was used.

MIT.
