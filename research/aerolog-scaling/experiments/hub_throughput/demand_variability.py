"""Milestone 6l: does measured day-to-day demand variability change the hub's spare-pack count, and can the exact rule carry it?

6k sized the pack pool from an exact time-varying rule, but with one fixed daily profile: every day was the mean day,
and the only randomness was Poisson orders within it. Real on-demand demand also moves from day to day (weather,
events, the week's level) and within the day (a busy evening). Those are fluctuations of the *rate*, so orders form a
doubly stochastic (Cox) process, more variable than Poisson over the hours that build 6k's evening backlog.

Data: Uber pickups in New York City, Apr to Sep 2014 (FiveThirtyEight FOIL release of NYC TLC data, CC BY 4.0;
`uber_nyc_extract.py` -> `uber_nyc_counts.json`). Ride-hail again, not delivery orders: it stands in for an
on-demand service's rate variability, as Chicago stood in for its shape in 6f/6k. Weekdays only (Mon to Fri).
Primary catchment, fixed before the data was opened: the busiest 2.2 x 2.1 km grid cell ("cell1"); the whole city
is the comparison.

Measurement. For weekday d: level L_d = median weekday total within +-10 days (d excluded), day-of-week factor f
(mean of total/L by weekday), day multiplier M_d = total_d / (L_d f). Hourly share s_h (weekday mean of N_dh /
total_d) and within-day ratio r_dh = N_dh / (total_d s_h). Variances are reported with the Poisson part removed
(var - mean of 1/expected count). Trend and weekday are taken out because a planner would forecast them.

Hub. 6k's hub (8 pads, 8 chargers, 42 min charge, 180 s swap and load, limit 11.43 flights/h), single orders
(k = 1), mean weekday load 70% and 85% of the limit. A day's order rate in 15-minute bin b is
lambda * shape_b * M_d * r_{d,hour(b)}, with shape the weekday mean 15-minute profile of the catchment and lambda
set so that the mean over observed days hits the load. Simulator: 6k's heap simulator, 1,000 seeds x 8 days, each
day an observed weekday drawn at random, time-varying Poisson orders within its bins, days 2 to 8 scored.
Target p95 wait <= 300 s over all scored orders (as 6c to 6k).
Rules: R0 = 6k's rule on the mean shape (ignores rate variability). R1 = mixture over observed days: for each
weekday d, 6k's exact rule over two days (the mean day, then day d), tail for day-2 orders, averaged with order
weights. R1 is exact for the Cox process if the queue empties overnight; it ignores carry-over from a busy
previous day. R1M = R1 with the day multiplier only (r = 1).

Predictions (written before the counts or variances were computed):
 (1) Day multiplier, Poisson-debiased CV for cell1 between 0.05 and 0.15; the city's CV smaller than cell1's.
 (2) Within-day hourly ratio over-dispersed: debiased CV of r_dh, averaged over 07:00 to 23:00, at least 0.07 for
     cell1, with lag-1 (hour to next hour) correlation of r_dh - 1 above 0.3.
 (3) R0 under-provisions: at 85% load the simulator needs at least 3 more packs than R0 (cell1).
 (4) R1 is within 1 pack of the simulator at both loads (cell1).
 (5) The day multiplier carries most of it: R1M within 1 pack of R1 at both loads (cell1).
 (6) Bad days: at the pooled count, more than 5% of simulated days miss the p95 target themselves; sizing so that
     95% of days meet it (R1, per-day expected tail) needs at least 5 more packs than the pooled count at 85% load.
Sensitivity, fixed in advance: R1 without the three federal holidays in the window (2014-05-26, 07-04, 09-01).
Preliminary.
"""
import heapq
import json
import math
import os
import random
import statistics
import sys
import time
from datetime import date
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import analytic_trace_tail as k6  # noqa: E402

T_PAD, D, PADS, CH, G, BIN = k6.T_PAD, k6.D, k6.PADS, k6.CH, k6.G, k6.BIN
LIM = CH * 3600 / D
W = 300.0
S_MAX = 300
SEEDS = 1000
SIM_DAYS = 8
HOLIDAYS = {"2014-05-26", "2014-07-04", "2014-09-01"}


# ---------- measurement ----------

def load(catchment):
    data = json.load(open(os.path.join(HERE, "uber_nyc_counts.json")))
    return data[catchment]["days"]


