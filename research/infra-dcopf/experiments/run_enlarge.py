"""Rule E: enlarge the trust box to the smallest non-empty scale before the elastic fallback
(research/grid-linopf).

Plan, rule E and predictions E1 to E7 in LOG.md (2026-11-19, "Box enlargement before the elastic fallback",
committed before this ran).

Rule E changes one thing in the frozen repair J-m-a: on a round whose hard QP fails, one LP (HiGHS, min t over
(x, t)) finds the smallest scale t of the round's trust box at which the hard QP's set is non-empty, with t capped
so that no box exceeds CAP times its first value (P box 20 % of range, V box VBOX). If 1 < t <= cap, the hard QP
is re-solved once at min(1.1 t, cap) times the box; if that solves, its step is the round's trial. Otherwise the
frozen elastic chain runs at the unchanged box. The stored boxes, their halving on a rejected step, the merit,
margins, elastic weights and budgets are unchanged (vlin.enlarged_step; vlin.slp / converge.traced_slp, enlarge=CAP).
Rule E acts only on rounds whose hard QP fails, so a case whose frozen run never has one is identical by construction
and is not rerun.
  development  converge.traced_slp, 30 rounds, start as run_elastic.setup; compared with results_converge.json.
               Primary arm cap 2 ("dev"); declared secondary arm cap 1 ("dev1"), the cap the 2026-11-19 Next named.
  held-out     run_heldout_slack.phase_j's protocol, 20 rounds, vlin.slp(enlarge=2); compared with
               results_heldout_slack.json on the 19 cases that reach the repair there.

Usage: OMP_NUM_THREADS=1 run_enlarge.py dev | dev1 | held | --summary
Writes results_enlarge_parts/<arm>_<case>_<kind>.json, then results_enlarge.json and .txt.
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

PARTS = HERE / "results_enlarge_parts"
OUT = HERE / "results_enlarge"
DEV_REF = HERE / "results_converge.json"
HELD_REF = HERE / "results_heldout_slack.json"
DEV_ROUNDS = 30
CAPS = {"dev": 2.0, "dev1": 1.0, "held": 2.0}
STALLS = [("case73_ieee_rts", "api"), ("case118_ieee", "api")]


def part(arm, name, kind):
    return PARTS / f"{arm}_{name}_{kind}.json"


def dev_touched(r):
    """Does the frozen run have a round whose hard QP failed (an elastic QP or no QP)?"""
    return any(("/" in s and not s.endswith("/hard")) or s == "QP infeasible" for s in r.get("statuses", []))


def held_touched(r):
    return any(q != "hard" for q in r.get("qp", [])) or any(s == "QP infeasible" for s in r.get("status", []))


def dev_job(job):
    from run_elastic import setup
    arm, name, kind = job
    f = part(arm, name, kind)
    if f.exists():
        return json.loads(f.read_text())
    s = setup(name, kind)
    ppc, ac, start, vf = s
    t = time.time()
    hist, trace = converge.traced_slp(ppc, start, vf, rounds=DEV_ROUNDS, enlarge=CAPS[arm])
    cl = next((h for h in hist if h.get("clean")), None)
    last = next((h for h in reversed(hist) if "max_load" in h), {})
    out = {"case": name, "kind": kind, "ac": ac, "secs": time.time() - t,
           "statuses": [h["status"] + ("/" + h["qp"] if "qp" in h else "") for h in hist],
           "clean_at": cl["it"] if cl else None, "clean_cost": cl["cost"] if cl else None,
           "enlarge": [{"it": tr["it"], "halvings": tr["halvings"], **tr["enlarge"]} for tr in trace if "enlarge" in tr],
           "accepted": [tr.get("accepted") for tr in trace],
           "last": {q: last.get(q) for q in ("n_over", "max_load", "slack_out_mw", "n_ang", "vviol", "v_exc_pu",
                                             "qviol", "q_exc_mvar")}}
    f.write_text(json.dumps(out, default=float))
    return out


def held_job(job):
    """run_heldout_slack.phase_j's protocol with rule E; nothing else changed."""
    from infra_dcopf.pglib import baseline, case_path, fix_ref, load_m
    from infra_dcopf.vsched import file_schedule
    from diag_slack_move import big_slack
    from run_fold import FINAL_ROUNDS, path
    from run_heldout import SPLIT
    from run_heldout_slack import jsonable
    from run_homotopy import dc_start
    from run_perturb import strip
    arm, name, kind = job
    f = part(arm, name, kind)
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
        info = []
        hist = vlin.slp(p, pg, vf, rounds=FINAL_ROUNDS, margin=vlin.MARGIN, analytic=True, solver="clarabel",
                        screen=True, warm=pts[-1][1], warm_check=True, enlarge=CAPS[arm], info=info)
        best = vlin.best_of(hist, p["baseMVA"])
        out.update(J_secs=time.time() - t1, status=[x["status"] for x in hist], qp=[x.get("qp") for x in hist],
                   clean_at=next((x["it"] for x in hist if x.get("clean")), None),
                   final=strip(best) if best else None, enlarge=info)
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


