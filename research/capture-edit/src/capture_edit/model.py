"""Synthetic multi-camera edit model: clock sync from a shared audio envelope, and angle selection from noisy per-camera scores.

Stdlib only, deterministic. Nothing here touches real footage: camera "quality" is a latent per-camera value
(how good that angle is at that moment) that the editor only sees through a noisy detector score.
"""
import math
import random

DT = 0.1            # seconds per scoring step (10 Hz)
MIN_SHOT = 1.5      # a shot shorter than this counts as jarring (assumed)
SYNC_TOL = 0.04     # seconds; about one frame at 25 fps (assumed)


def make_quality(n_cams, duration, rng):
    """q[c][i]: true quality of camera c at step i; piecewise constant over 2 to 8 s segments, uniform in [0.1, 1]."""
    steps = int(round(duration / DT))
    q = []
    for _ in range(n_cams):
        row = []
        while len(row) < steps:
            seg = int(rng.uniform(2.0, 8.0) / DT)
            row += [rng.uniform(0.1, 1.0)] * seg
        q.append(row[:steps])
    return q


def observe(q, sigma, rng):
    """Detector scores: true quality plus Gaussian noise, clipped to [0, 1]."""
    return [[min(1.0, max(0.0, v + rng.gauss(0, sigma))) for v in row] for row in q]


def fixed_cut(n_cams, steps, period):
    """Baseline: rotate through the cameras every `period` seconds, ignoring the footage."""
    k = max(1, int(round(period / DT)))
    return [(i // k) % n_cams for i in range(steps)]


def greedy(s):
    """Best-scoring camera at every step (flickers when scores are noisy)."""
    n, steps = len(s), len(s[0])
    return [max(range(n), key=lambda c: s[c][i]) for i in range(steps)]


def hold(s, margin=0.15, min_len=MIN_SHOT, win=1.0):
    """Causal rule: score over a 1 s trailing mean; switch only when another camera leads the current by
    `margin` and the current shot has run at least `min_len`."""
    n, steps = len(s), len(s[0])
    w = max(1, int(round(win / DT)))
    pre = [[0.0] for _ in range(n)]
    for c in range(n):
        for v in s[c]:
            pre[c].append(pre[c][-1] + v)
    cur, since, out = 0, 0, []
    for i in range(steps):
        lo = max(0, i + 1 - w)
        avg = [(pre[c][i + 1] - pre[c][lo]) / (i + 1 - lo) for c in range(n)]
        best = max(range(n), key=lambda c: avg[c])
        if best != cur and since * DT >= min_len and avg[best] - avg[cur] > margin:
            cur, since = best, 0
        out.append(cur)
        since += 1
    return out


def viterbi(s, switch_cost):
    """Exact maximum of (sum of chosen scores) minus switch_cost per cut, with the whole clip in view (offline edit)."""
    n, steps = len(s), len(s[0])
    best = [s[c][0] for c in range(n)]
    back = []
    for i in range(1, steps):
        top = max(range(n), key=lambda c: best[c])
        nb, bp = [], []
        for c in range(n):
            stay, move = best[c], best[top] - switch_cost
            if stay >= move:
                nb.append(stay + s[c][i]); bp.append(c)
            else:
                nb.append(move + s[c][i]); bp.append(top)
        best = nb
        back.append(bp)
    c = max(range(n), key=lambda k: best[k])
    path = [c]
    for bp in reversed(back):
        c = bp[c]
        path.append(c)
    return path[::-1]


def shots(path):
    """Run lengths of the cut list, in seconds."""
    out, run = [], 1
    for a, b in zip(path, path[1:]):
        if a == b:
            run += 1
        else:
            out.append(run * DT); run = 1
    return out + [run * DT]


def score_edit(path, q):
    """Mean true quality of the chosen camera, cuts per minute, and share of shots shorter than MIN_SHOT."""
    steps = len(path)
    sh = shots(path)
    return {
        "quality": sum(q[c][i] for i, c in enumerate(path)) / steps,
        "cuts_per_min": (len(sh) - 1) / (steps * DT / 60.0),
        "jarring": sum(1 for x in sh if x < MIN_SHOT - 1e-9) / len(sh),
    }


def envelope(events, t, width=0.05):
    return sum(a * math.exp(-((t - tau) ** 2) / (2 * width * width)) for tau, a in events)


def make_events(duration, rng, rate=0.5):
    """Loud moments (claps, speech onsets) as (time, amplitude), Poisson at `rate` per second."""
    ev, t = [], rng.expovariate(rate)
    while t < duration:
        ev.append((t, rng.uniform(0.5, 1.0)))
        t += rng.expovariate(rate)
    return ev


def estimate_offset(duration, offset, noise, rng, fs=50, max_lag=1.0):
    """Offset of a second recorder (true `offset` s later than the reference) recovered by brute-force
    cross-correlation of two noisy 50 Hz envelopes of the same events. Returns the estimate in seconds."""
    ev = make_events(duration + 2 * max_lag, rng)
    n = int(duration * fs)
    t0 = max_lag
    ref = [envelope(ev, t0 + i / fs) + rng.gauss(0, noise) for i in range(n)]
    oth = [envelope(ev, t0 + i / fs - offset) + rng.gauss(0, noise) for i in range(n)]
    best, best_lag = -1e18, 0
    L = int(max_lag * fs)
    for lag in range(-L, L + 1):
        lo, hi = max(0, lag), min(n, n + lag)
        acc = 0.0
        for i in range(lo, hi):
            acc += ref[i] * oth[i - lag]
        acc /= max(1, hi - lo)
        if acc > best:
            best, best_lag = acc, lag
    return -best_lag / fs
