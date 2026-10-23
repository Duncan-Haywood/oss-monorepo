"""Four ways to hold a clock model between audio re-syncs of two free-running cameras, scored on
clock-rate scenarios computed from a sourced AT-cut crystal temperature curve.

Estimator and audio model are `capture-audiosync`'s (GCC-PHAT on synthetic speech-like noise); the
scoring, the window cut with the correction in force and the offset/slope baselines are
`capture-syncslope`'s."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "capture-audiosync", "src"))
from capture_audiosync import make_pair, gcc_phat  # noqa: E402

TOL_S = 0.040  # EBU R37 lead limit, a stand-in (see capture-syncbudget)
A3_PPM_PER_K3 = 1.05e-4  # AT-cut cubic coefficient, Corning/Tele Quarz data book 2001, "Technical Introduction: Crystals"
A1_PER_ARCMIN = -0.085  # ppm/K per one-sixtieth of a degree of cut-angle error, same source


def crystal_ppm(temp_c, t_inv_c=25.0, dphi_arcmin=0.0):
    """Fractional frequency offset (ppm) of an AT-cut crystal: a1 (T-Tinv) + a3 (T-Tinv)^3."""
    d = np.asarray(temp_c, dtype=float) - t_inv_c
    return A1_PER_ARCMIN * dphi_arcmin * d + A3_PPM_PER_K3 * d ** 3


def _temps(name, t):
    """(T_A, T_B) in deg C. Camera A warms up after power-on; B sits at ambient. Assumed profiles."""
    if name == "warmup":
        amb = np.full_like(t, 20.0)
        return amb + 25.0 * (1 - np.exp(-t / 900.0)), amb
    amb = 15.0 + 10.0 * t / 21600.0 + 3.0 * np.sin(2 * np.pi * t / 3600.0)  # "sunday": drifting, gusty day
    return amb + 25.0 * (1 - np.exp(-t / 900.0)) + 10.0 * np.sin(np.pi * t / 21600.0) ** 2, amb


SCENARIOS = ("static", "warmup", "sunday", "wobble10", "wobble30")


def scenario_delay(name, span_s=6 * 3600.0, d0_s=0.8, base_ppm=20.0, dphi=(5.0, -5.0), t_inv=(25.0, 35.0)):
    """True delay of camera B behind A, on a 1 s grid, and the relative rate in ppm.
    static / wobbleN: 40 ppm constant, plus an N ppm sinusoidal rate wobble of 3600 s period (assumed,
    as in capture-syncslope). warmup / sunday: base_ppm (assumed initial tolerance) plus the difference of
    the two crystals' temperature curves (sourced), with cut-angle errors dphi arcmin and turnover t_inv."""
    t = np.arange(0.0, span_s + 1.0, 1.0)
    if name == "static" or name.startswith("wobble"):
        w = float(name[6:]) if name.startswith("wobble") else 0.0
        rate = 40.0 + w * np.sin(2 * np.pi * t / 3600.0)
    else:
        ta, tb = _temps(name, t)
        rate = base_ppm + crystal_ppm(ta, t_inv[0], dphi[0]) - crystal_ppm(tb, t_inv[1], dphi[1])
    delay = d0_s + np.concatenate([[0.0], np.cumsum(rate[:-1] * 1e-6)])
    return delay, rate


class Hold:
    """Offset hold: the last accepted estimate, gated by ppm_max * dt + margin."""
    def __init__(self, margin_s=0.005, ppm_max=100.0, **_):
        self.t, self.e, self.margin, self.ppm_max, self.n = [], [], margin_s, ppm_max, 0

    def predict(self, t):
        return self.e[-1]

    def gate(self, t, est):
        return abs(est - self.e[-1]) <= self.ppm_max * 1e-6 * (t - self.t[-1]) + self.margin

    def add(self, t, est):
        self.t.append(float(t)); self.e.append(float(est))

    def reset(self):
        self.t, self.e = [], []

    def line(self, t):  # (value now, rate per s) of the model in force from t
        return self.predict(t), 0.0


class Slope(Hold):
    """Least-squares line through the last `keep` accepted estimates. gate_ppm=None is capture-syncslope's
    5 ms line gate; a number allows the rate to differ from the fit by that many ppm."""
    def __init__(self, keep=8, gate_ppm=None, robust=False, **kw):
        super().__init__(**kw)
        self.keep, self.gate_ppm, self.robust = keep, gate_ppm, robust

    def _fit(self):
        t, e = np.array(self.t[-self.keep:]), np.array(self.e[-self.keep:])
        if len(t) < 2:
            return 0.0, e[-1] - 0.0 * t[-1]
        if self.robust:  # Theil-Sen: median pairwise slope, median intercept
            i, j = np.triu_indices(len(t), 1)
            m = float(np.median((e[j] - e[i]) / (t[j] - t[i])))
            return m, float(np.median(e - m * t))
        c = np.polyfit(t, e, 1)
        return float(c[0]), float(c[1])

    def predict(self, t):
        if len(self.t) < 2:
            return self.e[-1]
        m, b = self._fit()
        return m * t + b

    def gate(self, t, est):
        if len(self.t) < 2:
            return super().gate(t, est)
        slack = self.margin + ((self.gate_ppm or 0.0) * 1e-6 * (t - self.t[-1]))
        return abs(est - self.predict(t)) <= slack

    def line(self, t):
        if len(self.t) < 2:
            return self.e[-1], 0.0
        m, b = self._fit()
        return m * t + b, m


