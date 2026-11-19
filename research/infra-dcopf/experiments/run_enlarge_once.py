"""Rule O (E-once): rule E's box enlargement at most once per base point (research/grid-linopf).

Plan, rule O and predictions O1 to O6 in LOG.md (2026-11-19, "Rule E-once", committed before this ran).

Rule E (run_enlarge.py) re-solves a failed hard QP at the smallest non-empty box scale (times 1.1, capped at twice
the first boxes) before the elastic fallback; 68 of its 94 development firings rebuilt a QP the repair had just
rejected. Rule O is rule E with one change: once an enlarged step has been taken from a base point, every later
failed hard QP from that base point goes to the frozen elastic chain (enlarge_once=True in vlin.slp and
converge.traced_slp). Same cases and protocol as run_enlarge.py; compared with the frozen runs and with rule E's
(results_enlarge.json).

Usage: OMP_NUM_THREADS=1 run_enlarge_once.py dev | held | --summary
Writes results_enlarge_once_parts/<arm>_<case>_<kind>.json, then results_enlarge_once.json and .txt.
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

PARTS = HERE / "results_enlarge_once_parts"
OUT = HERE / "results_enlarge_once"
DEV_REF = HERE / "results_converge.json"
HELD_REF = HERE / "results_heldout_slack.json"
DEV_ROUNDS = 30
CAPS = {"dev": 2.0, "held": 2.0}
E_REF = HERE / "results_enlarge.json"
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
    hist, trace = converge.traced_slp(ppc, start, vf, rounds=DEV_ROUNDS, enlarge=CAPS[arm],
                                       enlarge_once=True)
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
                        screen=True, warm=pts[-1][1], warm_check=True, enlarge=CAPS[arm], info=info,
                        enlarge_once=True)
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


def blocked(r):
    return sum(1 for e in r.get("enlarge", []) if e.get("blocked"))


def summary():
    dref = {(r["case"], r["kind"]): r for r in json.loads(DEV_REF.read_text()) if r.get("ac_ok", True) and r.get("statuses")}
    href = {(r["case"], r["kind"]): r for r in json.loads(HELD_REF.read_text()) if "status" in r}
    eall = json.loads(E_REF.read_text()) if E_REF.exists() else {}
    eref = {a: {(r["case"], r["kind"]): r for r in eall.get(a, [])} for a in ("dev", "held")}
    L = []
    P = L.append
    P("Rule O (E-once): rule E's box enlargement at most once per base point (research/grid-linopf)")
    P("Plan, rule O and predictions O1 to O6: LOG.md 2026-11-19 (committed before this ran).")
    P("Cases whose frozen run has no failed hard QP are identical by construction (not rerun, counted as frozen).")
    P("")
    res, rows_by = {}, {}
    for arm, ref, budget in (("dev", dref, DEV_ROUNDS), ("held", href, 20)):
        got = {(r["case"], r["kind"]): r for r in (json.loads(f.read_text()) for f in sorted(PARTS.glob(f"{arm}_*.json")))}
        if not got:
            continue
        rows_by[arm] = got
        er = eref[arm]
        P(f"{ {'dev': 'Development, cap 2', 'held': 'Held-out, cap 2'}[arm]}: "
          f"{len(ref)} cases ({len(got)} rerun), {budget}-round budget")
        n_ev, n_fire, n_ok = fire_stats(got.values())
        n_bl = sum(blocked(r) for r in got.values())
        P(f"  failed hard QPs {n_ev}; blocked (an enlarged step already taken from this base point) {n_bl}; "
          f"rule fired (1 < t <= cap) on {n_fire}; enlarged hard QP solved on {n_ok}"
          + (f"; repeats (the 2026-11-19 diagnostic) {sum(repeats(r) for r in got.values())}" if arm == "dev" else ""))
        P("  case               kind   frozen@  E@   O@    cost% over AC optimum frozen / E / O   O fired/ok of failed, blocked")
        gained = lost = both = 0
        dr, dc = [], []
        for key in sorted(ref, key=lambda k: (k[1], k[0])):
            f = ref[key]
            r = got.get(key)
            e = er.get(key)
            fc = f.get("clean_at")
            oc = r.get("clean_at") if r else fc
            ec = e.get("clean_at") if e else fc
            if arm == "dev":
                cost = lambda x, c: x.get("clean_cost") if x else None  # noqa: E731
            else:
                cost = lambda x, c: (x.get("final") or {}).get("cost") if (x and c) else None  # noqa: E731
            fcost = cost(f, fc)
            ocost = cost(r, oc) if r else fcost
            ecost = cost(e, ec) if e else fcost
            ac = f["ac"]
            gained += int(fc is None and oc is not None)
            lost += int(fc is not None and oc is None)
            if fc is not None and oc is not None:
                both += 1
                dr.append(oc - fc)
                dc.append(pct(ocost, ac) - pct(fcost, ac))
            if r is None:
                continue
            gp = lambda c: "-" if c is None else f"{pct(c, ac):+.3f}"  # noqa: E731
            ev = r.get("enlarge", [])
            fs = (f"{sum(1 for x in ev if x.get('fired'))}/{sum(1 for x in ev if x.get('ok'))} of {len(ev)}, "
                  f"{blocked(r)} blocked")
            mark = "" if fc == oc else "  <-"
            P(f"  {key[0]:18s} {key[1]:4s} {str(fc):>7} {str(ec):>4} {str(oc):>4}   {gp(fcost)} / {gp(ecost)} / {gp(ocost)}   {fs}{mark}")
        skey = "statuses" if arm == "dev" else "status"
        inert = [k for k, r in got.items() if not any(x.get("ok") for x in r.get("enlarge", []))]
        bad = [k for k in inert if got[k].get(skey) != ref[k].get(skey)]
        P(f"  reproduction gate 1 (no enlarged step taken: equals the frozen run): {len(inert) - len(bad)} of {len(inert)}"
          + (f"; differ: {bad}" if bad else ""))
        nb = [k for k, r in got.items() if blocked(r) == 0 and k in er]
        bad2 = [k for k in nb if got[k].get(skey) != er[k].get(skey)]
        P(f"  reproduction gate 2 (never blocked: equals rule E's run): {len(nb) - len(bad2)} of {len(nb)}"
          + (f"; differ: {bad2}" if bad2 else ""))
        nf = sum(1 for k in ref if ref[k].get("clean_at") is not None)
        no = nf + gained - lost
        faster = sum(1 for d in dr if d < 0)
        slower = sum(1 for d in dr if d > 0)
        P(f"  finishers: frozen {nf} of {len(ref)}, rule O {no}; gained {gained}, lost {lost} "
          f"(sign test P = {sign_p(gained, lost):.3f})")
        if dr:
            P(f"  on the {both} cases both finish: rounds O minus frozen mean {np.mean(dr):+.2f}, median {np.median(dr):+.1f} "
              f"(O faster on {faster}, slower on {slower}, sign test P = {sign_p(faster, slower):.3f}); "
              f"cost points mean {np.mean(dc):+.3f}, max |.| {np.max(np.abs(dc)):.3f}")
        P("")
        res[arm] = {"n": len(ref), "rerun": len(got), "frozen": nf, "O": no, "gained": gained, "lost": lost,
                    "both": both, "d_rounds": dr, "d_cost_pts": dc, "failed_hard": n_ev, "fired": n_fire,
                    "fired_ok": n_ok, "blocked": n_bl}
    if "dev" in res:
        rd = res["dev"]
        c73 = rows_by["dev"].get(STALLS[0])
        P(f"O1 (development: at most 1 of the frozen finishers lost): {'held' if rd['lost'] <= 1 else 'refuted'} ({rd['lost']})")
        P(f"O2 (case73 API fully clean within 30 rounds): {'held' if c73 and c73.get('clean_at') else 'refuted'}"
          f" ({c73.get('clean_at') if c73 else None})")
        P(f"O3 (development finishers at least 32 of 34): {'held' if rd['O'] >= 32 else 'refuted'} ({rd['O']})")
        med = float(np.median(rd["d_rounds"])) if rd["d_rounds"] else 0.0
        P(f"O4 (development, both finish: median rounds O minus frozen <= 0): {'held' if med <= 0 else 'refuted'} ({med:+.1f})")
    if "held" in res:
        rh = res["held"]
        c500 = rows_by["held"].get(("case500_goc", "sad"))
        P(f"O5 (held-out finishers at least the frozen {rh['frozen']}): {'held' if rh['O'] >= rh['frozen'] else 'refuted'} ({rh['O']})")
        P(f"O6 (held-out case500 SAD finishes): {'held' if c500 and c500.get('clean_at') else 'refuted'}"
          f" ({c500.get('clean_at') if c500 else 'not rerun'})")
    return "\n".join(L) + "\n", {"tally": res, **{a: list(v.values()) for a, v in rows_by.items()}}


def main():
    PARTS.mkdir(exist_ok=True)
    for arm in ("dev",):
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