def weekdays(days):
    return sorted(d for d in days if date.fromisoformat(d).weekday() < 5)


def decompose(days):
    """Day multiplier M_d, hourly ratio r_dh, 15-min shape (mean 1) and the debiased statistics, weekdays only."""
    wd = weekdays(days)
    tot = {d: sum(days[d]) for d in wd}
    level = {}
    for d in wd:
        x = date.fromisoformat(d)
        near = [tot[e] for e in wd if e != d and abs((date.fromisoformat(e) - x).days) <= 10]
        level[d] = statistics.median(near)
    f = {}
    for w in range(5):
        v = [tot[d] / level[d] for d in wd if date.fromisoformat(d).weekday() == w]
        f[w] = sum(v) / len(v)
    exp_tot = {d: level[d] * f[date.fromisoformat(d).weekday()] for d in wd}
    M = {d: tot[d] / exp_tot[d] for d in wd}
    hours = {d: [sum(days[d][4 * h:4 * h + 4]) for h in range(24)] for d in wd}
    s = [sum(hours[d][h] / tot[d] for d in wd) / len(wd) for h in range(24)]
    r = {d: [hours[d][h] / (tot[d] * s[h]) for h in range(24)] for d in wd}
    shape = [sum(days[d][b] / tot[d] for d in wd) / len(wd) * 96 for b in range(96)]
    mv = list(M.values())
    var_M = statistics.pvariance(mv) - sum(1 / exp_tot[d] for d in wd) / len(wd)
    cv_r = []
    for h in range(7, 24):
        v = [r[d][h] for d in wd]
        cv_r.append(math.sqrt(max(statistics.pvariance(v) - sum(1 / (tot[d] * s[h]) for d in wd) / len(wd), 0.0)))
    xs = [(r[d][h] - 1, r[d][h + 1] - 1) for d in wd for h in range(7, 23)]
    mx = sum(a for a, _ in xs) / len(xs); my = sum(b for _, b in xs) / len(xs)
    cov = sum((a - mx) * (b - my) for a, b in xs)
    rho1 = cov / math.sqrt(sum((a - mx) ** 2 for a, _ in xs) * sum((b - my) ** 2 for _, b in xs))
    stats = {"n_days": len(wd), "cv_M": math.sqrt(max(var_M, 0.0)), "cv_M_raw": statistics.pstdev(mv),
             "M_min": min(mv), "M_max": max(mv), "M_min_day": min(M, key=M.get), "M_max_day": max(M, key=M.get),
             "cv_r_day": sum(cv_r) / len(cv_r), "rho1": rho1, "mean_tot": sum(tot.values()) / len(wd),
             "peak_to_mean": max(shape)}
    return wd, M, r, shape, stats


