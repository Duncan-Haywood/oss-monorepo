"""Contactor inrush across the assumptions (2026-11-14; cad/README.md "Contactor inrush and precharge").

    python3 tests/inrush_sweep.py

`Feeder.contactor_inrush` closes the contactor onto the switched bus as a series R-L-C, solved in closed form. Every
figure but the charger's 29.2 V is assumed, so this sweeps the three that move the answer most: the pack's
resistance, each ESC's input capacitance and the loop's inductance per metre. For each case it prints a direct close
(peak current, microseconds over the BMS's assumed 150 A trip) and a close after the 4.7 ohm, 0.5 s precharge (the
contactor's peak, and the precharge relay's).
"""

import itertools
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "cad"))
from otr_cad.params import Feeder  # noqa: E402

PACK_OHM = (0.020, 0.040, 0.080)
ESC_UF = (470.0, 1000.0, 2000.0)
UH_PER_M = (0.3, 0.6, 1.0)


def rows():
    out = []
    for r, c, l in itertools.product(PACK_OHM, ESC_UF, UH_PER_M):
        p = Feeder(pack_ohm=r, esc_cap_uf=c, loop_uh_per_m=l)
        d = p.contactor_inrush()
        out.append({"pack_mohm": r * 1e3, "esc_uf": c, "uh_per_m": l, "direct_a": d["direct"]["peak_a"],
                    "direct_bms_us": d["direct"]["bms_over_us"], "damping": d["damping"],
                    "close_a": d["closing"]["peak_a"], "precharge_a": d["precharge"]["peak_a"],
                    "residual_v": d["precharge"]["residual_v"], "fails": p.check_inrush()})
    return out


def main():
    rs = rows()
    print("pack mOhm  ESC uF  uH/m  zeta | direct A  >150 A us | precharged: close A  relay A  left V")
    for x in rs:
        print(f"{x['pack_mohm']:9.0f} {x['esc_uf']:7.0f} {x['uh_per_m']:5.1f} {x['damping']:5.2f} |"
              f" {x['direct_a']:8.0f} {x['direct_bms_us']:10.0f} | {x['close_a']:19.1f} {x['precharge_a']:8.2f} "
              f"{x['residual_v']:7.2f}")
    d = [x["direct_a"] for x in rs]
    us = [x["direct_bms_us"] for x in rs]
    print(f"\n{len(rs)} cases. Direct close: {min(d):.0f} to {max(d):.0f} A, over 150 A for {min(us):.0f} to {max(us):.0f} us; "
          f"{sum(u > 200 for u in us)} of {len(rs)} past an assumed 200 us BMS delay.")
    print(f"Precharged close: at most {max(x['close_a'] for x in rs):.1f} A; relay at most "
          f"{max(x['precharge_a'] for x in rs):.2f} A; cases the check fails: {sum(bool(x['fails']) for x in rs)}")


if __name__ == "__main__":
    main()
