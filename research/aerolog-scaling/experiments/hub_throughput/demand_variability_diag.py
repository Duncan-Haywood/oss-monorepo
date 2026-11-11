"""Milestone 6l, post hoc diagnostic (written after demand_variability_results.txt was read; not a pre-registered test).

At 85% load R1 (mixture over single observed days, each preceded by the mean day) asked for 90 packs where the
simulator needed 111. Candidate cause: carry-over. After a busy day the evening backlog has not cleared by morning,
so the next day starts with packs still at the chargers, which R1 rules out by giving every day a mean-day
predecessor. Test: R3 = 6k's exact rule over three consecutive *random* observed days (as the simulator draws
them), scoring the third day, averaged over N_TRIPLES random triples with order weights. If carry-over is the cause,
R3 should close most of the gap at 85% and change little at 70%. Also printed: the share of simulated mornings
(06:00) with packs still queued at the chargers is not available from the rule, so instead the rule's expected
charger count E[N_q] at 06:00 of day 3 is reported, mean and 95th percentile across triples.
"""
import os
import random
import sys
import time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import demand_variability as v  # noqa: E402

k6 = v.k6
N_TRIPLES = 400


def triple_tails(args):
    shape, lam, pa, pb, pc = args
    bins = [lam * shape[b] * p[b] for p in (pa, pb, pc) for b in range(96)]
    rate = k6.Rate(bins)
    nq = k6.nq_path(rate, 1)
    trim = rate.F(2 * 86400.0) / rate.cum[-1]
    tl = k6.order_tails(rate, 1, nq, v.W, list(range(1, v.S_MAX + 1)), trim=trim)
    i6 = int(round((2 * 86400 + 6 * 3600) / k6.G))
    eq = sum(n * p for n, p in enumerate(nq[i6]))
    return rate.L(2 * 86400.0, 3 * 86400.0), tl, eq


def main():
    t0 = time.time()
    wd, M, r, shape = v.decompose(v.load("cell1"))[:4]
    full = v.patterns(wd, M, r, True)
    names = sorted(full)
    rng = random.Random(6)
    trip = [tuple(rng.choice(names) for _ in range(3)) for _ in range(N_TRIPLES)]
    print(f"Milestone 6l diagnostic (post hoc): R3 = rule over three random observed days, cell1, {N_TRIPLES} triples")
    with Pool(4) as pool:
        for ld in (0.7, 0.85):
            lam = v.lam_scale(shape, full, ld)
            out = pool.map(triple_tails, [(shape, lam, full[a], full[b], full[c]) for a, b, c in trip])
            tot = sum(o[0] for o in out)
            pooled = {S: sum(o[0] * o[1][S] for o in out) / tot for S in range(1, v.S_MAX + 1)}
            eqs = sorted(o[2] for o in out)
            S3 = v.smallest(pooled)
            print(f"  load {ld:.0%}: R3 smallest S {S3}; P(W>300) at S = {S3 - 5}, {S3}, {S3 + 5}: "
                  f"{pooled[S3 - 5]:.4f}, {pooled[S3]:.4f}, {pooled[S3 + 5]:.4f}; "
                  f"E[N_q] at 06:00 of the scored day: mean {sum(eqs) / len(eqs):.1f}, "
                  f"95th pct {eqs[int(0.95 * len(eqs))]:.1f}, max {eqs[-1]:.1f} (chargers {v.CH})")
    print(f"  runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
