"""Milestone 7b: spin the largest size instead of holding it (LOG.md 7a, Next i).

Above a family's largest size the model (excavator_gear_pump.Gear._blend) holds the largest size's efficiency map and
drag per L/min, as if a larger pump of the same make existed. A builder short of displacement would instead drive the
largest size faster through a step-up drive. SpunGear does that: up to the largest size's 2100 r/min 20 bar flow Q_L
it is Gear; above it, a pump of flow q is the largest size at the speed n where its drawn 20 bar flow line gives q,
capped at n_cap, with efficiency and drag per L/min read off the sheet's own curves at n
(measured.gear_pump_point at that speed), and held at n_cap's per-unit values beyond.

Caps: AZPF size 28, n_max 3000 r/min at p2 (RE 10089/2021-11-24, page 9; its power curves are drawn to 3000 r/min).
AZPN size 36, 2700 r/min, the speed its power curves are drawn to (rated n_max not re-read this session; disclosed).

(i)  each spun family alone: index 2 (eta at 85 L/min, 150 bar), idle kW at 85 L/min, E50 with its own shape and drag,
     scored against rule (Z) 0.8239 + 0.0179 (kW - 3.57) and 7a's 64-cell refit 0.8238 + 0.0177 (kW - 3.57), and against
     the held reading; swaps (spun shape with held drag, held shape with spun drag).
(ii) the eight-family factorial with the two spun families in place of the held ones: rules refitted on 64 cells and
     leave-one-family-out (gear_pump_eight's method).
Everything else is 7a's pipeline (S = 0.38, central setting, 6k's 384 geometries, E 0.70 to 0.96 step 0.0025).
Predictions SP1 to SP6 are in LOG.md (7b), registered before any spun number was computed.

Usage: python gear_pump_spin.py [cache dir] > gear_pump_spin_results.txt
Needs numpy and h5py (cache shared with 5z to 7a).
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
import digitise_rexroth_azpg as rx  # noqa: E402
import digitise_rexroth_azpn as rn  # noqa: E402
import digitise_rexroth_azpu as ru  # noqa: E402
import digitise_rexroth_azpf as rf  # noqa: E402
from excavator_gear_pump import Gear, gear_powers, N_W  # noqa: E402
from excavator_idle_standby import CENTRAL, S_C  # noqa: E402
from excavator_breakeven_geometry import GRID  # noqa: E402

E_GRID = g5.E_GRID
FAMS = g8.FAMS
SPUN = {"azpf": 3000.0, "azpn": 2700.0}       # n_cap, r/min
RULE_Z = g8.RULE_Z
RULE_8 = (0.8238, 0.0177, 3.57)               # 7a: 64-cell refit
Q85 = 85.0
HELD_7A = {"azpf": 0.8075, "azpn": 0.8050}    # 7a: diagonal cells, gear_pump_eight_results.txt


class SpunGear(Gear):
    """Gear, except that above the largest size's 2100 r/min flow the largest size is driven faster (to n_cap)."""

    def __init__(self, rows, sizes, n_cap, n_r=1.0):
        super().__init__(rows, n_r=n_r, sizes=sizes)
        self.rows, self.n_cap, self.big = rows, n_cap, sizes[-1]
        self.memo = {}

    def speed(self, q):
        """Speed at which the largest size's 20 bar flow is q (flow lines are straight in speed), capped."""
        n = N_W * q / self.qn[-1]
        for _ in range(4):
            if n >= self.n_cap:
                return self.n_cap
            n *= q / gear_pump_point(self.rows, self.big, n)[0](20.0)
        return min(n, self.n_cap)

    def at(self, q):
        key = round(float(q), 4)
        if key not in self.memo:
            n = self.speed(q)
            fl, pw = gear_pump_point(self.rows, self.big, n)
            idle_pw = pw if self.n_r == 1.0 else gear_pump_point(self.rows, self.big, n * self.n_r)[1]
            self.memo[key] = (n, fl, pw, idle_pw, fl(20.0))
        return self.memo[key]

    def eta(self, q, p):
        if q <= self.qn[-1]:
            return super().eta(q, p)
        _, fl, pw, _, _ = self.at(q)
        return fl(p) * p / (600.0 * pw(p))

    def idle(self, q, pn):
        if q <= self.qn[-1]:
            return super().idle(q, pn)
        _, _, _, ipw, q20 = self.at(q)
        return q * ipw(pn) / q20


def rule(r, kw):
    return r[0] + r[1] * (kw - r[2])


