# Which track should the next run work on? Offline replay of four allocation policies (preliminary, stylised)

Pure Python, no dependencies. Milestone 4 (`swe-allocate`) of track 10, the software-engineering loop, in `PROJECTS.md`. **Partial: the offline comparison is done; the live trial the milestone requires before adopting a policy is not, so no policy is adopted.** All numbers below come from `experiments/results.txt`. Produced with AI assistance (Claude).

## Question

Today a run picks a track by a uniform random draw. Would choosing tracks by learned value per unit of cost deliver more value from the same budget?

## Results

- **Setup.** Arms are the 7 tracks with at least 6 scored projects (`accel`, `ambient`, `chip`, `garment`, `robofab`, `selfrep`, `simdesign`; the pre-track "other" pool is not a choice). Pulling an arm draws one of that track's projects with replacement, giving its value (1 to 3, from `swe-value`'s pass A or pass B) and cost (lines added). Each policy spends a 20,000-line budget; 300 seeds each.
- **Greedy and Thompson beat uniform in this replay.** Pass A: uniform 98.9 value points (95% CI 97.7 to 100.0), greedy 136.9 (135.5 to 138.3), bootstrap Thompson 130.5 (129.3 to 131.8), knapsack-UCB 109.2 (108.2 to 110.2); the oracle that puts the whole budget on the best track (`selfrep`) would earn 164.5. Pass B gives the same order (uniform 82.1, greedy 112.6, Thompson 107.5, UCB 88.4; oracle 142.4 on `garment`). Uniform reaches 58% to 60% of the oracle, greedy 79% to 83%.
- **The UCB variant explores too much** at this budget (about 60 pulls over 7 arms) and gains little over uniform. That is a property of this simplified index, not of bandits-with-knapsacks in general.
- **The replay assumes stationary arms, and the data say otherwise.** Within a track, value per 1000 lines falls with commit order (Spearman rho −0.36 to −0.57 in `chip`, `garment`, `ambient`, `robofab`; +0.42 in `selfrep`; about 0 in `simdesign` and `accel`). A policy that piles onto the "best" track would see its returns fall, so the gains above are an upper bound.

## Why this must not drive a policy yet

- **The values are the weak part.** The two scoring passes agree at near-chance level (`swe-value`, kappa 0.07), and pass A scores later family members lower by construction, so "value falls with order" is partly built into the rubric. The agreement between pass A and pass B here (same winner order, different best track) is encouraging, not validating.
- **Cost is lines of code**, a poor proxy for tokens or subscription time, which the log mostly lacks (`swe-ledger`).
- **Projects are drawn with replacement** from history, so a policy can "re-run" a project, and no duplication or merge-conflict cost appears (that is `swe-schedule`).
- **No live trial**, which the milestone makes a condition for adoption. Greedy would also collapse the track mix the owner set on purpose.

## Method

`src/swe_allocate/policies.py`. Uniform: random arm. Greedy: two pulls of each arm, then best observed value per line. Thompson: two pulls each, then resample each arm's observed projects with replacement and pick the best sampled value-per-line ratio. Knapsack-UCB: optimistic value over pessimistic cost with a Hoeffding-style radius, in the single-resource form of Badanidiyuru et al. (2018). Six unit tests check that policies learn deterministic arms, that uniform is worse, budget accounting, the oracle, the interval and seed reproducibility.

## Reproduce

```bash
cd research/swe-allocate
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests
python3 experiments/run.py                                # seconds; writes experiments/results.txt
```

`experiments/scores.csv` is a copy of `swe-value`'s committed per-project scores.

## Builds on

Badanidiyuru, Kleinberg and Slivkins (2018), "Bandits with knapsacks", *Journal of the ACM* 65(3); Russo, Van Roy, Kazerouni, Osband and Wen (2018), "A tutorial on Thompson sampling", *Foundations and Trends in Machine Learning* 11(1); Auer, Cesa-Bianchi and Fischer (2002), "Finite-time analysis of the multiarmed bandit problem", *Machine Learning* 47. Data and rubric from `swe-value` and `swe-ledger`. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Next steps

Rescore a sample with a blind reviewer to firm up value; replace lines with tokens once the ledger records them; add diminishing returns by fitting a per-track decay and re-compare; then, if a policy still wins, propose a live trial through `prompt.md`'s experiment process (a candidate brief that weights the track draw) for the owner to approve.

## Owner steps

Decide whether to trial a weighted track draw.

## Outside dependencies

None (standard library only). No language-model proposer was used.

MIT.
