"""A margin-backoff rule for an empty margin-shifted set (research/grid-linopf).

Plan, rule B and predictions B1 to B7 in LOG.md (2026-11-17, "A margin-backoff rule for an empty
margin-shifted set", committed before this ran).

Rule B, before round 1, on the network the repair runs on:
  panel  = the solvers of {PIPS, IPOPT} that solve PYPOWER's unshifted AC OPF (none: decline, frozen margins);
  k = 0  : the shifted OPF (every bound pulled in by vlin.MARGIN); any panel solver solves it -> frozen margins;
  k=1..3 : margins x 2^-k; the first k at which any panel solver solves the shifted OPF is used;
  none   : frozen margins.
Only cases where the rule changes the margins are rerun; elsewhere the repair is identical by construction.

Usage: OMP_NUM_THREADS=1 run_backoff.py dev | held | --summary (needs cyipopt for the IPOPT half of the panel).
Writes results_backoff_parts/<arm>_<case>_<kind>.json, then results_backoff.json and results_backoff.txt.
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
from pypower.api import runopf  # noqa: E402

from infra_dcopf import converge, ipopt_nlp, vlin  # noqa: E402
from run_margin import shifted  # noqa: E402
from run_pglib import ACOPT, CASES  # noqa: E402

PARTS = HERE / "results_backoff_parts"
OUT = HERE / "results_backoff"
DEV_REF = HERE / "results_converge.json"
HELD_REF = HERE / "results_heldout_slack.json"
DEV_ROUNDS = 30
KMAX = 3
FAMS = tuple(vlin.MARGIN)
KINDS = ["typ", "api", "sad"]
PREV_BOTH_FAIL = [("case73_ieee_rts", "api"), ("case24_ieee_rts", "api"), ("case240_pserc", "typ"),
                  ("case240_pserc", "sad")]


def scaled(k):
    return {f: v * 2.0 ** -k for f, v in vlin.MARGIN.items()}


def solve(ppc, solver):
    t = time.time()
    try:
        if solver == "ipopt":
            with ipopt_nlp.use_ipopt():
                r = runopf(ppc, ACOPT)
        else:
            r = runopf(ppc, ACOPT)
        ok = bool(r["success"])
        return {"ok": ok, "f": float(r["f"]) if ok else None, "secs": time.time() - t}
    except Exception as e:  # a solver crash counts as no solution, recorded
        return {"ok": False, "f": None, "err": f"{type(e).__name__}: {e}", "secs": time.time() - t}


def with_margin(ppc, m):
    """shifted() pulls bounds in by vlin.MARGIN; scale MARGIN temporarily to pull them in by m."""
    old = dict(vlin.MARGIN)
    import run_margin
    try:
        run_margin.MG.update(m)
        return shifted(ppc, FAMS)
    finally:
        run_margin.MG.update(old)


def rule_b(ppc):
    """Rule B's decision: (k or None, log). k = None means the frozen margins stand."""
    log = {"unshifted": {s: solve(ppc, s) for s in ("pips", "ipopt")}}
    panel = [s for s in ("pips", "ipopt") if log["unshifted"][s]["ok"]]
    log["panel"] = panel
    log["tries"] = []
    if not panel:
        log["decision"] = "decline (no panel)"
        return None, log
    for k in range(0, KMAX + 1):
        sp = with_margin(ppc, scaled(k))
        tr = {"k": k}
        got = False
        for s in panel:
            tr[s] = solve(sp, s)
            if tr[s]["ok"]:
                tr[s]["gap_pct"] = 100.0 * (tr[s]["f"] / log["unshifted"][s]["f"] - 1.0)
                got = True
                break  # any panel solver solving it is enough
        log["tries"].append(tr)
        if got:
            log["decision"] = "frozen" if k == 0 else f"k={k}"
            return (None if k == 0 else k), log
    log["decision"] = "none solves by k=3: frozen"
    return None, log


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
        k, log = rule_b(ppc)
        out = {"case": name, "kind": kind, "ac": ac, "k": k, "rule": log, "rule_secs": time.time() - t}
        if k is not None:
            t = time.time()
            hist, _ = converge.traced_slp(ppc, start, vf, rounds=DEV_ROUNDS, margin=scaled(k))
            cl = next((h for h in hist if h.get("clean")), None)
            last = next((h for h in reversed(hist) if "max_load" in h), {})
            out.update(secs=time.time() - t, statuses=[h["status"] for h in hist],
                       clean_at=cl["it"] if cl else None, clean_cost=cl["cost"] if cl else None,
                       last={q: last.get(q) for q in ("n_over", "max_load", "slack_out_mw", "n_ang", "vviol",
                                                      "v_exc_pu", "qviol", "q_exc_mvar")})
    f.write_text(json.dumps(out, default=float))
    return out


