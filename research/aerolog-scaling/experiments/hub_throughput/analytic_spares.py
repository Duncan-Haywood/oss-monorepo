"""Milestone 6h: can a closed-form queueing rule replace the simulator for a hub's spare-pack count?

Model (6c's hub: 8 pads, 8 chargers, 1C, 20-90% window = 2520 s charge, 180 s swap+load).
Each flight takes a charged pack from a ground pool of S packs; its depleted pack reaches a charger
T_PAD = 180 s later and is ready D = 2520 s after it starts charging (FIFO, c chargers). A flight
waits for a pack iff the number of packs not ready, N_out, is at least S. If waits are rare,
N_out = N_q + N_t, where N_t (packs between pad and charger) counts the orders of the last 180 s and
N_q (packs at the chargers) the number in an M/D/c (or M^X/D/c for batches) queue fed by older orders.
The two count disjoint stretches of the arrival process, so they are independent. For deterministic
service the M/D/c count obeys an exact one-step recursion over a window of length D:
    N(t + D) = max(N(t) - c, 0) + A(t, t + D]
(everyone in service at t has left by t + D; everyone waiting at t, and everyone who arrives, is
still there). Its stationary law is found by iterating that map. Batch epochs are Poisson, so they
see the time-average state (PASTA); the i-th order of a batch of k waits iff N_out + i > S.
Feedback is ignored (a flight that waits sends its depleted pack to the charger later), so the rule
should over-state stockouts a little; pad waits are not modelled (8 pads, k <= 8).

Predictions (written before the first run):
 (1) Poisson orders (k = 1) at 70% and 85% of the 11.4 flights/h charger limit: the analytic share of
     orders that wait for a pack is within 0.02 (absolute) of the simulator's (6c's sim logic, 5 seeds of
     40,000 orders) at every S where the simulated share is between 0.01 and 0.5.
 (2) Smallest S with a waiting share <= 5% (so p95 wait = 0): analytic within 1 pack of simulated for
     k = 1, 2, 4, 8 at both loads.
 (3) The analytic share is never below the simulated share by more than 0.01 (it should err high, from
     the ignored feedback).
The rule needs no simulation: one 600-state fixed-point iteration per (load, k), about 0.5 s in pure Python
(stated as "milliseconds" before the run; timed after), stdlib only. The recursion is the one Crommelin (1932,
"Delay probability formulae when the holding times are constant", P.O. Elect. Eng. J. 25) used for M/D/c.
Inputs as 6c (vendor swap and charge figures, see run.py); batch size k swept, not measured. Preliminary.

Added after the first run (the predictions above are unchanged): the k = 8 simulated share stopped
falling near 0.05 however many packs the hub held. Those are pad waits: a second batch of 8 lands
within the 180 s pad time about 5% of the time (1 - exp(-180/3600) at 1 batch/h). So the simulator
also reports the share of orders that find no charged pack on arrival, the event the rule models.
"""
import math
import random

T_PAD, D, PADS, CH = 180.0, 0.7 * 3600, 8, 8
NMAX = 600


def poisson_pmf(mu, nmax=NMAX):
    p = [0.0] * (nmax + 1)
    p[0] = math.exp(-mu)
    for n in range(1, nmax + 1):
        p[n] = p[n - 1] * mu / n
    return p


