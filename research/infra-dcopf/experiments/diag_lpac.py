"""Milestone 4a diagnostic (after the run, not pre-registered): on each case where LPAC-C has no
solution, which single limit class, removed, makes it solvable? Classes: thermal ratings, angle
limits, unit Q limits, bus voltage bands (widened to 0.5 to 1.5 pu), and the cosine floor (delta
widened to 90 deg, which also loosens the parabola). Clarabel, same formulation as lpac.solve.
Writes results_lpac_infeasible.txt."""
import copy
import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from pypower.idx_brch import ANGMAX, ANGMIN, RATE_A  # noqa: E402
from pypower.idx_bus import VMAX, VMIN  # noqa: E402
from pypower.idx_gen import QMAX, QMIN  # noqa: E402

from infra_dcopf import lpac  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402


def drop(ppc, what):
    p = copy.deepcopy(ppc)
    if what == "thermal":
        p["branch"][:, RATE_A] = 0
    elif what == "angle":
        p["branch"][:, ANGMIN], p["branch"][:, ANGMAX] = -360, 360
    elif what == "Q":
        p["gen"][:, QMAX], p["gen"][:, QMIN] = 1e5, -1e5
    elif what == "V":
        p["bus"][:, VMAX], p["bus"][:, VMIN] = 1.5, 0.5
    return p


def main():
    rows = json.loads((HERE / "results_lpac.json").read_text())
    bad = [(r["case"], r["kind"]) for r in rows if r.get("ac_ok") and "L" not in r]
    classes = ["thermal", "angle", "Q", "V"]
    L = ["LPAC-C infeasible cases: does removing one limit class make it solvable? (Clarabel status)", "",
         f"{'case':18s} {'kind':4s} " + " ".join(f"{c:>16s}" for c in classes) + f" {'cos domain 90deg':>17s}"]
    count = {c: 0 for c in classes + ["cos"]}
    for name, kind in bad:
        ppc = load_m(case_path(name, kind))
        st = {c: lpac.solve(drop(ppc, c))["status"] for c in classes}
        old = lpac.DELTA_CAP
        try:
            # a wider cosine domain: every branch's delta at 90 deg (angle limits themselves unchanged)
            orig = lpac.delta_of
            lpac.delta_of = lambda p, idx: __import__("numpy").full(len(idx), old)
            st["cos"] = lpac.solve(ppc)["status"]
        finally:
            lpac.delta_of = orig
        for c in st:
            count[c] += st[c] == "Solved"
        L.append(f"{name:18s} {kind:4s} " + " ".join(f"{st[c]:>16s}" for c in classes) + f" {st['cos']:>17s}")
    L.append("")
    L.append(f"{len(bad)} cases; solvable after removing: " + ", ".join(f"{c} {count[c]}" for c in classes)
             + f", with the 90-degree cosine domain {count['cos']}")
    text = "\n".join(L) + "\n"
    (HERE / "results_lpac_infeasible.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