class Kalman(Hold):
    """Constant-rate model with a random-walk rate: state [delay, rate]. Measurement sd r_s; the rate
    wanders by q_ppm_per_sqrt_h ppm over an hour (1 sigma). Gate: innovation within 4 sigma + margin."""
    def __init__(self, r_s=0.001, q_ppm_per_sqrt_h=5.0, rate0_ppm=60.0, nsig=4.0, **kw):
        super().__init__(**kw)
        self.r, self.q, self.p0, self.nsig, self.x = r_s ** 2, (q_ppm_per_sqrt_h * 1e-6) ** 2 / 3600.0, (rate0_ppm * 1e-6) ** 2, nsig, None

    def _pred(self, t):
        dt = t - self.t[-1]
        d, v = self.x
        F = np.array([[1.0, dt], [0.0, 1.0]])
        Q = self.q * np.array([[dt ** 3 / 3, dt ** 2 / 2], [dt ** 2 / 2, dt]])
        return np.array([d + v * dt, v]), F @ self.P @ F.T + Q

    def predict(self, t):
        return self._pred(t)[0][0] if self.x is not None else self.e[-1]

    def gate(self, t, est):
        x, P = self._pred(t)
        return abs(est - x[0]) <= self.nsig * np.sqrt(P[0, 0] + self.r) + self.margin

    def add(self, t, est):
        if self.x is None or not self.t:
            self.x, self.P = np.array([est, 0.0]), np.diag([self.r, self.p0])
        else:
            x, P = self._pred(t)
            S = P[0, 0] + self.r
            K = P[:, 0] / S
            self.x = x + K * (est - x[0])
            self.P = (np.eye(2) - np.outer(K, [1.0, 0.0])) @ P
        self.t.append(float(t)); self.e.append(float(est))

    def reset(self):
        super().reset(); self.x = None

    def line(self, t):
        return self.x[0], self.x[1]


def make_holder(mode, **kw):
    if mode == "offset":
        return Hold(**kw)
    if mode == "slope_strict":
        return Slope(**kw)
    if mode == "slope_wide":
        return Slope(gate_ppm=30.0, **kw)
    if mode == "theilsen_wide":
        return Slope(gate_ppm=30.0, robust=True, **kw)
    if mode.startswith("kalman"):  # kalman, or kalman_q<N>: rate wander of N ppm per sqrt(hour)
        return Kalman(q_ppm_per_sqrt_h=float(mode[8:]) if "_q" in mode else 5.0, **kw)
    raise ValueError(mode)


MODES = ("offset", "slope_strict", "slope_wide", "theilsen_wide", "kalman")
MODES_ALL = MODES + ("kalman_q1", "kalman_q20")


def simulate(seed, mode="kalman", scenario="static", every_s=900.0, snr_db=-12.0, span_s=6 * 3600.0,
             win_s=2.0, first_win_s=10.0, reset_after=2, tol_s=TOL_S, estimate=None):
    """Share of the shoot with |applied correction(t) - true delay(t)| > tol_s, plus (n_rejected, n_wrong_applied).
    The window is cut with the correction in force so only the residual is searched. After `reset_after`
    rejections in a row the next estimate is trusted and the model restarts (0 turns that off).
    `estimate(rng, residual_s, win_s)` replaces GCC-PHAT (tests only)."""
    rng = np.random.default_rng(seed)
    delay, _ = scenario_delay(scenario, span_s)
    h = make_holder(mode)
    segs = []  # (t_start, value at t_start, rate) of the correction in force
    rejected = wrong = streak = 0
    for t in np.arange(0.0, span_s, every_s):
        cur = 0.0
        if segs:
            t0, v0, r0 = segs[-1]
            cur = v0 + r0 * (t - t0)
        resid = delay[int(t)] - cur
        w = first_win_s if not h.t else win_s
        if estimate is not None:
            est = cur + estimate(rng, resid, w)
        else:
            a, b = make_pair(rng, resid, w, snr_db)
            est = cur + gcc_phat(a, b)
        if h.t and not h.gate(t, est):
            if reset_after and streak + 1 >= reset_after:
                h.reset()
            else:
                rejected += 1
                streak += 1
                continue
        streak = 0
        h.add(t, est)
        if abs(est - delay[int(t)]) > tol_s:
            wrong += 1
        v, m = h.line(t)
        segs.append((float(t), float(v), float(m)))
    grid = np.arange(0.0, span_s, 1.0)
    starts = np.array([s[0] for s in segs])
    idx = np.searchsorted(starts, grid, side="right") - 1
    ok = idx >= 0
    s = np.array(segs)
    applied = np.where(ok, s[np.clip(idx, 0, None), 1] + s[np.clip(idx, 0, None), 2] * (grid - starts[np.clip(idx, 0, None)]), np.inf)
    return float(np.mean(np.abs(applied - delay[: len(grid)]) > tol_s)), rejected, wrong
