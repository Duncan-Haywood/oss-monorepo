"""A third DC solver on the one confirmation case with no DC start on PIPS or Clarabel, case2853_sdet API
(research/grid-linopf; plan and prediction H1 in LOG.md 2026-11-21, committed before this ran).

(a) feasibility: diag_dc_infeasible.dc_ref's B-theta rows (rated flows, PMIN/PMAX, angle limits when asked) with a
    zero objective on HiGHS, under the four start conventions of run_dc_rescue.rescue_start (MP-x0 and PM, with and
    without angle limits), on the largest-PMAX-slack network the protocol uses;
(b) where (a) says infeasible: diag_dc_infeasible.elastic (HiGHS phase-1 LP, no angle limits, 1 per MW of slack on
    every rated flow and PMIN/PMAX row) on the same convention, to say how far from feasible the case is and where.
For contrast both run on case2853_sdet TYP and SAD, which Clarabel started. Writes results_dc_highs.txt and .json.
--start (declared in the plan for the case that HiGHS finds feasible): the DC OPF QP on HiGHS (dc_ref
solver="highs-qp") in rescue_start's order (MP-x0 with angle limits, MP-x0 without, PM with, PM without) as the start,
then run_confirm._job's arm F unchanged (continuation, 20 rounds of the frozen repair); where that is not clean, the
IPOPT reactive stage at its best point (run_confirm_reactive.r_step's rule, 45-minute wall limit). Writes
results_dc_highs_start.json and appends to results_dc_highs.txt.
Usage: diag_dc_highs.py [--start]
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


def highs_start(p):
    for conv in ("MP-x0", "PM"):
        q = convention(p, conv)
        for ang in (True, False):
            f, status, pg = dc_ref(q, ang, want_pg=True, solver="highs-qp")
            if status == "Optimal":
                return pg, f"HiGHS QP {conv}{'+ang' if ang else ', no ang'}"
    return None, None


def start(name="case2853_sdet", kind="api"):
    import subprocess
    import numpy as np
    import run_confirm as rc
    import run_confirm_reactive as rr
    import run_homotopy
    from infra_dcopf import vlin
    got = {}
    orig = vlin.best_of

    def capture(hist, base):
        got["best"] = orig(hist, base)
        return got["best"]

    vlin.best_of = capture
    run_homotopy.dc_start = highs_start
    out = rc._job("F", name, kind)
    b = got.get("best")
    out["best_pg"] = None if b is None else np.asarray(b["pg"]).tolist()
    out["reproduced"] = True  # not a rerun: lets run_confirm_reactive.r_step read this part
    rr.PARTS.mkdir(exist_ok=True)
    rr.part("H", name, kind, "best").write_text(json.dumps(out, default=float))
    if out.get("final") and not out.get("clean_at"):
        try:
            subprocess.run([sys.executable, rr.__file__, "r", "H", name, kind], timeout=rr.WALL, check=False)
            out["JR"] = json.loads(rr.part("H", name, kind, "R").read_text())["JR"]
        except subprocess.TimeoutExpired:
            out["JR"], out["JR_timeout"] = None, True
    (HERE / "results_dc_highs_start.json").write_text(json.dumps(out, default=float, indent=1))
    f, ac = out.get("final"), out["ac"]
    L = ["", f"--start: {name} {kind}, start {out.get('start_rule')}, mu* {out.get('mu_star', 0):.3f}, "
         + (out.get("stop") or f"frozen repair clean at round {out['clean_at']}" if out.get("clean_at") or out.get("stop")
            else "frozen repair not clean in 20 rounds")]
    if f:
        L.append(f"  J best (round {f['it']}): {f['n_over']} over (max {100 * f['max_load']:.2f} %), {f['vviol']} V out, "
                 f"{f['qviol']} Q out ({f['q_exc_mvar']:.3f} MVAr), cost {100 * (f['cost'] - ac) / ac:+.3f} % "
                 f"against PGLib's AC optimum; {out['secs']:.0f} s")
    if "JR" in out:
        jr = out["JR"]
        L.append("  J+R: " + ("over the 45-minute wall limit" if out.get("JR_timeout") else "no solution" if jr is None
                              else f"{jr['n_over']} over (max {100 * jr['max_load']:.2f} %), {jr['vviol']} V out, "
                              f"{jr['qviol']} Q out" + (f", clean at {100 * (jr['cost'] - ac) / ac:+.3f} %" if jr["clean"] else "")))
    with open(HERE / "results_dc_highs.txt", "a") as fh:
        fh.write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if "--start" in sys.argv:
        start()
    else:
        main()