def held_job(job):
    """run_heldout_slack.phase_j's protocol; rule B on the network after the reference move."""
    from pypower.idx_bus import BUS_TYPE
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
    p, b, _k = big_slack(ppc)
    out = {"case": name, "kind": kind, "ac": float(baseline()[(name, kind)][1])}
    k, log = rule_b(p)
    out.update(k=k, rule=log, rule_secs=time.time() - t0)
    if k is not None:
        pg, rule = dc_start(p)
        vf = file_schedule(p)
        pts, _ = path(p, lambda m: m * pg, vf)
        if not pts or pts[-1][0] < 1.0:
            out["stop"] = "no power flow at mu = 1"
        else:
            t1 = time.time()
            hist = vlin.slp(p, pg, vf, rounds=FINAL_ROUNDS, margin=scaled(k), analytic=True, solver="clarabel",
                            screen=True, warm=pts[-1][1], warm_check=True)
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


def summary():
    dev = [json.loads(f.read_text()) for f in sorted(PARTS.glob("dev_*.json"))]
    held = [json.loads(f.read_text()) for f in sorted(PARTS.glob("held_*.json"))]
    dref = {(r["case"], r["kind"]): r for r in json.loads(DEV_REF.read_text())}
    href = {(r["case"], r["kind"]): r for r in json.loads(HELD_REF.read_text())}
    L = []
    P = L.append
    P("A margin-backoff rule for an empty margin-shifted set (research/grid-linopf)")
    P("Plan, rule B and predictions B1 to B7: LOG.md 2026-11-17 (committed before this ran).")
    P(f"vlin.MARGIN = {vlin.MARGIN}; backoff margins x 2^-k, k = 1..{KMAX}")
    P("")

    def rule_line(r):
        lg = r["rule"]
        tries = []
        for t in lg["tries"]:
            s = [f"{so}:" + (f"{t[so]['gap_pct']:+.3f}%" if t[so]["ok"] else "x") for so in lg["panel"] if so in t]
            tries.append(f"k={t['k']} " + " ".join(s))
        return f"panel {'+'.join(lg['panel']) or '-':10s} {lg['decision']:28s} " + " | ".join(tries)

    dv = [r for r in dev if not r.get("skip")]
    P(f"Development: {len(dv)} cases with a PIPS AC optimum; rule B per case (shifted OPF gap over each solver's own unshifted optimum)")
    fired = []
    for r in dv:
        if r["k"] is not None or r["rule"]["decision"] != "frozen":
            P(f"  {r['case']:18s} {r['kind']:4s} {rule_line(r)}")
        if r["k"] is not None:
            fired.append(r)
    nfro = sum(1 for r in dv if r["rule"]["decision"] == "frozen")
    P(f"  rule keeps the frozen margins at k = 0 on {nfro} of {len(dv)}; fires on {len(fired)}: "
      f"{[(r['case'], r['kind'], r['k']) for r in fired]}")
    P("")
    P("Development cases where rule B fires: frozen repair vs rule B (30 rounds)")
    P("case               kind   k  frozen@  B@   cost% frozen / B   B last state if not clean")
    lost = gained = 0
    for r in fired:
        f = dref[(r["case"], r["kind"])]
        fc, bc = f.get("clean_at"), r.get("clean_at")
        lost += int(fc is not None and bc is None)
        gained += int(fc is None and bc is not None)
        gp = lambda c: "-" if c is None else f"{pct(c, r['ac']):+.3f}"  # noqa: E731
        P(f"  {r['case']:18s} {r['kind']:4s} {r['k']:2d}  {str(fc):>6} {str(bc):>5}   "
          f"{gp(f.get('clean_cost'))} / {gp(r.get('clean_cost'))}   {'' if bc else json.dumps(r.get('last'))}")
    nfin = sum(1 for r in dv if dref[(r["case"], r["kind"])].get("clean_at"))
    tot = nfin - lost + gained
    P(f"  lost {lost}, gained {gained}; development finishers within 30 rounds: frozen {nfin} of {len(dv)}, rule B {tot}")
    get = {(r["case"], r["kind"]): r for r in dv}
    c73 = get.get(("case73_ieee_rts", "api"))
    P("")
    if c73:
        P(f"B1 (case73 API: fires, stops at k = 1): {'held' if c73['k'] == 1 else 'refuted'} (k = {c73['k']}; {c73['rule']['decision']})")
        P(f"B2 (case73 API clean within 30 rounds under B): {'held' if c73.get('clean_at') else 'refuted'} ({c73.get('clean_at')})")
    fk = sorted((r["case"], r["kind"]) for r in fired)
    P(f"B3 (fires on exactly the four previous both-solver failures): {'held' if fk == sorted(PREV_BOTH_FAIL) else 'refuted'}")
    P(f"B4 (at most 1 frozen finisher lost where it fires): {'held' if lost <= 1 else 'refuted'} ({lost})")
    if c73 and c73.get("clean_at"):
        g = pct(c73["clean_cost"], c73["ac"])
        P(f"B5 (case73 API finish within +1 % of the AC optimum): {'held' if g <= 1.0 else 'refuted'} ({g:+.3f} %)")
    else:
        P("B5: untestable (case73 API did not finish)")
    P("")
    P(f"Held-out: rule B on {len(held)} cases that reach the repair under the one protocol (reference at the largest unit)")
    hf = []
    hlost = hgain = 0
    for r in held:
        P(f"  {r['case']:16s} {r['kind']:4s} {rule_line(r)}  ({r['rule_secs']:.0f} s)")
        if r["k"] is not None:
            hf.append(r)
    P("Held-out cases where rule B fires: frozen J vs rule B J (20 rounds)")
    for r in hf:
        f = href[(r["case"], r["kind"])]
        fc, bc = f.get("clean_at"), r.get("clean_at")
        hlost += int(bool(fc) and not bc)
        hgain += int(not fc and bool(bc))
        fin = r.get("final") or {}
        ffin = f.get("final") or {}
        gp = lambda c: "-" if not c else f"{pct(c, r['ac']):+.3f} %"  # noqa: E731
        P(f"  {r['case']:16s} {r['kind']:4s} k={r['k']}  frozen@{fc}  B@{bc}  {r.get('stop', '')}"
          f"  best point cost vs PGLib: frozen {gp(ffin.get('cost'))}, B {gp(fin.get('cost'))}; B best: nOv {fin.get('n_over')}, "
          f"maxLd {fin.get('max_load', 0):.4f}, V {fin.get('vviol')}, Q {fin.get('qviol')}")
    P(f"B6 (fires on at most 3 held-out cases): {'held' if len(hf) <= 3 else 'refuted'} ({len(hf)} of {len(held)})")
    if hf:
        P(f"B7 (where it fires: gains >= 1, loses none): {'held' if hgain >= 1 and hlost == 0 else 'refuted'} "
          f"(gained {hgain}, lost {hlost})")
    else:
        P("B7: untestable (fires on none)")
    return "\n".join(L) + "\n", {"dev": dev, "held": held}


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
