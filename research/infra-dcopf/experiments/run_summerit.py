"""Rule S: accept a repair step on the summed thermal excess, not the worst one (research/grid-linopf).

Plan, rule S and predictions S1 to S6 in LOG.md (2026-11-18, "A merit that matches the QP", committed before
this ran).

Rule S changes one thing in the frozen repair J-m-a: a not-clean trial replaces the base point iff
vlin.merit_sum(trial) < vlin.merit_sum(base), where merit_sum is vlin.merit with max(max_load - 1, 0) (the worst
branch's thermal excess) replaced by the sum of every rated branch's thermal excess. Everything else (margins,
boxes, elastic weights, halving on a rejected step, the round budgets) is unchanged.
  development  the 36 PGLib cases of results_converge.json, converge.traced_slp, 30 rounds, start as
               run_elastic.setup; compared with results_converge.json (the frozen merit).
  held-out     run_heldout_slack.phase_j's protocol, 20 rounds, vlin.slp with merit_fn=merit_sum; compared with
               results_heldout_slack.json, on the 19 cases that reach the repair there.

Usage: OMP_NUM_THREADS=1 run_summerit.py dev | held | --summary
Writes results_summerit_parts/<arm>_<case>_<kind>.json, then results_summerit.json and .txt.
"""
import json
import sys
import time
import warnings
from multiprocessing import Pool
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
import numpy as np  # noqa: E402

from infra_dcopf import converge, vlin  # noqa: E402
from run_pglib import CASES  # noqa: E402

PARTS = HERE / "results_summerit_parts"
OUT = HERE / "results_summerit"
DEV_REF = HERE / "results_converge.json"
HELD_REF = HERE / "results_heldout_slack.json"
DEV_ROUNDS = 30
KINDS = ["typ", "api", "sad"]
STALLS = [("case73_ieee_rts", "api"), ("case118_ieee", "api")]


def accept_s(base_mva):
    """traced_slp's accept hook for rule S (ctx["cur"] is the base point's check, None if it had no power flow)."""
    def accept(ctx):
        cur, c = ctx["cur"], ctx["c"]
        return cur is None or vlin.merit_sum(c, base_mva) < vlin.merit_sum(cur, base_mva)
    return accept


def hook_frozen(ctx):
    """Records the frozen test's verdict on the same trial (diagnostic; changes nothing)."""
    return {"phi_frozen": bool(ctx["phi_accept"])}


def part(arm, name, kind):
    return PARTS / f"{arm}_{name}_{kind}.json"


def dev_job(job):
    from run_elastic import setup
    name, kind = job
    f = part("dev", name, kind)
    if f.exists():
        return json.loads(f.read_text())
    s = setup(name, kind)
    if s is None:
        out = {"case": name, "kind": kind, "skip": True}
    else:
        ppc, ac, start, vf = s
        t = time.time()
        hist, trace = converge.traced_slp(ppc, start, vf, rounds=DEV_ROUNDS, hook=hook_frozen,
                                          accept=accept_s(ppc["baseMVA"]))
        cl = next((h for h in hist if h.get("clean")), None)
        last = next((h for h in reversed(hist) if "max_load" in h), {})
        out = {"case": name, "kind": kind, "ac": ac, "secs": time.time() - t,
               "statuses": [h["status"] + ("/" + h["qp"] if "qp" in h else "") for h in hist],
               "clean_at": cl["it"] if cl else None, "clean_cost": cl["cost"] if cl else None,
               "n_differ": sum(1 for t in trace if "hook" in t and t["status"] != "clean"
                               and t["accepted"] != t["hook"]["phi_frozen"]),
               "accepted": [t.get("accepted") for t in trace],
               "last": {q: last.get(q) for q in ("n_over", "max_load", "load_exc_sum", "slack_out_mw", "n_ang",
                                                 "vviol", "v_exc_pu", "qviol", "q_exc_mvar")}}
    f.write_text(json.dumps(out, default=float))
    return out


