"""Milestone 6j: does the analytic spare-pack rule give the waiting-time tail, and so 6c's p95 <= 300 s count?

6i's rule gives the share of orders that wait at all. 6c sized the hub on a different criterion, p95 wait
<= 300 s, which needs the waiting-time distribution. Same hub (8 pads, 8 chargers, D = 2520 s charge for
20-90% at 1C, T_PAD = 180 s swap+load), same no-feedback model as 6i.

Derivation (no feedback, no pad waits). Depleted packs reach the chargers T_PAD after their order and are
charged FIFO; with deterministic D, packs leave the chargers in the order they arrived, so the pool of S
packs is used cyclically: order n gets the pack freed by order n - S, ready at
    R_{n-S} = t_{n-S} + T_PAD + Wq_{n-S} + D,
and waits W_n = max(0, T_PAD + D + Wq_{n-S} - H_S), with H_S = t_n - t_{n-S}.
For FIFO M^X/D/c, customer n departs at max(t_n, Dep_{n-c}) + D, so V_n = Dep_{n-c} - t_n obeys the Lindley
recursion V_{n+c} = max(V_n, 0) + D - (t_{n+c} - t_n): the charger wait is that of a single-server queue with
deterministic service D and Erlang-(c/k) gaps (batches of k, k dividing c). Wq_{n-S} depends only on arrivals
up to n - S and H_S only on later gaps, so they are independent; for order position p (0..k-1) in its batch,
H_S ~ Gamma(ceil((S - p)/k), batch rate). Both steps are "add a constant, subtract a sum of exponentials,
clip at 0", which on a 10 s grid costs O(grid) per exponential: stdlib, no simulation.

Predictions (written before the first run):
 (1) Consistency: P(W > 0) from this tail equals 6i's wait share (a different derivation of the same model)
     within 0.003 at every S tested.
 (2) Smallest S with p95 wait <= 300 s: analytic within 1 pack of the simulator (6c's sim logic as copied in
     6i, 5 seeds x 40,000 orders, every S on a 1-pack grid) for k = 1, 2, 4 at 70% and 85% of the
     11.4 flights/h charger limit, and for k = 8 at 70%.
 (3) Where the simulated P(W > 300 s) is between 0.01 and 0.3 and S >= E[N_out] + 2, the analytic value is within
     0.01 of it.
 (4) The analytic p95 count is never above the simulated one (the rule errs optimistic, as 6i found).
 (5) Validation of the charger queue: analytic mean Wq of M^X/D/c within 3% of a direct FIFO simulation of the
     charger queue alone (5 seeds x 200,000 orders) in all 8 cases.
Inputs as 6c (vendor swap and charge figures, see run.py); batch size swept, not measured. Preliminary.
"""
import math
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analytic_spares as a6i  # noqa: E402

T_PAD, D, PADS, CH = a6i.T_PAD, a6i.D, a6i.PADS, a6i.CH
DT = 10.0  # grid step, s; D and T_PAD are whole multiples
ND, NP = int(round(D / DT)), int(round(T_PAD / DT))
TRIM = 1e-15


def sub_exp(x, lam):
    """Law of X - E, E ~ Exp(lam) rounded to the DT grid. x is a pmf on 0, DT, 2DT, ...;
    returns (pmf on the same grid, mass that fell below 0). O(len(x))."""
    q = math.exp(-lam * DT)
    p0 = 1.0 - math.exp(-lam * DT / 2)
    a = math.exp(lam * DT / 2) * (1.0 - q)
    n = len(x)
    out = [0.0] * n
    T = 0.0
    for j in range(n - 1, -1, -1):
        out[j] = x[j] * p0 + a * T
        T = q * (x[j] + T)
    # mass below zero: sum_i x[i] P(E_d > i) = sum_i x[i] exp(-lam DT (i + 1/2))
    neg, w = 0.0, math.exp(-lam * DT / 2)
    for v in x:
        neg += v * w
        w *= q
        if w < 1e-300:
            break
    return out, neg


def trim(x):
    n = len(x)
    while n > 1 and x[n - 1] < TRIM:
        n -= 1
    return x[:n]


def charger_wait_pmf(rate_per_h, k, c=CH, tol=1e-11, it_max=20000):
    """Stationary FIFO M^X/D/c wait on the DT grid via V' = max(V, 0) + D - Gamma(c/k, batch rate)."""
    assert c % k == 0
    lam_b = rate_per_h / k / 3600.0
    m = c // k
    w = [1.0]
    for it in range(it_max):
        x = [0.0] * ND + w
        neg = 0.0
        for _ in range(m):
            x, ng = sub_exp(x, lam_b)
            neg += ng
        x[0] += neg
        x = trim(x)
        s = sum(x)
        x = [v / s for v in x]
        n = max(len(x), len(w))
        diff = sum(abs((x[i] if i < len(x) else 0.0) - (w[i] if i < len(w) else 0.0)) for i in range(n))
        w = x
        if diff < tol:
            break
    return w, it + 1


def pmf_mean(x):
    return DT * sum(i * v for i, v in enumerate(x))


def tail(x, w_s):
    """P(W > w_s) for a pmf on the grid."""
    j0 = int(math.floor(w_s / DT + 1e-9)) + 1
    return sum(x[j0:])


