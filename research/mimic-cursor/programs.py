"""The two players' programs.

Imitator: a cursor-stroke generator assembled from code components. Its genome
names one component per gene (path shape, speed profile, submovements, noise,
event clock, rounding, duration law) and that component's parameters. Search
changes the components, not only numbers, so the free parameter is code drawn
from a fixed component library, not code written freely.

Detector: a choice of K feature functions from a fixed library, fed to a
logistic regression. Search changes which functions it runs.
"""
import copy
import math

import numpy as np
from scipy.special import betainc

W = 20.0  # target width in Fitts' law, px (DUX logs no widths; a fixed guess)

# ---------------------------------------------------------------- imitator

GENES = {
    "dur": {"kinds": ["fitts", "template"], "params": {"a": (50, 1500), "b": (0, 400), "sd": (0, 1.0)}},
    "path": {"kinds": ["line", "arc", "scurve", "template"],
             "params": {"curv": (0, 0.4), "tmix": (0, 0.5), "tol": (2, 45)}},
    "profile": {"kinds": ["uniform", "minjerk", "skew"], "params": {"peak": (0.15, 0.85)}},
    "sub": {"kinds": ["none", "overshoot", "undershoot"],
            "params": {"mag": (0, 0.3), "prob": (0, 1), "frac": (0.6, 0.98)}},
    "noise": {"kinds": ["none", "white", "smooth"], "params": {"sd": (0, 4), "rho": (0, 0.98)}},
    "clock": {"kinds": ["fixed", "jitter", "poll", "empirical", "template"],
              "params": {"dt": (4, 40), "cv": (0, 1.5)}},
    "round": {"kinds": ["no", "yes"], "params": {}},
}

# What an automation script does by default: a straight line at constant speed,
# a fixed duration, a fixed event interval, sub-pixel coordinates.
NAIVE = {
    "dur": {"kind": "fitts", "a": 400.0, "b": 0.0, "sd": 0.0},
    "path": {"kind": "line", "curv": 0.1, "tmix": 0.0, "tol": 45.0},
    "profile": {"kind": "uniform", "peak": 0.5},
    "sub": {"kind": "none", "mag": 0.08, "prob": 0.5, "frac": 0.9},
    "noise": {"kind": "none", "sd": 1.0, "rho": 0.8},
    "clock": {"kind": "fixed", "dt": 16.0, "cv": 0.3},
    "round": {"kind": "no"},
}


# Training-split human strokes, for the two data-driven components ("template"
# path and "empirical" clock): the cursor counterpart of few-shot examples.
HUMAN = {"strokes": [], "chord": None, "dts": [], "times": []}


def set_human(strokes):
    """Give the data-driven components their human examples (training split only)."""
    HUMAN["strokes"], HUMAN["times"] = [], []
    chords, dts = [], []
    for s in strokes:
        s = np.asarray(s, float)
        c = s[-1, 1:] - s[0, 1:]
        D = np.hypot(*c)
        n = np.array([-c[1], c[0]]) / D
        rel = s[:, 1:] - s[0, 1:]
        HUMAN["strokes"].append(np.column_stack([s[:, 0] / s[-1, 0], rel @ (c / D) / D, rel @ n / D]))
        chords.append([D, math.atan2(c[1], c[0])])
        dts.append(np.diff(s[:, 0]))
        HUMAN["times"].append(s[:, 0])
    HUMAN["chord"] = np.array(chords)
    HUMAN["dts"] = dts


def _retrieve(start, end, tol, rng):
    """Two training strokes whose chords are within `tol` degrees of this one
    and within a length ratio of 1 + tol/30. A small tol is close to copying."""
    d = end - start
    D = max(np.hypot(*d), 1.0)
    ang = math.atan2(d[1], d[0])
    ch = HUMAN["chord"]
    da = np.abs(np.angle(np.exp(1j * (ch[:, 1] - ang))))
    dl = np.abs(np.log(ch[:, 0] / D))
    near = np.flatnonzero((da < math.radians(tol)) & (dl < math.log(1 + tol / 30)))
    if len(near) < 2:
        near = np.argsort(da + dl)[:2]
    return rng.choice(near, 2, replace=False)