def held_job(job):
    """run_heldout_slack.phase_j's protocol with rule S's merit; nothing else changed."""
    from infra_dcopf.pglib import baseline, case_path, fix_ref, load_m
    from infra_dcopf.vsched import file_schedule
    from diag_slack_move import big_slack
    from run_fold import FINAL_ROUNDS, path
    from run_heldout import SPLIT
    from run_heldout_slack import jsonable
    from run_homotopy import dc_start
    from run_perturb import strip
    name, kind = job
    f = part("held", name, kind)
    if f.exists():
        return json.loads(f.read_text())
    t0 = time.time()
    ppc, _ = fix_ref(load_m(case_path(name, kind)))
    p, _b, _k = big_slack(ppc)
    out = {"case": name, "kind": kind, "ac": float(baseline()[(name, kind)][1])}
    pg, _rule = dc_start(p)
    vf = file_schedule(p)
    pts, _ = path(p, lambda m: m * pg, vf)
    if not pts or pts[-1][0] < 1.0:
        out["stop"] = "no power flow at mu = 1"
    else:
        t1 = time.time()
        hist = vlin.slp(p, pg, vf, rounds=FINAL_ROUNDS, margin=vlin.MARGIN, analytic=True, solver="clarabel",
                        screen=True, warm=pts[-1][1], warm_check=True, merit_fn=vlin.merit_sum)
        best = vlin.best_of(hist, p["baseMVA"])
        out.update(J_secs=time.time() - t1, status=[x["status"] for x in hist],
                   clean_at=next((x["it"] for x in hist if x.get("clean")), None),
                   final=strip(best) if best else None)
        b10 = vlin.best_of(hist[:SPLIT], p["baseMVA"])
        out["final10"] = strip(b10) if b10 else None
    out["secs"] = time.time() - t0
    out = jsonable(out)
    f.write_text(json.dumps(out, default=float))
    return out


def pct(c, ref):
    return None if c is None else 100.0 * (c / ref - 1.0)


def sign_p(wins, losses):
    """Two-sided exact sign test on the discordant pairs."""
    from math import comb
    n = wins + losses
    if n == 0:
        return 1.0
    k = min(wins, losses)
    return min(1.0, 2.0 * sum(comb(n, i) for i in range(k + 1)) / 2 ** n)


