"""Milestone 7zt: the 4 m monohull's 30 W wave loss with the near-field added resistance of 7zs.

    PYTHONPATH=src:experiments python3 experiments/run_nearfield_monohull.py > experiments/results_nearfield_monohull.txt

7zs showed that, with the strip motions fixed, Boese's near-field formula in PDSTRIP's documented form (NF; NF0 without
the U d/dx convection; NF-B with Boese's m*a force in the rotation term) gives Fn 0.2 peaks on Journee's L/B 10 Wigley
hulls from 0.79 to 1.33 of the measured, where Gerritsma-Beukelman (GB) gives 0.75 to 0.81. The paper's 3.4% to 4.2%
bracket on the monohull's 30 W range loss rests on GB. This step swaps the formula and nothing else:
`run_faltinsen_reflection.FaltinsenWaveTable` and `mono_eval` (7zh's pooled bow-sector climate, the rr.DISP speeds,
the 30 W loss and the 200 W scope) are reused unchanged, and the hull's R_aw comes from `nearfield.NearField.response`
on the monohull's own `WigleyStrip` with 7zg damping (zeta3 0.0375, zeta5 0), so the motions are the GB rows' motions.

Rows: each formula without the Faltinsen reflection term (as 7zs's NF rows) and with it (as the GB bracket rows).
Expectations M0 to M4 were committed to LOG.md before this code.
"""
import sys
import time

from marine_hull import nearfield as nf
from marine_hull import reflection as rf
from marine_hull import strip as st
import run_a0_coupling_transfer as a0
import run_faltinsen_reflection as fr
import run_range_speed as rr

Z3, Z5 = 0.0375, 0.0
FORMULAS = (("GB", "gb"), ("NF", "nf"), ("NF0", "nf0"), ("NF-B", "nf_boese"))
REF_7ZR_V0 = 3.39          # 7zr, V0 30 W loss at share 0.25 (GB + Faltinsen reflection, 7zg damping)


class Cached:
    """One near-field evaluation per (omega, U), shared by every formula row."""

    def __init__(self, n):
        self.n, self.memo = n, {}

    def get(self, w, u):
        k = (w, u)
        if k not in self.memo:
            self.memo[k] = self.n.response(w, u)
        return self.memo[k]


class Formula:
    """The strip hull's `response` shape (z, theta, R_aw, omega_e) with R_aw from one formula."""

    def __init__(self, hull, cache, key):
        self.h, self.c, self.key = hull, cache, key

    def __getattr__(self, name):
        return getattr(self.h, name)

    def response(self, w, u):
        o = self.c.get(w, u)
        return o["z"], o["theta"], o[self.key], o["we"]


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    mono = a0.Mono()
    i_mono = rf.waterline_integral(rf.wigley_slope(mono.l, mono.b), mono.l)
    mh = st.WigleyStrip(mono.l, mono.b, mono.t, table=mono.table)
    mh.set_viscous(Z3, Z5)
    cache = Cached(nf.NearField(mh))
    pr("Milestone 7zt: the 4 m monohull's 30 W wave loss with near-field added resistance (7zs) in place of GB")
    pr(f"hull L {mono.l} B {mono.b} T {mono.t:.4f}; 7zg damping zeta3 {Z3} zeta5 {Z5}; {len(mono.recs)} wave records "
       f"(7zh pooled bow sector); speeds rr.DISP {rr.DISP[0]} to {rr.DISP[-1]} m/s")
    pr("loss = range change at 30 W (negative is a loss), share 0.25 (bow-sector share of head seas) and 1.0 (all head-on)")
    pr("# table: formula reflection pooled_1ms_motion_N pooled_1ms_refl_N loss30W_share025 loss30W_share1 scope200W")
    res = {}
    for name, key in FORMULAS:
        tab = fr.FaltinsenWaveTable(Formula(mh, cache, key), rr.DISP, mono.t01s, i_mono)
        e = fr.mono_eval(mono, tab)
        res[(name, True)] = e
        tab.f = {t: [(m, 0.0) for m, _ in v] for t, v in tab.f.items()}
        e0 = fr.mono_eval(mono, tab)
        res[(name, False)] = e0
        for refl, x in ((False, e0), (True, e)):
            pr(f"row {name} {'faltinsen' if refl else 'none'} {x['motion']:.3f} {x['refl']:.3f} {x['loss25']:.2f} "
               f"{x['loss1']:.2f} {x['scope']}")
        out.flush()

    pr("## motion term at 1 m/s relative to GB")
    g = res[("GB", True)]["motion"]
    for name, _ in FORMULAS[1:]:
        pr(f"ratio {name}/GB {res[(name, True)]['motion'] / g:.3f}")

    pr("## expectations")
    L = lambda n: -res[(n, True)]["loss25"]
    m0 = abs(L("GB") - REF_7ZR_V0) <= 0.01
    pr(f"M0 GB + reflection loss {L('GB'):.2f}% (7zr V0 {REF_7ZR_V0}%) to 0.01: {m0}")
    pr(f"M1 NF0 + reflection loss {L('NF0'):.2f}% inside 2.5-4.3%: {2.5 <= L('NF0') <= 4.3}")
    pr(f"M2 NF + reflection loss {L('NF'):.2f}% above 4.2%: {L('NF') > 4.2}")
    r_nf = res[("NF", True)]["motion"] / g
    r_nf0 = res[("NF0", True)]["motion"] / g
    pr(f"M3 motion NF/GB {r_nf:.3f} in 1.2-2.0, NF0/GB {r_nf0:.3f} in 0.8-1.3: "
       f"{1.2 <= r_nf <= 2.0 and 0.8 <= r_nf0 <= 1.3}")
    sc = {k: v["scope"] for k, v in res.items()}
    pr(f"M4 200 W scope holds in every row: {all(sc.values())}"
       + ("" if all(sc.values()) else f" (fails: {[k for k, v in sc.items() if not v]})"))
    pr(f"(elapsed {time.time() - t0:.0f} s, {len(cache.memo)} near-field evaluations)")


if __name__ == "__main__":
    main()
