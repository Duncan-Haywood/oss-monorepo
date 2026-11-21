"""Milestone 6 of research/grid-linopf, re-tallied under one protocol on all 24 held-out cases (plan in LOG.md
2026-11-15, "Held-out cases under one protocol", committed before this ran).

The earlier tally (run_heldout.py) put the slack at the file's reference (or `fix_ref`'s first PV bus), started the
repair cold at the DC dispatch, and scored only the cases PIPS solved. Two later steps changed what the protocol
should be: IPOPT matches PGLib's published objective within 0.005 % where PIPS fails (results_ipopt_ref.txt), and on
the RTE networks the fold was the slack choice (results_bigslack.txt). The protocol here, the same on every case:
  reference  the bus of the live unit with the largest PMAX (diag_slack_move.big_slack);
  start      the DC OPF with angle limits, else without (run_homotopy.dc_start);
  power flow the fold step's continuation of the DC dispatch from mu = 0 to 1 (run_fold.path, file schedule);
  J          the frozen 20-round J-m-a warm at the full-load power flow (run_fold.repair_stage, no constant changed);
  J10        its first 10 rounds;
  J+R        the reactive stage on IPOPT on J's best point when J is not fully clean (wall limit set by the shell);
  cost       against PGLib-OPF v23.07's published AC objective.
Phase J writes results_heldout_slack_parts/<case>_<kind>.json; phase R writes <case>_<kind>_R.json; --merge writes
results_heldout_slack.json and .txt, with the paired comparison against the earlier protocol.
Usage: run_heldout_slack.py J|R case/kind ... | --merge. OMP_NUM_THREADS=1 recommended.
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
import numpy as np  # noqa: E402
from pypower.idx_bus import BUS_TYPE  # noqa: E402

from infra_dcopf import ipopt_nlp, vlin  # noqa: E402
from infra_dcopf.pglib import baseline, case_path, fix_ref, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule  # noqa: E402
from diag_slack_move import big_slack  # noqa: E402
from run_fold import FINAL_ROUNDS, path, repair_stage  # noqa: E402
from run_heldout import HELDOUT, KINDS, SPLIT, reactive  # noqa: E402
from run_homotopy import dc_start  # noqa: E402
from run_perturb import cluster_boot, sign_test, strip, wilson  # noqa: E402

PARTS = HERE / "results_heldout_slack_parts"
CASES = [(c, k) for k in KINDS for c in HELDOUT]


def jsonable(x):
    if isinstance(x, dict):
        return {k: jsonable(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [jsonable(v) for v in x]
    if isinstance(x, np.ndarray):
        return x.tolist()
    if isinstance(x, (np.floating, np.integer, np.bool_)):
        return x.item()
    return x


def phase_j(name, kind):
    t0 = time.time()
    ppc, _ = fix_ref(load_m(case_path(name, kind)))
    old_ref = int(ppc["bus"][ppc["bus"][:, BUS_TYPE] == 3, 0][0])
    p, b, k = big_slack(ppc)
    out = {"case": name, "kind": kind, "nbus": int(p["bus"].shape[0]), "old_ref": old_ref, "slack_bus": b,
           "slack_unit": int(k), "moved": b != old_ref, "ac": float(baseline()[(name, kind)][1]), "ref": "PGLib"}
    pg, rule = dc_start(p)
    out["start_rule"] = rule
    if pg is None:
        out["stop"] = "no DC start"
        out["secs"] = time.time() - t0
        return out
    vf = file_schedule(p)
    out["S"] = strip(vlin.check(p, pg, vf))
    pts, _ = path(p, lambda m: m * pg, vf)
    out["mu_star"] = float(pts[-1][0]) if pts else 0.0
    out["n_pf_path"] = len(pts)
    if not pts or pts[-1][0] < 1.0:
        out["stop"] = "no power flow at mu = 1"
        out["secs"] = time.time() - t0
        return out
    t1 = time.time()
    hist, best = repair_stage(p, pg, vf, pts[-1][1], FINAL_ROUNDS)
    out["J_secs"] = time.time() - t1
    out["status"] = [x["status"] for x in hist]
    out["qp"] = [x.get("qp") for x in hist]
    out["clean_at"] = next((x["it"] for x in hist if x.get("clean")), None)
    out["final"] = strip(best) if best else None
    b10 = vlin.best_of(hist[:SPLIT], p["baseMVA"])
    out["final10"] = strip(b10) if b10 else None
    out["best_pg"] = None if best is None else np.asarray(best["pg"]).tolist()
    out["best_pg10"] = None if b10 is None else np.asarray(b10["pg"]).tolist()
    out["secs"] = time.time() - t0
    return out


def phase_r(name, kind):
    """IPOPT reactive stage on J's best point. (J10+R, the 10-round point, is not run: no prediction rests on it, and
    each IPOPT attempt can take most of the wall limit on these networks.)"""
    t0 = time.time()
    r = json.loads((PARTS / f"{name}_{kind}.json").read_text())
    out = {"case": name, "kind": kind}
    ppc, _ = fix_ref(load_m(case_path(name, kind)))
    p, _, _ = big_slack(ppc)
    with ipopt_nlp.use_ipopt():
        for key, fk, pk in (("JR", "final", "best_pg"),):
            f = r.get(fk)
            if f is None or f["clean"] or r.get(pk) is None:
                continue
            if key == "J10R" and r["best_pg10"] == r["best_pg"]:
                out["J10R"] = out.get("JR")
                continue
            out[key] = reactive(p, {"pg": np.array(r[pk]), "clean": False})
    out["secs"] = time.time() - t0
    return out


def pct(c, ref):
    return 100 * (c - ref) / ref


def fin(f):
    return ("-" if not f else f"{f['n_over']:3d} {f['max_load'] * 100:7.2f} {f['slack_out_mw']:7.1f} "
            f"{f['n_ang']:4d} {f['vviol']:4d} {f['qviol']:4d}")


def clean(c):
    return bool(c and c.get("clean"))


def ok(r, arm):
    if r.get("stop"):
        return False
    if arm == "S":
        return clean(r["S"])
    if arm == "J":
        return bool(r["clean_at"])
    if arm == "J10":
        return bool(r["clean_at"] and r["clean_at"] <= SPLIT)
    if arm == "JR":
        return ok(r, "J") or clean(r.get("JR"))
    if arm == "J10R":
        return ok(r, "J10") or clean(r.get("J10R"))
    raise KeyError(arm)


def clean_cost(r):
    if ok(r, "J"):
        return pct(r["final"]["cost"], r["ac"])
    if clean(r.get("JR")):
        return pct(r["JR"]["cost"], r["ac"])
    return None


def old_rows():
    """The earlier protocol's outcome per case: results_heldout.json (PIPS-scored) and _noref.json (the rest)."""
    old = {}
    for fn in ("results_heldout.json", "results_heldout_noref.json"):
        for r in json.loads((HERE / fn).read_text()):
            if "J" in r:
                old[(r["case"], r["kind"])] = r
    return old