def main(cache):
    gs.E_GRID = E_GRID
    gears = gs.families()
    gears["rexroth"] = Gear(gr.rexroth_rows(), sizes=rx.SIZES)
    gears["azpn"] = Gear(g6.azpn_rows(), sizes=rn.SIZES)
    gears["azpu"] = Gear(g7.azpu_rows(), sizes=ru.SIZES)
    gears["azpf"] = Gear(g8.azpf_rows(), sizes=rf.SIZES)
    gears["azpf_spin"] = SpunGear(g8.azpf_rows(), rf.SIZES, SPUN["azpf"])
    gears["azpn_spin"] = SpunGear(g6.azpn_rows(), rn.SIZES, SPUN["azpn"])
    E = {f: gs.index2(g, f) for f, g in gears.items()}
    for f in SPUN:
        E[f + "_spin"] = gears[f + "_spin"].eta(Q85, 150.0)
    rows, coef = gs.geometry_rows(cache, gears)
    idle = {f: gear_powers(g, coef, *CENTRAL) for f, g in gears.items()}
    k85 = int(round((Q85 - GRID[0]) / 0.5))
    kw = {f: float(idle[f][0][k85]) for f in gears}
    ks = {f: gears[f].eta(150.0, 150.0) / E[f] - 1.0 for f in gears}
    for i, x in enumerate(rows):
        x["i"] = i
    norm = {f: [x["eo"][f] / E[f] for x in rows] for f in gears}

    def cell(f, g):
        sh = gs.shares(rows, lambda x, e: np.minimum(gs.CAP, e * norm[f][x["i"]]), idle[g])
        return gs.crossing(list(E_GRID), sh)

    out = []
    p = out.append
    p("Milestone 7b: spin the largest size instead of holding it (Bosch Rexroth AZPF size 28 to 3000 r/min, AZPN size "
      "36 to 2700 r/min), then the eight-family factorial with the spun families in place of the held ones")
    p("(motion: fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; load-sensing pump: Kauranne 2022, Energies "
      "15:4030, Fig. 13, CC BY; gear pumps as gear_pump_eight.py; AZPF n_max: RE 10089/2021-11-24, page 9)")
    p("")
    held = {}
    for f in SPUN:
        held[f] = cell(f, f)
    p(f"Check: held diagonals against 7a's table: azpf {held['azpf']:.4f} ({held['azpf'] - HELD_7A['azpf']:+.4f}), "
      f"azpn {held['azpn']:.4f} ({held['azpn'] - HELD_7A['azpn']:+.4f})")
    p("")
    for f, ncap in SPUN.items():
        g, s = gears[f + "_spin"], f + "_spin"
        p(f"{f.upper()} largest size {g.big} cm3/r: {g.qn[-1]:.2f} L/min at {N_W:.0f} r/min; spun to {ncap:.0f} r/min it "
          f"gives {g.at(1e3)[4]:.2f} L/min (held at that speed's per-unit values beyond)")
        p("  q L/min  speed r/min  eta_t(100)  eta_t(150)  eta_t(200)  P(0) W per L/min   held: eta_t(150)  "
          "P(0) W per L/min")
        for q in (g.qn[-1], 65.0, 70.0, 75.0, 80.0, 85.0, 100.0):
            if q < g.qn[-1] - 1e-9:
                continue
            n = g.speed(q) if q > g.qn[-1] else N_W
            h = gears[f]
            hp0 = 1000.0 * h.idle(q, 0.0) / q
            p(f"  {q:7.2f}  {n:11.0f}  {g.eta(q, 100.0):10.4f}  {g.eta(q, 150.0):10.4f}  {g.eta(q, 200.0):10.4f}  "
              f"{1000.0 * g.idle(q, 0.0) / q:16.1f}   {h.eta(q, 150.0):16.4f}  {hp0:16.1f}")
        above = float(np.mean(GRID > g.qn[-1]) * 100)
        reach = float(np.mean((GRID > g.qn[-1]) & (GRID <= g.at(1e3)[4])) * 100)
        p(f"  {above:.1f}% of the size grid lies above {g.qn[-1]:.1f} L/min; spinning reaches {reach:.1f}% of it, the "
          f"rest is held at {ncap:.0f} r/min")
        p("")
    p("Families (index 2 at 85 L/min and 150 bar; size slope k = eta(150 L/min)/E - 1; idle kW at 85 L/min):")
    p("  family      index 2  size slope k  idle kW")
    for f in ("azpf", "azpf_spin", "azpn", "azpn_spin"):
        p(f"  {f:10s}  {E[f]:.4f}  {ks[f]:+12.4f}  {kw[f]:7.2f}")
    p("")

    res = {}
    p("(i) each spun family alone (E50 with its own shape and drag):")
    for f in SPUN:
        s = f + "_spin"
        e = cell(s, s)
        sh_swap, dr_swap = cell(s, f), cell(f, s)
        pz, p8 = rule(RULE_Z, kw[s]), rule(RULE_8, kw[s])
        res[f] = {"e50": e, "ez": e - pz, "shape": sh_swap, "drag": dr_swap}
        p(f"  {f.upper()} spun: E50 {e:.4f} (held {held[f]:.4f}, {e - held[f]:+.4f})")
        p(f"    (Z) 6z rule at {kw[s]:.2f} kW: {pz:.4f}, error {e - pz:+.4f}; 7a 64-cell refit {p8:.4f}, error "
          f"{e - p8:+.4f}")
        p(f"    swaps: spun shape with held drag {sh_swap:.4f} ({sh_swap - held[f]:+.4f} from held); held shape with "
          f"spun drag {dr_swap:.4f} ({dr_swap - held[f]:+.4f} from held)")
    p("")

    fam_s = tuple(f + "_spin" if f in SPUN else f for f in FAMS)
    cells = {(f, g): cell(f, g) for f in fam_s for g in fam_s}
    allc = np.array(list(cells.values()))
    p("(ii) eight families with the AZPF and AZPN spun (64 cells): "
      f"{allc.min():.4f} to {allc.max():.4f}")
    p("  shape \\ idle  " + "  ".join(f"{h[:9]:>9s}" for h in fam_s))
    for f in fam_s:
        p(f"  {f[:12]:12s}  " + "  ".join(f"{cells[(f, h)]:9.4f}" for h in fam_s))
    for w in (1, 2):
        b = g5.fit(cells, kw, ks, w)
        r = [cells[(f, h)] - g5.predict(b, kw[h], ks[f]) for f, h in cells]
        extra = f"; as E50 = {g5.predict(b, 3.57, 0.0):.4f} + {b[1]:.4f} (kW - 3.57)" if w == 2 else ""
        p(f"  {'one' if w == 1 else 'two'}-number fit: in-sample RMS {g5.rms(r):.4f}{extra}")
        if w == 2:
            b2 = b
    diag = {1: [], 2: []}
    for h in fam_s:
        train = {c: v for c, v in cells.items() if h not in c}
        for w in (1, 2):
            b = g5.fit(train, kw, ks, w)
            diag[w].append(cells[(h, h)] - g5.predict(b, kw[h], ks[h]))
    p(f"  leave-one-family-out diagonal RMS: one-number {g5.rms(diag[1]):.4f}, two-number {g5.rms(diag[2]):.4f}")
    p("  diagonal errors (two-number): " + ", ".join(f"{h} {e:+.4f}" for h, e in zip(fam_s, diag[2])))
    p("")

    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    a = res["azpf"]
    p("Predictions (LOG.md 7b):")
    p(f"  SP1 spun AZPF idle kW above the held 2.61: {ok(kw['azpf_spin'] > kw['azpf'])} ({kw['azpf_spin']:.2f} "
      f"against {kw['azpf']:.2f})")
    p(f"  SP2 spun AZPF index 2 within 0.010 of the held 0.9103: {ok(abs(E['azpf_spin'] - E['azpf']) <= 0.010)} "
      f"({E['azpf_spin']:.4f}, {E['azpf_spin'] - E['azpf']:+.4f})")
    p(f"  SP3 spun AZPF E50 within 0.006 of rule (Z): {ok(abs(a['ez']) <= 0.006)} ({a['ez']:+.5f})")
    p(f"  SP4 spun AZPF E50 within 0.005 of the held 0.8075: {ok(abs(a['e50'] - held['azpf']) <= 0.005)} "
      f"({a['e50'] - held['azpf']:+.4f})")
    p(f"  SP5 spun AZPN E50 within 0.006 of rule (Z): {ok(abs(res['azpn']['ez']) <= 0.006)} ({res['azpn']['ez']:+.4f})")
    sw = all(abs(res[f]["drag"] - held[f]) > abs(res[f]["shape"] - held[f]) for f in SPUN)
    p(f"  SP6 drag swap moves E50 more than shape swap in both: {ok(sw)} (" + "; ".join(
        f"{f} drag {res[f]['drag'] - held[f]:+.4f}, shape {res[f]['shape'] - held[f]:+.4f}" for f in SPUN) + ")")
    p("")
    p("Sources: as gear_pump_eight.py; Bosch Rexroth RE 10089/2021-11-24 page 9 (AZPF n_max).")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator"))
