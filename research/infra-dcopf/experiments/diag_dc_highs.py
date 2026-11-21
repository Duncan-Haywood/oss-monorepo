"""A third DC solver on the one confirmation case with no DC start on PIPS or Clarabel, case2853_sdet API
(research/grid-linopf; plan and prediction H1 in LOG.md 2026-11-21, committed before this ran).

(a) feasibility: diag_dc_infeasible.dc_ref's B-theta rows (rated flows, PMIN/PMAX, angle limits when asked) with a
    zero objective on HiGHS, under the four start conventions of run_dc_rescue.rescue_start (MP-x0 and PM, with and
    without angle limits), on the largest-PMAX-slack network the protocol uses;
(b) where (a) says infeasible: diag_dc_infeasible.elastic (HiGHS phase-1 LP, no angle limits, 1 per MW of slack on
    every rated flow and PMIN/PMAX row) on the same convention, to say how far from feasible the case is and where.
For contrast both run on case2853_sdet TYP and SAD, which Clarabel started. Writes results_dc_highs.txt and .json.
Usage: diag_dc_highs.py
"""
import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
from diag_dc_infeasible import aggregates, big_slack, convention, dc_ref, elastic  # noqa: E402
from infra_dcopf.pglib import case_path, fix_ref, load_m  # noqa: E402

CASES = [("case2853_sdet", "api"), ("case2853_sdet", "typ"), ("case2853_sdet", "sad")]


def main():
    rows, L = [], []
    P = L.append
    P("case2853_sdet: DC OPF feasibility on HiGHS (zero objective) and the elastic phase-1 LP (research/grid-linopf)")
    P("Plan and prediction H1: LOG.md 2026-11-21. Network: fix_ref, then the largest-PMAX slack (the protocol's).")
    P("")
    for name, kind in CASES:
        ppc, _ = fix_ref(load_m(case_path(name, kind)))
        p, _, _ = big_slack(ppc)
        out = {"case": name, "kind": kind, "agg": aggregates(p), "feas": {}, "elastic": {}}
        a = out["agg"]
        P(f"{name} {kind}: " + ", ".join(f"{k} {v:.1f}" if isinstance(v, float) else f"{k} {v}" for k, v in a.items()))
        for conv in ("MP-x0", "PM"):
            q = convention(p, conv)
            for ang in (True, False):
                _, st = dc_ref(q, ang, solver="highs-feas")
                out["feas"][f"{conv}{'+ang' if ang else ''}"] = st
                P(f"  HiGHS feasibility {conv:5s} {'with' if ang else 'no  '} angle limits: {st}")
            if any(out["feas"][k] == "Infeasible" for k in (conv, conv + "+ang")):
                e = elastic(q)
                out["elastic"][conv] = e
                if e.get("status") == 0:
                    P(f"  elastic {conv:5s} (no angle limits): total slack {e['total_mw']:.2f} MW = rated rows "
                      f"{e['rate_mw']:.2f} MW on {e['n_rate_rows']} branches, PMIN {e['pmin_mw']:.2f} MW on {e['n_pmin']}, "
                      f"PMAX {e['pmax_mw']:.2f} MW on {e['n_pmax']}")
                    for r in e["rows"][:5]:
                        P(f"    branch {r['from']}-{r['to']}: rate {r['rate_mw']:.1f} MW, over by {r['excess_mw']:.2f} MW "
                          f"({r['excess_pct']:.1f} %)")
                else:
                    P(f"  elastic {conv}: {e}")
        rows.append(out)
        P("")
    api = rows[0]["feas"]
    P(f"H1 (HiGHS reports infeasible under all four conventions on case2853_sdet API): "
      f"{'held' if all(v == 'Infeasible' for v in api.values()) else 'refuted'} ({api})")
    (HERE / "results_dc_highs.json").write_text(json.dumps(rows, indent=1, default=float))
    (HERE / "results_dc_highs.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
