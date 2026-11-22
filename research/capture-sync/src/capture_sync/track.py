"""Session trackers started from a coarse offset and clock rate (step 6b).

Every tracker here predicts device 1's delay behind device 0 (s) at device-0 times t_eval, causally, from a
coarse estimate (offset d0 at time t0 and rate s0 in s/s, e.g. `sync.rate_lag_search` over the first 20 s).
The windowed ones share step 4d's re-estimation: a WIN s window of device 0 every HOP s, envelope-normalised
GCC (gamma 0.25) searched +-SEARCH s around the current line; they differ in what a window may change.

  hold   the coarse line d0 + s0 (t - t0), never updated.
  kr     step 4d's rule (windows in the last HIST s with PSR at or above that history's median; a Theil-Sen line
         through them when at least 3 span MIN_SPAN s) but, short of a line, the coarse slope s0 through the
         kept windows' median residual instead of a flat median (4d and 6a dropped the rate there).
  gated  a window joins the history only if it lands within `gate` s of the current line; the line is a
         Theil-Sen fit through the accepted windows of the last HIST s once at least 3 span MIN_SPAN s, else
         s0 through their median residual, else the coarse line. No PSR vote.
"""
import numpy as np

from .sync import gcc, theil_sen, FS

WIN, HOP, SEARCH, HIST, MIN_SPAN = 2.0, 5.0, 1.5, 120.0, 20.0
FRAME = 1.0 / 30.0


def track(e0, e1, d0, s0, t_eval, mode="gated", t0=10.0, start=20.0, gate=FRAME, fs=FS):
    """(prediction at each t_eval, final slope s/s). `start` is the first window's end (4d's T0)."""
    t_eval = np.asarray(t_eval, float)
    coarse = (lambda x: d0 + s0 * (x - t0))
    if mode == "hold":
        return coarse(t_eval), float(s0)
    if mode not in ("kr", "gated"):
        raise ValueError(mode)
    n, g = int(WIN * fs), int(SEARCH * fs)
    pred = np.empty(len(t_eval))
    line, slope = coarse, float(s0)
    ts, ds, ps, ok = [], [], [], []
    k = 0
    t = start - WIN
    end = len(e0) / fs
    while k < len(t_eval):
        t_done = t + WIN
        while k < len(t_eval) and t_eval[k] < t_done:
            pred[k] = line(t_eval[k])
            k += 1
        if t + WIN > end:
            t += HOP
            continue
        c = line(t + WIN / 2)
        i0 = int(round(t * fs))
        j0 = int(round((t + c) * fs)) - g
        if 0 <= j0 and j0 + n + 2 * g <= len(e1) and i0 + n <= len(e0):
            d, p = gcc(e0[i0:i0 + n], e1[j0:j0 + n + 2 * g], gamma=0.25, max_lag_s=SEARCH, centre_s=SEARCH,
                       fs=fs)
            est = c + d - SEARCH
            ts.append(t + WIN / 2)
            ds.append(est)
            ps.append(p)
            ok.append(abs(est - c) <= gate)
        T, D, P, A = np.array(ts), np.array(ds), np.array(ps), np.array(ok, bool)
        h = T > t_done - HIST
        keep = (h & (P >= np.median(P[h]))) if (mode == "kr" and h.any()) else (h & A)
        if keep.any():
            if keep.sum() >= 3 and np.ptp(T[keep]) >= MIN_SPAN:
                icpt, slope = theil_sen(T[keep], D[keep])
                line = (lambda a, b: (lambda x: a + b * x))(icpt, slope)
            else:
                m = float(np.median(D[keep] - s0 * T[keep]))
                line = (lambda a: (lambda x: a + s0 * x))(m)
                slope = float(s0)
        t += HOP
    return pred, slope