def summary():
    dev = [json.loads(f.read_text()) for f in sorted(PARTS.glob("dev_*.json"))]
    held = [json.loads(f.read_text()) for f in sorted(PARTS.glob("held_*.json"))]
    dref = {(r["case"], r["kind"]): r for r in json.loads(DEV_REF.read_text())}
    href = {(r["case"], r["kind"]): r for r in json.loads(HELD_REF.read_text())}
    L = []
    P = L.append
    P("Rule S: accept a repair step on the summed thermal excess, not the worst one (research/grid-linopf)")
    P("Plan, rule S and predictions S1 to S6: LOG.md 2026-11-18 (committed before this ran).")
    P("")
    res = {}
    for arm, rows, ref, budget, ckey in (("dev", dev, dref, DEV_ROUNDS, "clean_cost"),
                                         ("held", held, href, 20, None)):
        rows = [r for r in rows if not r.get("skip")]
        if not rows:
            continue
        P(f"{'Development' if arm == 'dev' else 'Held-out'}: {len(rows)} cases, {budget}-round budget; "
          "frozen merit (worst excess) vs rule S (summed excess)")
        P("  case               kind   frozen@  S@    cost% over AC optimum frozen / S")
        gained = lost = both = 0
        dr = []
        dc = []
        for r in sorted(rows, key=lambda r: (r["kind"], r["case"])):
            f = ref[(r["case"], r["kind"])]
            fc, sc = f.get("clean_at"), r.get("clean_at")
            if arm == "dev":
                fcost, scost = f.get("clean_cost"), r.get("clean_cost")
            else:
                fcost = (f.get("final") or {}).get("cost") if fc else None
                scost = (r.get("final") or {}).get("cost") if sc else None
            gained += int(fc is None and sc is not None)
            lost += int(fc is not None and sc is None)
            if fc is not None and sc is not None:
                both += 1
                dr.append(sc - fc)
                dc.append(pct(scost, r["ac"]) - pct(fcost, r["ac"]))
            gp = lambda c: "-" if c is None else f"{pct(c, r['ac']):+.3f}"  # noqa: E731
            mark = "" if fc == sc else "  <-"
            P(f"  {r['case']:18s} {r['kind']:4s} {str(fc):>7} {str(sc):>4}   {gp(fcost)} / {gp(scost)}{mark}")
        nf = sum(1 for r in rows if ref[(r["case"], r["kind"])].get("clean_at") is not None)
        ns = sum(1 for r in rows if r.get("clean_at") is not None)
        faster = sum(1 for d in dr if d < 0)
        slower = sum(1 for d in dr if d > 0)
        P(f"  finishers: frozen {nf} of {len(rows)}, rule S {ns}; gained {gained}, lost {lost} "
          f"(sign test on finish/no-finish, P = {sign_p(gained, lost):.3f})")
        if dr:
            P(f"  on the {both} cases both finish: rounds S minus frozen mean {np.mean(dr):+.2f}, median "
              f"{np.median(dr):+.1f} (S faster on {faster}, slower on {slower}, sign test P = {sign_p(faster, slower):.3f}); "
              f"cost points mean {np.mean(dc):+.3f}, max |.| {np.max(np.abs(dc)):.3f}")
        P("")
        res[arm] = {"n": len(rows), "frozen": nf, "S": ns, "gained": gained, "lost": lost, "both": both,
                    "d_rounds": dr, "d_cost_pts": dc}
    d = {(r["case"], r["kind"]): r for r in dev}
    if "dev" in res:
        c118, c73 = d.get(STALLS[1]), d.get(STALLS[0])
        P(f"S1 (case118 API fully clean within 30 rounds under S): {'held' if c118 and c118.get('clean_at') else 'refuted'}"
          f" ({c118.get('clean_at') if c118 else None}; last {json.dumps(c118.get('last') if c118 else None)})")
        P(f"S2 (case73 API still does not finish): {'held' if c73 and not c73.get('clean_at') else 'refuted'}"
          f" ({c73.get('clean_at') if c73 else None})")
        rd = res["dev"]
        P(f"S3 (development: at most 1 of the frozen finishers lost): {'held' if rd['lost'] <= 1 else 'refuted'} ({rd['lost']})")
        med = float(np.median(rd["d_rounds"])) if rd["d_rounds"] else 0.0
        P(f"S4 (development, cases both finish: median rounds S minus frozen <= 0): {'held' if med <= 0 else 'refuted'} ({med:+.1f})")
        mc = float(np.mean(rd["d_cost_pts"])) if rd["d_cost_pts"] else 0.0
        P(f"S5 (development, cases both finish: mean cost within 0.1 points of frozen): {'held' if abs(mc) <= 0.1 else 'refuted'} ({mc:+.3f})")
    if "held" in res:
        rh = res["held"]
        P(f"S6 (held-out: gains at least 1 finisher and loses none): {'held' if rh['gained'] >= 1 and rh['lost'] == 0 else 'refuted'}"
          f" (gained {rh['gained']}, lost {rh['lost']}; {rh['n']} cases scored)")
    return "\n".join(L) + "\n", {"dev": dev, "held": held, "tally": res}


def main():
    PARTS.mkdir(exist_ok=True)
    if "dev" in sys.argv:
        with Pool(4) as pool:
            pool.map(dev_job, [(c, k) for k in KINDS for c in CASES], chunksize=1)
    if "held" in sys.argv:
        ref = json.loads(HELD_REF.read_text())
        jobs = [(r["case"], r["kind"]) for r in ref if "status" in r]
        jobs.sort(key=lambda j: next(r["nbus"] for r in ref if (r["case"], r["kind"]) == j))
        with Pool(4) as pool:
            pool.map(held_job, jobs, chunksize=1)
    txt, res = summary()
    OUT.with_suffix(".json").write_text(json.dumps(res, default=float))
    OUT.with_suffix(".txt").write_text(txt)
    print(txt)


if __name__ == "__main__":
    main()