def old_ok(r, arm):
    if arm == "J":
        return bool(r["J"]["clean_at"])
    jr = r.get("JR")
    return bool(r["J"]["clean_at"]) or bool(jr and jr.get("clean"))


ARMS = [("S", "S (DC dispatch)"), ("J10", "J, 10 rounds (H2 as written)"), ("J10R", "J10 or J10+R"),
        ("J", "J, 20 rounds (frozen budget)"), ("JR", "J or J+R")]


def summary(rows):
    L = []
    P = L.append
    P("Milestone 6 under one protocol: the 24 held-out PGLib-OPF v23.07 cases (500 to 2,000 buses), reference at")
    P("the largest live unit, DC start, continuation to the full-load power flow, frozen 20-round J-m-a warm there,")
    P("IPOPT reactive stage on its best point (+R). Cost against PGLib's published AC objective. Plan: LOG.md")
    P("2026-11-15. Cell: branches over 100 %, worst loading %, slack MW outside limits, angle violations, buses out")
    P("of V band, units outside Q limits.")
    P("")
    P(f"{'case':16s} {'kind':4s} {'slack':>13s} {'start':>10s} {'mu*':>6s} {'J10':>4s} {'J':>4s} {'J+R':>5s}  "
      f"{'J best: nOv  maxLd%   slkMW nAng    V    Q':42s} {'cost':>9s} {'s':>6s}")
    for r in rows:
        mv = f"{r['old_ref']}->{r['slack_bus']}" if r["moved"] else f"{r['slack_bus']} (same)"
        if r.get("stop"):
            P(f"{r['case']:16s} {r['kind']:4s} {mv:>13s} {str(r['start_rule']):>10s} "
              f"{r.get('mu_star', 0):6.3f}  {r['stop']}")
            continue
        jr = r.get("JR", "n/a")
        jrs = ("y" if ok(r, "JR") else ("-" if jr is None or jr == "n/a" or not clean(jr) else "y")) \
            if not ok(r, "J") else "y"
        if not ok(r, "J") and "R_done" in r and not r["R_done"]:
            jrs = "t/o"
        if not ok(r, "J") and jr is None and r.get("R_done"):
            jrs = "none"
        c = clean_cost(r)
        cs = f"{c:+8.3f}%" if c is not None else (f"({pct(r['final']['cost'], r['ac']):+.3f}%)" if r["final"] else "-")
        P(f"{r['case']:16s} {r['kind']:4s} {mv:>13s} {r['start_rule']:>10s} {r['mu_star']:6.3f} "
          f"{('@' + str(r['clean_at'])) if ok(r, 'J10') else 'no':>4s} {('@' + str(r['clean_at'])) if r['clean_at'] else 'no':>4s} "
          f"{jrs:>5s}  {fin(r['final']):42s} {cs:>9s} {r['secs'] + r.get('R_secs', 0):6.0f}")
    P("")
    P("'none' = IPOPT reactive stage found no solution; 't/o' = it did not finish inside the wall limit (not clean).")
    P("Costs in parentheses are of points that are not fully clean (J's best), shown for reference only.")
    P("")
    sc = [r for r in rows if not r.get("stop")]
    stops = [r for r in rows if r.get("stop")]
    P(f"Cases: {len(rows)}; reference moved on {sum(r['moved'] for r in rows)}; no DC start "
      f"{sum(r['stop'] == 'no DC start' for r in stops)}; no full-load power flow "
      f"{sum(r['stop'] == 'no power flow at mu = 1' for r in stops)}; scored {len(sc)}.")
    if stops:
        P("  not scored: " + ", ".join(f"{r['case']}/{r['kind']} ({r['stop']})" for r in stops))
    P("")
    P("Fully clean, over all 24 cases (a case with no start counts as not clean) and over the scored cases:")
    nets = [c for c in HELDOUT]
    res = {}
    for kind in KINDS + ["all"]:
        sel = [r for r in rows if kind == "all" or r["kind"] == kind]
        P(f"  {kind.upper()} ({len(sel)} cases, {sum(not r.get('stop') for r in sel)} scored):")
        for arm, lab in ARMS:
            k, n = sum(ok(r, arm) for r in sel), len(sel)
            w = wilson(k, n)
            extra = ""
            if kind == "all":
                groups = [np.array([ok(r, arm) for r in sel if r["case"] == c], int) for c in nets]
                bb = cluster_boot([g for g in groups if len(g)])
                extra = f"  cluster [{bb[0]:.3f}, {bb[1]:.3f}]"
            res[(kind, arm)] = k
            ns = sum(not r.get("stop") for r in sel)
            P(f"    {lab:30s} {k:3d}/{n:<3d} = {k / n:.3f}  Wilson [{w[0]:.3f}, {w[1]:.3f}]{extra}   of scored {k}/{ns}")
    P("")
    old = old_rows()
    P("Paired against the earlier protocol (results_heldout.json / _noref.json: slack at the file's or fix_ref's")
    P("reference, cold start at the DC dispatch, PIPS reactive stage), on the cases it scored:")
    pairs = [(r, old[(r["case"], r["kind"])]) for r in rows if (r["case"], r["kind"]) in old]
    for arm in ("J", "JR"):
        w = [f"{r['case']}/{r['kind']}" for r, o in pairs if ok(r, arm) and not old_ok(o, arm)]
        lo = [f"{r['case']}/{r['kind']}" for r, o in pairs if old_ok(o, arm) and not ok(r, arm)]
        P(f"  {arm:3s}: new {sum(ok(r, arm) for r, _ in pairs)}, old {sum(old_ok(o, arm) for _, o in pairs)} of "
          f"{len(pairs)}; gained {len(w)} ({', '.join(w) or '-'}); lost {len(lo)} ({', '.join(lo) or '-'}); "
          f"sign test P = {sign_test(len(w), len(lo)):.2g}")
    same = [(r, o) for r, o in pairs if not r["moved"] and not r.get("stop")]
    ident = [f"{r['case']}/{r['kind']}" for r, o in same if r["status"] == o["J"]["status"]]
    P(f"  control C0 (reference not moved): round-by-round statuses identical to the earlier run on {len(ident)} of "
      f"{len(same)}" + (f""" ({', '.join(f'{r[0]["case"]}/{r[0]["kind"]}' for r in same if f'{r[0]["case"]}/{r[0]["kind"]}' not in ident)} differ)"""
                        if len(ident) < len(same) else ""))
    bsp = HERE / "results_bigslack.json"
    if bsp.exists():
        bs = {(x["case"], x["kind"]): x for x in json.loads(bsp.read_text())}
        rep = [(r, bs[(r["case"], r["kind"])]) for r in rows if (r["case"], r["kind"]) in bs]
        same_b = sum(r.get("status") == b.get("status") for r, b in rep)
        P(f"  control C1 (same protocol as results_bigslack on its five RTE cases): statuses identical on {same_b} of {len(rep)}")
    P("")
    costs = [(f"{r['case']}/{r['kind']}", clean_cost(r)) for r in rows if clean_cost(r) is not None]
    n = len(rows)
    P("Predictions (LOG.md 2026-11-15):")
    P(f"  R1 scored (DC start and a full-load power flow) on >= 19 of 24: {len(sc)} -> "
      f"{'HELD' if len(sc) >= 19 else 'REFUTED'}")
    np_old = sum(old_ok(o, 'J') for _, o in pairs)
    P(f"  R2 J fully clean within 20 rounds on >= 10 of 24: {res[('all', 'J')]} -> "
      f"{'HELD' if res[('all', 'J')] >= 10 else 'REFUTED'}")
    lostJ = sum(old_ok(o, 'J') and not ok(r, 'J') for r, o in pairs)
    P(f"  R3 no harm where the old protocol scored: J clean on >= {np_old} of those {len(pairs)} and at most 2 lost: "
      f"{sum(ok(r, 'J') for r, _ in pairs)}, lost {lostJ} -> "
      f"{'HELD' if sum(ok(r, 'J') for r, _ in pairs) >= np_old and lostJ <= 2 else 'REFUTED'}")
    P(f"  R4 J or J+R fully clean on >= 12 of 24: {res[('all', 'JR')]} -> {'HELD' if res[('all', 'JR')] >= 12 else 'REFUTED'}")
    if costs:
        P("  R5 every fully clean point within +1 % of PGLib's objective: "
          + ", ".join(f"{c} {v:+.3f}%" for c, v in costs) + " -> " + ("HELD" if max(v for _, v in costs) <= 1.0 else "REFUTED"))
        v = [x for _, x in costs]
        P(f"     mean {np.mean(v):+.3f} %, median {np.median(v):+.3f} %, within +0.1 %: {sum(x <= 0.1 for x in v)} of {len(v)}")
    P(f"  R6 H2 as written stays refuted (J within 10 rounds below 50 %): {res[('all', 'J10')]} of {n} -> "
      f"{'HELD (H2 refuted)' if res[('all', 'J10')] < 0.5 * n else 'REFUTED'}")
    apisad = [r for r in sc if r["kind"] in ("api", "sad")]
    h1 = sum(not r["S"]["p_clean"] for r in apisad if r["S"])
    nopf = sum(r["S"] is None for r in apisad)
    P(f"  H1 DC dispatch breaks a thermal, slack or angle limit on {h1} of {len(apisad)} scored API and SAD cases"
      f" and has no AC power flow (cold Newton) on {nopf} more")
    el = sum(bool(q and "elastic" in q) for r in sc for q in r["qp"])
    P(f"Rounds run: {sum(len(r['status']) for r in sc)}; elastic QPs: {el}. Wall time: phase J "
      f"{sum(r['secs'] for r in rows):.0f} s, phase R {sum(r.get('R_secs', 0) for r in rows):.0f} s, summed over cases.")
    return "\n".join(L) + "\n"


