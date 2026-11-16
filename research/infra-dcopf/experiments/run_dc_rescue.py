"""The five held-out cases the one protocol left unscored, run with a DC start from a second solver (research/grid-linopf;
plan in LOG.md 2026-11-16, "Five unscored cases with a second-solver DC start", committed before this ran).

Start rule: PYPOWER rundcopf (PIPS) as before (run_homotopy.dc_start); only where it reports no solution, the same
B-theta DC OPF on Clarabel (diag_dc_infeasible.dc_ref), accepting status Solved only, in the order
  MP-x0 with angle limits, MP-x0 without, PM with angle limits, PM without
(MP-x0 is MATPOWER's B with x = 0 bus ties at 1e-4 pu; identical to MP on cases with no x = 0 branch).
Everything after the start is run_heldout_slack.phase_j unchanged: reference at the largest live unit, continuation
to the full-load power flow, frozen 20-round J-m-a. No IPOPT reactive stage (cyipopt does not build here).
Writes results_dc_rescue_parts/<case>_<kind>.json; --merge writes results_dc_rescue.txt and .json.
--x0-angles (declared after the first run, not in the plan): the continuation's warm-start angles (run_homotopy.dc_angles,
a DC power flow) are taken on the MP-x0 network, since on SNEM MATPOWER's B is infinite and the angles come back NaN;
the AC network is unchanged. Parts go to <case>_<kind>_x0ang.json.
--R (declared after the plan, once cyipopt built in this session): the protocol's IPOPT reactive stage on J's best
point where J is not fully clean (run_heldout_slack.phase_r's rule, 45-minute wall limit from the shell), written to
<case>_<kind>_R.json.
Usage: run_dc_rescue.py [--x0-angles] case/kind ... | --R case/kind ... | --merge. Needs Python >= 3.12 (run_fold.py). OMP_NUM_THREADS=1 recommended.
"""
import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
import run_heldout_slack as hs  # noqa: E402
from diag_dc_infeasible import convention, dc_ref  # noqa: E402
from run_homotopy import dc_start  # noqa: E402

PARTS = HERE / "results_dc_rescue_parts"
CASES = [("case1803_snem", "typ"), ("case1803_snem", "api"), ("case1803_snem", "sad"),
         ("case1951_rte", "api"), ("case2000_goc", "api")]


def rescue_start(p):
    pg, rule = dc_start(p)
    if pg is not None:
        return pg, rule
    for conv in ("MP-x0", "PM"):
        q = convention(p, conv)
        for ang in (True, False):
            f, status, pg = dc_ref(q, ang, want_pg=True)
            if status == "Solved":
                return pg, f"Clarabel {conv}{'+ang' if ang else ', no ang'}"
    return None, None


def run(name, kind, x0_angles=False):
    hs.dc_start = rescue_start
    if x0_angles:
        import run_fold
        from run_homotopy import dc_angles
        run_fold.dc_angles = lambda ppc, mu, pg, vg: dc_angles(convention(ppc, "MP-x0"), mu, pg, vg)
    out = hs.phase_j(name, kind)
    out["x0_angles"] = x0_angles
    PARTS.mkdir(exist_ok=True)
    (PARTS / f"{name}_{kind}{'_x0ang' if x0_angles else ''}.json").write_text(json.dumps(hs.jsonable(out), indent=1))
    return out


def phase_r(name, kind):
    import time
    import numpy as np
    from infra_dcopf import ipopt_nlp
    from infra_dcopf.pglib import case_path, fix_ref, load_m
    t0 = time.time()
    r = json.loads((PARTS / f"{name}_{kind}.json").read_text())
    out = {"case": name, "kind": kind, "JR": None}
    f = r.get("final")
    if f is not None and not f["clean"] and r.get("best_pg") is not None:
        ppc, _ = fix_ref(load_m(case_path(name, kind)))
        p, _, _ = hs.big_slack(ppc)
        with ipopt_nlp.use_ipopt():
            out["JR"] = hs.reactive(p, {"pg": np.array(r["best_pg"]), "clean": False})
    out["secs"] = time.time() - t0
    (PARTS / f"{name}_{kind}_R.json").write_text(json.dumps(hs.jsonable(out), indent=1))
    return out