def _template(start, end, u, mix, pick):
    """Shape of a retrieved human stroke, blended with a second one by weight
    `mix`, mapped onto the new chord."""
    d = end - start
    a, b = (HUMAN["strokes"][i] for i in pick)
    shape = np.column_stack([np.interp(u, a[:, 0], a[:, k]) for k in (1, 2)])
    if mix > 0:
        shape = (1 - mix) * shape + mix * np.column_stack([np.interp(u, b[:, 0], b[:, k]) for k in (1, 2)])
    n = np.array([-d[1], d[0]])
    return start + np.outer(shape[:, 0], d) + np.outer(shape[:, 1], n)


def mutate(genome, gene, rng):
    g = copy.deepcopy(genome)
    spec = GENES[gene]
    params = list(spec["params"])
    if len(spec["kinds"]) > 1 and (not params or rng.random() < 0.4):
        g[gene]["kind"] = str(rng.choice([k for k in spec["kinds"] if k != g[gene]["kind"]]))
    else:
        p = params[rng.integers(len(params))]
        lo, hi = spec["params"][p]
        g[gene][p] = float(np.clip(g[gene][p] + rng.normal(0, 0.2 * (hi - lo)), lo, hi))
    return g


def _warp(u, prof):
    if prof["kind"] == "uniform":
        return u
    if prof["kind"] == "minjerk":
        return 10 * u**3 - 15 * u**4 + 6 * u**5
    k = 6.0
    return betainc(1 + k * prof["peak"], 1 + k * (1 - prof["peak"]), u)


def _clock(T, c, rng):
    if c["kind"] == "empirical":
        seq = HUMAN["dts"][rng.integers(len(HUMAN["dts"]))]
        k = int(T / max(seq.mean(), 1)) * 2 + 8
        steps = np.resize(np.roll(seq, -rng.integers(len(seq))), k)
        t = np.concatenate([[0], np.cumsum(steps)])
        return t[t < T]
    if c["kind"] == "fixed":
        return np.arange(0, T, c["dt"])
    steps = c["dt"] * rng.lognormal(0, c["cv"] + 1e-6, size=int(T / max(c["dt"], 1) * 3) + 8)
    steps = np.maximum(np.round(steps), 1)
    t = np.concatenate([[0], np.cumsum(steps)])
    return t[t < T]


def _segment(p0, p1, u, path, rng):
    d = p1 - p0
    n = np.array([-d[1], d[0]])
    if path["kind"] == "line":
        off = np.zeros_like(u)
    elif path["kind"] == "arc":
        off = 4 * u * (1 - u) * rng.normal(0, path["curv"])
    else:
        off = 6.0 * u * (1 - u) * (1 - 2 * u) * rng.normal(0, path["curv"])
    return p0 + np.outer(u, d) + np.outer(off, n)