def merge():
    rows = []
    for c, k in CASES:
        r = json.loads((PARTS / f"{c}_{k}.json").read_text())
        rp = PARTS / f"{c}_{k}_R.json"
        needs_r = not r.get("stop") and not r["clean_at"]
        if needs_r:
            r["R_done"] = rp.exists()
            if rp.exists():
                rr = json.loads(rp.read_text())
                r["JR"], r["J10R"], r["R_secs"] = rr.get("JR"), rr.get("J10R"), rr["secs"]
        elif not r.get("stop") and r["clean_at"] and r["clean_at"] > SPLIT and rp.exists():
            rr = json.loads(rp.read_text())
            r["J10R"], r["R_secs"] = rr.get("J10R"), rr["secs"]
        rows.append({k2: v for k2, v in r.items() if k2 not in ("best_pg", "best_pg10")})
    (HERE / "results_heldout_slack.json").write_text(json.dumps(jsonable(rows), indent=1))
    text = summary(rows)
    (HERE / "results_heldout_slack.txt").write_text(text)
    print(text)


def main():
    if "--merge" in sys.argv:
        return merge()
    phase = sys.argv[1]
    PARTS.mkdir(exist_ok=True)
    for a in sys.argv[2:]:
        c, k = a.split("/")
        t0 = time.time()
        try:
            r = phase_j(c, k) if phase == "J" else phase_r(c, k)
        except Exception as e:  # reported, not allowed to stop the batch
            r = {"case": c, "kind": k, "error": f"{type(e).__name__}: {e}", "secs": time.time() - t0}
        suffix = "" if phase == "J" else "_R"
        (PARTS / f"{c}_{k}{suffix}.json").write_text(json.dumps(jsonable(r), indent=1))
        print(f"done {phase} {c}/{k} {r['secs']:.0f}s clean_at {r.get('clean_at')} stop {r.get('stop')} "
              f"err {r.get('error')}", flush=True)


if __name__ == "__main__":
    main()