def patterns(wd, M, r, use_r=True):
    """Relative rate per 15-min bin for each weekday: M_d * r_{d,hour}."""
    return {d: [M[d] * (r[d][b // 4] if use_r else 1.0) for b in range(96)] for d in wd}


def lam_scale(shape, pats, load_):
    """Per-hour rate multiplier so the mean over days of the daily mean rate is load * LIM."""
    mean_rel = sum(sum(shape[b] * p[b] for b in range(96)) / 96 for p in pats.values()) / len(pats)
    return load_ * LIM / mean_rel


# ---------- rules ----------

def day2_tails(args):
    """6k's exact rule over two days (mean day, then the given day); expected orders and order-weighted tail
    sum over day-2 orders, for S = 1..S_MAX."""
    shape, lam, pat = args
    bins = [lam * shape[b] for b in range(96)] + [lam * shape[b] * pat[b] for b in range(96)]
    rate = k6.Rate(bins)
    nq = k6.nq_path(rate, 1)
    trim = rate.F(86400.0) / rate.cum[-1]
    S_list = list(range(1, S_MAX + 1))
    tl = k6.order_tails(rate, 1, nq, W, S_list, trim=trim)
    n2 = rate.L(86400.0, 2 * 86400.0)
    return n2, tl


def mixture(pool, shape, lam, pats):
    days = sorted(pats)
    out = pool.map(day2_tails, [(shape, lam, pats[d]) for d in days])
    tot = sum(n for n, _ in out)
    pooled = {S: sum(n * tl[S] for n, tl in out) / tot for S in range(1, S_MAX + 1)}
    per_day = {d: tl for d, (n, tl) in zip(days, out)}
    return pooled, per_day


def smallest(tl):
    return next((S for S in sorted(tl) if tl[S] <= 0.05), None)


def smallest_days(per_day, share=0.95):
    """Smallest S at which at least `share` of days have an expected P(W > 300 s) <= 0.05."""
    n = len(per_day)
    for S in range(1, S_MAX + 1):
        if sum(1 for tl in per_day.values() if tl[S] <= 0.05) >= share * n:
            return S
    return None


# ---------- simulator ----------

def sim_job(args):
    shape, lam, pats, S, seed0, seeds = args
    names = sorted(pats)
    waits, per_seed, day_fail, day_n = [], [], 0, 0
    for sd in range(seed0, seed0 + seeds):
        rng = random.Random(7919 * sd + 3)
        seq = [pats[rng.choice(names)] for _ in range(SIM_DAYS)]
        ts = []
        for dd, p in enumerate(seq):
            for b in range(96):
                lam_s = lam * shape[b] * p[b] / 3600.0
                if lam_s <= 0:
                    continue
                t = dd * 86400 + b * BIN
                end = t + BIN
                while True:
                    t += rng.expovariate(lam_s)
                    if t >= end:
                        break
                    ts.append(t)
        pad = [0.0] * PADS; chg = [0.0] * CH; pack = [0.0] * S
        pop, push = heapq.heappop, heapq.heappush
        hit = [0] * SIM_DAYS; cnt = [0] * SIM_DAYS
        w_seed = []
        for t in ts:
            p_free = pop(pad); k_ready = pop(pack)
            start = max(t, p_free, k_ready); end = start + T_PAD
            c_free = pop(chg)
            done = max(end, c_free) + D
            push(chg, done); push(pack, done); push(pad, end)
            dd = int(t // 86400)
            if dd >= 1:
                w = start - t
                w_seed.append(w)
                cnt[dd] += 1
                hit[dd] += w > W
        per_seed.append(sum(1 for v in w_seed if v > W) / len(w_seed))
        waits += w_seed
        for dd in range(1, SIM_DAYS):
            day_n += 1
            day_fail += hit[dd] > 0.05 * cnt[dd]
    return S, waits, per_seed, day_fail, day_n


def sim_at(pool, shape, lam, pats, S):
    chunks = 4
    out = pool.map(sim_job, [(shape, lam, pats, S, i * SEEDS // chunks, SEEDS // chunks) for i in range(chunks)])
    waits = sorted(v for o in out for v in o[1])
    per_seed = [v for o in out for v in o[2]]
    n = len(waits)
    return {"p95": waits[int(0.95 * n)], "tail": sum(1 for v in waits if v > W) / n,
            "se": statistics.stdev(per_seed) / math.sqrt(len(per_seed)),
            "day_fail": sum(o[3] for o in out) / sum(o[4] for o in out)}


def sim_smallest(pool, shape, lam, pats, guess):
    res = {}
    S = max(guess, 1)
    # walk down while passing, up while failing
    while True:
        res[S] = sim_at(pool, shape, lam, pats, S)
        if res[S]["p95"] <= W:
            if S - 1 < 1:
                break
            if S - 1 in res and res[S - 1]["p95"] > W:
                break
            S -= 1
        else:
            if S + 1 in res and res[S + 1]["p95"] <= W:
                S += 1
                break
            S += 1
    first = min(s for s in res if res[s]["p95"] <= W)
    for extra in (first - 1, first + 1):  # neighbours for the table
        if extra >= 1 and extra not in res:
            res[extra] = sim_at(pool, shape, lam, pats, extra)
    return first, res


def main():
    t0 = time.time()
    print("Milestone 6l: hub spare packs under measured day-to-day and within-day demand variability "
          "(Uber NYC pickups, weekdays Apr to Sep 2014)")
    print(f"hub: {PADS} pads, {CH} chargers, charge {D:.0f} s, swap+load {T_PAD:.0f} s, limit {LIM:.2f} flights/h; "
          f"k = 1; target p95 wait <= {W:.0f} s; simulator {SEEDS} seeds x {SIM_DAYS} days (days 2-{SIM_DAYS} scored)")
    dec = {}
    print("\n== P1, P2. Rate variability (weekdays; trend and weekday removed; Poisson part removed)")
    print("  catchment | days | pickups/day | CV(M) debiased (raw) | M min (day) .. max (day) | "
          "CV(r) 07-23h | lag-1 corr | 15-min peak/mean")
    for c in ("city", "cell1", "cell2", "cell3", "cell4", "cell5"):
        wd, M, r, shape, st = decompose(load(c))
        dec[c] = (wd, M, r, shape)
        print(f"  {c:9s} | {st['n_days']:4d} | {st['mean_tot']:11.0f} | {st['cv_M']:.4f} ({st['cv_M_raw']:.4f}) | "
              f"{st['M_min']:.3f} ({st['M_min_day']}) .. {st['M_max']:.3f} ({st['M_max_day']}) | "
              f"{st['cv_r_day']:.4f} | {st['rho1']:+.3f} | {st['peak_to_mean']:.2f}")

    rows = []
    with Pool(4) as pool:
        for c in ("cell1", "city"):
            wd, M, r, shape = dec[c]
            full = patterns(wd, M, r, True)
            monly = patterns(wd, M, r, False)
            for ld in (0.7, 0.85):
                lam = lam_scale(shape, full, ld)
                lam_m = lam_scale(shape, monly, ld)
                lam0 = ld * LIM / (sum(shape) / 96)
                n0, t_r0 = day2_tails((shape, lam0, [1.0] * 96))
                S0 = smallest(t_r0)
                p1, pd1 = mixture(pool, shape, lam, full)
                S1 = smallest(p1)
                S1d = smallest_days(pd1)
                pm, _ = mixture(pool, shape, lam_m, monly)
                S1M = smallest(pm)
                S1h = None
                if c == "cell1":
                    noh = {d: v for d, v in full.items() if d not in HOLIDAYS}
                    ph, _ = mixture(pool, shape, lam_scale(shape, noh, ld), noh)
                    S1h = smallest(ph)
                Ss, res = sim_smallest(pool, shape, lam, full, S1)
                Ss0 = None
                if c == "cell1":
                    Ss0, res0 = sim_smallest(pool, shape, lam0, {"mean": [1.0] * 96}, S0)
                peak = max(lam * shape[b] * p[b] for p in full.values() for b in range(96))
                print(f"\n== {c}, load {ld:.0%} (mean {ld * LIM:.2f}/h; busiest observed bin {peak:.2f}/h)")
                print("  S   | R1 P(W>300) | sim P(W>300) | sim se | diff    | sim p95 (s) | sim share of days missing p95")
                for S in sorted(res):
                    v = res[S]
                    print(f"  {S:3d} | {p1[S]:11.4f} | {v['tail']:12.4f} | {v['se']:.4f} | {p1[S] - v['tail']:+.4f} | "
                          f"{v['p95']:11.0f} | {v['day_fail']:.3f}")
                if Ss0 is not None:
                    print("  mean-shape check (no rate variability): S | R0 P(W>300) | sim P(W>300) | sim se")
                    for S in sorted(res0):
                        print(f"    {S:3d} | {t_r0[S]:.4f} | {res0[S]['tail']:.4f} | {res0[S]['se']:.4f}")
                share_days_S1 = sum(1 for tl in pd1.values() if tl[S1] > 0.05) / len(pd1)
                print(f"  smallest S with p95 <= 300 s: R0 (mean shape) {S0}, R1 (mixture) {S1}, R1M (day multiplier only) "
                      f"{S1M}, simulator {Ss}" + (f", simulator on the mean shape {Ss0}" if Ss0 is not None else "")
                      + (f"; R1 without holidays {S1h}" if S1h is not None else ""))
                print(f"  R1 at S={S1}: {share_days_S1:.3f} of observed days have expected P(W>300) > 0.05; "
                      f"95% of days meet it at S = {S1d}")
                rows.append((c, ld, S0, S1, S1M, S1h, Ss, Ss0, S1d, res[Ss]["day_fail"]))

    print("\nSummary")
    for c, ld, S0, S1, S1M, S1h, Ss, Ss0, S1d, dfail in rows:
        print(f"  {c} {ld:.0%}: R0 {S0}, R1 {S1}, R1M {S1M}, simulator {Ss} (sim on mean shape {Ss0}); "
              f"R1 no-holiday {S1h}; 95%-of-days (R1) {S1d}; sim share of days missing at S={Ss}: {dfail:.3f}")
    print(f"  runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
