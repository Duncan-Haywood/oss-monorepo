"""A delay prior built from a camera's own earlier windows instead of the true delay.

capture-aliaswin showed that a prior tighter than a clip's period removes period aliasing, but its prior was an
oracle (centred on the true delay). Here the first `boot` windows are searched without a prior; a robust line
(Theil-Sen) through their estimates predicts the next window's delay, the search is restricted to the prediction
+- a half-width taken from the line's own scatter, and each new estimate joins the history."""
import numpy as np
from capture_aliaswin import gcc_search

SLOPE_PPM = 40.0      # crystal tolerance assumed by capture-residgate's clocks (+-40 ppm); bounds the drift rate


def theil_sen(t, d):
    """(slope, intercept) of the median-of-pairwise-slopes line; slope 0 with one point."""
    t, d = np.asarray(t, float), np.asarray(d, float)
    if len(t) < 2:
        return 0.0, float(d[-1])
    i, j = np.triu_indices(len(t), 1)
    m = np.median((d[j] - d[i]) / (t[j] - t[i]))
    return float(m), float(np.median(d - m * t))


def predict(ts, ds, t_next, keep=6, floor_s=0.002, k_mad=4.0, cap_s=None):
    """(centre, half-width) in s for the delay at t_next from the last `keep` estimates.
    One point: the half-width must cover the worst drift, SLOPE_PPM x gap. Two or more: k_mad x the robust scatter
    of the residuals (floor_s at least), and never more than the drift bound while the line has few points.
    cap_s, if given, caps the half-width (use below the clip's period)."""
    ts, ds = np.asarray(ts[-keep:], float), np.asarray(ds[-keep:], float)
    m, c = theil_sen(ts, ds)
    centre = m * t_next + c
    gap = t_next - ts[-1]
    if len(ts) < 3:
        half = SLOPE_PPM * 1e-6 * gap + floor_s
    else:
        res = ds - (m * ts + c)
        half = k_mad * 1.4826 * float(np.median(np.abs(res - np.median(res)))) + floor_s + SLOPE_PPM * 1e-6 * gap * 0.1
    if cap_s is not None:
        half = min(half, cap_s)
    return float(centre), float(half)


def track_camera(windows, times, gamma, boot, cap_s=None, full_half=1.5):
    """Estimate the delay of each (a, b) window in order. The first `boot` are searched over +-full_half s;
    later ones inside the predicted prior. Returns (estimates, centres, halves); centre/half are nan for bootstrap."""
    est, cen, hal = [], [], []
    for k, (a, b) in enumerate(windows):
        if k < boot:
            d = gcc_search(a, b, gamma, 0.0, full_half)
            c = h = float("nan")
        else:
            c, h = predict(times[:k], est, times[k], cap_s=cap_s)
            d = gcc_search(a, b, gamma, c, h)
        est.append(d); cen.append(c); hal.append(h)
    return np.array(est), np.array(cen), np.array(hal)
