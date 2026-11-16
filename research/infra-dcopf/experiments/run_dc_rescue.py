"""The five held-out cases the one protocol left unscored, run with a DC start from a second solver (research/grid-linopf;
plan in LOG.md 2026-11-16, "Five unscored cases with a second-solver DC start", committed before this ran).

Start rule: PYPOWER rundcopf (PIPS) as before (run_homotopy.dc_start); only where it reports no solution, the same
B-theta DC OPF on Clarabel (diag_dc_infeasible.dc_ref), accepting status Solved only, in the order
  MP-x0 with angle limits, MP-x0 without, PM with angle limits, PM without
(MP-x0 is MATPOWER's B with x = 0 bus ties at 1e-4 pu; identical to MP on cases with no x = 0 branch).
Everything after the start is run_heldout_slack.phase_j unchanged: reference at the largest live unit, continuation
to the full-load power flow, frozen 20-round J-m-a. No IPOPT reactive stage (cyipopt does not build here).
Writes results_dc_rescue_parts/<case>_<kind>.json; --merge writes results_dc_rescue.txt and .json.
Usage: run_dc_rescue.py case/kind ... | --merge. Needs Python >= 3.12 (run_fold.py). OMP_NUM_THREADS=1 recommended.
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


def run(name, kind):
    hs.dc_start = rescue_start
    out = hs.phase_j(name, kind)
    PARTS.mkdir(exist_ok=True)
    (PARTS / f"{name}_{kind}.json").write_text(json.dumps(hs.jsonable(out), indent=1))
    return out


def merge():
    rows = [json.loads((PARTS / f"{c}_{k}.json").read_text()) for c, k in CASES if (PARTS / f"{c}_{k}.json").exists()]
    L = []
    P = L.append
    P("The five held-out cases the one protocol left unscored, with a second-solver DC start (plan: LOG.md 2026-11-16).")
    P("Start: PIPS DC OPF, else Clarabel (MP-x0 then PM, with angle limits then without). Then run_heldout_slack.phase_j")
    P("unchanged. Final cell: branches over 100 %, worst loading %, slack MW outside limits, angle violations, buses out")
    P("of V band, units outside Q limits. Cost against PGLib's published AC objective.")
    P("")
    P(f"{'case':14s} {'kind':4s} {'start':>24s} {'S clean':>7s} {'mu*':>6s} {'J':>5s}  {'J best: nOv  maxLd%   slkMW nAng    V    Q':42s} {'cost':>10s} {'s':>6s}")
    for r in rows:
        s_clean = "y" if r.get("S") and r["S"].get("clean") else "-"
        if r.get("stop"):
            P(f"{r['case']:14s} {r['kind']:4s} {str(r['start_rule']):>24s} {s_clean:>7s} {r.get('mu_star', 0):6.3f}  {r['stop']}"
              f"{'':30s} {r['secs']:6.0f}")
            continue
        f = r["final"]
        cost = f"{100 * (f['cost'] - r['ac']) / r['ac']:+9.3f}%" if f else "-"
        P(f"{r['case']:14s} {r['kind']:4s} {r['start_rule']:>24s} {s_clean:>7s} {r['mu_star']:6.3f} "
          f"{('@' + str(r['clean_at'])) if r['clean_at'] else 'no':>5s}  {hs.fin(f):42s} {cost:>10s} {r['secs']:6.0f}")
    n = len(rows)
    nj = sum(1 for r in rows if not r.get("stop") and r["clean_at"])
    nmu = sum(1 for r in rows if not r.get("stop") or r["stop"] != "no DC start")
    nfull = sum(1 for r in rows if not r.get("stop"))
    P("")
    P(f"{n} cases: DC start on {nmu}, full-load power flow on {nfull}, J fully clean within 20 rounds on {nj}.")
    P(f"Held-out tally under the one protocol (J, 20 rounds): 10 of 24 before; {10 + nj} of 24 with this start rule.")
    (HERE / "results_dc_rescue.json").write_text(json.dumps(rows, indent=1))
    (HERE / "results_dc_rescue.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if sys.argv[1:] == ["--merge"]:
        merge()
    else:
        for a in sys.argv[1:]:
            c, k = a.split("/")
            r = run(c, k)
            print(c, k, r.get("start_rule"), r.get("stop"), r.get("clean_at"), round(r["secs"]), flush=True)
