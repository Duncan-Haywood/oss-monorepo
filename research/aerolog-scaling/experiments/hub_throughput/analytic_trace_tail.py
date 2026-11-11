"""Milestone 6k: does an exact time-varying version of the analytic rule size the hub's packs under a daily demand profile?

6i and 6j size the spare-pack pool from stationary queueing formulas, which need a constant order rate. 6f's
daily profile (Chicago ride-hail shape) peaks at 1.76x its mean, above the 11.4 flights/h charger limit at both
70% and 85% mean load, so a stationary formula has no answer at the peak. The usual fix, the pointwise-stationary
approximation (PSA: apply the stationary formula bin by bin), breaks down there too.

Derivation (same no-feedback, no-pad-wait model as 6i/6j; any time-varying Poisson stream of fixed batches).
Depleted packs reach the chargers T_PAD after their order and are charged FIFO for a fixed D, so packs become
ready in order-arrival order and order n gets the pack freed by order n - S. Hence an order at time t waits more
than w iff at least S packs of *earlier* orders are still not ready at u = t + w. For 0 <= w < D + T_PAD those packs
are (a) every pack of an order in (u - D - T_PAD, t), which cannot be ready before u, plus (b) the survivors at u of
the packs at the chargers at time u - D, which are exactly max(N_q(u - D) - c, 0). So

    P(W > w | order at t, batch position p) = P( max(N_q(t + w - D) - c, 0) + A(t + w - D - T_PAD, t) + p >= S ),

with the two terms independent (disjoint stretches of a Poisson stream). N_q, the count at the chargers, obeys
the time-indexed recursion N_q(s) = max(N_q(s - D) - c, 0) + A(s - D - T_PAD, s - T_PAD], valid for any arrival
process. Both are pmf convolutions with Poisson counts of the integrated rate: no simulation, no stationarity, no
grid in the waiting time (only in the order time t, here 60 s). At constant rate it is a third derivation of 6i/6j.

Predictions (written before the first run):
 (1) Consistency: at a constant rate the rule's long-run P(W > 0) and P(W > 300 s) at the stationary p95 count are
     within 0.003 of 6i's wait share and 6j's tail, for k = 1 and 4 at 70% and 85% of the charger limit.
 (2) Daily profile (Wed 2019-10-09 and Sat 2019-10-12 shapes, 4 days, 6f's warm-up trim), time-varying Poisson
     orders, k = 1: the rule's smallest S with p95 wait <= 300 s is within 2 packs of the simulator (6f's run(),
     1-pack grid, 100 seeds pooled) at both loads.
 (3) Same with batches of k = 4 (batch epochs time-varying Poisson at rate lambda(t)/4): within 3 packs.
 (4) The rule is never below the simulator (it errs conservative in the design region, as 6j found).
 (5) PSA has no finite answer in any case (some bin's rate is at or above the charger limit), and the
     stationary count at the daily mean rate (6j) understates the trace count by at least 4 packs at 85%, k = 1.
 (6) 6f's own arrival generator (bin counts rounded to an integer, spread uniformly in the bin; less variable than
     Poisson) needs no more packs than time-varying Poisson orders, and at most 3 fewer.
Inputs as 6c/6f: vendor swap and charge figures (run.py), Chicago open-data trip counts as the shape of an
on-demand service's day (not delivery orders), batch size swept, not measured. Preliminary.

Added after the first run (the predictions above are unchanged): 100 seeds proved far too few for batches (the
k = 4 counts moved by up to 6 packs on fresh seeds), so the simulator now pools 2,000 seeds for k = 1 and 4,000 for
k = 4, prints the standard error across seeds, and uses heaps for its earliest-free choices (identical waits).
The first run's numbers are kept in LOG.md (6k, process note).
"""
import heapq
import math
import os
import statistics
import random
import sys
import time
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import analytic_spares as a6i  # noqa: E402
import analytic_wait_tail as a6j  # noqa: E402
import cargo_hub_trace as h6f  # noqa: E402

