"""Milestone 6a: a smaller fixed open-centre pump on the measured excavator, priced in cycle time.

5z turned the joint motion of folder `75` of `fuxi-robot/excavator-motion` (CC BY-NC-SA 4.0) into
cylinder flow demand with the XCMG XE80E's published cylinders, and found that a fixed pump at the p99
of demand delivers about 2.4 times the oil the work uses. Here the fixed pump shrinks, as 5w did on the
loader: where demand q exceeds the pump flow q_p the actuators slow (the sample lasts dt q / q_p), so
the pumped volume is sum max(q_p, q) dt and r(q_p) = sum max(q_p, q) dt / sum q dt (measured.pump_ratio).
The break-even load-sensing margin follows 5u's rule as in 5z, m* ~ 0.78 (r - 1) p. The equal-energy
pump q_eq is where m* equals a margin sold; its cost is open-centre record time over load-sensing's, with
load-sensing charged its own 219 L/min limit. Predictions A1 to A6 are in LOG.md (6a), registered
before this script existed.

Usage: python measured_excavator_pump_size.py [cache dir]   (default ~/.cache/heavy-hydraulics-excavator)
Needs numpy and h5py; under a minute of range reads on first run (shared cache with 5z), seconds after.
"""
import itertools
import os
import statistics
import sys

import numpy as np

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import pump_ratio, pump_for_ratio  # noqa: E402
from measured_excavator_flow import load, demand, CYL, Q_PUMP, V_MOVE, COV, P_TOP, SHARE  # noqa: E402

JOINTS = ("boom", "arm", "bucket")
FRACS = (1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4)          # of 219 L/min, registered
MARGINS = (14.0, 20.0, 24.9, 25.0)                          # bar; central 20
PRESS = (100.0, SHARE * P_TOP, 174.0)                       # bar; central 0.41 x 316
LOADER_TIME = 1.39                                          # 5w, at the loader's V_eq
KIN = (-1, 1)                                               # boom, arm signs from the dataset's kinematics


def spearman(a, b):
    ra = np.argsort(np.argsort(a)).astype(float)
    rb = np.argsort(np.argsort(b)).astype(float)
    return float(np.corrcoef(ra, rb)[0, 1])


class Trace:
    """Moving-sample demand of all files, with per-sample dt, and the whole-record time base."""

    def __init__(self, recs, levers, signs, s_swing):
        self.files = []
        for r in recs:
            q = demand(r["v"], levers, signs, s_swing)
            mv = np.abs(r["v"]).max(1) > V_MOVE
            self.files.append((np.where(mv, q, 0.0), mv, r["dt"]))
        self.q = np.concatenate([q[m] for q, m, _ in self.files])
        self.w = np.concatenate([np.full(m.sum(), dt) for _, m, dt in self.files])
        self.vol = float((self.q * self.w).sum())
        self.p99 = float(np.percentile(self.q, 99))

    def r(self, qp, sub=None):
        q, w = (self.q, self.w) if sub is None else sub
        return float((np.maximum(qp, q) * w).sum() / (q * w).sum())

    def q_for(self, r_t, sub=None):
        q = self.q if sub is None else sub[0]
        lo, hi = 0.0, float(q.max())
        if self.r(hi, sub) < r_t:
            return hi * r_t / self.r(hi, sub)
        for _ in range(80):
            mid = 0.5 * (lo + hi)
            lo, hi = (mid, hi) if self.r(mid, sub) < r_t else (lo, mid)
        return 0.5 * (lo + hi)

    def time_ratio(self, qp, files=None):
        t_oc = t_ls = 0.0
        for q, _, dt in (self.files if files is None else files):
            t_oc += np.maximum(1.0, q / qp).sum() * dt
            t_ls += np.maximum(1.0, q / Q_PUMP).sum() * dt
        return float(t_oc / t_ls)


def r_for_margin(m, p):
    return 1.0 + m / (COV * p)