def generate(genome, start, end, rng):
    """One stroke from start to end: array of (t_ms, x, y), t from 0."""
    start, end = np.asarray(start, float), np.asarray(end, float)
    D = float(np.hypot(*(end - start)))
    du = genome["dur"]
    uses = (genome["path"]["kind"], du["kind"], genome["clock"]["kind"])
    pick = _retrieve(start, end, genome["path"]["tol"], rng) if "template" in uses else None
    if du["kind"] == "template":
        T = float(HUMAN["times"][pick[0]][-1])
    else:
        T = (du["a"] + du["b"] * math.log2(D / W + 1)) * rng.lognormal(0, du["sd"] + 1e-6)
        T = float(np.clip(T, 60, 3000))
    if genome["clock"]["kind"] == "template":
        ta = HUMAN["times"][pick[0]]
        t = np.round(ta[:-1] * T / ta[-1])
    else:
        t = _clock(T, genome["clock"], rng)
    T = float(round(T))
    t = np.append(t[np.round(t) < T], T)  # the last tick must not shadow the endpoint
    u = _warp(t / T, genome["profile"])
    sub = genome["sub"]
    if genome["path"]["kind"] == "template":
        # the template carries its own speed profile, so use clock time as is
        pts = _template(start, end, t / T, genome["path"]["tmix"], pick)
    elif sub["kind"] == "none" or rng.random() > sub["prob"]:
        pts = _segment(start, end, u, genome["path"], rng)
    else:
        if sub["kind"] == "overshoot":
            mid = end + (end - start) * sub["mag"]
        else:
            mid = start + (end - start) * sub["frac"]
        split = 0.75
        pts = np.empty((len(u), 2))
        a = u <= split
        pts[a] = _segment(start, mid, u[a] / split, genome["path"], rng)
        pts[~a] = _segment(mid, end, (u[~a] - split) / (1 - split), {"kind": "line"}, rng)
    nz = genome["noise"]
    if nz["kind"] != "none" and len(pts) > 2:
        e = rng.normal(0, nz["sd"], size=pts.shape)
        if nz["kind"] == "smooth":
            for i in range(1, len(e)):
                e[i] = nz["rho"] * e[i - 1] + math.sqrt(1 - nz["rho"] ** 2) * e[i]
        taper = np.sin(np.pi * np.clip(t / T, 0, 1))[:, None]
        pts = pts + e * taper
    pts[0], pts[-1] = start, end
    if genome["round"]["kind"] == "yes":
        pts = np.round(pts)
    out = np.column_stack([np.round(t), pts])
    if genome["clock"]["kind"] == "poll" or genome["round"]["kind"] == "yes":
        # a browser fires mousemove only when the pointer moved
        keep = np.ones(len(out), bool)
        keep[1:] = np.any(np.diff(out[:, 1:], axis=0) != 0, axis=1)
        out = out[keep]
    _, idx = np.unique(out[:, 0], return_index=True)
    return out[np.sort(idx)]


# ---------------------------------------------------------------- features


def _kin(s):
    s = np.asarray(s, float)
    t, xy = s[:, 0], s[:, 1:]
    dt = np.maximum(np.diff(t), 1.0)
    step = np.diff(xy, axis=0)
    v = np.hypot(step[:, 0], step[:, 1]) / dt
    vs = np.convolve(v, np.ones(3) / 3, mode="same") if len(v) >= 3 else v
    return t, xy, dt, step, v, vs


def f_timing(s):
    t, xy, *_ = _kin(s)
    D = np.hypot(*(xy[-1] - xy[0]))
    T = max(t[-1], 1.0)
    return [math.log(T), math.log(T) / math.log2(D / W + 2)]


def f_straight(s):
    _, xy, _, step, *_ = _kin(s)
    chord = xy[-1] - xy[0]
    D = max(np.hypot(*chord), 1.0)
    L = np.hypot(step[:, 0], step[:, 1]).sum()
    n = np.array([-chord[1], chord[0]]) / D
    dev = np.abs((xy - xy[0]) @ n).max() / D
    return [math.log(max(L / D, 1.0)), dev]


def f_speed(s):
    *_, v, vs = _kin(s)
    m = max(v.mean(), 1e-6)
    return [v.std() / m, vs.max() / m]


def f_peak(s):
    t, *_, vs = _kin(s)
    return [t[1:][np.argmax(vs)] / max(t[-1], 1.0)]


def f_jerk(s):
    t, xy, dt, step, v, vs = _kin(s)
    if len(v) < 4:
        return [0.0]
    a = np.diff(vs) / dt[1:]
    j = np.diff(a) / dt[2:]
    D = max(np.hypot(*(xy[-1] - xy[0])), 1.0)
    T = max(t[-1], 1.0)
    return [math.log(np.abs(j).mean() * T**3 / D + 1e-9)]


def f_dt(s):
    dt = np.diff(np.asarray(s, float)[:, 0])
    vals, counts = np.unique(dt, return_counts=True)
    return [math.log(np.median(dt)), dt.std() / max(dt.mean(), 1e-6), counts.max() / len(dt)]


def f_steps(s):
    _, xy, _, step, *_ = _kin(s)
    frac = np.any(xy != np.round(xy), axis=1).mean()
    return [(step[:, 0] == 0).mean(), (step[:, 1] == 0).mean(),
            (np.abs(step).max(axis=1) <= 1).mean(), frac]