T_PAD, D, PADS, CH = a6i.T_PAD, a6i.D, a6i.PADS, a6i.CH
assert h6f.T_PAD == T_PAD and h6f.T_CHG == D
G = 60.0                    # order-time grid, s; divides T_PAD, D, 300 s and the 900 s bins
BIN = 900.0
DAYS = 4                    # as 6f
NMAX = 500
W_TARGET = 300.0
SEEDS = {1: 2000, 4: 4000}  # by batch size; raised from 100 after the first run (see LOG, 6k)


def poisson_pmf(mu, nmax=NMAX):
    p = [0.0] * (nmax + 1)
    p[0] = math.exp(-mu)
    for n in range(1, nmax + 1):
        p[n] = p[n - 1] * mu / n
        if p[n] < 1e-300 and n > mu:
            break
    return p


def batch_count_pmf(mu_b, k, nmax=NMAX):
    """Orders in a window whose batch count is Poisson(mu_b), k orders per batch."""
    q = poisson_pmf(mu_b, nmax // k)
    p = [0.0] * (nmax + 1)
    for j, v in enumerate(q):
        if j * k <= nmax:
            p[j * k] = v
    return p


def conv(a, b, nmax=NMAX):
    bs = [(j, y) for j, y in enumerate(b) if y > 1e-18]
    out = [0.0] * (nmax + 1)
    for i, x in enumerate(a):
        if x < 1e-18:
            continue
        for j, y in bs:
            if i + j > nmax:
                break
            out[i + j] += x * y
    return out


def shift_down(p, c):
    out = [0.0] * len(p)
    for i, x in enumerate(p):
        out[max(i - c, 0)] += x
    return out


class Rate:
    """Order rate piecewise constant on 900 s bins over DAYS days (per hour in `per_h`); exact integrals."""

    def __init__(self, per_h_bins):
        self.r = [v / 3600.0 for v in per_h_bins]
        cum = [0.0]
        for v in self.r:
            cum.append(cum[-1] + v * BIN)
        self.cum = cum
        self.T = BIN * len(self.r)

    def F(self, t):
        if t <= 0:
            return 0.0
        if t >= self.T:
            return self.cum[-1]
        b = int(t // BIN)
        return self.cum[b] + self.r[b] * (t - b * BIN)

    def L(self, a, b):
        return max(self.F(b) - self.F(a), 0.0)

    def at(self, t):
        return self.r[min(int(t // BIN), len(self.r) - 1)] if t >= 0 else 0.0


def nq_path(rate, k, c=CH):
    """pmf of N_q(s) at every grid time s = 0, G, ..., T (system empty at 0, no orders before 0)."""
    n = int(round(rate.T / G)) + 1
    step = int(round(D / G))
    out = []
    for i in range(n):
        s = i * G
        mu_b = rate.L(s - D - T_PAD, s - T_PAD) / k
        a = batch_count_pmf(mu_b, k)
        prev = out[i - step] if i >= step else [1.0] + [0.0] * NMAX
        out.append(conv(shift_down(prev, c), a))
    return out


def tail_from(p):
    t = [0.0] * (len(p) + 1)
    for i in range(len(p) - 1, -1, -1):
        t[i] = t[i + 1] + p[i]
    return t


def order_tails(rate, k, nq, w, S_list, trim=0.2):
    """Order-weighted P(W > w) for each S, over orders after the first `trim` share of expected orders."""
    step_w = int(round(w / G))
    stepD = int(round(D / G))
    tot = rate.cum[-1]
    acc = {S: 0.0 for S in S_list}
    wsum = 0.0
    n = len(nq)
    for i in range(n - 1):
        t = (i + 0.5) * G  # midpoint of the cell, weight = expected orders in it
        wt = rate.L(i * G, (i + 1) * G)
        if wt <= 0 or rate.F(t) < trim * tot:
            continue
        # N_q at u - D = t + w - D, linear in grid index: use the cell's left point (i) and right point (i+1) averaged
        vals = {S: 0.0 for S in S_list}
        for j in (i, i + 1):
            tj = j * G
            jq = j + step_w - stepD
            base = shift_down(nq[jq], CH) if jq >= 0 else [1.0] + [0.0] * NMAX
            mu_b = rate.L(tj + w - D - T_PAD, tj) / k
            y = conv(base, batch_count_pmf(mu_b, k))
            tl = tail_from(y)
            for S in S_list:
                # batch position p = 0..k-1 adds p earlier orders of the same batch
                vals[S] += sum(tl[max(S - p, 0)] if S - p < len(tl) else 0.0 for p in range(k)) / k / 2
        for S in S_list:
            acc[S] += wt * vals[S]
        wsum += wt
    return {S: acc[S] / wsum for S in S_list}


def smallest_S(tails):
    return next((S for S in sorted(tails) if tails[S] <= 0.05), None)


# ---------- simulation (6f's hub logic: pads, chargers, pack pool, feedback) ----------

def nhpp_batches(rate, k, rng):
    """Batch epochs of a time-varying Poisson process (rate/k), by thinning per bin, k orders each."""
    ts = []
    for b, r in enumerate(rate.r):
        lam = r / k
        if lam <= 0:
            continue
        t = b * BIN
        end = t + BIN
        while True:
            t += rng.expovariate(lam)
            if t >= end:
                break
            ts.extend([t] * k)
    return ts


def sim_p95(args):
    gen, counts, mean_h, k, S, seeds = args
    rate = trace_rate(counts, mean_h) if counts is not None else None
    waits, per_seed = [], []
    for sd in range(seeds):
        rng = random.Random(10007 * sd + 17)
        if gen == "poisson":
            ts = nhpp_batches(rate, k, rng)
        else:
            ts = h6f.arrivals(counts, mean_h, "uniform", rng, DAYS)
        w = sim_waits(ts, S)
        per_seed.append(sum(1 for v in w if v > W_TARGET) / len(w))
        waits += w
    waits.sort()
    n = len(waits)
    se = statistics.stdev(per_seed) / math.sqrt(seeds)  # standard error of P(W > 300 s) across seeds
    return S, waits[int(0.95 * n)], sum(1 for v in waits if v > W_TARGET) / n, se


def sim_waits(ts, spares):
    """6f's run(), returning the warm-up-trimmed waits instead of (mean, p95) so seeds can be pooled."""
    # Same choices as run(): earliest-free pad, earliest-ready pack, earliest-free charger; kept in heaps
    # (equal values are interchangeable, so the waits are identical; test_hub_throughput checks it).
    pad = [0.0] * PADS; chg = [0.0] * CH; pack = [0.0] * spares
    waits = []
    pop, push = heapq.heappop, heapq.heappush
    for t in ts:
        p_free = pop(pad)
        k_ready = pop(pack)
        start = max(t, p_free, k_ready); end = start + T_PAD
        c_free = pop(chg)
        done = max(end, c_free) + D
        push(chg, done); push(pack, done); push(pad, end)
        waits.append(start - t)
    return waits[len(waits) // 5:]


def trace_rate(counts, mean_h):
    scale = mean_h * 24 / sum(counts)
    return Rate([c * scale * 4 for c in counts] * DAYS)  # per-hour rate in each 15-min bin


def sim_smallest(pool, gen, counts, mean_h, k, guess, seeds=None):
    """Smallest S with pooled p95 <= 300 s, scanning a 1-pack window around the rule's answer."""
    seeds = seeds or SEEDS[k]
    lo, hi = max(guess - 5, 1), guess + 5
    res = dict((S, (p95, f, se)) for S, p95, f, se in pool.map(sim_p95, [(gen, counts, mean_h, k, S, seeds) for S in range(lo, hi + 1)]))
    ok = [S for S in sorted(res) if res[S][0] <= W_TARGET]
    first = ok[0] if ok else None
    if first == lo and lo > 1:
        return sim_smallest(pool, gen, counts, mean_h, k, lo - 6, seeds)
    if first is None:  # window too low: move it up
        return sim_smallest(pool, gen, counts, mean_h, k, hi + 8, seeds)
    return first, res


def psa(rate_bins_h, k, lim):
    """Pointwise-stationary: finite only if every bin's rate is below the charger limit."""
    over = [r for r in rate_bins_h if r >= lim]
    return len(over), max(rate_bins_h)


def main():
    t0 = time.time()
    lim = CH * 3600 / D
    days = h6f.load_profile()
    print("Milestone 6k: exact time-varying analytic rule (time-indexed charger count + cyclic pack pool) "
          "against 6f's simulator under the Chicago daily profile")
    print(f"hub: {PADS} pads, {CH} chargers, charge {D:.0f} s, swap+load {T_PAD:.0f} s, limit {lim:.2f} flights/h; "
          f"order-time grid {G:.0f} s; {DAYS} days, first 20% of orders trimmed; target p95 wait <= {W_TARGET:.0f} s; "
          f"simulator seeds pooled: {SEEDS[1]} (k=1), {SEEDS[4]} (k=4); se = standard error across seeds")

    # (1) constant-rate consistency with 6i / 6j
    print("\n== P1. Constant rate: this rule (4 days from empty, trimmed) against 6i's share and 6j's tail")
    print("  load | k | S  | P(W>0) here | 6i     | P(W>300) here | 6j     | |diff| max")
    worst1 = 0.0
    for load in (0.7, 0.85):
        rate_h = load * lim
        for k in (1, 4):
            r = Rate([rate_h] * int(DAYS * 86400 / BIN))
            nq = nq_path(r, k)
            wq, _ = a6j.charger_wait_pmf(rate_h, k)
            j6 = a6j.pack_wait_tails(wq, rate_h, k, 60, (0.0, 300.0))
            S_st = next(S for S in range(1, 61) if j6[S][300.0] <= 0.05)
            t0_ = order_tails(r, k, nq, 0.0, [S_st])[S_st]
            t3_ = order_tails(r, k, nq, 300.0, [S_st])[S_st]
            s6i = a6i.wait_share(a6i.outstanding_pmf(rate_h, k), S_st, k)
            d = max(abs(t0_ - s6i), abs(t3_ - j6[S_st][300.0]))
            worst1 = max(worst1, d)
            print(f"  {load:.0%}  | {k} | {S_st:2d} | {t0_:11.4f} | {s6i:.4f} | {t3_:13.4f} | {j6[S_st][300.0]:.4f} | {d:.4f}")
    print(f"  P1 worst |diff|: {worst1:.4f}")

    rows, diffs = [], []
    with Pool(4) as pool:
        for load in (0.7, 0.85):
            mean_h = load * lim
            for k in (1, 4):
                wq, _ = a6j.charger_wait_pmf(mean_h, k)
                j6 = a6j.pack_wait_tails(wq, mean_h, k, 120, (300.0,))
                s_mean = next(S for S in range(1, 121) if j6[S][300.0] <= 0.05)
                for day, counts in days.items():
                    rate = trace_rate(counts, mean_h)
                    bins_h = [c * mean_h * 24 / sum(counts) * 4 for c in counts]
                    n_over, peak = psa(bins_h, k, lim)
                    nq = nq_path(rate, k)
                    S_list = list(range(1, 141))
                    tl = order_tails(rate, k, nq, W_TARGET, S_list)
                    S_a = smallest_S(tl)
                    S_s, res = sim_smallest(pool, "poisson", counts, mean_h, k, S_a)
                    S_6f = None
                    if k == 1:
                        S_6f, res6f = sim_smallest(pool, "6f", counts, mean_h, k, S_s or S_a)
                    rows.append((load, k, day, S_a, S_s, S_6f, s_mean, n_over, peak))
                    print(f"\n== load {load:.0%} ({mean_h:.2f}/h mean), k={k}, day {day}: peak bin {peak:.2f}/h, "
                          f"{n_over} of {len(bins_h)} bins at or above the {lim:.2f}/h limit (PSA undefined there)")
                    print("  S  | rule P(W>300) | sim P(W>300) | sim se | diff    | sim p95 (s)")
                    for S in sorted(res):
                        print(f"  {S:3d} | {tl[S]:13.4f} | {res[S][1]:12.4f} | {res[S][2]:.4f} | {tl[S] - res[S][1]:+.4f} | {res[S][0]:8.0f}")
                        diffs.append((k, tl[S] - res[S][1], res[S][2]))
                    print(f"  smallest S with p95 <= 300 s: rule {S_a}, simulator (Poisson orders) {S_s}"
                          + (f", simulator (6f generator) {S_6f}" if k == 1 else "")
                          + f"; stationary at the mean rate (6j) {s_mean}")
        # time-of-day profile for the figure: Wed, 85%, k=1, at the rule's S
        load, k = 0.85, 1
        mean_h = load * lim
        counts = days["2019-10-09"]
        rate = trace_rate(counts, mean_h)
        nq = nq_path(rate, k)
        S_fig = [r for r in rows if r[0] == load and r[1] == k and r[2] == "2019-10-09"][0][3]
        print(f"\n== Time of day. Wed profile, 85% mean load, k=1, S={S_fig}: hourly order rate and P(wait > 300 s) "
              "for orders in that hour on day 4, rule and simulator (2000 seeds)")
        sim_hour = sim_by_hour(counts, mean_h, S_fig)
        print("  hour | rate (/h) | rule P(W>300) | sim P(W>300)")
        for h in range(24):
            t_a = (3 * 24 + h) * 3600
            num = den = 0.0
            for i in range(int(t_a // G), int((t_a + 3600) // G)):
                wt = rate.L(i * G, (i + 1) * G)
                v = 0.0
                for j in (i, i + 1):
                    tj = j * G
                    jq = j + int(W_TARGET // G) - int(D // G)
                    y = conv(shift_down(nq[jq], CH), batch_count_pmf(rate.L(tj + W_TARGET - D - T_PAD, tj), 1))
                    v += tail_from(y)[S_fig] / 2
                num += wt * v; den += wt
            print(f"  {h:4d} | {rate.L(t_a, t_a + 3600):9.2f} | {num / den:13.4f} | {sim_hour[h]:12.4f}")

    print("\nSummary")
    print(f"  P1 worst |rule - 6i/6j| at constant rate: {worst1:.4f}")
    for load, k, day, sa, ss, s6f, sm, n_over, peak in rows:
        d = "n/a" if sa is None or ss is None else f"{sa - ss:+d}"
        extra = f", 6f generator {s6f}" if k == 1 else ""
        print(f"  load {load:.0%} k={k} {day}: rule {sa}, simulated {ss} (diff {d}){extra}; mean-rate stationary {sm}; "
              f"PSA bins over limit {n_over} (peak {peak:.2f}/h)")
    for kk in (1, 4):
        d = [x for x in diffs if x[0] == kk]
        print(f"  k={kk}: mean rule - sim P(W>300) over the scanned rows {sum(x[1] for x in d) / len(d):+.4f}, "
              f"largest |diff| / se {max(abs(x[1]) / x[2] for x in d):.1f}")
    print(f"  runtime {time.time() - t0:.0f} s")


def _hour_job(args):
    counts, mean_h, S, sd = args
    rng = random.Random(10007 * sd + 17)
    rate = trace_rate(counts, mean_h)
    ts = nhpp_batches(rate, 1, rng)
    pad = [0.0] * PADS; chg = [0.0] * CH; pack = [0.0] * S
    hit = [0] * 24; tot = [0] * 24
    for t in ts:
        i = min(range(PADS), key=pad.__getitem__)
        j = min(range(S), key=pack.__getitem__)
        start = max(t, pad[i], pack[j]); end = start + T_PAD
        c = min(range(CH), key=chg.__getitem__)
        chg[c] = max(end, chg[c]) + D
        pack[j] = chg[c]; pad[i] = end
        if t >= 3 * 86400:  # day 4, as the rule column
            h = int((t % 86400) // 3600)
            tot[h] += 1
            hit[h] += (start - t) > W_TARGET
    return hit, tot


def sim_by_hour(counts, mean_h, S, seeds=2000):
    with Pool(4) as pool:
        out = pool.map(_hour_job, [(counts, mean_h, S, sd) for sd in range(seeds)])
    hit = [sum(o[0][h] for o in out) for h in range(24)]
    tot = [sum(o[1][h] for o in out) for h in range(24)]
    return [hit[h] / tot[h] if tot[h] else 0.0 for h in range(24)]


if __name__ == "__main__":
    main()
