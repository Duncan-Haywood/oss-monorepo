"""A simulated RTGS day: netting bounds, a FIFO queue and the Bech-Soramaki (2001) gridlock resolution.

Payments are (time, sender, receiver, value) with time in [0, 1). Standard library only.
"""
import math
import random

__all__ = ["gen_day", "bank_weights", "top_share", "bounds", "bilateral_need", "simulate", "resolve"]


def bank_weights(n, s):
    """Zipf activity weights 1/k^s, normalised."""
    w = [1.0 / (k + 1) ** s for k in range(n)]
    t = sum(w)
    return [x / t for x in w]


def top_share(w, k):
    return sum(sorted(w, reverse=True)[:k])


EPS = 1e-9


def gen_day(rng, n, n_pay, s, sigma, rho=0.0, tau=0.2):
    """One day of about n_pay payments: sender and receiver drawn from Zipf weights (receiver != sender),
    lognormal values (median 1, log-sd sigma), uniform times. With reciprocity rho a payment is followed,
    later the same day, by a return payment between the same pair of value x * exp(N(0, tau)); real
    payment flows are far more balanced than independent draws. Returned sorted by time."""
    w = bank_weights(n, s)
    idx = list(range(n))
    out = []
    for _ in range(round(n_pay / (1.0 + rho))):
        a = rng.choices(idx, w)[0]
        b = rng.choices(idx, w)[0]
        while b == a:
            b = rng.choices(idx, w)[0]
        t, v = rng.random(), math.exp(rng.gauss(0.0, sigma))
        out.append((t, a, b, v))
        if rng.random() < rho:
            out.append((t + rng.random() * (1.0 - t), b, a, v * math.exp(rng.gauss(0.0, tau))))
    out.sort()
    return out


def bounds(pays, n):
    """(UB, LB, gross): the liquidity needed to settle every payment on arrival (sum over banks of the
    peak net outflow), the liquidity needed to settle all of them at the end of the day (sum of the
    positive net positions), and the gross value. These are Bech and Soramaki's upper and lower bounds."""
    bal = [0.0] * n
    peak = [0.0] * n
    gross = 0.0
    for _, a, b, v in pays:
        bal[a] -= v
        bal[b] += v
        gross += v
        if -bal[a] > peak[a]:
            peak[a] = -bal[a]
    return sum(peak), sum(max(0.0, -x) for x in bal), gross


def bilateral_need(pays, n):
    """Liquidity needed if only bilateral pairs net: each bank funds the sum of its positive pair positions."""
    net = {}
    for _, a, b, v in pays:
        net[(a, b)] = net.get((a, b), 0.0) + v
    need = 0.0
    for (a, b), v in net.items():
        d = v - net.get((b, a), 0.0)
        if d > 0:
            need += d
    return need


def resolve(queues, bal):
    """Gridlock resolution on queued payments. queues[i] is a list of (value, receiver) in FIFO order and
    bal[i] the balance. Starts with every queued payment, then removes the last queued payment of any bank
    whose ex post balance is negative until none is. Returns the number of payments of each bank to settle
    (a prefix of its queue). Bech and Soramaki (2001), section 3.3."""
    n = len(queues)
    k = [len(q) for q in queues]
    ex = list(bal)
    for i in range(n):
        for j in range(k[i]):
            v, r = queues[i][j]
            ex[i] -= v
            ex[r] += v
    work = [i for i in range(n) if ex[i] < -EPS]
    while work:
        i = work.pop()
        while ex[i] < -EPS and k[i] > 0:
            k[i] -= 1
            v, r = queues[i][k[i]]
            ex[i] += v
            ex[r] -= v
            if ex[r] < -EPS:
                work.append(r)
    return k


def simulate(pays, n, liq, resolution):
    """FIFO queueing. Each bank i starts with liq[i]; a payment is sent when its bank's earlier queued
    payments are gone and the balance covers it; with `resolution` the gridlock algorithm also runs
    whenever a payment is left queued. Payments still queued at the close settle at time 1.
    Returns (value-weighted mean delay as a fraction of the day, share of value unsettled at the close,
    share of value settled by the algorithm)."""
    bal = list(liq)
    queues = [[] for _ in range(n)]       # (value, receiver, arrival time)
    delay = unsettled = by_alg = total = 0.0
    nq = 0

    def settle(i, count, t, alg):
        nonlocal delay, by_alg, nq
        for v, r, t0 in queues[i][:count]:
            bal[i] -= v
            bal[r] += v
            delay += v * (t - t0)
            if alg:
                by_alg += v
        del queues[i][:count]
        nq -= count

    def fifo(t, start):
        work = [start]
        while work:
            i = work.pop()
            moved = False
            while queues[i] and bal[i] + EPS >= queues[i][0][0]:
                settle(i, 1, t, False)
                moved = True
            if moved:
                work.extend(j for j in range(n) if queues[j] and j != i and bal[j] + EPS >= queues[j][0][0])

    for t, a, b, v in pays:
        total += v
        queues[a].append((v, b, t))
        nq += 1
        fifo(t, a)
        if resolution and nq:
            while True:
                k = resolve([[(x[0], x[1]) for x in q] for q in queues], bal)
                if not any(k):
                    break
                for i in range(n):
                    if k[i]:
                        settle(i, k[i], t, True)
                for i in range(n):
                    fifo(t, i)
    for i in range(n):
        for v, r, t0 in queues[i]:
            delay += v * (1.0 - t0)
            unsettled += v
    return delay / total, unsettled / total, by_alg / total
