"""After-the-run diagnostic for the V-first step (LOG.md 2026-11-14), rule fixed before it ran: is the fold an
artefact of where the slack sits? On the RTE cases `pglib.fix_ref` (PYPOWER's rule: the first PV bus with a
live unit) makes a 15 to 30 MW unit the slack, and along the continuation it must absorb 500 to 690 MW of
losses (diag_slack_fold.txt). Here the reference moves to the bus of the live unit with the largest PMAX
(the old reference bus becomes PV), and the fold step's continuation of the DC dispatch (same rules, file
schedule, cold Newton from DC angles at mu = 0) is rerun. Reports mu*, sigma ratio, lowest voltage and the
new slack's output against its limits.
Writes diag_slack_move.txt. Usage: diag_slack_move.py [case/kind ...]
"""
import copy
import sys
import warnings
from multiprocessing import Pool
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
import numpy as np  # noqa: E402
from pypower.idx_bus import BUS_TYPE, PD, VM  # noqa: E402
from pypower.idx_gen import GEN_BUS, GEN_STATUS, PG, PMAX, PMIN  # noqa: E402

from infra_dcopf.aclin import slack_gen  # noqa: E402
from infra_dcopf.fold import newton_jacobian, sigma_min  # noqa: E402
from infra_dcopf.pglib import case_path, fix_ref, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule  # noqa: E402
from run_fold import path  # noqa: E402
from run_homotopy import CASES, dc_start  # noqa: E402


def big_slack(ppc):
    """Reference at the bus of the live unit with the largest PMAX; the old reference bus becomes PV."""
    p = copy.deepcopy(ppc)
    g = p["gen"]
    live = np.where(g[:, GEN_STATUS] > 0)[0]
    k = live[np.argmax(g[live, PMAX])]
    b = int(g[k, GEN_BUS])
    p["bus"][p["bus"][:, BUS_TYPE] == 3, BUS_TYPE] = 2
    p["bus"][p["bus"][:, 0] == b, BUS_TYPE] = 3
    return p, b, k


def one(job):
    name, kind = job
    ppc, _ = fix_ref(load_m(case_path(name, kind)))
    p, b, k = big_slack(ppc)
    pg, _ = dc_start(p)
    pts, _ = path(p, lambda m: m * pg, file_schedule(p))
    if not pts:
        return f"{name:14s} {kind:4s} new slack bus {b} (PMAX {p['gen'][k, PMAX]:.0f} MW): no power flow at mu = 0"
    s0 = sigma_min(newton_jacobian(pts[0][1]))
    mu, r = pts[-1]
    s = slack_gen(p)
    ss = sigma_min(newton_jacobian(r))
    loss = r["gen"][r["gen"][:, GEN_STATUS] > 0, PG].sum() - mu * p["bus"][:, PD].sum()
    return (f"{name:14s} {kind:4s} new slack bus {b} (unit {s}, [{p['gen'][s, PMIN]:.0f}, {p['gen'][s, PMAX]:.0f}] MW): "
            f"mu* {mu:.4f}  sigma ratio {ss / s0:.3f}  Vmin {r['bus'][:, VM].min():.3f}  slack P {r['gen'][s, PG]:.1f} MW "
            f"(scheduled {mu * pg[s]:.1f})  losses {loss:.1f} MW")


def main():
    jobs = [tuple(a.split("/")) for a in sys.argv[1:]] or CASES
    with Pool(min(len(jobs), 2)) as pool:
        lines = list(pool.map(one, jobs))
    text = ("Fold step's continuation with the reference moved to the largest live unit (diagnostic, after the run):\n"
            + "\n".join(lines) + "\n")
    if not sys.argv[1:]:
        (HERE / "diag_slack_move.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
