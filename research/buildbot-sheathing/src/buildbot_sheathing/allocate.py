"""Risk allocated per press: exact fewest-re-zero schedules for an additive risk budget (milestone 74).

Milestone 73 gave each press the same per-press risk level eps and scheduled the deadlines it
implies. Here every press gets its own share. A schedule splits the wall's presses into segments
(a re-zero before the first press of each segment, the one before press 0 implied and not counted).
Within a segment starting at press i, press m is checked at elapsed time E(i, m) and leaves its
allowance with marginal probability p_m(E(i, m)) (`drift.p_violate`).

Two segment risks are additive over segments:

  union  r(i, j) = sum_{m=i..j} p_m(E(i, m))     (sum over the wall >= the wall's failure)
  lower  r(i, j) = -log(1 - max_{m=i..j} p_m)    (segments are independent and a segment fails
                                                  with at least its largest marginal, so a wall
                                                  failure <= alpha forces sum r <= -log(1 - alpha))

`fewest` solves  min #re-zeros  s.t.  sum_segments r <= budget  exactly, by layers: R_c[j] is the
least total risk that covers presses 0..j-1 with c re-zeros, R_{c+1}[j] = min_i R_c[i] + r(i, j-1),
and the answer is the first c with R_c[M] <= budget (the schedule found has the least risk among
those with that count). With the union risk and budget alpha the answer is the best per-press
allocation under the union bound (milestone 73's BONF is one feasible point of it, so never fewer
re-zeros); with the lower risk and budget -log(1 - alpha) it is a lower bound on the count of any
schedule whose wall failure is <= alpha, under this drift model and checks at press ends.

The wall is periodic: the gap before a press depends only on its index modulo the sheet's press
count P (the start press's own gap is never counted), and so does its allowance. So
p(i, i + k) depends on (i mod P, k) only, and `risk_table` evaluates P x M values, not M^2.
"""
import numpy as np

from . import drift as D


def risk_table(gaps, taus, allow, period, rho, sigma):
    """Q[s, k] = p_{s+k}(E(s, s+k)) for s < period, 0 <= k < M - s (inf-free; 0 past the end)."""
    gaps, taus, allow = (np.asarray(v, float) for v in (gaps, taus, allow))
    M = len(taus)
    if M < 2 * period:
        raise ValueError("wall shorter than two periods")
    Q = np.zeros((period, M))
    for s in range(period):
        h = gaps[s + 1:] + taus[s + 1:]
        E = taus[s] + np.concatenate(([0.0], np.cumsum(h)))
        a = allow[s:]
        for av in np.unique(a):
            sel = a == av
            Q[s, :M - s][sel] = D.p_violate(E[sel], av, rho, sigma)
    return Q


def check_periodic(gaps, taus, allow, period):
    """True if press data repeat with the period (index 0's gap excepted: it is never counted)."""
    g, t, a = (np.asarray(v, float) for v in (gaps, taus, allow))
    M = len(t)
    idx = np.arange(period, M)
    return (np.allclose(t[idx], t[idx % period]) and np.allclose(a[idx], a[idx % period])
            and np.allclose(g[idx], g[idx % period + period]))


def segment_risk(Q, kind):
    """Cumulative segment risk C[s, k] = r(s, s+k) for a segment from a start with residue s."""
    if kind == "union":
        return np.cumsum(Q, axis=1)
    if kind == "lower":
        mx = np.maximum.accumulate(np.minimum(Q, 1.0), axis=1)
        with np.errstate(divide="ignore"):
            return -np.log1p(-mx)
    raise ValueError(kind)


def fewest(C, M, period, budget, max_rezeros=None):
    """Fewest re-zeros with total segment risk <= budget. Returns (count, starts, risk) or None.

    C[s, k] is the risk of a segment starting at a press with residue s and holding k + 1 presses.
    """
    max_rezeros = M - 1 if max_rezeros is None else max_rezeros
    # longest useful segment per residue: risk is nondecreasing in k, and a segment over budget is never used
    klim = np.array([int(np.searchsorted(C[s, :M], budget, side="right")) for s in range(period)])
    K = int(klim.max())
    starts_all = np.arange(M)
    res = starts_all % period
    Rc = np.full(M + 1, np.inf)                    # c = 0: one segment from press 0
    k0 = min(int(klim[0]), M)
    Rc[1:k0 + 1] = C[0, :k0]
    back = []
    c = 0
    while True:
        if Rc[M] <= budget:
            break
        if c >= max_rezeros:
            return None
        Rn = np.full(M + 1, np.inf)
        arg = np.full(M + 1, -1, dtype=np.int64)
        base = Rc[1:M]                              # a re-zero before press i = 1..M-1 after covering 0..i-1
        i_idx = starts_all[1:]
        ri = res[1:]
        ok = np.isfinite(base)
        if not ok.any():
            return None
        i_ok, ri_ok, b_ok = i_idx[ok], ri[ok], base[ok]
        for k in range(K):
            j = i_ok + k + 1                        # covers presses i..i+k, next free index j
            sel = (j <= M) & (k < klim[ri_ok])
            if not sel.any():
                continue
            jj = j[sel]
            v = b_ok[sel] + C[ri_ok[sel], k]
            # several i can map to the same j only for different k; within one k, j is unique per i
            better = v < Rn[jj]
            Rn[jj[better]] = v[better]
            arg[jj[better]] = i_ok[sel][better]
        back.append(arg)
        Rc = Rn
        c += 1
    # recover the starts
    starts, j = [], M
    for layer in range(c - 1, -1, -1):
        i = int(back[layer][j])
        starts.append(i)
        j = i
    return c, sorted(starts), float(Rc[M])


def schedule_risk(gaps, taus, allow, starts, rho, sigma, kind="union"):
    """Total segment risk of a given schedule, computed directly (for tests)."""
    gaps, taus, allow = (np.asarray(v, float) for v in (gaps, taus, allow))
    M = len(taus)
    cuts = [0] + sorted(starts) + [M]
    tot = 0.0
    for a0, b0 in zip(cuts[:-1], cuts[1:]):
        E = taus[a0] + np.concatenate(([0.0], np.cumsum(gaps[a0 + 1:b0] + taus[a0 + 1:b0])))
        p = np.array([float(D.p_violate(e, av, rho, sigma)) for e, av in zip(E, allow[a0:b0])])
        tot += p.sum() if kind == "union" else -np.log1p(-min(p.max(), 1.0))
    return tot
