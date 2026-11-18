"""Do the two development stalls come from the repair's own safety margins? (research/grid-linopf)

Plan and predictions A1, M1 to M3, Z1 to Z4 in LOG.md (2026-11-17, "Do the two development stalls
come from the repair's own safety margins?", committed before this ran).

Arm A: where PYPOWER's AC optimum (PIPS) sits relative to the margin band (vlin.MARGIN) of each row.
Arm M: the same AC OPF with bounds pulled in by vlin.MARGIN (all families; v only; load only).
Arm Z: the frozen J-m-a repair (converge.traced_slp, 30 rounds, start as run_elastic.setup) with the
voltage margin at 0, the thermal margin at 0, and every margin at 0.

Usage: OMP_NUM_THREADS=1 run_margin.py [--run] [--diag] (--diag: after-the-run checks, needs cyipopt); writes results_margin.json and results_margin.txt.
"""
import copy
import json
import sys
import time
import warnings
from multiprocessing import Pool
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np
from pypower.api import runopf
from pypower.idx_brch import ANGMAX, ANGMIN, BR_STATUS, RATE_A
from pypower.idx_bus import VM, VMAX, VMIN
from pypower.idx_gen import GEN_BUS, GEN_STATUS, PG, PMAX, PMIN, QG, QMAX, QMIN

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
from infra_dcopf import converge, vlin  # noqa: E402
from infra_dcopf.aclin import angle_diffs, angle_limited, end_flows, slack_gen  # noqa: E402
from run_elastic import setup  # noqa: E402
from run_pglib import ACOPT, CASES  # noqa: E402

ROUNDS = 30
KINDS = ["typ", "api", "sad"]
STALLS = [("case73_ieee_rts", "api"), ("case118_ieee", "api")]
REF = HERE / "results_converge.json"
OUT = HERE / "results_margin"
MG = vlin.MARGIN
VARIANTS = {"v0": dict(MG, v=0.0), "load0": dict(MG, load=0.0),
            "all0": {k: 0.0 for k in MG}}
SHIFTS = {"all": tuple(MG), "v": ("v",), "load": ("load",)}


def band(ppc, r):
    """Rows of an OPF result inside the margin band (within the margin of their bound), per family."""
    br, bus, g = ppc["branch"], ppc["bus"], ppc["gen"]
    live = g[:, GEN_STATUS] > 0
    out = {}
    vm = r["bus"][:, VM]
    lo, hi = vlin.shrink(bus[:, VMIN], bus[:, VMAX], MG["v"])
    gb = set(int(b) for b in g[live, GEN_BUS])
    isg = np.array([int(b) in gb for b in bus[:, 0]])
    inb = (vm < lo - 1e-7) | (vm > hi + 1e-7)
    out["v_pq"] = int((inb & ~isg).sum())
    out["v_gen"] = int((inb & isg).sum())
    out["v_gen_at_hi"] = int(((vm > hi + 1e-7) & isg).sum())
    out["v_pq_at_lo"] = int(((vm < lo - 1e-7) & ~isg).sum())
    rate = br[:, RATE_A]
    on = (br[:, BR_STATUS] > 0) & (rate > 0)
    sf = end_flows(r)
    nb = br.shape[0]
    load = np.maximum(sf[:nb], sf[nb:])[on] / rate[on]
    out["load"] = int((load > 1.0 - MG["load"] + 1e-7).sum())
    out["max_load"] = float(load.max())
    qlo, qhi = vlin.shrink(g[live, QMIN], g[live, QMAX], MG["q"])
    qg = r["gen"][live, QG]
    out["q"] = int(((qg < qlo - 1e-7) | (qg > qhi + 1e-7)).sum())
    s = slack_gen(ppc)
    plo, phi = vlin.shrink(g[s:s + 1, PMIN], g[s:s + 1, PMAX], MG["slack"])
    ps = r["gen"][s, PG]
    out["slack"] = int(ps < plo[0] - 1e-7 or ps > phi[0] + 1e-7)
    aidx = angle_limited(ppc)
    if len(aidx):
        d = angle_diffs(r, aidx)
        alo, ahi = vlin.shrink(br[aidx, ANGMIN], br[aidx, ANGMAX], MG["ang"])
        out["ang"] = int(((d < alo - 1e-7) | (d > ahi + 1e-7)).sum())
    else:
        out["ang"] = 0
    return out


