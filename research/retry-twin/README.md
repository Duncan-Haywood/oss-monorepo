# Retry twin: how many retries does a grasp need when the simulator treats attempts as independent?

Pure Python, no dependencies. A pick skill is retried until it succeeds. The twin draws every attempt independently with success `p=0.6`; in the "real" system each object has a latent success probability `P~Beta(a,b)` with the same mean, so the single-attempt success rate (what a twin is calibrated on) matches exactly while attempts on one object are positively correlated (`ρ=1/(a+b+1)`). Real failure after `k` attempts is exactly `B(a,b+k)/B(a,b)=∏(b+j)/(a+b+j)`, a power law `~k^{-a}` against the twin's geometric `(1−p)^k` (matched to a 200,000-object simulation). At the twin's budget for `δ=0.01` (6 attempts, claimed 0.0041) real failure is 0.010 / 0.042 / 0.151 for `ρ`=0.05 / 0.2 / 0.5 (2× / 10× / 37× the claim); the budget the real system needs is 7 / 13 / 571 (for `ρ=0.5`, `a=0.6<1`, so the expected number of attempts without a cap diverges). The payoff cost of the wrong budget is mostly small (0–6%, but 23% at `ρ=0.5` with cheap payoff) and the optimal give-up rule is a closed form `w·a/(a+b+k) ≥ c`; the certificate is what is badly wrong. One attempt per object cannot identify `ρ`; two forced attempts per object can (method of moments), but a budget aimed at `δ` is only met in 50–79% of repeats even at 6,400 objects. See `paper/whitepaper.md`.

```bash
cd research/retry-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                 # ~7 s; output in experiments/results.txt
```

**Builds on.** The manipulation direction of the HIRO Group (<https://hiro-group.ronc.one/>) and the task-and-motion-planning direction of CAIRO Lab (<https://cairo-lab.com/>), where skills are scored in simulation before robot trials; no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The method is classical: the Beta-binomial (Skellam 1948; Johnson, Kemp & Kotz 2005), a one-step posterior check for the give-up rule, and sim-to-real context (Zhao, Queralta & Westerlund 2020). Companion to `grasp-twin` (how firmly to grip; here how often to retry), `handover-twin` (when to abort a wait), `workcell-twin` and `safety-twin` (a tail that a moment fit cannot see) in this repository.

Stylised: one latent difficulty per object with a Beta law, i.i.d. attempts given the object, a simulated "real" system, no robot data. MIT.