def batch_pmf(rate_b, t, k, nmax=NMAX):
    """Law of k * Poisson(rate_b * t), the order count of fixed-size batches over time t."""
    q = poisson_pmf(rate_b * t, nmax // k)
    p = [0.0] * (nmax + 1)
    for j, v in enumerate(q):
        if j * k <= nmax:
            p[j * k] = v
    return p


def convolve(a, b, nmax=NMAX):
    bs = [(j, y) for j, y in enumerate(b) if y > 1e-300]
    out = [0.0] * (nmax + 1)
    for i, x in enumerate(a):
        if x < 1e-300:
            continue
        for j, y in bs:
            if i + j > nmax:
                break
            out[i + j] += x * y
    return out


def mdc_stationary(arr, c, tol=1e-13, it_max=20000):
    """Stationary law of N' = max(N - c, 0) + A, with A ~ arr (pmf list). Requires E[A] < c."""
    n = len(arr) - 1
    pi = [0.0] * (n + 1)
    pi[0] = 1.0
    for _ in range(it_max):
        shifted = [0.0] * (n + 1)
        for i, x in enumerate(pi):
            shifted[max(i - c, 0)] += x
        new = convolve(shifted, arr, n)
        s = sum(new)
        new = [x / s for x in new]
        if sum(abs(x - y) for x, y in zip(new, pi)) < tol:
            return new
        pi = new
    return pi


def outstanding_pmf(rate_per_h, k, c=CH, d=D, t_pad=T_PAD):
    rb = rate_per_h / k / 3600.0
    nq = mdc_stationary(batch_pmf(rb, d, k), c)
    nt = batch_pmf(rb, t_pad, k)
    return convolve(nq, nt)


def wait_share(p_out, S, k):
    """Share of orders that wait for a pack: order i of a batch waits iff N_out + i > S."""
    tail = [0.0] * (len(p_out) + 1)
    for n in range(len(p_out) - 1, -1, -1):
        tail[n] = tail[n + 1] + p_out[n]
    return sum(tail[max(S - i + 1, 0)] for i in range(1, k + 1)) / k


def mean(p):
    return sum(i * x for i, x in enumerate(p))


def sim_waits(rate_per_h, k, spares, n_batches, seed):
    """6c's hub simulation (cargo_hub_bursts.sim), returning the warm-up-trimmed waits."""
    rng = random.Random(seed)
    lam_b = rate_per_h / k / 3600.0
    t = 0.0
    pad = [0.0] * PADS; chg = [0.0] * CH; pack = [0.0] * spares
    waits, pack_bound = [], []
    for _ in range(n_batches):
        t += rng.expovariate(lam_b)
        for _ in range(k):
            i = min(range(PADS), key=pad.__getitem__)
            j = min(range(spares), key=pack.__getitem__)
            start = max(t, pad[i], pack[j])
            pack_bound.append(pack[j] > t + 1e-6)  # no charged pack on arrival
            end = start + T_PAD
            c = min(range(CH), key=chg.__getitem__)
            chg[c] = max(end, chg[c]) + D
            pack[j] = chg[c]
            pad[i] = end
            waits.append(start - t)
    return waits[len(waits) // 5:], pack_bound[len(pack_bound) // 5:]


def sim_shares(rate, k, S, seeds=5, orders=40000):
    """(share of orders that wait for anything, share that find no charged pack on arrival)."""
    w, b = [], []
    for s in range(seeds):
        ws, bs = sim_waits(rate, k, S, orders // k, s)
        w += ws; b += bs
    return sum(1 for x in w if x > 1e-6) / len(w), sum(b) / len(b)


def sim_share(rate, k, S, seeds=5, orders=40000):
    return sim_shares(rate, k, S, seeds, orders)[0]


def main():
    lim = CH * 3600 / D
    print(f"Milestone 6h: analytic spare-pack rule (M^X/D/c + pad transit) against the 6c simulator")
    print(f"hub: {PADS} pads, {CH} chargers, charge {D:.0f} s, swap+load {T_PAD:.0f} s, charger limit {lim:.2f} flights/h")
    worst_abs, worst_low, count_diffs = {}, 0.0, []
    for load in (0.7, 0.85):
        rate = load * lim
        for k in (1, 2, 4, 8):
            p = outstanding_pmf(rate, k)
            print(f"\nload {load:.0%} ({rate:.2f}/h), batch k={k}: E[N_out] analytic {mean(p):.2f} "
                  f"(Little: {rate * (D + T_PAD) / 3600:.2f} + E[queue wait] term)")
            print("  S  | analytic wait share | simulated | diff    | simulated, no charged pack on arrival")
            a_first = s_first = sp_first = None
            for S in range(4, 81):
                a = wait_share(p, S, k)
                if a_first is None and a <= 0.05:
                    a_first = S
                need_sim = (a > 0.002 and a < 0.7) or (a_first is not None and s_first is None)
                if not need_sim:
                    if a_first is not None and s_first is not None:
                        break
                    continue
                s, sp = sim_shares(rate, k, S)
                if s_first is None and s <= 0.05:
                    s_first = S
                if 0.01 <= s <= 0.5:
                    worst_abs[k] = max(worst_abs.get(k, 0.0), abs(a - s))
                worst_low = max(worst_low, s - a)
                print(f"  {S:3d} | {a:19.4f} | {s:9.4f} | {a - s:+.4f} | {sp:.4f}")
                if sp_first is None and sp <= 0.05:
                    sp_first = S
                if a_first is not None and s_first is not None and a < 0.002:
                    break
            count_diffs.append((load, k, a_first, s_first, sp_first))
            print(f"  smallest S with wait share <= 5%: analytic {a_first}, simulated {s_first}, simulated no-pack {sp_first}")
    print("\nSummary")
    for k, v in sorted(worst_abs.items()):
        print(f"  {'P1' if k == 1 else '  '} k={k}: worst |analytic - simulated| where simulated in [0.01, 0.5]: {v:.4f}")
    print(f"  P3 worst amount analytic falls below simulated: {worst_low:.4f}")
    for load, k, a, s, sp in count_diffs:
        d = "n/a" if a is None or s is None else f"{a - s:+d}"
        print(f"  P2 load {load:.0%} k={k}: analytic {a}, simulated {s} (diff {d}), no charged pack on arrival {sp} (none = above 80 tried)")


if __name__ == "__main__":
    main()
