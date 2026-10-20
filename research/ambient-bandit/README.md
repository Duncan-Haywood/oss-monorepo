# ambient-bandit: can an always-on assistant learn when to speak from accept/dismiss feedback alone, and how many dismissals does it cost?

Track 2 (ambient AI assistant), follow-up to `ambient-interject`. A simulated assistant decides, window by window, whether to speak. It learns only from what the user does when it *does* speak (accept or dismiss); silence gives no label. I compare greedy, epsilon-greedy and Thompson-sampling versions of an online logistic policy with an offline oracle. Produced with AI assistance. **Stylised, simulated results only**: every distribution is chosen by me and nothing is a claim about a real user, device or product. Most of the headline results here are negative or conditional (see below).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/ambient-bandit/

## Motivation

`ambient-interject` tuned interruption policies on labelled hours. A deployed assistant has no labels: it sees only the user's reaction to its own interruptions. A policy that stops speaking stops learning, so there is an exploration problem, and every exploratory interruption that is dismissed costs annoyance.

## Builds on (and does not claim affiliation with)

- `research/ambient-interject` in this repository: the simulated listening windows (the generator is copied into `src/ambient_bandit/bandit.py` so the project is self-contained) and the expected-utility speaking rule, which itself follows the idea in Horvitz (1999), "Principles of mixed-initiative user interfaces", CHI '99, 159&ndash;166, <https://doi.org/10.1145/302979.303030> (the idea only; not a reproduction).
- Li, Chu, Langford and Schapire (2010), "A contextual-bandit approach to personalized news article recommendation", WWW 2010, 661&ndash;670, <https://doi.org/10.1145/1772690.1772758>: the framing of choosing an action from context with feedback only on the chosen action. I do not implement their LinUCB.
- Chapelle and Li (2011), "An empirical evaluation of Thompson sampling", NIPS 24, 2249&ndash;2257, <https://papers.nips.cc/paper/4321-an-empirical-evaluation-of-thompson-sampling>: the Thompson-sampling-with-Laplace-posterior-for-logistic-models idea. My version is a small batched variant of my own; I did not reproduce their experiments. I checked both entries' authors, venue, year and pages by web search, not by reading the papers in full.

No research group from `prompt.md` is built on; there is no lab tag.

## Method

Windows are 10 s; 3% contain a need; the assistant sees an intent score (N(2,1) when help is wanted, N(0,1) otherwise), a keyword flag and an "others talking" flag. A wake phrase is always answered and is not a learned feature. Speaking earns +3 if help was wanted (accept) and costs 1 if not (dismiss), 2 when others are talking. The policy speaks when p&middot;3 &gt; (1&minus;p)&middot;cost, where p = P(need | features) comes from a logistic model with a Gaussian prior, refit (MAP, Newton) every 10 minutes on the windows where it spoke. Three variants: *greedy*; *eps* (extra random interruptions with probability 0.005 per window); *thompson* (one weight sample from the Laplace posterior per 10-minute batch). Two priors: *uninformed* (weights 0, intercept &minus;3.5, i.e. "needs are rare") and *informed* (the same but score weight 1, i.e. "the score is informative"). The oracle is a logistic fit on 2000 fully labelled hours, applied with the same rule. 20 seeds, 100 h streams; "+-" is the standard deviation over seeds.

## Reproduce

```bash
cd research/ambient-bandit
PYTHONPATH=src python3 -m pytest -q tests       # 6 tests
PYTHONPATH=src python3 experiments/run.py       # about 70 s, writes experiments/results.txt
```

## Results (all from `experiments/results.txt`)

Utility per hour in the stationary world; the oracle earns 12.71 per hour over hours 20&ndash;100.

| prior | policy | h 0&ndash;5 | h 20&ndash;100 | dismissals/h (20&ndash;100) | regret at 100 h |
|---|---|---|---|---|---|
| uninformed | greedy | &minus;15.8 | &minus;0.07 | 4.1 | 1372 |
| uninformed | eps | &minus;25.0 | &minus;1.97 | 5.8 | 1678 |
| uninformed | thompson | &minus;24.1 | &minus;1.36 | 5.1 | 1558 |
| informed | greedy | 7.8 | 10.39 | 9.4 | 243 |
| informed | eps | 6.0 | 8.50 | 10.6 | 430 |
| informed | thompson | 3.7 | 10.32 | 9.3 | 282 |

1. **With an uninformed prior, none of the three learns a useful policy in 100 h** (utility at or below zero, and the trailing-10-h rate never reaches 90% of the oracle's in any of the 20 seeds for any variant). The first labels come mostly from wake-phrase windows, which are mostly real needs, so early estimates are over-optimistic, the policy speaks too often, and dismissals pull it back to near silence. I did not test other priors or learning rates beyond these two, so this is a finding about this setup, not about bandits in general.
2. **With an informed prior, greedy is the best of the three**: it reaches 90% of the oracle's trailing rate after a median 22.5 h (0% of seeds fail), at about 185 dismissals in the first 20 h. Thompson reaches it after 32.5 h (0% fail) and epsilon-greedy after 31 h but fails in 55% of seeds. Explicit exploration did not pay for itself here; a plausible cause is that the keyword and score signals already put many windows near the decision boundary, so the policy explores anyway, but I did not test that.
3. **Even the best online variant stays below the oracle** (10.4 vs 12.7 per hour at hours 20&ndash;100): it keeps speaking about 9.4 times per hour against need that arrives about 11 times per hour. Part of the gap is that labels exist only where it spoke.
4. **Drift (negative).** When the intent classifier degrades at hour 50 (d&prime; 2 &rarr; 1), utility per hour over hours 50&ndash;100 is 5.63 for a post-drift oracle, 4.38 for the stale pre-drift offline weights, 0.31 +- 0.65 for the greedy bandit with no forgetting and 0.62 +- 0.68 when it keeps only the last 20 h of labels. The bandit does far worse than not adapting at all. I did not find out why; censored feedback and the prior's pull on the score weight are candidates.

## Limitations

- Needs are independent across windows, the user always accepts a wanted interruption and always dismisses an unwanted one, and feedback is instant and noise-free. Real reactions are delayed, ambiguous and depend on content.
- The benefit (3) and costs (1 and 2) are numbers I picked. The learned model has a correct functional form (logistic on the true features), which a real system will not.
- The oracle is the best logistic fit, not the Bayes-optimal policy; "regret" is against it.
- Two priors, one exploration setting per variant, one drift scenario, one world. The ranking of variants may change with other choices; no tuning was done.

## Next steps

- Debias with inverse-propensity weighting and test whether that fixes the uninformed-prior failure and the drift result.
- Add a cooldown and clustered needs (the `ambient-interject` next steps) and see whether learning gets easier.
- Replace the simulated user with recorded accept/dismiss logs once the owner opts in to collecting them.

## Outside dependencies

numpy (and pytest for the tests). No model, dataset, service or hardware is used.
