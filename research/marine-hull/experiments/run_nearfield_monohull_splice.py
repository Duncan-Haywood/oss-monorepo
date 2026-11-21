"""Milestone 7zt, post hoc (decided after reading results_nearfield_monohull_bands.txt): the monohull's 30 W loss
with the near field used only where 7zs checked it (lambda/L <= CUT) and Gerritsma-Beukelman beyond.

    PYTHONPATH=src:experiments python3 experiments/run_nearfield_monohull_splice.py > experiments/results_nearfield_monohull_splice.txt

The band split showed the near field does not decay in long waves (at lambda/L 10 it is about 300 times GB, carried by
the pressure-force-times-rotation term, eq. 166), and 91% of the 7zh climate's wave energy is at lambda/L > 8 on a
4 m hull, so the unspliced rows measure that residual more than the formula. Physically R_aw vanishes as the hull
follows ever longer waves, which GB does. The splice is a sensitivity, not a model: CUT 2.0 (7zs's checked range)
and CUT 1.5 and 3.0 to show how much the number leans on the cut.
"""
import math
import sys
import time

from marine_hull import nearfield as nf
from marine_hull import reflection as rf
from marine_hull import strip as st
import run_a0_coupling_transfer as a0
import run_faltinsen_reflection as fr
import run_nearfield_monohull as nm
import run_range_speed as rr

CUTS = (1.5, 2.0, 3.0)


class Spliced(nm.Formula):
    def __init__(self, hull, cache, key, cut):
        super().__init__(hull, cache, key)
        self.cut = cut

    def response(self, w, u):
        o = self.c.get(w, u)
        lam_l = 2.0 * math.pi * st.G / (w * w) / self.h.l
        return o["z"], o["theta"], (o[self.key] if lam_l <= self.cut else o["gb"]), o["we"]


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    mono = a0.Mono()
    i_mono = rf.waterline_integral(rf.wigley_slope(mono.l, mono.b), mono.l)
    mh = st.WigleyStrip(mono.l, mono.b, mono.t, table=mono.table)
    mh.set_viscous(nm.Z3, nm.Z5)
    cache = nm.Cached(nf.NearField(mh))
    pr("Milestone 7zt post hoc: monohull 30 W loss, near field on lambda/L <= cut, GB beyond, Faltinsen reflection added")
    pr("# table: formula cut pooled_1ms_motion_N loss30W_share025 loss30W_share1 scope200W")
    for name, key in nm.FORMULAS[1:]:
        for cut in CUTS:
            e = fr.mono_eval(mono, fr.FaltinsenWaveTable(Spliced(mh, cache, key, cut), rr.DISP, mono.t01s, i_mono))
            pr(f"row {name} {cut} {e['motion']:.3f} {e['loss25']:.2f} {e['loss1']:.2f} {e['scope']}")
            out.flush()
    pr(f"(elapsed {time.time() - t0:.0f} s)")


if __name__ == "__main__":
    main()
