"""Committed minorities and conventions: how many committed people flip a norm?

Two models (see LOG.md, 2026-11-11):

* Xie et al. (2011) binary agreement naming game with a committed fraction p of
  people who only ever say A, everyone else starting on B. `xie_rhs` is the
  mean-field ODE, re-derived from the interaction cases (docstring below), and
  `xie_pc` finds its critical fraction (published value about 0.0979).
  `xie_sim` plays the game itself on a complete graph.

* A memory-M majority game, the model class of Centola et al. (2018): each person
  keeps the last M names they heard and says the one most frequent in memory
  (ties at random). Committed people always say the new name and never update.
  Each round every uncommitted person hears one random neighbour. `mf_fc` is the
  mean-field critical fraction, `simulate` plays it on any graph.

Results are about simulated people following stated rules.
"""
import math

import numpy as np


# ---------------------------------------------------------------- Xie et al.

def xie_rhs(nA, nB, p):
    """Mean-field rates for the binary agreement model with committed fraction p.

    Speaker says a random word from their list; a listener who has it collapses
    with the speaker to that word, otherwise adds it. Committed (C) say A only and
    never change. Summing the cases speaker -> listener (A, B, AB, C):
      A->AB, C->AB: listener to A;  B->A: listener A to AB;  AB->A says A:
      speaker to A, says B: listener to AB;  AB->AB: both to the said word;
      AB->C says A: speaker to A;  C->B, A->B: listener to AB.
    gives dnA = -nA nB + nAB^2 + nA nAB + 1.5 p nAB and
          dnB = -nA nB + nAB^2 + nB nAB - p nB, with nAB = 1 - p - nA - nB.
    """
    nAB = 1.0 - p - nA - nB
    dA = -nA * nB + nAB * nAB + nA * nAB + 1.5 * p * nAB
    dB = -nA * nB + nAB * nAB + nB * nAB - p * nB
    return dA, dB


def xie_flips(p, t_max=2000.0, dt=0.05):
    """Integrate from nB = 1 - p (RK4); True if uncommitted A passes 90%."""
    nA, nB = 0.0, 1.0 - p
    t = 0.0
    while t < t_max:
        k1 = xie_rhs(nA, nB, p)
        k2 = xie_rhs(nA + dt / 2 * k1[0], nB + dt / 2 * k1[1], p)
        k3 = xie_rhs(nA + dt / 2 * k2[0], nB + dt / 2 * k2[1], p)
        k4 = xie_rhs(nA + dt * k3[0], nB + dt * k3[1], p)
        nA += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
        nB += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
        t += dt
        if nA > 0.9 * (1.0 - p):
            return True
    return False


def xie_pc(lo=0.05, hi=0.2, tol=1e-4):
    """Bisection for the mean-field critical committed fraction."""
    while hi - lo > tol:
        mid = 0.5 * (lo + hi)
        if xie_flips(mid):
            hi = mid
        else:
            lo = mid
    return 0.5 * (lo + hi)


def xie_sim(n, p, t_max, rng):
    """Binary agreement game on a complete graph of n people, round(p n) committed.
    Time is in units of n interactions. Returns the final fraction of uncommitted
    people holding only A."""
    c = int(round(p * n))
    # 0 = {B}, 1 = {A}, 2 = {A, B}; committed are the first c and hold A
    st = np.zeros(n, np.int8)
    st[:c] = 1
    steps = int(t_max * n)
    pairs = rng.integers(0, n, size=(steps, 2))
    coin = rng.random(steps) < 0.5
    for k in range(steps):
        s, l = pairs[k]
        if s == l:
            continue
        ss = st[s]
        w = ss if ss < 2 else (1 if coin[k] else 0)  # word said: 1 = A, 0 = B
        lst = st[l]
        has = lst == 2 or lst == w
        if has:
            if s >= c:
                st[s] = w
            if l >= c:
                st[l] = w
        elif l >= c:
            st[l] = 2
    unc = st[c:]
    return float(np.mean(unc == 1)) if len(unc) else 1.0


# ------------------------------------------------------- memory-M majority game

def says_new_prob(M, q):
    """P(majority of M draws with P(new) = q is new), ties counted as half."""
    tot = 0.0
    for k in range(M + 1):
        pk = math.comb(M, k) * q ** k * (1 - q) ** (M - k)
        if 2 * k > M:
            tot += pk
        elif 2 * k == M:
            tot += 0.5 * pk
    return tot


def mf_flips(M, f, iters=20000):
    x = 0.0
    for _ in range(iters):
        nx = says_new_prob(M, f + (1 - f) * x)
        if abs(nx - x) < 1e-12:
            break
        x = nx
    return x > 0.5


def mf_fc(M, tol=1e-5):
    """Mean-field critical committed fraction for memory length M."""
    lo, hi = 0.0, 0.5
    if not mf_flips(M, hi):
        return float("nan")
    while hi - lo > tol:
        mid = 0.5 * (lo + hi)
        if mf_flips(M, mid):
            hi = mid
        else:
            lo = mid
    return 0.5 * (lo + hi)


def complete_csr(n):
    """Neighbour lists of a complete graph as (offsets, flat targets)."""
    tgt = np.array([j for i in range(n) for j in range(n) if j != i], np.int64)
    off = np.arange(0, n * (n - 1) + 1, n - 1, dtype=np.int64)
    return off, tgt


def adj_csr(adj):
    deg = np.array([len(a) for a in adj], np.int64)
    off = np.concatenate([[0], np.cumsum(deg)])
    tgt = np.array([v for a in adj for v in sorted(a)], np.int64)
    return off, tgt


def simulate(csr, committed, M, rounds, rng, record=False):
    """Memory-M majority game. `committed` is a boolean mask. Everyone's memory
    starts full of the old name. Returns the final fraction of uncommitted people
    saying the new name (and the per-round trace when record is True)."""
    off, tgt = csr
    n = len(off) - 1
    deg = np.diff(off)
    mem = np.zeros((n, M), np.int8)
    cnt = np.zeros(n, np.int64)
    unc = ~committed
    trace = []
    for r in range(rounds):
        tie = rng.random(n) < 0.5
        says = (2 * cnt > M) | ((2 * cnt == M) & tie) | committed
        nb = tgt[off[:-1] + (rng.random(n) * deg).astype(np.int64)]
        heard = says[nb].astype(np.int8)
        col = r % M
        cnt += np.where(unc, heard - mem[:, col], 0)
        mem[unc, col] = heard[unc]
        if record:
            trace.append(float(says[unc].mean()))
    says = (2 * cnt > M) | ((2 * cnt == M) & (rng.random(n) < 0.5))
    final = float(says[unc].mean()) if unc.any() else 1.0
    return (final, trace) if record else final