def shifted(ppc, fams):
    """A copy of ppc with the bounds of the given families pulled in by vlin.MARGIN."""
    p = copy.deepcopy(ppc)
    br, bus, g = p["branch"], p["bus"], p["gen"]
    if "v" in fams:
        bus[:, VMIN], bus[:, VMAX] = vlin.shrink(bus[:, VMIN], bus[:, VMAX], MG["v"])
    if "load" in fams:
        br[:, RATE_A] = br[:, RATE_A] * (1.0 - MG["load"])
    if "q" in fams:
        live = g[:, GEN_STATUS] > 0
        lo, hi = vlin.shrink(g[live, QMIN], g[live, QMAX], MG["q"])
        g[live, QMIN], g[live, QMAX] = lo, hi
    if "slack" in fams:
        s = slack_gen(ppc)
        lo, hi = vlin.shrink(g[s:s + 1, PMIN], g[s:s + 1, PMAX], MG["slack"])
        g[s, PMIN], g[s, PMAX] = lo[0], hi[0]
    if "ang" in fams:
        a = angle_limited(ppc)
        lo, hi = vlin.shrink(br[a, ANGMIN], br[a, ANGMAX], MG["ang"])
        br[a, ANGMIN], br[a, ANGMAX] = lo, hi
    return p


def run_AM(job):
    name, kind = job
    s = setup(name, kind)
    if s is None:
        return {"case": name, "kind": kind, "skip": True}
    ppc, ac_f, _start, _vf = s
    ac = runopf(ppc, ACOPT)
    out = {"case": name, "kind": kind, "ac": ac_f, "band": band(ppc, ac), "shift": {}}
    for k, fams in SHIFTS.items():
        t = time.time()
        r = runopf(shifted(ppc, fams), ACOPT)
        ent = {"ok": bool(r["success"]), "secs": time.time() - t}
        if r["success"]:
            ent["f"] = float(r["f"])
            ent["gap_pct"] = 100.0 * (float(r["f"]) / ac_f - 1.0)
            c = vlin.check(ppc, r["gen"][:, PG], r["gen"][:, 5])  # VG column: setpoints of the shifted optimum
            ent["unshifted_clean"] = bool(c["clean"]) if c else None
        out["shift"][k] = ent
    return out


def run_Z(job):
    name, kind, var = job
    s = setup(name, kind)
    if s is None:
        return {"case": name, "kind": kind, "var": var, "skip": True}
    ppc, ac, start, vf = s
    t = time.time()
    hist, trace = converge.traced_slp(ppc, start, vf, rounds=ROUNDS, margin=VARIANTS[var])
    cl = next((h for h in hist if h.get("clean")), None)
    last = next((h for h in reversed(hist) if "max_load" in h), {})
    return {"case": name, "kind": kind, "var": var, "ac": ac, "secs": time.time() - t,
            "statuses": [h["status"] for h in hist], "clean_at": cl["it"] if cl else None,
            "clean_cost": cl["cost"] if cl else None,
            "last": {k: last.get(k) for k in ("n_over", "max_load", "slack_out_mw", "n_ang", "vviol",
                                              "v_exc_pu", "qviol", "q_exc_mvar")}}




def run_gate(job):
    """Declared after the run: the frozen margins through this script's path reproduce results_converge."""
    name, kind = job
    ppc, ac, start, vf = setup(name, kind)
    hist, _ = converge.traced_slp(ppc, start, vf, rounds=ROUNDS)
    return {"case": name, "kind": kind,
            "statuses": [h["status"] + ("/" + h["qp"] if "qp" in h else "") for h in hist]}