def main(cache):
    recs = load(cache)
    allq = np.concatenate([r["q"] for r in recs])
    span = np.percentile(allq, 99.9, axis=0) - np.percentile(allq, 0.1, axis=0)
    lev0 = [CYL[k][2] / span[j] for j, k in enumerate(JOINTS)]
    out = []
    p = out.append
    p("Milestone 6a: a smaller fixed pump on the measured excavator, priced in cycle time")
    p("(fuxi-robot/excavator-motion, folder 75, CC BY-NC-SA 4.0; geometry XCMG XE80E brochure; demand as 5z)")
    p("")
    cen = Trace(recs, lev0, KIN + (1,), 0.5)
    p_c = SHARE * P_TOP
    # checks: numpy r equals the tested stdlib pump_ratio on one file (equal dt there); stock r as 5z
    q1 = cen.files[0][0][cen.files[0][1]]
    p(f"check: numpy r vs stdlib pump_ratio, file 1 at 120 L/min: {cen.r(120.0, (q1, np.ones_like(q1))):.6f} "
      f"vs {pump_ratio(list(q1), 120.0):.6f}; inverse at that r {pump_for_ratio(list(q1), pump_ratio(list(q1), 120.0)):.3f} L/min")
    p(f"check: r at the p99 pump {cen.p99:.1f} L/min = {cen.r(cen.p99):.3f} (5z: 2.38); "
      f"r at 219 L/min = {cen.r(Q_PUMP):.3f} (5z: 2.16 to 2.17, no slowing there)")
    p(f"central demand while moving: mean {cen.vol / cen.w.sum():.1f}, median {np.median(cen.q):.1f}, "
      f"p99 {cen.p99:.1f} L/min; load-sensing at 219 L/min slows {np.mean(cen.q > Q_PUMP) * 100:.1f}% of moving samples")
    p("")
    p(f"Pump sweep, central (kinematic signs, bucket +1, swing 0.5, p {p_c:.0f} bar, m* = {COV} (r - 1) p):")
    p(f"{'frac':>5} {'q_p L/min':>10} {'r':>7} {'m* bar':>8} {'time OC/LS':>11} {'short %':>8}")
    sweep = []
    for f in FRACS:
        qp = f * Q_PUMP
        r = cen.r(qp)
        tr = cen.time_ratio(qp)
        sweep.append((qp, r, COV * (r - 1) * p_c, tr))
        p(f"{f:>5.2f} {qp:>10.1f} {r:>7.3f} {COV * (r - 1) * p_c:>8.1f} {tr:>11.3f} {np.mean(cen.q > qp) * 100:>8.1f}")
    p("")
    p("Equal-energy pump q_eq (m* = margin), central geometry:")
    p(f"{'margin':>7} {'p bar':>6} {'r_eq':>6} {'q_eq L/min':>11} {'q_eq/p99':>9} {'q_eq/219':>9} {'time OC/LS':>11}")
    eq = {}
    for m in MARGINS:
        for pr in PRESS:
            r_t = r_for_margin(m, pr)
            qe = cen.q_for(r_t)
            eq[(m, pr)] = (qe, cen.time_ratio(qe))
            p(f"{m:>7.1f} {pr:>6.0f} {r_t:>6.3f} {qe:>11.1f} {qe / cen.p99:>9.3f} {qe / Q_PUMP:>9.3f} {eq[(m, pr)][1]:>11.3f}")
    qe_c, tr_c = eq[(20.0, p_c)]
    p("")
    # per file at the pooled q_eq, and each file's own q_eq
    rs, trs, own = [], [], []
    for fq, mv, dt in cen.files:
        sub = (fq[mv], np.full(mv.sum(), dt))
        rs.append(cen.r(Q_PUMP, sub))
        trs.append(cen.time_ratio(qe_c, [(fq, mv, dt)]))
        own.append(cen.time_ratio(cen.q_for(r_for_margin(20.0, p_c), sub), [(fq, mv, dt)]))
    rho = spearman(rs, trs)
    p(f"per file (central, pooled q_eq {qe_c:.1f} L/min): r at 219 {min(rs):.2f} to {max(rs):.2f}; time ratio "
      f"{min(trs):.3f} to {max(trs):.3f} (median {statistics.median(trs):.3f}); each file at its own q_eq "
      f"{min(own):.3f} to {max(own):.3f}; Spearman(r at 219, time ratio) {rho:.3f}")
    p("")
    # step-wise price of break-even, bar per % of time
    pts = [s for s in sweep if s[0] > qe_c] + [(qe_c, None, 20.0, tr_c)]
    p("Break-even bought per % of extra time, step by step (central):")
    rates = []
    for a, b in zip(pts, pts[1:]):
        dm, dtp = a[2] - b[2], (b[3] - a[3]) * 100
        rate = dm / dtp if dtp > 0 else float("inf")
        rates.append(rate)
        p(f"  {a[0]:>6.1f} -> {b[0]:>6.1f} L/min: {dm:6.1f} bar for {dtp:5.2f}% time ({rate:.2f} bar per %)")
    p("")
    # geometry sweep, as 5z's 384 cases, x margins 14 to 25 x pressures
    fs = (1.0, 1.5, 2.0, 2.5)
    g_tr, g_qf = [], []
    for fb, fa, fu in itertools.product(fs, repeat=3):
        lev = [lev0[0] / fb, lev0[1] / fa, lev0[2] / fu]
        for bs in (1, -1):
            for s_sw in (0.0, 0.5, 1.0):
                tr_ = Trace(recs, lev, KIN + (bs,), s_sw)
                for m in (14.0, 20.0, 25.0):
                    for pr in PRESS:
                        qe = tr_.q_for(r_for_margin(m, pr))
                        g_tr.append(tr_.time_ratio(qe))
                        g_qf.append(qe / tr_.p99)
                tr20 = tr_.time_ratio(tr_.q_for(r_for_margin(20.0, p_c)))
                if (fb, fa, fu, bs, s_sw) == (1.0, 1.0, 1.0, 1, 0.5):
                    assert abs(tr20 - tr_c) < 1e-9
    gt, gq = g_tr, g_qf
    p(f"Geometry sweep: 384 cases (lever factors 1 to 2.5 per joint, bucket sign, swing 0/0.5/1) x margins 14/20/25 "
      f"x p 100/{p_c:.0f}/174 bar = {len(gt)}: time ratio at q_eq {min(gt):.3f} to {max(gt):.3f} "
      f"(median {statistics.median(gt):.3f}); q_eq/p99 {min(gq):.3f} to {max(gq):.3f}")
    p("")
    p("Predictions (LOG.md 6a):")
    a1 = qe_c / cen.p99 < 0.5
    p(f"  A1 q_eq below half the p99 demand (central): {'held' if a1 else 'refuted'} ({qe_c:.1f} / {cen.p99:.1f} = {qe_c / cen.p99:.3f})")
    p(f"  A2 time ratio at q_eq > 1.25 (central): {'held' if tr_c > 1.25 else 'refuted'} ({tr_c:.3f})")
    p(f"  A3 time ratio > the loader's {LOADER_TIME} (central): {'held' if tr_c > LOADER_TIME else 'refuted'} ({tr_c:.3f}; "
      f"at the loader's 24.9 bar margin {eq[(24.9, p_c)][1]:.3f})")
    p(f"  A4 time ratio > 1.10 in every sweep case: {'held' if min(gt) > 1.10 else 'refuted'} (min {min(gt):.3f})")
    p(f"  A5 Spearman(r at 219, time ratio) < -0.5 over files: {'held' if rho < -0.5 else 'refuted'} ({rho:.3f})")
    p(f"  A6 first step buys more bar per % time than the last: {'held' if rates[0] > rates[-1] else 'refuted'} "
      f"({rates[0]:.2f} against {rates[-1]:.2f})")
    p("")
    p("Source: fuxi-robot/excavator-motion, https://huggingface.co/datasets/fuxi-robot/excavator-motion, CC BY-NC-SA 4.0. "
      "Derived statistics only; no data redistributed.")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
