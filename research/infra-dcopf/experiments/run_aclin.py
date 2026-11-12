"""AC-informed linearisation of the OPF on PGLib-OPF v23.07 (TYP and API), with the published ratings.

Next step 1 of the README, predictions in LOG.md (2026-11-12, written before this ran).
For each case, a linearisation of the AC power flow (src/infra_dcopf/aclin.py: finite-difference
loss factors and apparent-flow sensitivities, offsets at the point) and a QP on the case's costs,
then the AC check of run_pglib.py (generator voltages at the AC optimum's schedule):
  A  linearise at the AC optimum (oracle bound; needs the AC OPF it is trying to replace);
  B  linearise once at the AC power flow of the plain DC-MP dispatch (no AC OPF needed);
  C  successive linearisation from B (see slp below: a per-unit step box halved on a step that does
     not lower the infeasibility, and an l1-penalised elastic QP when the first-order model has no
     feasible point in the box, Fletcher's Sl1QP device),
     at most 10 rounds, stop when the AC check is clean (no branch over 100 %, slack in limits).
case179_goc API has no AC optimum from PIPS: its schedule is the case file's own setpoints and it has
no cost reference. Writes experiments/results_aclin.txt and results_aclin.json."""
import json
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np
from pypower.api import rundcopf, runopf
from pypower.idx_bus import VM
from pypower.idx_gen import GEN_BUS, PG, PMAX, PMIN, VG

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
from infra_dcopf.aclin import linearise, solve_linear  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from run_pglib import ACOPT, CASES, DCOPT, KINDS, ac_check  # noqa: E402

ROUNDS = 10
ELASTIC = 1e4  # $/MVA-h on linearised overload, far above the units' marginal costs (1e5 stalls PIPS)


def check(ppc, pg, ac_ref):
    fake = {"gen": ppc["gen"].copy()}
    fake["gen"][:, PG] = pg
    c = ac_check(ppc, fake, ac_ref)
    if c is None:
        return None
    c.pop("s")
    c["clean"] = c["n_over"] == 0 and c["slack_out_mw"] < 1e-3
    return c


def one_shot(ppc, pg, vg, ac_ref):
    lin = linearise(ppc, pg, vg)
    if lin is None:
        return {"status": "PF failed at point"}
    x, ok = solve_linear(ppc, lin)
    if not ok:
        return {"status": "QP infeasible"}
    c = check(ppc, x, ac_ref)
    return {"status": "PF failed" if c is None else ("clean" if c["clean"] else "not clean"), "check": c, "pg": x}


def merit(c, base_mva):
    """Infeasibility of an AC-checked dispatch: worst overload (fraction of rating) plus the slack's
    excursion outside its P limits in per unit."""
    return max(c["max_load"] - 1.0, 0.0) + c["slack_out_mw"] / base_mva


def slp(ppc, pg_start, vg, ac_ref):
    """Successive linearisation with a step box, a trust-region SLP. Round 1 is B (no box). Later
    rounds relinearise at the current dispatch and solve the QP inside a per-unit box (starting at
    20 % of the unit's range, at least 0.1 MW); when the first-order model has no feasible point in
    the box the QP is elastic (l1-penalised overload, Fletcher's Sl1QP device; the penalty is retried
    10x lower if PIPS stalls). A step is taken when it lowers the merit (or is clean) and the box is
    halved when it does not."""
    g = ppc["gen"]
    trust = np.maximum(0.2 * (g[:, PMAX] - g[:, PMIN]), 0.1)
    pg = pg_start.copy()
    cur = check(ppc, pg, ac_ref)
    hist = []
    for it in range(1, ROUNDS + 1):
        lin = linearise(ppc, pg, vg)
        if lin is None:
            hist.append({"it": it, "status": "PF failed at point"})
            break
        box = {"trust": trust} if it > 1 else {}
        tries = [box] + [dict(box, elastic=e) for e in (ELASTIC, ELASTIC / 10)]
        for kw in tries:
            x, ok = solve_linear(ppc, lin, **kw)
            if ok:
                break
        if not ok:
            hist.append({"it": it, "status": "QP infeasible"})
            trust = trust / 2
            continue
        c = check(ppc, x, ac_ref)
        if c is None:
            hist.append({"it": it, "status": "PF failed"})
            trust = trust / 2
            continue
        hist.append({"it": it, "status": "clean" if c["clean"] else "not clean", "qp": "+".join(kw) or "hard", **c})
        if c["clean"]:
            break
        if cur is None or merit(c, ppc["baseMVA"]) < merit(cur, ppc["baseMVA"]):
            pg, cur = x.copy(), c
        else:
            trust = trust / 2
    return hist


