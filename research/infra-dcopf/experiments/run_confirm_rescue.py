"""Confirmation split, second-solver DC start for the cases the protocol left without one (research/grid-linopf).

Plan and predictions R0 to R5 in LOG.md (2026-11-21, "Confirmation split: a second-solver DC start for the 10
no-start cases", committed before this ran). The 10 cases are the confirmation-split cases whose frozen run
(run_confirm.py F) stopped with "no DC start". Start rule: run_dc_rescue.rescue_start, unchanged from the
2026-11-16 held-out rescue (PIPS first; only where PIPS reports no solution, the same B-theta DC OPF on Clarabel,
status Solved only, MP-x0 with angle limits, MP-x0 without, PM with, PM without). Everything after the start is
run_confirm._job's arm F unchanged (largest-PMAX slack, load continuation, 20 rounds of the frozen repair on
Clarabel). Rules C and P are not rerun: the widening line closed on 2026-11-21.

Usage: OMP_NUM_THREADS=1 run_confirm_rescue.py run | --summary
Writes results_confirm_rescue_parts/F_<case>_<kind>.json, then results_confirm_rescue.json and .txt.
"""
import json
import sys
import warnings
from multiprocessing import Pool
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))

import run_confirm as rc  # noqa: E402
import run_dc_rescue  # noqa: E402  (binds the original PIPS dc_start before the patch below)
import run_homotopy  # noqa: E402
from run_enlarge_rel import pct  # noqa: E402

PARTS = HERE / "results_confirm_rescue_parts"
OUT = HERE / "results_confirm_rescue"


def no_start_cases():
    F = rc.load("F")
    return sorted(k for k, r in F.items() if r.get("stop") == "no DC start")


def job(k):
    rc.PARTS = PARTS  # parts of this arm go to their own directory; run_confirm's are read, never written
    run_homotopy.dc_start = run_dc_rescue.rescue_start  # _job imports dc_start at call time
    return rc.job(("F", k[0], k[1]))


def summary():
    F0 = rc.load("F")
    cases = no_start_cases()
    R = {(r["case"], r["kind"]): r for r in (json.loads(f.read_text()) for f in sorted(PARTS.glob("F_*.json")))}
    L = []
    P = L.append
    P("Confirmation split: second-solver DC start for the cases with no PIPS DC start (research/grid-linopf)")
    P("Plan and predictions R0 to R5: LOG.md 2026-11-21 (committed before this ran).")
    P("Start: run_dc_rescue.rescue_start (PIPS, else Clarabel MP-x0/PM, with then without angle limits).")
    P("Then run_confirm.py arm F unchanged: continuation to full load, 20 rounds of the frozen repair.")
    P("Final cell as run_confirm: clean round and cost against PGLib's published AC objective.")
    P("")
    P(f"{'case':18s} {'kind':4s} {'bus':>5s} {'start':>24s} {'mu*':>6s} {'clean@':>6s} {'cost %':>8s} {'s':>6s}  note")
    for k in cases:
        r = R.get(k)
        if r is None:
            P(f"{k[0]:18s} {k[1]:4s}  PENDING")
            continue
        if "error" in r:
            P(f"{k[0]:18s} {k[1]:4s}  ERROR {r['error']}")
            continue
        c = rc.cost(r)
        note = r.get("stop", "")
        if not note and r.get("final") and not r.get("clean_at"):
            f = r["final"]
            note = "best: " + ", ".join(f"{a}={f[a]}" for a in ("n_over", "max_load", "n_v", "n_q") if a in f)
        P(f"{k[0]:18s} {k[1]:4s} {r['nbus']:5d} {str(r.get('start_rule')):>24s} {r.get('mu_star', 0.0):6.3f} "
          f"{str(r.get('clean_at') or '-'):>6s} {('-' if c is None else f'{pct(c, r['ac']):+.3f}'):>8s} "
          f"{r['secs']:6.0f}  {note}")
    done = [R[k] for k in cases if k in R and "error" not in R[k]]
    clar = [r for r in done if str(r.get("start_rule", "")).startswith("Clarabel")]
    pips = [r for r in done if r.get("start_rule") and not str(r["start_rule"]).startswith("Clarabel")]
    full = [r for r in done if "status" in r]
    fin = [r for r in done if r.get("clean_at")]
    base_fin = sum(1 for r in F0.values() if r.get("clean_at"))
    P("")
    P(f"{len(cases)} cases, {len(done)} run: DC start on {len(clar) + len(pips)} (Clarabel {len(clar)}, PIPS {len(pips)}), "
      f"full-load power flow on {len(full)}, frozen repair fully clean within 20 rounds on {len(fin)}.")
    P(f"Confirmation tally, frozen repair: {base_fin} of 33 under the protocol's start; "
      f"{base_fin + len(fin)} of 33 with this start rule ({len(F0) - len(cases) + len(full)} reach the repair).")
    P("")
    P(f"R0 (PIPS still finds no start on all 10): {'held' if not pips else 'refuted'} ({len(pips)} PIPS starts)")
    P(f"R1 (Clarabel start on at least 8 of 10): {'held' if len(clar) >= 8 else 'refuted'} ({len(clar)})")
    P(f"R2 (full-load power flow on at least 5 of 10): {'held' if len(full) >= 5 else 'refuted'} ({len(full)})")
    P(f"R3 (at least 1 finisher): {'held' if fin else 'refuted'} ({len(fin)})")
    P(f"R4 (fewer finishers per case reaching the repair than the protocol's 9 of 23): "
      f"{'untestable' if not full else 'held' if len(fin) / len(full) < 9 / 23 else 'refuted'} "
      f"({len(fin)} of {len(full)})")
    over = [pct(rc.cost(r), r["ac"]) for r in fin]
    P(f"R5 (every finisher within +7 % of PGLib's AC optimum): "
      f"{'untestable' if not fin else 'held' if max(over) <= 7 else 'refuted'}"
      + (f" (max {max(over):+.3f} %)" if over else ""))
    res = {"cases": [list(k) for k in cases], "clarabel": len(clar), "pips": len(pips), "full": len(full),
           "finishers": len(fin), "base_finishers": base_fin, "rows": done}
    return "\n".join(L) + "\n", res


def main():
    PARTS.mkdir(exist_ok=True)
    if "run" in sys.argv:
        cases = sorted(no_start_cases(), key=lambda k: -int(k[0][4:8]))
        with Pool(4) as pool:
            for r in pool.imap_unordered(job, cases):
                print(r["case"], r["kind"], r.get("start_rule"), r.get("stop"), r.get("clean_at"),
                      round(r.get("secs", 0)), flush=True)
    txt, res = summary()
    OUT.with_suffix(".json").write_text(json.dumps(res, default=float))
    OUT.with_suffix(".txt").write_text(txt)
    print(txt)


if __name__ == "__main__":
    main()
