"""Milestone 7c: price the step-up drive that 7b's spun pump needs (LOG.md 7b, Next k).

7b drove a family's largest size faster than 2100 r/min to reach flows above its range and priced the step-up drive
as lossless. GearedSpun adds the drive's loss, from an open measured source: Anderson and Loewenthal, NASA Technical
Paper 1622 (1980), "Spur-gear-system efficiency at part and full load" (NTRS 19800009206). Its Table III example, one
steel spur mesh on ball bearings at 2000 r/min and 56.79 kW in, loses 0.3776 kW (sliding, rolling, windage and
bearings): system efficiency 99.34%. Its figure 9 text: the no-load (tare) loss "theoretically can reach 65 percent of
the full-load loss" at 2000 r/min.

Drive loss L = (1 - eta_f) [t P_rated + (1 - t) P], with P the pump's drive power and P_rated its drive power at the
size's p2 (AZPF 28: 200 bar, AZPN 36: 180 bar) at the same speed; both scale with flow beyond the cap, as 7b does.
Below the largest size's 2100 r/min flow no drive is fitted and the family is 7b's SpunGear (that is, Gear).

Grid: eta_f in {0.9934 (sourced), 0.99, 0.985, 0.98 (a plausible lower end for a mobile PTO drive, not sourced)} x
t in {0, 0.325, 0.65 (sourced upper end)}. Each cell: index 2, idle kW at 85 L/min, E50 with its own shape and drag
(7b's pipeline), scored against rule (Z) 0.8239 + 0.0179 (kW - 3.57). At the sourced point also the eight-family
factorial and leave-one-family-out with both families geared. Predictions GB1 to GB6 are in LOG.md (7c), registered
before any geared number was computed.

Usage: python gear_pump_stepup.py [cache dir] > gear_pump_stepup_results.txt
Needs numpy and h5py (cache shared with 5z to 7b).
"""
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import gear_pump_point  # noqa: E402
import gear_pump_shape as gs  # noqa: E402
import gear_pump_rexroth as gr  # noqa: E402
import gear_pump_five as g5  # noqa: E402
import gear_pump_six as g6  # noqa: E402
import gear_pump_seven as g7  # noqa: E402
import gear_pump_eight as g8  # noqa: E402
import gear_pump_spin as gp  # noqa: E402
import digitise_rexroth_azpg as rx  # noqa: E402
import digitise_rexroth_azpn as rn  # noqa: E402
import digitise_rexroth_azpu as ru  # noqa: E402
import digitise_rexroth_azpf as rf  # noqa: E402
from excavator_gear_pump import Gear, gear_powers  # noqa: E402
from excavator_idle_standby import CENTRAL  # noqa: E402
from excavator_breakeven_geometry import GRID  # noqa: E402

E_GRID = g5.E_GRID
FAMS = g8.FAMS
SPUN = gp.SPUN                                  # n_cap, r/min
P2 = {"azpf": rf.P2[rf.SIZES[-1]], "azpn": rn.P2[rn.SIZES[-1]]}   # bar: 200 and 180
RULE_Z = g8.RULE_Z
Q85 = 85.0
ETA_SRC, T_SRC = 0.9934, 0.65                   # NASA TP-1622 Table III; figure 9 text
ETAS = (0.9934, 0.99, 0.985, 0.98)
TARES = (0.0, 0.325, 0.65)
SPUN_7B = {"azpf": (0.8075, 2.99), "azpn": (0.8031, 2.61)}   # 7b: E50 and idle kW, gear_pump_spin_results.txt


class GearedSpun(gp.SpunGear):
    """7b's SpunGear with a step-up drive above the largest size's 2100 r/min flow, losing
    (1 - eta_f) [t P_rated + (1 - t) P]."""

    def __init__(self, rows, sizes, n_cap, p2, eta_f, tare, n_r=1.0):
        super().__init__(rows, sizes, n_cap, n_r=n_r)
        self.p2, self.eta_f, self.tare = float(p2), float(eta_f), float(tare)

    def loss(self, p_pump, p_rated):
        return (1.0 - self.eta_f) * (self.tare * p_rated + (1.0 - self.tare) * p_pump)

    def eta(self, q, p):
        if q <= self.qn[-1]:
            return super().eta(q, p)
        _, fl, pw, _, _ = self.at(q)
        P = pw(p)
        return fl(p) * p / (600.0 * (P + self.loss(P, pw(self.p2))))

    def idle(self, q, pn):
        if q <= self.qn[-1]:
            return super().idle(q, pn)
        n, _, pw, ipw, q20 = self.at(q)
        rated = pw if self.n_r == 1.0 else gear_pump_point(self.rows, self.big, n * self.n_r)[1]
        P = ipw(pn)
        return q * (P + self.loss(P, rated(self.p2))) / q20