def run_warm(job):
    """Declared after the run: the all-family shifted OPF with IPOPT in place of PIPS (ipopt_nlp, same
    model and start; a second solver, since PIPS ignores the case's start), the unshifted OPF with IPOPT
    as a control, and which single families and pairs PIPS fails on, on cases where PIPS failed."""
    name, kind = job
    ppc, ac_f, _s, _v = setup(name, kind)
    from infra_dcopf import ipopt_nlp
    with ipopt_nlp.use_ipopt():
        r = runopf(shifted(ppc, SHIFTS["all"]), ACOPT)
        r0 = runopf(ppc, ACOPT)
    out = {"case": name, "kind": kind, "ipopt_unshifted_ok": bool(r0["success"]),
           "ipopt_unshifted_gap_pct": 100.0 * (float(r0["f"]) / ac_f - 1.0) if r0["success"] else None}
    out.update(ok=bool(r["success"]))
    if r["success"]:
        out["gap_pct"] = 100.0 * (float(r["f"]) / ac_f - 1.0)
    # family-pairs: which two-family shift first fails (from the default start)
    pairs = {}
    fams = tuple(MG)
    for i, a in enumerate(fams):
        for b in fams[i + 1:]:
            pairs[f"{a}+{b}"] = bool(runopf(shifted(ppc, (a, b)), ACOPT)["success"])
    out["pairs"] = pairs
    out["singles"] = {a: bool(runopf(shifted(ppc, (a,)), ACOPT)["success"]) for a in fams}
    return out