def pack_wait_tails(wq, rate_per_h, k, S_max, thresholds):
    """For S = 1..S_max: dict S -> {w: P(W_pack > w)} averaged over the k order positions in a batch.
    W_pack = max(0, T_PAD + D + Wq - Gamma(m, batch rate)), m = ceil((S - p) / k)."""
    lam_b = rate_per_h / k / 3600.0
    m_max = -(-S_max // k)
    x = [0.0] * (NP + ND) + wq
    by_m = {}
    for m in range(1, m_max + 1):
        x, _ = sub_exp(x, lam_b)
        x = trim(x)
        by_m[m] = {w: tail(x, w) for w in thresholds}
    out = {}
    for S in range(1, S_max + 1):
        ms = [-(-(S - p) // k) for p in range(k)]
        out[S] = {w: sum(by_m[m][w] for m in ms if m >= 1) / k for w in thresholds}
    return out


def sim_charger_mean_wait(rate_per_h, k, seeds=5, orders=200000, c=CH):
    """Direct FIFO simulation of the charger queue alone: Dep_n = max(t_n, Dep_{n-c}) + D."""
    tot, n = 0.0, 0
    for s in range(seeds):
        rng = random.Random(1000 + s)
        lam_b = rate_per_h / k / 3600.0
        dep = [0.0] * c
        t = 0.0
        for b in range(orders // k):
            t += rng.expovariate(lam_b)
            for _ in range(k):
                i = (b * k + _) % c  # cyclic: departures are in arrival order
                start = max(t, dep[i])
                if b > orders // k // 5:
                    tot += start - t
                    n += 1
                dep[i] = start + D
    return tot / n


def sim_stats(rate, k, S, seeds=5, orders=40000):
    """(P(W > 0), P(W > 300 s), p95 as 6c computes it) from 6i's copy of 6c's simulator."""
    w = []
    for s in range(seeds):
        w += a6i.sim_waits(rate, k, S, orders // k, s)[0]
    w.sort()
    n = len(w)
    return (sum(1 for v in w if v > 1e-6) / n, sum(1 for v in w if v > 300.0) / n, w[int(0.95 * n)])


def main():
    t0 = time.time()
    lim = CH * 3600 / D
    print("Milestone 6j: analytic waiting-time tail (M^X/D/c charger wait + cyclic pack pool) against the 6c simulator")
    print(f"hub: {PADS} pads, {CH} chargers, charge {D:.0f} s, swap+load {T_PAD:.0f} s, limit {lim:.2f} flights/h, grid {DT:.0f} s")
    worst_p1, worst_p3, rows = 0.0, 0.0, []
    for load in (0.7, 0.85):
        rate = load * lim
        for k in (1, 2, 4, 8):
            wq, its = charger_wait_pmf(rate, k)
            sim_wq = sim_charger_mean_wait(rate, k)
            p_out = a6i.outstanding_pmf(rate, k)
            en = a6i.mean(p_out)
            S_max = 120
            tails = pack_wait_tails(wq, rate, k, S_max, (0.0, 300.0))
            S_a = next((S for S in range(1, S_max + 1) if tails[S][300.0] <= 0.05), None)
            print(f"\nload {load:.0%} ({rate:.2f}/h), k={k}: charger mean wait analytic {pmf_mean(wq):.1f} s "
                  f"({its} iterations), direct sim {sim_wq:.1f} s, rel diff {(pmf_mean(wq) - sim_wq) / sim_wq:+.4f}; E[N_out] {en:.2f}")
            print("  S  | P(W>0) tail | P(W>0) 6i | P(W>300) analytic | simulated | diff    | sim P(W>0) | sim p95 (s)")
            s_first = None
            lo = max(int(math.ceil(en)), 1)
            hi = (S_a or S_max) + 3
            for S in range(lo, hi + 1):
                p0 = tails[S][0.0]
                p0_6i = a6i.wait_share(p_out, S, k)
                worst_p1 = max(worst_p1, abs(p0 - p0_6i))
                sw0, sw300, p95 = sim_stats(rate, k, S)
                if s_first is None and p95 <= 300.0:
                    s_first = S
                d = tails[S][300.0] - sw300
                if 0.01 <= sw300 <= 0.3 and S >= en + 2:
                    worst_p3 = max(worst_p3, abs(d))
                print(f"  {S:3d} | {p0:11.4f} | {p0_6i:9.4f} | {tails[S][300.0]:17.4f} | {sw300:9.4f} | {d:+.4f} | {sw0:10.4f} | {p95:9.0f}")
                if s_first is not None and S >= (S_a or 0) + 1:
                    break
            rows.append((load, k, S_a, s_first, (pmf_mean(wq) - sim_wq) / sim_wq))
            print(f"  smallest S with p95 wait <= 300 s: analytic {S_a}, simulated {s_first}")
    print("\nSummary")
    print(f"  P1 worst |P(W>0) from the tail - 6i wait share|: {worst_p1:.4f}")
    print(f"  P3 worst |analytic - simulated P(W>300 s)| where simulated in [0.01, 0.3] and S >= E[N_out]+2: {worst_p3:.4f}")
    for load, k, sa, ss, rd in rows:
        d = "n/a" if sa is None or ss is None else f"{sa - ss:+d}"
        print(f"  P2/P4 load {load:.0%} k={k}: analytic {sa}, simulated {ss} (diff {d})")
    for load, k, sa, ss, rd in rows:
        print(f"  P5 load {load:.0%} k={k}: charger mean wait rel diff {rd:+.4f}")
    print(f"  runtime {time.time() - t0:.0f} s (mostly the simulator)")


if __name__ == "__main__":
    main()