def rule(r, kw):
    return r[0] + r[1] * (kw - r[2])


def main(cache):
    gs.E_GRID = E_GRID
    base = gs.families()
    base["rexroth"] = Gear(gr.rexroth_rows(), sizes=rx.SIZES)
    base["azpu"] = Gear(g7.azpu_rows(), sizes=ru.SIZES)
    rows_of = {"azpf": (g8.azpf_rows(), rf.SIZES), "azpn": (g6.azpn_rows(), rn.SIZES)}
    gears = dict(base)
    for f, (r, sz) in rows_of.items():
        gears[f + "_spin"] = gp.SpunGear(r, sz, SPUN[f])
        for e in ETAS:
            for t in TARES:
                gears[(f, e, t)] = GearedSpun(r, sz, SPUN[f], P2[f], e, t)
    E = {k: (g.eta(Q85, 150.0) if not isinstance(k, str) or k.endswith("_spin") else gs.index2(g, k))
         for k, g in gears.items()}
    rows, coef = gs.geometry_rows(cache, gears)
    idle = {k: gear_powers(g, coef, *CENTRAL) for k, g in gears.items()}
    k85 = int(round((Q85 - GRID[0]) / 0.5))
    kw = {k: float(idle[k][0][k85]) for k in gears}
    ks = {k: gears[k].eta(150.0, 150.0) / E[k] - 1.0 for k in gears}
    for i, x in enumerate(rows):
        x["i"] = i
    norm = {k: [x["eo"][k] / E[k] for x in rows] for k in gears}

    def cell(f, g):
        sh = gs.shares(rows, lambda x, e: np.minimum(gs.CAP, e * norm[f][x["i"]]), idle[g])
        return gs.crossing(list(E_GRID), sh)

    out = []
    p = out.append
    p("Milestone 7c: the step-up drive priced (spur-gear system loss from NASA TP-1622, swept) for 7b's spun AZPF "
      "size 28 (to 3000 r/min) and AZPN size 36 (to 2700 r/min)")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps as gear_pump_spin.py; drive loss: Anderson and Loewenthal 1980, NASA "
      "TP-1622, Table III and figure 9)")
    p("")
    e7 = {f: cell(f + "_spin", f + "_spin") for f in SPUN}
    p("Check: ungeared spun diagonals against 7b: " + ", ".join(
        f"{f} E50 {e7[f]:.4f} ({e7[f] - SPUN_7B[f][0]:+.4f}), idle {kw[f + '_spin']:.2f} kW "
        f"({kw[f + '_spin'] - SPUN_7B[f][1]:+.2f})" for f in SPUN))
    p("")
    p("Drive loss at the sourced point (eta_f 0.9934, tare 0.65), per pump at 85 L/min:")
    for f in SPUN:
        g = gears[(f, ETA_SRC, T_SRC)]
        n, fl, pw, _, q20 = g.at(Q85)
        sc = Q85 / q20
        p(f"  {f.upper()}: speed {n:.0f} r/min; rated drive power at {g.p2:.0f} bar {pw(g.p2) * sc:.2f} kW; drive "
          f"loss at 150 bar {g.loss(pw(150.0), pw(g.p2)) * sc * 1000:.0f} W on {pw(150.0) * sc:.2f} kW; at zero "
          f"pressure {g.loss(pw(0.0), pw(g.p2)) * sc * 1000:.0f} W on {pw(0.0) * sc:.2f} kW")
    p("")

    res = {}
    p("(i) the sweep, each geared family alone (E50 with its own shape and drag); rule (Z) error = E50 - rule at the "
      "geared idle kW")
    p("  family  eta_f   tare   index 2  idle kW   E50     dE50 vs 7b  rule (Z)  error")
    for f in SPUN:
        for e in ETAS:
            for t in TARES:
                k = (f, e, t)
                v = cell(k, k)
                pz = rule(RULE_Z, kw[k])
                res[k] = {"e50": v, "err": v - pz, "kw": kw[k]}
                p(f"  {f:6s}  {e:.4f}  {t:.3f}  {E[k]:.4f}   {kw[k]:6.2f}  {v:.4f}  {v - e7[f]:+.4f}      {pz:.4f}  "
                  f"{v - pz:+.4f}")
    p("")

    p("Diagnostic (not a prediction), at the sourced point: which half of the drive moves the crossing")
    for f in SPUN:
        k, s0 = (f, ETA_SRC, T_SRC), f + "_spin"
        a, b = cell(k, s0), cell(s0, k)
        p(f"  {f.upper()}: geared shape with lossless-spin drag {a:.4f} ({a - e7[f]:+.4f}); lossless-spin shape with "
          f"geared drag {b:.4f} ({b - e7[f]:+.4f}); both {res[k]['e50']:.4f} ({res[k]['e50'] - e7[f]:+.4f})")
    p("")

    fam_s = tuple((f, ETA_SRC, T_SRC) if f in SPUN else f for f in FAMS)
    name = lambda k: k if isinstance(k, str) else k[0] + "_gear"  # noqa: E731
    cells = {(f, g): cell(f, g) for f in fam_s for g in fam_s}
    allc = np.array(list(cells.values()))
    p("(ii) eight families with the AZPF and AZPN spun and geared at the sourced point (64 cells): "
      f"{allc.min():.4f} to {allc.max():.4f}")
    p("  shape \\ idle  " + "  ".join(f"{name(h)[:9]:>9s}" for h in fam_s))
    for f in fam_s:
        p(f"  {name(f)[:12]:12s}  " + "  ".join(f"{cells[(f, h)]:9.4f}" for h in fam_s))
    for w in (1, 2):
        b = g5.fit(cells, kw, ks, w)
        r = [cells[(f, h)] - g5.predict(b, kw[h], ks[f]) for f, h in cells]
        extra = f"; as E50 = {g5.predict(b, 3.57, 0.0):.4f} + {b[1]:.4f} (kW - 3.57)" if w == 2 else ""
        p(f"  {'one' if w == 1 else 'two'}-number fit: in-sample RMS {g5.rms(r):.4f}{extra}")
    diag = {1: [], 2: []}
    for h in fam_s:
        train = {c: v for c, v in cells.items() if h not in c}
        for w in (1, 2):
            b = g5.fit(train, kw, ks, w)
            diag[w].append(cells[(h, h)] - g5.predict(b, kw[h], ks[h]))
    p(f"  leave-one-family-out diagonal RMS: one-number {g5.rms(diag[1]):.4f}, two-number {g5.rms(diag[2]):.4f}")
    p("  diagonal errors (two-number): " + ", ".join(f"{name(h)} {e:+.4f}" for h, e in zip(fam_s, diag[2])))
    p("")

    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    src = res[("azpf", ETA_SRC, T_SRC)]
    dkw = src["kw"] - kw["azpf_spin"]
    de = src["e50"] - e7["azpf"]
    mono = True
    for f in SPUN:
        for e in ETAS:
            seq = [res[(f, e, t)]["e50"] for t in TARES]
            mono &= all(b >= a - 1e-4 for a, b in zip(seq, seq[1:]))
        for t in TARES:
            seq = [res[(f, e, t)]["e50"] for e in ETAS]
            mono &= all(b >= a - 1e-4 for a, b in zip(seq, seq[1:]))
    errs = [res[(("azpf"), e, t)]["err"] for e in ETAS for t in TARES]
    p("Predictions (LOG.md 7c):")
    p(f"  GB1 geared AZPF idle kW 0.05 to 0.25 above the spun 2.99 at the sourced point: {ok(0.05 <= dkw <= 0.25)} "
      f"({dkw:+.3f} kW)")
    p(f"  GB2 geared AZPF E50 0.0005 to 0.0040 above the spun 0.8075 at the sourced point: "
      f"{ok(0.0005 <= de <= 0.0040)} ({de:+.4f})")
    p(f"  GB3 E50 does not fall as the loss grows, either axis, either family: {ok(mono)}")
    p(f"  GB4 rule (Z) error on the geared AZPF at the sourced point in -0.0075 to -0.0045: "
      f"{ok(-0.0075 <= src['err'] <= -0.0045)} ({src['err']:+.4f})")
    p(f"  GB5 rule (Z) error on the geared AZPF within +-0.008 across the grid: {ok(max(map(abs, errs)) <= 0.008)} "
      f"({min(errs):+.4f} to {max(errs):+.4f})")
    p(f"  GB6 eight-family LOFO two-number diagonal RMS at most 0.0040 with both geared: "
      f"{ok(g5.rms(diag[2]) <= 0.0040)} ({g5.rms(diag[2]):.4f})")
    p("")
    p("Sources: as gear_pump_spin.py; Anderson, N. E. and Loewenthal, S. H. (1980), Spur-gear-system efficiency at "
      "part and full load, NASA Technical Paper 1622 (NTRS 19800009206), Table III (99.34%) and figure 9 text (tare "
      "up to 65% of full-load loss at 2000 r/min).")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
