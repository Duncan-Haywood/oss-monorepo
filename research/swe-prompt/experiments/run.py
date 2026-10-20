"""Error rates and stopping times of fixed-n, naive peeking and mSPRT on ledger-shaped outcomes.

Two outcome models, both drawn from committed data:
  success  Bernoulli with the ledger's own rate (experiments/ledger_outcomes.csv, copied from
           prompts/runs.jsonl: date, prompt_version and outcome of each of 244 runs).
  value    resampled from swe-value's pass-A scores (1 to 3) of the 408 projects, via
           experiments/scores.csv; a candidate's effect is a shift added to each draw.
The candidate's effect sizes are hypothetical: no candidate brief has been run yet (all 244
ledger rows are prompt 0), so nothing here says how any real brief performs.
"""
import csv, json, os, sys, collections
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_prompt.seq import *

ALPHA, N_MAX = 0.05, 400
NULL_SIMS, ALT_SIMS = 2000, 1000

ledger = list(csv.DictReader(open(os.path.join(HERE, "ledger_outcomes.csv"))))
N_RUNS, N_OK = len(ledger), sum(r["outcome"] == "success" for r in ledger)
P = N_OK / N_RUNS
dates = collections.Counter(r["date"] for r in ledger if r["date"])
VALUES = [float(r["pass_A"]) for r in csv.DictReader(open(os.path.join(HERE, "scores.csv")))]
VMEAN = sum(VALUES) / len(VALUES)
VVAR = sum((v - VMEAN) ** 2 for v in VALUES) / (len(VALUES) - 1)

def bern(p): return lambda rng: 1.0 if rng.random() < p else 0.0
def val(shift): return lambda rng: rng.choice(VALUES) + shift

def table(title, mk, tau2, floor, effects, label):
    print(f"\n{title}")
    print(f"  {'effect':>9} {'rule':>6} {'reject rate (95% Wilson)':>28} {'mean pairs used':>16}")
    for eff in effects:
        sims = NULL_SIMS if eff == 0 else ALT_SIMS
        r = simulate(mk(0.0), mk(eff), N_MAX, ALPHA, tau2, floor, sims, seed=11)
        for rule in ("fixed", "peek", "msprt"):
            rate, n = r[rule]
            lo, hi = wilson(round(rate * sims), sims)
            print(f"  {label(eff):>9} {rule:>6} {rate:7.3f} ({lo:.3f} to {hi:.3f}) {n:16.1f}")

print(f"ledger: {N_RUNS} runs, {N_OK} success (rate {P:.4f}); all prompt_version 0 = "
      f"{all(r['prompt_version'] == '0' for r in ledger)}")
print(f"value scores: n={len(VALUES)} mean {VMEAN:.3f} variance {VVAR:.3f}")
print(f"alpha {ALPHA}, up to {N_MAX} pairs, null sims {NULL_SIMS}, alternative sims {ALT_SIMS}")

# Success: champion rate P, candidate rate P + eff (clipped to 1 inside the draw)
def succ_pair_factory(eff):
    return bern(min(1.0, max(0.0, P + eff)))
table("A. success rate (binary). Effects are changes in the success rate.", succ_pair_factory,
      tau2=0.02 ** 2, floor=0.005, effects=[0.0, 0.01, 0.02, -0.03],
      label=lambda e: f"{e:+.2f}")
table("B. project value (1 to 3). Effects are shifts in mean value.", val,
      tau2=0.3 ** 2, floor=0.05, effects=[0.0, 0.1, 0.2, 0.3],
      label=lambda e: f"{e:+.2f}")

print("\nC. Pairs per arm for a fixed-n test at 80% power (alpha 0.05, normal approximation)")
sig_s = P * (1 - P)
for d in (0.01, 0.02):
    print(f"  success rate {P:.3f} -> {P + d:.3f}: {fixed_n_pairs(sig_s, d):6d} pairs "
          f"= {2 * fixed_n_pairs(sig_s, d)} runs")
for d in (0.1, 0.2, 0.3):
    print(f"  value mean shift {d:+.1f}: {fixed_n_pairs(VVAR, d):6d} pairs = {2 * fixed_n_pairs(VVAR, d)} runs")
if dates:
    days = len(dates); rpd = sum(dates.values()) / days
    print(f"  ledger run rate: {sum(dates.values())} dated runs over {days} dated days "
          f"= {rpd:.0f} runs per dated day (dated rows only; a lower bound on what can be run)")