def summary(res):
    ref = {(r["case"], r["kind"]): r for r in json.loads(REF.read_text())}
    L = []
    P = L.append
    P("Do the two development stalls come from the repair's own safety margins? (research/grid-linopf)")
    P("Plan and predictions: LOG.md 2026-11-17 (committed before this ran).")
    P(f"vlin.MARGIN = {MG} (thermal: fraction of rating; slack MW; angle deg; v pu; q MVAr)")
    P("")
    AM = [r for r in res["AM"] if not r.get("skip")]
    P(f"Arms A and M: {len(AM)} development cases with a PIPS AC optimum")
    P("case               kind  in band: v_pq(lo) v_gen(hi) load q slack ang | max_load | shifted OPF: all  v  load (gap %; 'x' = PIPS no solution)")
    m3 = []
    for r in AM:
        b = r["band"]
        sh = []
        for k in SHIFTS:
            e = r["shift"][k]
            sh.append(f"{e['gap_pct']:+.3f}" if e["ok"] else "x")
            if k == "all" and e["ok"]:
                m3.append(e["gap_pct"])
        P(f"{r['case']:18s} {r['kind']:4s} {b['v_pq']:3d}({b['v_pq_at_lo']:2d}) {b['v_gen']:4d}({b['v_gen_at_hi']:2d}) "
          f"{b['load']:4d} {b['q']:3d} {b['slack']:3d} {b['ang']:3d} | {b['max_load']:.4f} | " + "  ".join(f"{x:>7}" for x in sh))
    nfail = sum(1 for r in AM if not r["shift"]["all"]["ok"])
    P(f"Shifted OPF (all families): PIPS solves {len(AM) - nfail} of {len(AM)}; "
      f"gap over the unshifted optimum: max {max(m3):+.3f} %, median {float(np.median(m3)):+.3f} %")
    get = {(r["case"], r["kind"]): r for r in AM}
    c73, c118 = get.get(STALLS[0]), get.get(STALLS[1])
    if c73:
        b = c73["band"]
        P(f"A1 (case73 API AC optimum: some voltage inside the 0.001 pu band): "
          f"{'held' if b['v_pq'] + b['v_gen'] > 0 else 'refuted'} (PQ {b['v_pq']}, generator buses {b['v_gen']})")
        P(f"M1 (PIPS solves case73 API's margin-shifted OPF): {'held' if c73['shift']['all']['ok'] else 'refuted'}")
    if c118:
        P(f"M2 (PIPS solves case118 API's margin-shifted OPF): {'held' if c118['shift']['all']['ok'] else 'refuted'}")
    P(f"M3 (shifted OPF costs at most 0.5 % more on every case PIPS solves both): "
      f"{'held' if m3 and max(m3) <= 0.5 else 'refuted'} ({sum(1 for x in m3 if x <= 0.5)} of {len(m3)})")
    P("")
    Z = [r for r in res["Z"] if not r.get("skip")]
    P("Arm Z: the frozen repair (30 rounds) with margins removed; frozen = results_converge.json")
    P("case               kind  frozen@   v0@ load0@  all0@   cost% frozen / v0 / load0 / all0")
    byk = {}
    for r in Z:
        byk.setdefault((r["case"], r["kind"]), {})[r["var"]] = r
    lost = {v: 0 for v in VARIANTS}
    gained = {v: 0 for v in VARIANTS}
    nfin = 0
    for key, d in byk.items():
        f = ref.get(key)
        fc = f.get("clean_at") if f else None
        fcost = f.get("clean_cost") if f else None
        ac = next(iter(d.values()))["ac"]
        nfin += int(fc is not None)
        gp = lambda c: "-" if c is None else f"{100 * (c / ac - 1):+.3f}"  # noqa: E731
        for v in VARIANTS:
            if v in d:
                lost[v] += int(fc is not None and d[v]["clean_at"] is None)
                gained[v] += int(fc is None and d[v]["clean_at"] is not None)
        P(f"{key[0]:18s} {key[1]:4s} {str(fc):>7} " + " ".join(f"{str(d[v]['clean_at']) if v in d else '?':>6}" for v in VARIANTS)
          + "   " + " / ".join([gp(fcost)] + [gp(d[v]["clean_cost"]) if v in d else "?" for v in VARIANTS]))
    for v in VARIANTS:
        P(f"  {v}: lost {lost[v]} of {nfin} frozen finishers, gained {gained[v]}")
    for key in STALLS:
        d = byk.get(key, {})
        for v in VARIANTS:
            if v in d and d[v]["clean_at"] is None:
                P(f"  {key[0]} {key[1]} {v} last state: {json.dumps(d[v]['last'])}")
    z = lambda key, v: byk.get(key, {}).get(v, {}).get("clean_at") is not None  # noqa: E731
    P(f"Z1 (v margin 0: case73 API clean within 30 rounds): {'held' if z(STALLS[0], 'v0') else 'refuted'}")
    P(f"Z2 (thermal margin 0: case118 API clean within 30 rounds): {'held' if z(STALLS[1], 'load0') else 'refuted'}")
    P(f"Z3 (all margins 0 loses at least 3 frozen finishers): {'held' if lost['all0'] >= 3 else 'refuted'} ({lost['all0']})")
    P(f"Z4 (v margin 0 loses at most 1 frozen finisher): {'held' if lost['v0'] <= 1 else 'refuted'} ({lost['v0']})")
    if res.get("gate"):
        P("")
        P("After-the-run checks (declared in LOG.md, not in the plan):")
        bad = [g for g in res["gate"] if g["statuses"] != ref[(g["case"], g["kind"])]["statuses"]]
        P(f"  Reproduction gate (frozen margins through this script = results_converge.json statuses on "
          f"{len(res['gate'])} cases): {'PASS' if not bad else 'FAIL ' + str([(b['case'], b['kind']) for b in bad])}")
    for w in res.get("warm", []):
        P(f"  {w['case']} {w['kind']}: IPOPT on the shifted OPF: "
          f"{'solved, ' + format(w['gap_pct'], '+.3f') + ' %' if w['ok'] else 'no solution'} (IPOPT unshifted: {'ok' if w['ipopt_unshifted_ok'] else 'fails'}); "
          f"single-family shifts that fail: {[k for k, v in w['singles'].items() if not v] or 'none'}; "
          f"failing pairs: {[k for k, v in w['pairs'].items() if not v] or 'none'}")
    return "\n".join(L) + "\n"


def main():
    path = OUT.with_suffix(".json")
    if "--run" in sys.argv:
        cases = [(c, k) for k in KINDS for c in CASES]
        with Pool(4) as pool:
            am = pool.map(run_AM, cases)
            # stalls first so their answers arrive early in the log
            zj = [(c, k, v) for (c, k) in STALLS for v in VARIANTS]
            zj += [(c, k, v) for (c, k) in cases if (c, k) not in STALLS for v in VARIANTS]
            z = pool.map(run_Z, zj, chunksize=1)
        path.write_text(json.dumps({"AM": am, "Z": z}, default=float))
    if "--diag" in sys.argv:
        res = json.loads(path.read_text())
        fail = [(r["case"], r["kind"]) for r in res["AM"] if not r.get("skip") and not r["shift"]["all"]["ok"]]
        with Pool(4) as pool:
            res["gate"] = pool.map(run_gate, [(r["case"], r["kind"]) for r in res["AM"] if not r.get("skip")])
            res["warm"] = pool.map(run_warm, fail)
        path.write_text(json.dumps(res, default=float))
    txt = summary(json.loads(path.read_text()))
    OUT.with_suffix(".txt").write_text(txt)
    print(txt)


if __name__ == "__main__":
    main()