def f_submove(s):
    _, xy, _, _, _, vs = _kin(s)
    peaks = 0
    if len(vs) >= 3:
        m = vs.max()
        inner = (vs[1:-1] > vs[:-2]) & (vs[1:-1] >= vs[2:]) & (vs[1:-1] > 0.2 * m)
        peaks = int(inner.sum())
    chord = xy[-1] - xy[0]
    D = max(np.hypot(*chord), 1.0)
    proj = (xy - xy[0]) @ (chord / D)
    return [float(peaks), max(proj.max() - D, 0.0) / D]


def f_heading(s):
    _, _, _, step, *_ = _kin(s)
    mv = step[np.any(step != 0, axis=1)]
    if len(mv) < 3:
        return [0.0, 0.0]
    h = np.arctan2(mv[:, 1], mv[:, 0])
    dh = np.angle(np.exp(1j * np.diff(h)))
    sc = (np.sign(dh[1:]) * np.sign(dh[:-1]) < 0).mean() if len(dh) > 1 else 0.0
    return [np.abs(dh).mean(), sc]


def f_rate(s):
    t = np.asarray(s, float)[:, 0]
    return [math.log(len(t)), len(t) / max(t[-1], 1.0) * 1000 / 100]


def f_endphase(s):
    t, xy, *_ = _kin(s)
    chord = xy[-1] - xy[0]
    D = max(np.hypot(*chord), 1.0)
    prog = (xy - xy[0]) @ (chord / D) / D
    T = max(t[-1], 1.0)
    half = np.interp(0.5, t / T, prog)
    late = (t[-1] - t[np.argmax(prog >= 0.9)]) / T
    return [half, late]


LIBRARY = {
    "timing": f_timing, "straight": f_straight, "speed": f_speed, "peak": f_peak,
    "jerk": f_jerk, "dt": f_dt, "steps": f_steps, "submove": f_submove,
    "heading": f_heading, "rate": f_rate, "endphase": f_endphase,
}
GROUPS = list(LIBRARY)
WIDTH = {g: len(LIBRARY[g](np.array([[0, 0, 0], [8, 3, 1], [16, 9, 4], [30, 20, 9], [40, 30, 10]])))
         for g in GROUPS}


def features(strokes):
    """dict group -> array (n, width)."""
    out = {g: np.empty((len(strokes), WIDTH[g])) for g in GROUPS}
    for i, s in enumerate(strokes):
        for g in GROUPS:
            out[g][i] = LIBRARY[g](s)
    return {g: np.nan_to_num(v, nan=0.0, posinf=50.0, neginf=-50.0) for g, v in out.items()}


def stack(feats, groups):
    return np.hstack([feats[g] for g in groups])


def gaps(human, other):
    """Per group: largest absolute standardised mean difference of its features."""
    out = {}
    for g in GROUPS:
        h, o = human[g], other[g]
        sd = np.sqrt((h.var(axis=0) + o.var(axis=0)) / 2) + 1e-9
        out[g] = float(np.max(np.abs(h.mean(axis=0) - o.mean(axis=0)) / sd))
    return out


# ---------------------------------------------------------------- copying


def shape_vec(s, n=16):
    """Stroke resampled at n equal time steps, relative to its start, in px."""
    s = np.asarray(s, float)
    u = np.linspace(0, s[-1, 0], n)
    return np.concatenate([np.interp(u, s[:, 0], s[:, k]) - s[0, k] for k in (1, 2)])


def nn_dist(strokes, bank, exclude=None):
    """RMS distance from each stroke to its nearest stroke in `bank`, divided
    by the stroke's start-to-end distance
    (an array of shape vectors); exclude[i] is a boolean mask of bank rows
    stroke i may not match (its own session)."""
    out = np.empty(len(strokes))
    for i, s in enumerate(strokes):
        d = np.sqrt(((bank - shape_vec(s)) ** 2).mean(axis=1))
        if exclude is not None:
            d = np.where(exclude[i], np.inf, d)
        s = np.asarray(s, float)
        out[i] = d.min() / max(np.hypot(*(s[-1, 1:] - s[0, 1:])), 1.0)
    return out
