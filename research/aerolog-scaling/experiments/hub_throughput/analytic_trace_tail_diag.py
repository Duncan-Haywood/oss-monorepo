"""Milestone 6k diagnostic, written AFTER the first run of analytic_trace_tail.py (not a pre-registered test).

The first run found the time-varying rule exact to the 1-pack grid for single orders but 3 to 4 packs optimistic
for batches of 4 under the daily profile. The rule leaves out two things the simulator has: (a) feedback, a flight
that waits sends its depleted pack to the charger later, and (b) pad waits (8 pads). This script splits the gap.
It runs the same simulator three ways on the same arrivals (same seeds as the main run):
  full     : 6f's run() (feedback and 8 pads);
  no-fb    : the depleted pack reaches the charger T_PAD after the ORDER time, not after the flight starts (no feedback),
             8 pads kept;
  model    : no feedback and unlimited pads, the rule's exact model.
If the derivation is right, `model` matches the rule to sampling noise, and the differences between rows say how
much of the gap each left-out mechanism makes.

Outcome (analytic_trace_tail_diag_results.txt): `model`, `no-fb` and `full` agree to 4 decimals in every row, so
neither feedback nor the pad limit moves P(W > 300 s) here. The rule-vs-`model` gap in the k = 4 rows is sampling
noise of these 100 seeds: with 4,000 seeds (analytic_trace_tail.py, second run) the k = 4 gap falls to
-0.003 on average (largest 5 standard errors) and the pack counts to within 1. The paired columns (same arrivals) are the point of this script, not the rule column.
"""
import os
import random
import sys
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analytic_trace_tail as m  # noqa: E402

T_PAD, D, PADS, CH = m.T_PAD, m.D, m.PADS, m.CH
SEEDS = 100


def waits(ts, S, feedback, pads):
    pad = [0.0] * pads; chg = [0.0] * CH; pack = [0.0] * S
    out = []
    for t in ts:
        i = min(range(pads), key=pad.__getitem__)
        j = min(range(S), key=pack.__getitem__)
        start = max(t, pad[i], pack[j]); end = start + T_PAD
        arrive = end if feedback else t + T_PAD
        c = min(range(CH), key=chg.__getitem__)
        chg[c] = max(arrive, chg[c]) + D
        pack[j] = chg[c]; pad[i] = end
        out.append(start - t)
    return out[len(out) // 5:]


def job(args):
    counts, mean_h, k, S, mode, seeds = args
    rate = m.trace_rate(counts, mean_h)
    w = []
    for sd in range(seeds):
        ts = m.nhpp_batches(rate, k, random.Random(10007 * sd + 17))
        fb, pads = {"full": (True, PADS), "no-fb": (False, PADS), "model": (False, 10 ** 4 // 100)}[mode]
        w += waits(ts, S, fb, pads)
    return sum(1 for v in w if v > m.W_TARGET) / len(w)


def main():
    lim = CH * 3600 / D
    days = m.h6f.load_profile()
    print("Milestone 6k diagnostic (post hoc): P(W > 300 s) by mechanism, time-varying Poisson orders, 100 seeds pooled")
    print("  ('model' = no feedback and 100 pads, the rule's model; unlimited pads in effect at these rates)")
    with Pool(4) as pool:
        for load, k, S_list in ((0.7, 1, (20, 23)), (0.7, 4, (36, 40, 44)), (0.85, 1, None), (0.85, 4, None)):
            mean_h = load * lim
            counts = days["2019-10-09"]
            rate = m.trace_rate(counts, mean_h)
            nq = m.nq_path(rate, k)
            tl = m.order_tails(rate, k, nq, m.W_TARGET, list(range(1, 141)))
            if S_list is None:
                s0 = m.smallest_S(tl)
                S_list = (s0 - 4, s0, s0 + 4)
            print(f"\n== load {load:.0%}, k={k}, Wed 2019-10-09 shape")
            print("  S  | rule   | model  | no-fb  | full")
            for S in S_list:
                r = pool.map(job, [(counts, mean_h, k, S, mode, SEEDS) for mode in ("model", "no-fb", "full")])
                print(f"  {S:3d} | {tl[S]:.4f} | {r[0]:.4f} | {r[1]:.4f} | {r[2]:.4f}")


if __name__ == "__main__":
    main()