def run_case(name, kind):
    ppc = load_m(case_path(name, kind))
    t0 = time.time()
    ac = runopf(ppc, ACOPT)
    out = {"case": name, "kind": kind, "ac_ok": bool(ac["success"])}
    if ac["success"]:
        out["ac"] = float(ac["f"])
        vm = dict(zip(ac["bus"][:, 0].astype(int), ac["bus"][:, VM]))
        vg = np.array([vm[int(b)] for b in ppc["gen"][:, GEN_BUS]])
        ac_ref = ac
    else:  # no AC optimum: hold the case file's own voltage setpoints
        vg = ppc["gen"][:, VG].copy()
        ac_ref = {"bus": ppc["bus"].copy()}
        ac_ref["bus"][:, VM] = 1.0
        bus_of = {int(b): i for i, b in enumerate(ppc["bus"][:, 0])}
        for gb, v in zip(ppc["gen"][:, GEN_BUS].astype(int), vg):
            ac_ref["bus"][bus_of[gb], VM] = v
    dc = rundcopf(ppc, DCOPT)
    out["plain"] = check(ppc, dc["gen"][:, PG], ac_ref) if dc["success"] else None
    if ac["success"]:
        a = one_shot(ppc, ac["gen"][:, PG], vg, ac_ref)
        a.pop("pg", None)
        out["A"] = a
    if dc["success"]:
        b = one_shot(ppc, dc["gen"][:, PG], vg, ac_ref)
        b.pop("pg", None)
        out["B"] = b
        out["C"] = slp(ppc, dc["gen"][:, PG], vg, ac_ref)
    out["secs"] = time.time() - t0
    return out


def pct(x, y):
    return 100.0 * (x / y - 1.0)


def cell(r, c):
    if c is None:
        return f"{'PF failed':>32s}"
    cost = f"{pct(c['cost'], r['ac']):+7.3f}%" if r["ac_ok"] else f"{'n/a':>8s}"
    return f"{c['n_over']:4d} {100 * c['max_load']:7.2f} {c['slack_out_mw']:7.1f} {c['vviol']:3d} {c['qviol']:3d} {cost}"


def main():
    only = sys.argv[1:]
    rows = [run_case(c, k) for c in CASES for k in KINDS if not only or c in only]
    (HERE / "results_aclin.json").write_text(json.dumps(rows, indent=1, default=float))
    L = []
    P = L.append
    P("PGLib-OPF v23.07: AC-informed linearisation (finite-difference loss factors and |S| sensitivities) + QP,")
    P("dispatch then run through an AC power flow with generator voltages at the AC optimum's schedule.")
    P("Each cell: branches over 100 %, worst loading %, slack MW outside its limits, buses out of V band,")
    P("generators outside Q limits, AC cost of the dispatch vs the AC optimum.")
    hdr = f"{'nOver':>4s} {'maxLd%':>7s} {'slkMW':>7s} {'V':>3s} {'Q':>3s} {'cost':>8s}"
    for kind in KINDS:
        P("")
        P(f"== {kind.upper()} ==")
        P(f"{'case':18s} {'method':6s} {'status':>18s} {hdr}")
        for r in rows:
            if r["kind"] != kind:
                continue
            P(f"{r['case']:18s} {'plainDC':6s} {'':>18s} {cell(r, r['plain'])}")
            for m in ("A", "B"):
                if m not in r:
                    why = "no AC optimum" if m == "A" else "DC infeasible"
                    P(f"{r['case']:18s} {m:6s} {why:>18s}")
                    continue
                x = r[m]
                P(f"{r['case']:18s} {m:6s} {x['status']:>18s} " + (cell(r, x["check"]) if x.get("check") is not None else ""))
            if "C" in r:
                h = r["C"]
                good = [x for x in h if "n_over" in x]
                best = next((x for x in good if x["clean"]), min(good, key=lambda x: x["max_load"]) if good else None)
                st = f"clean @{best['it']}" if best and best["clean"] else f"not clean ({len(h)})"
                P(f"{r['case']:18s} {'C':6s} {st:>18s} " + (cell(r, best) if best else ""))
    P("")
    for kind in KINDS:
        sel = [r for r in rows if r["kind"] == kind]
        n = len(sel)
        cnt = lambda m: sum(1 for r in sel if m in r and r[m].get("status") == "clean")
        c_clean = sum(1 for r in sel if any(x.get("clean") for x in r.get("C", [])))
        plain = sum(1 for r in sel if r["plain"] is not None and r["plain"]["clean"])
        P(f"{kind.upper()} summary ({n} cases): clean dispatches  plain DC {plain}, A {cnt('A')}, B {cnt('B')}, C {c_clean}")
    P("Run time: " + ", ".join(f"{r['case']}/{r['kind']} {r['secs']:.0f}s" for r in rows))
    text = "\n".join(L) + "\n"
    if not only:
        (HERE / "results_aclin.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
