"""Milestone 2 of research/grid-linopf, check (a): analytic sensitivities (vlin.jacobian_sens) against
central finite differences of PYPOWER's AC power flow, on every PGLib v23.07 TYP, API and SAD case.

Point: the plain DC-MP dispatch (with angle limits; without them if infeasible) at the case file's
voltage setpoints, the start of every milestone-3b repair. Central steps 1e-3 MW per non-slack unit and
1e-5 pu per voltage setpoint; where the scaled error passes 1e-4, the voltage step is cut to 1e-6 to tell
the analytic model's error from the difference quotient's truncation error (which falls with the step
squared). Error per entry = |analytic - central| / the column's largest |central| entry.
Writes results_sens.txt. Usage: check_sens.py [case ...]; about 2 min."""
import copy
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np
from pypower.api import rundcopf
from pypower.idx_brch import ANGMAX, ANGMIN
from pypower.idx_gen import PG

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
from infra_dcopf import vlin  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule  # noqa: E402
from run_pglib import CASES, DCOPT  # noqa: E402


def central(ppc, pg, v, lay, aidx, hp, hv):
    base = vlin.run_point(ppc, pg, lay.vg_of(v))
    if base is None:
        return None, None
    pgb = base["gen"][:, PG].copy()
    m = lambda r: vlin.measure(ppc, r, lay, aidx)  # noqa: E731
    J = np.zeros((len(m(base)), lay.ng + lay.nv))
    for k in range(lay.ng):
        if lay.live[k] and k != lay.slack:
            a, b = pgb.copy(), pgb.copy()
            a[k] += hp
            b[k] -= hp
            J[:, k] = (m(vlin.run_point(ppc, a, lay.vg_of(v), base)) - m(vlin.run_point(ppc, b, lay.vg_of(v), base))) / (2 * hp)
    for j in range(lay.nv):
        a, b = v.copy(), v.copy()
        a[j] += hv
        b[j] -= hv
        J[:, lay.ng + j] = (m(vlin.run_point(ppc, pgb, lay.vg_of(a), base)) - m(vlin.run_point(ppc, pgb, lay.vg_of(b), base))) / (2 * hv)
    return base, J


def scaled_err(Ja, Jc):
    return np.abs(Ja - Jc) / np.maximum(np.abs(Jc).max(axis=0), 1e-12)


def main():
    only = sys.argv[1:]
    L = ["Analytic (vlin.jacobian_sens) vs central finite differences at the DC-MP start, 1.0 pu setpoints.",
         "Scaled error = max |A - CD| / column max |CD|. Steps 1e-3 MW, 1e-5 pu (refined: 1e-6 pu).",
         f"{'case':18s} {'kind':4s} {'rows':>5s} {'cols':>5s} {'err':>9s} {'err refined':>12s} {'A s':>7s} {'CD s':>7s}"]
    worst = []
    for name in CASES:
        if only and name not in only:
            continue
        for kind in ("typ", "api", "sad"):
            ppc = load_m(case_path(name, kind))
            lay, aidx = vlin.Layout(ppc), vlin.angle_limited(ppc)
            dc = rundcopf(ppc, DCOPT)
            if not dc["success"]:
                free = copy.deepcopy(ppc)
                free["branch"][:, ANGMIN], free["branch"][:, ANGMAX] = -360.0, 360.0
                dc = rundcopf(free, DCOPT)
            v = lay.v_of(file_schedule(ppc))
            t0 = time.time()
            base, Jc = central(ppc, dc["gen"][:, PG].copy(), v, lay, aidx, 1e-3, 1e-5)
            tc = time.time() - t0
            if base is None:
                L.append(f"{name:18s} {kind:4s} no AC power flow at the start point")
                continue
            t0 = time.time()
            Ja = vlin.jacobian_sens(ppc, base, lay, aidx)
            ta = time.time() - t0
            e = scaled_err(Ja, Jc).max()
            ref = ""
            if e > 1e-4:
                _b, Jc2 = central(ppc, dc["gen"][:, PG].copy(), v, lay, aidx, 1e-3, 1e-6)
                e2 = scaled_err(Ja, Jc2).max()
                ref = f"{e2:.2e}"
                worst.append(e2)
            else:
                worst.append(e)
            L.append(f"{name:18s} {kind:4s} {Ja.shape[0]:5d} {Ja.shape[1]:5d} {e:9.2e} {ref:>12s} {ta:7.3f} {tc:7.2f}")
            print(L[-1], flush=True)
    L.append(f"Worst over {len(worst)} cases (refined where needed): {max(worst):.2e}")
    text = "\n".join(L) + "\n"
    if not only:
        (HERE / "results_sens.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
