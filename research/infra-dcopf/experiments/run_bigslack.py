"""The frozen repair from a start that has a power flow (research/grid-linopf; plan in LOG.md 2026-11-15, committed
before this ran). On the five RTE cases the fold step's continuation reaches full load once the reference moves
from `fix_ref`'s 15 to 30 MW unit to the largest live unit (diag_slack_move.txt). Here, with that reference:
the DC start (same rule), the continuation to mu = 1 (same rules), then the frozen 20-round J-m-a warm at the
full-load power flow; J+R = the reactive stage (IPOPT, ipopt_nlp) on its best point when not fully clean.
Cost reference: PGLib-OPF's published AC objective, which the IPOPT reference matches within 0.005 %.
Writes results_bigslack_parts/<case>_<kind>.json per case; --merge writes results_bigslack.json and .txt.
Usage: run_bigslack.py [--merge] [case/kind ...]
"""
import json
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
from infra_dcopf import ipopt_nlp, vlin  # noqa: E402
from infra_dcopf.pglib import baseline, case_path, fix_ref, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule  # noqa: E402
from diag_slack_move import big_slack  # noqa: E402
from run_fold import FINAL_ROUNDS, path, repair_stage  # noqa: E402
from run_heldout import reactive  # noqa: E402
from run_homotopy import dc_start  # noqa: E402
from run_perturb import strip  # noqa: E402

CASES = [("case1888_rte", "typ"), ("case1888_rte", "api"), ("case1888_rte", "sad"), ("case1951_rte", "typ"),
         ("case1951_rte", "sad")]
PARTS = HERE / "results_bigslack_parts"


def run(name, kind):
    t0 = time.time()
    ppc, _ = fix_ref(load_m(case_path(name, kind)))
    p, b, k = big_slack(ppc)
    out = {"case": name, "kind": kind, "slack_bus": b, "slack_unit": int(k),
           "ac": float(baseline()[(name, kind)][1]), "ref": "PGLib IPOPT"}
    pg, rule = dc_start(p)
    out["start_rule"] = rule
    vf = file_schedule(p)
    pts, _ = path(p, lambda m: m * pg, vf)
    out["mu_star"] = float(pts[-1][0]) if pts else 0.0
    if not pts or pts[-1][0] < 1.0:
        out["stop"] = "no power flow at mu = 1"
        out["secs"] = time.time() - t0
        return out
    r = pts[-1][1]
    out["start"] = strip(vlin.check(p, pg, vf, r))
    hist, best = repair_stage(p, pg, vf, r, FINAL_ROUNDS)
    out["status"] = [x["status"] for x in hist]
    out["clean_at"] = next((x["it"] for x in hist if x.get("clean")), None)
    out["final"] = strip(best) if best else None
    out["repair_secs"] = time.time() - t0
    if best is not None and not best["clean"]:
        with ipopt_nlp.use_ipopt():
            out["JR"] = reactive(p, best)
    out["secs"] = time.time() - t0
    return out


def pct(c, ref):
    return 100 * (c - ref) / ref


def fin(f):
    return ("-" if not f else f"{f['n_over']:3d} {f['max_load'] * 100:7.2f} {f['slack_out_mw']:7.1f} "
            f"{f['n_ang']:4d} {f['vviol']:4d} {f['qviol']:4d}")


def summary(rows):
    L = ["The frozen 20-round J-m-a from the DC start's full-load power flow, reference at the largest live unit",
         "(plan in LOG.md 2026-11-15). Cell: branches over 100 %, worst loading, slack MW outside limits, angle",
         "violations, buses out of V band, units outside Q limits; cost against PGLib's published AC objective.", "",
         f"{'case':14s} {'kind':4s} {'mu*':>6s} {'what':6s} {'nOv  maxLd%   slkMW nAng    V    Q':36s} {'cost':>9s}"]
    for r in rows:
        if r.get("stop"):
            L.append(f"{r['case']:14s} {r['kind']:4s} {r['mu_star']:6.3f} {r['stop']}")
            continue
        L.append(f"{r['case']:14s} {r['kind']:4s} {r['mu_star']:6.3f} {'start':6s} {fin(r['start']):36s} "
                 f"{pct(r['start']['cost'], r['ac']):+8.3f}%")
        c = f"@{r['clean_at']}" if r["clean_at"] else "no"
        L.append(f"{'':26s} {'J ' + c:6s} {fin(r['final']):36s} "
                 f"{(pct(r['final']['cost'], r['ac']) if r['final'] else float('nan')):+8.3f}%")
        jr = r.get("JR")
        if "JR" in r:
            L.append(f"{'':26s} {'J+R':6s} {(fin(jr) if jr else 'reactive stage: no IPOPT solution'):36s} "
                     f"{(('%+8.3f%%' % pct(jr['cost'], r['ac'])) if jr else ''):>9s}"
                     f"{('  clean' if jr and jr['clean'] else '')}")
    sc = [r for r in rows if not r.get("stop")]
    b1 = sum(1 for r in sc if r["clean_at"])
    b2 = sum(1 for r in sc if r["clean_at"] or (r.get("JR") and r["JR"]["clean"]))
    costs = [pct(r["final"]["cost"], r["ac"]) for r in sc if r["clean_at"]] + \
            [pct(r["JR"]["cost"], r["ac"]) for r in sc if not r["clean_at"] and r.get("JR") and r["JR"]["clean"]]
    L += ["", f"Cases with a full-load power flow: {len(sc)} of {len(rows)}",
          f"B1 J fully clean within 20 rounds on >= 2 of 5: {b1} -> {'HELD' if b1 >= 2 else 'REFUTED'}",
          f"B2 J or J+R fully clean on >= 3 of 5: {b2} -> {'HELD' if b2 >= 3 else 'REFUTED'}",
          ("B3 every clean point within +1 %: " + ", ".join(f"{c:+.3f}%" for c in costs) + " -> "
           + ("HELD" if max(costs) <= 1.0 else "REFUTED")) if costs else "B3 not testable (no clean point)",
          "Wall time (s): " + ", ".join(f"{r['case']}/{r['kind']} {r.get('secs', 0):.0f}" for r in rows)]
    return "\n".join(L) + "\n"


def main():
    if "--merge" in sys.argv:
        rows = [json.loads((PARTS / f"{c}_{k}.json").read_text()) for c, k in CASES]
        (HERE / "results_bigslack.json").write_text(json.dumps(rows, indent=1, default=float))
        text = summary(rows)
        (HERE / "results_bigslack.txt").write_text(text)
        print(text)
        return
    PARTS.mkdir(exist_ok=True)
    for a in [x for x in sys.argv[1:] if not x.startswith("--")] or [f"{c}/{k}" for c, k in CASES]:
        c, k = a.split("/")
        r = run(c, k)
        (PARTS / f"{c}_{k}.json").write_text(json.dumps(r, indent=1, default=float))
        print(f"done {c}/{k} in {r['secs']:.0f}s clean_at {r.get('clean_at')}", flush=True)


if __name__ == "__main__":
    main()