def fire_stats(rows):
    ev = [e for r in rows for e in r.get("enlarge", [])]
    fired = [e for e in ev if e.get("fired")]
    return len(ev), len(fired), sum(1 for e in fired if e.get("ok"))


def repeats(r):
    """After-the-run diagnostic (declared in LOG.md): firings that rebuild the previous round's enlarged QP. With
    the base point unchanged (previous trial rejected) the linearisation is the same, and t_min times the box
    (t_min 2^-halvings, in first-box units) equal to the previous round's means the same QP, the same trial."""
    ev = {e["it"]: e for e in r.get("enlarge", [])}
    acc = r.get("accepted", [])
    n = 0
    for it, e in ev.items():
        p = ev.get(it - 1)
        if not (p and e.get("fired") and p.get("fired") and e.get("t_min") and p.get("t_min")):
            continue
        if it - 2 < len(acc) and acc[it - 2] is False:
            a, b = e["t_min"] * 2.0 ** -e["halvings"], p["t_min"] * 2.0 ** -p["halvings"]
            n += int(abs(a - b) <= 1e-6 * max(abs(a), abs(b)))
    return n


def summary():
    dref = {(r["case"], r["kind"]): r for r in json.loads(DEV_REF.read_text()) if r.get("ac_ok", True) and r.get("statuses")}
    href = {(r["case"], r["kind"]): r for r in json.loads(HELD_REF.read_text()) if "status" in r}
    L = []
    P = L.append
    P("Rule E: enlarge the trust box to the smallest non-empty scale before the elastic fallback (research/grid-linopf)")
    P("Plan, rule E and predictions E1 to E7: LOG.md 2026-11-19 (committed before this ran).")
    P("Cases whose frozen run has no failed hard QP are identical by construction (not rerun, counted as frozen).")
    P("")
    res, rows_by = {}, {}
    for arm, ref, budget in (("dev", dref, DEV_ROUNDS), ("dev1", dref, DEV_ROUNDS), ("held", href, 20)):
        got = {(r["case"], r["kind"]): r for r in (json.loads(f.read_text()) for f in sorted(PARTS.glob(f"{arm}_*.json")))}
        if not got:
            continue
        rows_by[arm] = got
        P(f"{ {'dev': 'Development, cap 2 (primary)', 'dev1': 'Development, cap 1 (secondary)', 'held': 'Held-out, cap 2'}[arm]}: "
          f"{len(ref)} cases ({len(got)} rerun), {budget}-round budget")
        n_ev, n_fire, n_ok = fire_stats(got.values())
        n_rep = sum(repeats(r) for r in got.values())
        P(f"  failed hard QPs {n_ev}; rule fired (1 < t <= cap) on {n_fire}; enlarged hard QP solved on {n_ok}; "
          + (f"of those, {n_rep} rebuild the previous round's rejected QP (same base point, same box: a repeat)"
             if arm.startswith("dev") else "repeats not counted (vlin.slp records no acceptance or halvings)"))
        P("  case               kind   frozen@  E@    cost% over AC optimum frozen / E   fired/ok of failed")
        gained = lost = both = 0
        dr, dc = [], []
        for key in sorted(ref, key=lambda k: (k[1], k[0])):
            f = ref[key]
            r = got.get(key)
            fc = f.get("clean_at")
            ec = r.get("clean_at") if r else fc
            if arm.startswith("dev"):
                fcost = f.get("clean_cost")
                ecost = r.get("clean_cost") if r else fcost
            else:
                fcost = (f.get("final") or {}).get("cost") if fc else None
                ecost = ((r.get("final") or {}).get("cost") if ec else None) if r else fcost
            ac = f["ac"]
            gained += int(fc is None and ec is not None)
            lost += int(fc is not None and ec is None)
            if fc is not None and ec is not None:
                both += 1
                dr.append(ec - fc)
                dc.append(pct(ecost, ac) - pct(fcost, ac))
            if r is None:
                continue
            gp = lambda c: "-" if c is None else f"{pct(c, ac):+.3f}"  # noqa: E731
            ev = r.get("enlarge", [])
            fs = f"{sum(1 for e in ev if e.get('fired'))}/{sum(1 for e in ev if e.get('ok'))} of {len(ev)}"
            if repeats(r):
                fs += f", {repeats(r)} repeats"
            mark = "" if fc == ec else "  <-"
            P(f"  {key[0]:18s} {key[1]:4s} {str(fc):>7} {str(ec):>4}   {gp(fcost)} / {gp(ecost)}   {fs}{mark}")
        inert = [k for k, r in got.items() if not any(e.get("ok") for e in r.get("enlarge", []))]
        skey = "statuses" if arm.startswith("dev") else "status"
        gate_bad = [k for k in inert if got[k].get(skey) != ref[k].get(skey)]
        P(f"  reproduction gate (rerun cases where no enlarged step was taken equal the frozen run): "
          f"{len(inert) - len(gate_bad)} of {len(inert)}" + (f"; differ: {gate_bad}" if gate_bad else ""))
        nf = sum(1 for k in ref if ref[k].get("clean_at") is not None)
        ne = nf + gained - lost
        faster = sum(1 for d in dr if d < 0)
        slower = sum(1 for d in dr if d > 0)
        P(f"  finishers: frozen {nf} of {len(ref)}, rule E {ne}; gained {gained}, lost {lost} "
          f"(sign test P = {sign_p(gained, lost):.3f})")
        if dr:
            P(f"  on the {both} cases both finish: rounds E minus frozen mean {np.mean(dr):+.2f}, median {np.median(dr):+.1f} "
              f"(E faster on {faster}, slower on {slower}, sign test P = {sign_p(faster, slower):.3f}); "
              f"cost points mean {np.mean(dc):+.3f}, max |.| {np.max(np.abs(dc)):.3f}")
        P("")
        res[arm] = {"n": len(ref), "rerun": len(got), "frozen": nf, "E": ne, "gained": gained, "lost": lost,
                    "both": both, "d_rounds": dr, "d_cost_pts": dc, "failed_hard": n_ev, "fired": n_fire, "fired_ok": n_ok}
    if "dev" in rows_by:
        d = rows_by["dev"]
        c73, c118 = d.get(STALLS[0]), d.get(STALLS[1])
        ev73 = [e for e in (c73 or {}).get("enlarge", []) if e["it"] >= 3]
        f73 = sum(1 for e in ev73 if e.get("fired") and e.get("ok"))
        P(f"E1 (case73 API: rule fires and the enlarged hard QP solves on at least half of its failed rounds from 3): "
          f"{('held' if f73 >= len(ev73) / 2 else 'refuted') if ev73 else 'untestable, no failed hard QP from round 3'}"
          f" ({f73} of {len(ev73)}; rounds 1 to 2: {sum(1 for e in (c73 or {}).get('enlarge', []) if e['it'] < 3 and e.get('ok'))} fired and solved)")
        P(f"E2 (case73 API fully clean within 30 rounds): {'held' if c73 and c73.get('clean_at') else 'refuted'}"
          f" ({c73.get('clean_at') if c73 else None}; last {json.dumps(c73.get('last') if c73 else None)})")
        P(f"E3 (case118 API fully clean within 30 rounds): {'held' if c118 and c118.get('clean_at') else 'refuted'}"
          f" ({c118.get('clean_at') if c118 else None}; last {json.dumps(c118.get('last') if c118 else None)})")
        rd = res["dev"]
        P(f"E4 (development: at most 1 frozen finisher lost): {'held' if rd['lost'] <= 1 else 'refuted'} ({rd['lost']})")
        med = float(np.median(rd["d_rounds"])) if rd["d_rounds"] else 0.0
        P(f"E5 (development, both finish: median rounds E minus frozen <= 0): {'held' if med <= 0 else 'refuted'} ({med:+.1f})")
        fr = rd["fired_ok"] / rd["fired"] if rd["fired"] else 0.0
        P(f"E7 (development: the enlarged hard QP solves on at least 90 % of firings): {'held' if fr >= 0.9 else 'refuted'}"
          f" ({rd['fired_ok']} of {rd['fired']})")
    if "held" in res:
        rh = res["held"]
        P(f"E6 (held-out: gains at least 1 finisher and loses none): {'held' if rh['gained'] >= 1 and rh['lost'] == 0 else 'refuted'}"
          f" (gained {rh['gained']}, lost {rh['lost']}; {rh['n']} cases scored)")
    return "\n".join(L) + "\n", {"tally": res, **{a: list(v.values()) for a, v in rows_by.items()}}


def main():
    PARTS.mkdir(exist_ok=True)
    for arm in ("dev", "dev1"):
        if arm in sys.argv:
            ref = [r for r in json.loads(DEV_REF.read_text()) if r.get("statuses") and dev_touched(r)]
            ref.sort(key=lambda r: -r.get("secs", 0))
            with Pool(4) as pool:
                pool.map(dev_job, [(arm, r["case"], r["kind"]) for r in ref], chunksize=1)
    if "held" in sys.argv:
        ref = [r for r in json.loads(HELD_REF.read_text()) if "status" in r and held_touched(r)]
        ref.sort(key=lambda r: -r["secs"])
        with Pool(4) as pool:
            pool.map(held_job, [("held", r["case"], r["kind"]) for r in ref], chunksize=1)
    txt, res = summary()
    OUT.with_suffix(".json").write_text(json.dumps(res, default=float))
    OUT.with_suffix(".txt").write_text(txt)
    print(txt)


if __name__ == "__main__":
    main()
