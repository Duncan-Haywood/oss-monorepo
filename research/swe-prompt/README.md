# When can a prompt experiment stop? Fixed-n, peeking and a mixture SPRT on ledger-shaped outcomes (preliminary, stylised)

Pure Python, no dependencies. Milestone 6 (`swe-prompt`) of track 10, the software-engineering loop, in `PROJECTS.md`. **Partial: this builds and calibrates the stopping rule `prompt.md`'s experiment process needs. No candidate brief has been run, so no brief's effect is measured.** All numbers below come from `experiments/results.txt`. Produced with AI assistance (Claude).

## Question

`prompt.md` compares a candidate brief with the champion run by run. If someone checks the running tally after every run and stops when it looks significant, how often does a brief that changed nothing get declared a winner? And is there a rule that is safe to peek at, and how many runs does it need at the effect sizes and outcome rates this ledger has?

## Results

- **All 244 ledger rows are prompt 0** (`experiments/ledger_outcomes.csv`), so there is no real A/B data yet. Effects below are hypothetical, applied to outcome distributions drawn from the ledger (success rate 237/244 = 0.971) and from `swe-value`'s pass-A project values (n = 408, mean 1.68, variance 0.445).
- **Peeking inflates false positives badly.** With up to 400 pairs of runs and a z-test (alpha 0.05) read after every pair, a brief identical to the champion was declared different in 21.3% of 2,000 simulated experiments on the success rate (Wilson 19.6% to 23.2%) and 40.5% on project value (38.4% to 42.7%). One look at the end gives 5.3% and 4.9%, as it should.
- **The mixture SPRT stays at or below nominal.** Its false-positive rate was 0.4% (success) and 3.9% (value). It is conservative, and pays for it in power: at +0.2 mean value it detects the effect in 92.2% of experiments (fixed n: 99.1%) but stops after 181 pairs on average instead of 400; at +0.3 it stops after 89 pairs.
- **Success rate is a poor primary metric here.** At a 97% base rate, detecting 0.971 to 0.991 at 80% power takes about 1,094 pairs per arm (2,188 runs) with a fixed test, and 0.971 to 0.981 takes 8,750 runs. Within 400 pairs the mixture SPRT found a +0.02 change in only 13.7% of experiments. Project value (1 to 3) needs 350 runs for a +0.2 shift. The success rate mostly records whether a run avoided failure, and almost every run does.
- **Run rate.** The 242 dated ledger rows span 4 dated days (about 60 runs per dated day, a rough figure: some rows carry no date, and a candidate gets only its share of runs). A trial that gave a candidate 20% of runs would collect on the order of 12 candidate runs a day at that rate, so even the value-based test is a matter of weeks.

## Why this is not yet a decision procedure

- The effects are hypothetical and the value scores are the weak, partly author-built rubric from `swe-value` (kappa 0.07 between passes). A real experiment needs a metric from a blind reviewer.
- Pairs are simulated as independent draws. Real runs differ by track, task and day, so arms need stratified or blocked assignment, which this does not model.
- The mixture prior (a normal with standard deviation 0.02 for success, 0.3 for value) was chosen by hand, and the variance is estimated from the data rather than known, so the false-positive guarantee is approximate. The simulations above are the check, at two outcome shapes only.
- One-sided "stop when the candidate is clearly worse" rules, multiple candidates at once and the cost of running a bad candidate are not studied.

## Method

`src/swe_prompt/seq.py`. Arms A (champion) and B (candidate) each yield one outcome per step. Fixed: a two-sided z-test of the difference in means, read once at n_max. Peek: the same test read after every pair from the 10th on. mSPRT: with prior N(0, tau^2) on the difference, the log mixture likelihood ratio is 0.5 ln(V/(V+tau^2)) + tau^2 D^2 / (2V(V+tau^2)), where D is the observed mean difference and V = 2 sigma^2 / n; stop and reject when it reaches ln(1/alpha). Under an exact normal model with known variance, Ville's inequality bounds the chance of ever rejecting a true null by alpha. Seven unit tests check the critical value, the Wilson interval, the sample-size formula, the likelihood ratio's direction, that peeking inflates the false-positive rate while the mSPRT does not, that a large effect is found and the mSPRT stops early, and seed reproducibility.

## Reproduce

```bash
cd research/swe-prompt
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests
python3 experiments/run.py > experiments/results.txt       # about a minute
python3 experiments/figure.py                              # writes type_one_error.svg from results.txt
```

## Builds on

Wald (1945), "Sequential tests of statistical hypotheses", *Annals of Mathematical Statistics* 16(2); Robbins (1970), "Statistical methods related to the law of the iterated logarithm", *Annals of Mathematical Statistics* 41(5), 1397-1409, the mixture-martingale construction; Johari, Koomen, Pekelis and Walsh (2017), "Peeking at A/B tests: why it matters, and what to do about it", KDD '17, pp. 1517-1525, which applies the mixture SPRT to A/B tests; Howard, Ramdas, McAuliffe and Sekhon (2021), "Time-uniform, nonparametric, nonasymptotic confidence sequences", *Annals of Statistics* 49(2), 1055-1080, the nonparametric route this project does not take; Kohavi, Tang and Xu (2020), *Trustworthy Online Controlled Experiments*, Cambridge University Press. The first three I checked against bibliographic records this run (Johari et al. and Howard et al. by search, Robbins by Project Euclid's record); Wald and Kohavi et al. are cited from memory for the topic only and no claim here rests on their text. Data from `swe-ledger` and `swe-value`. No lab's work is built on, and no lab is affiliated with or endorses this project.

## Next steps

Replace the normal-theory test with an empirical-Bernstein confidence sequence (Howard et al.) for bounded outcomes; add blocked assignment by track; use a blind reviewer's value score as the outcome; add one-sided futility stopping; then propose a first candidate brief through `prompt.md`'s experiment process, with the stopping rule fixed in advance.

## Owner steps

Decide whether to run a candidate brief on a share of runs, and which outcome counts.

## Outside dependencies

None (standard library only). No language-model proposer was used.

MIT.