def merge():
    rows = [json.loads((PARTS / f"{c}_{k}.json").read_text()) for c, k in CASES if (PARTS / f"{c}_{k}.json").exists()]
    extra = [json.loads((PARTS / f"{c}_{k}_x0ang.json").read_text()) for c, k in CASES
             if (PARTS / f"{c}_{k}_x0ang.json").exists()]
    L = []
    P = L.append
    P("The five held-out cases the one protocol left unscored, with a second-solver DC start (plan: LOG.md 2026-11-16).")
    P("Start: PIPS DC OPF, else Clarabel (MP-x0 then PM, with angle limits then without). Then run_heldout_slack.phase_j")
    P("unchanged. Final cell: branches over 100 %, worst loading %, slack MW outside limits, angle violations, buses out")
    P("of V band, units outside Q limits. Cost against PGLib's published AC objective.")
    P("")
    P(f"{'case':14s} {'kind':4s} {'start':>24s} {'S clean':>7s} {'mu*':>6s} {'J':>5s}  {'J best: nOv  maxLd%   slkMW nAng    V    Q':42s} {'cost':>10s} {'s':>6s}")
    for r in rows + extra:
        if r is extra[0] if extra else False:
            P("Declared after the first run (--x0-angles): warm-start angles from the MP-x0 network, AC network unchanged.")
        s_clean = "y" if r.get("S") and r["S"].get("clean") else "-"
        if r.get("stop"):
            P(f"{r['case']:14s} {r['kind']:4s} {str(r['start_rule']):>24s} {s_clean:>7s} {r.get('mu_star', 0):6.3f}  {r['stop']}"
              f"{'':30s} {r['secs']:6.0f}")
            continue
        f = r["final"]
        cost = f"{100 * (f['cost'] - r['ac']) / r['ac']:+9.3f}%" if f else "-"
        P(f"{r['case']:14s} {r['kind']:4s} {r['start_rule']:>24s} {s_clean:>7s} {r['mu_star']:6.3f} "
          f"{('@' + str(r['clean_at'])) if r['clean_at'] else 'no':>5s}  {hs.fin(f):42s} {cost:>10s} {r['secs']:6.0f}")
        rp = PARTS / f"{r['case']}_{r['kind']}_R.json"
        if rp.exists():
            rr = json.loads(rp.read_text())
            jr = rr["JR"]
            r["JR"] = jr
            if rr.get("timeout"):
                P(f"{'':20s}J+R: did not finish within the 45-minute wall limit (counts as not clean)")
                continue
            tail = ("J+R fully clean at " + f"{100 * (jr['cost'] - r['ac']) / r['ac']:+.3f}%" if jr and jr.get("clean")
                    else "J+R: " + ("no solution" if jr is None else "not clean " + hs.fin(jr)))
            P(f"{'':20s}{tail}")
    n = len(rows)
    nj = sum(1 for r in rows if not r.get("stop") and r["clean_at"])
    njr = nj + sum(1 for r in rows if not r.get("stop") and not r["clean_at"] and (r.get("JR") or {}).get("clean"))
    nmu = sum(1 for r in rows if not r.get("stop") or r["stop"] != "no DC start")
    nfull = sum(1 for r in rows if not r.get("stop"))
    P("")
    P(f"{n} cases: DC start on {nmu}, full-load power flow on {nfull}, J fully clean within 20 rounds on {nj}.")
    P(f"J or J+R fully clean on {njr}.")
    P(f"Held-out tally under the one protocol (J, 20 rounds): 10 of 24 before; {10 + nj} of 24 with this start rule.")
    P(f"J or J+R: 12 of 24 before; {12 + njr} of 24 with this start rule (J+R run after the plan, once IPOPT built).")
    (HERE / "results_dc_rescue.json").write_text(json.dumps(rows, indent=1))
    (HERE / "results_dc_rescue.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if sys.argv[1:] == ["--merge"]:
        merge()
    elif sys.argv[1:2] == ["--R"]:
        for a in sys.argv[2:]:
            c, k = a.split("/")
            r = phase_r(c, k)
            print(c, k, "JR", None if r["JR"] is None else r["JR"].get("clean"), round(r["secs"]), flush=True)
    else:
        x0 = "--x0-angles" in sys.argv
        for a in [a for a in sys.argv[1:] if a != "--x0-angles"]:
            c, k = a.split("/")
            r = run(c, k, x0)
            print(c, k, r.get("start_rule"), r.get("stop"), r.get("clean_at"), round(r["secs"]), flush=True)
