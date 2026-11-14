"""A start that has an AC power flow (milestone 6's Next (1) in research/grid-linopf).

On six cases the AC power flow at the DC start does not converge, so the frozen repair stops at
round 1: case1888_rte TYP, API, SAD and case1951_rte TYP, SAD (held out, milestone 6) and case300
TYP (development). Plan and predictions Q1 to Q5: LOG.md, 2026-11-14, committed before this ran.

Dispatch homotopy, voltage setpoints at the file schedule throughout:
  PG(lam) = (1 - lam) PG_file + lam PG_DC, lam = 0 a cold Newton from the file's bus voltages, every
  later point warm-started at the previous solution; step 0.1, halved on failure down to 1/1024.
Arm H = frozen J-m-a (vlin.slp: 20 rounds, vlin.MARGIN, analytic, Clarabel, screened) from PG(lam*),
round 1 linearised at the path's last solution and every AC check warm-started at the current
round's linearisation point (warm, warm_check). H+R = the reactive stage on H's best point.
Writes results_homotopy.json and results_homotopy.txt. Usage: run_homotopy.py [--summary] [--load] [case/kind ...]

--load (an after-the-run diagnostic, declared in LOG.md after the planned run found no power flow at the
file dispatch on any of the six cases; not pre-registered): load-scaling continuation instead. Loads
(PD, QD) and the DC dispatch scaled together by mu; mu0 = the smallest of 0.1, 0.2, ..., 1.0 with a cold
power flow, then step 0.1 halved on failure to 1/1024. At mu = 1 the path's solution is a power flow of
the unscaled case at the DC dispatch, and H runs from it as above. Also reported: PYPOWER's other
power-flow algorithms (fast-decoupled XB and BX, Gauss-Seidel) cold at the DC dispatch.
Writes results_homotopy_load.json and .txt.

--dcangle (a second after-the-run diagnostic, declared in LOG.md after --load found no cold power flow
on the RTE cases even at 10 % load): pandapower's Newton solved the no-load RTE network only from DC
power-flow angles, so here every cold Newton starts from the DC power flow's angles (VM 1.0) and the
load-scaling continuation runs from mu = 0 (no load, no generation). Reported per case: mu*, the last
step size, the lowest bus voltage at mu = 0, 0.5 (if reached) and mu*, and which of mu = 0.1, 0.25, 0.5,
0.75, 1.0 solve directly from DC angles. H is run only where mu* = 1. Writes results_homotopy_dcangle.*.
OMP_NUM_THREADS=1 recommended (one process per case).
"""
import json
import sys
import time
import warnings
from multiprocessing import Pool
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np
from pypower.api import runopf
from pypower.idx_gen import PG

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
from infra_dcopf import vlin  # noqa: E402
from infra_dcopf.pglib import baseline, case_path, fix_ref, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule  # noqa: E402
from run_heldout import reactive  # noqa: E402
from run_perturb import strip  # noqa: E402
from run_pglib import ACOPT, DCOPT  # noqa: E402

CASES = [("case300_ieee", "typ"), ("case1888_rte", "typ"), ("case1888_rte", "api"), ("case1888_rte", "sad"),
         ("case1951_rte", "typ"), ("case1951_rte", "sad")]
ROUNDS = 20
STEP0, STEP_MIN = 0.1, 1.0 / 1024


def dc_start(ppc):
    """Milestone 6's start rule: DC OPF with angle limits, else without (run_heldout._run_case)."""
    import copy
    from pypower.api import rundcopf
    from pypower.idx_brch import ANGMAX, ANGMIN
    dc = rundcopf(ppc, DCOPT)
    if dc["success"]:
        return dc["gen"][:, PG].copy(), "DC+ang"
    free = copy.deepcopy(ppc)
    free["branch"][:, ANGMIN], free["branch"][:, ANGMAX] = -360.0, 360.0
    dc = rundcopf(free, DCOPT)
    return (dc["gen"][:, PG].copy(), "DC, no ang") if dc["success"] else (None, None)


def homotopy(ppc, pg_file, pg_dc, vg):
    """Walk PG(lam) from the file dispatch to the DC dispatch. Returns (lam*, last PF result, #PFs, cold_dc)."""
    cold_dc = vlin.run_point(ppc, pg_dc, vg) is not None
    r = vlin.run_point(ppc, pg_file, vg)
    npf = 2
    if r is None:
        return 0.0, None, npf, cold_dc
    lam, step = 0.0, STEP0
    while lam < 1.0 and step >= STEP_MIN:
        nxt = min(1.0, lam + step)
        t = vlin.run_point(ppc, (1 - nxt) * pg_file + nxt * pg_dc, vg, r)
        npf += 1
        if t is None:
            step /= 2
        else:
            lam, r = nxt, t
    return lam, r, npf, cold_dc


def scaled(ppc, mu):
    import copy
    from pypower.idx_bus import PD, QD
    p = copy.deepcopy(ppc)
    p["bus"][:, PD] *= mu
    p["bus"][:, QD] *= mu
    return p


def homotopy_load(ppc, pg_dc, vg):
    """Load-scaling continuation to (ppc, pg_dc). Returns (mu0, mu*, last PF result, #PFs)."""
    npf, r, mu0 = 0, None, None
    for k in range(1, 11):
        npf += 1
        r = vlin.run_point(scaled(ppc, k / 10), k / 10 * pg_dc, vg)
        if r is not None:
            mu0 = k / 10
            break
    if r is None:
        return None, 0.0, None, npf
    mu, step = mu0, STEP0
    while mu < 1.0 and step >= STEP_MIN:
        nxt = min(1.0, mu + step)
        t = vlin.run_point(scaled(ppc, nxt), nxt * pg_dc, vg, r)
        npf += 1
        if t is None:
            step /= 2
        else:
            mu, r = nxt, t
    return mu0, mu, r, npf


def other_algs(ppc, pg_dc, vg):
    from pypower.api import ppoption, runpf
    out = {}
    for alg, nm, it in ((2, "FDXB", 100), (3, "FDBX", 100), (4, "GS", 1000)):
        p = vlin.with_dispatch(ppc, pg_dc, vg) if hasattr(vlin, "with_dispatch") else None
        if p is None:
            from infra_dcopf.aclin import with_dispatch
            p = with_dispatch(ppc, pg_dc, vg)
        opt = ppoption(VERBOSE=0, OUT_ALL=0, ENFORCE_Q_LIMS=0, PF_ALG=alg, PF_MAX_IT_FD=it, PF_MAX_IT_GS=it)
        _, ok = runpf(p, opt)
        out[nm] = bool(ok)
    return out


def run_load(job):
    name, kind = job
    t0 = time.time()
    try:
        ppc, moved = fix_ref(load_m(case_path(name, kind)))
        out = {"case": name, "kind": kind, "nbus": int(ppc["bus"].shape[0]), "ref_moved": moved}
        if name in ("case1888_rte", "case1951_rte"):
            out["ref"], out["ac"] = "PGLib IPOPT", float(baseline()[(name, kind)][1])
        else:
            ac = runopf(ppc, ACOPT)
            out["ref"], out["ac"] = "PIPS", float(ac["f"])
        pg_dc, rule = dc_start(ppc)
        out["start_rule"] = rule
        vf = file_schedule(ppc)
        out["algs"] = other_algs(ppc, pg_dc, vf)
        mu0, mu, r, npf = homotopy_load(ppc, pg_dc, vf)
        out.update({"mu0": mu0, "mu": mu, "n_pf": npf})
        if r is None or mu < 1.0:
            out["secs"] = time.time() - t0
            return out
        out["H0"] = strip(vlin.check(ppc, pg_dc, vf, r))
        t1 = time.time()
        hist = vlin.slp(ppc, pg_dc, vf, rounds=ROUNDS, margin=vlin.MARGIN, analytic=True, solver="clarabel",
                        screen=True, warm=r, warm_check=True)
        out["H_secs"] = time.time() - t1
        b = vlin.best_of(hist, ppc["baseMVA"])
        out["H"] = {"rounds": len(hist), "clean_at": next((x["it"] for x in hist if x.get("clean")), None),
                    "final": strip(b), "status": [x["status"] for x in hist], "qp": [x.get("qp") for x in hist]}
        out["HR"] = reactive(ppc, b)
        out["secs"] = time.time() - t0
        return out
    except Exception as e:
        return {"case": name, "kind": kind, "error": f"{type(e).__name__}: {e}", "secs": time.time() - t0}


def summary_load(rows):
    L = []
    P = L.append
    P("After-the-run diagnostic (declared in LOG.md after the planned run; not pre-registered): load-scaling")
    P("continuation to the DC dispatch. mu0 = first load scale with a cold PF; mu* = scale reached; H as in the")
    P("planned arm, from the DC dispatch with the path's mu = 1 solution as the warm start. Other algorithms:")
    P("PYPOWER fast-decoupled (XB, BX; 100 iterations) and Gauss-Seidel (1000) cold at the DC dispatch.")
    P("")
    P(f"{'case':14s} {'kind':4s} {'FDXB':>4s} {'FDBX':>4s} {'GS':>3s} {'mu0':>4s} {'mu*':>7s} {'PFs':>4s} "
      f"{'H0 nOv/ang/V/Q':>15s} {'H':>4s} {'H+R':>4s}  {'H best: nOv maxLd% slkMW nAng V Q':34s} {'cost':>9s} {'H+R cost':>9s} {'s':>5s}")
    yn = lambda b: "y" if b else "n"
    for r in rows:
        if r.get("error"):
            P(f"{r['case']:14s} {r['kind']:4s}  error: {r['error']}")
            continue
        a = r["algs"]
        h0 = r.get("H0")
        h0s = "-" if not h0 else f"{h0['n_over']}/{h0['n_ang']}/{h0['vviol']}/{h0['qviol']}"
        H = r.get("H")
        f = H["final"] if H else None
        hc = f"@{H['clean_at']}" if H and H["clean_at"] else ("no" if H else "-")
        hr = r.get("HR")
        hrc = "y" if (H and H["clean_at"]) or (hr and hr["clean"]) else "-"
        best = ("-" if not f else
                f"{f['n_over']:3d} {f['max_load'] * 100:7.2f} {f['slack_out_mw']:6.1f} {f['n_ang']:4d} {f['vviol']:3d} {f['qviol']:3d}")
        cost = pct(f["cost"], r["ac"]) if f else "-"
        hrcost = pct(hr["cost"], r["ac"]) if hr else "-"
        P(f"{r['case']:14s} {r['kind']:4s} {yn(a['FDXB']):>4s} {yn(a['FDBX']):>4s} {yn(a['GS']):>3s} "
          f"{str(r['mu0']):>4s} {r['mu']:7.4f} {r['n_pf']:4d} {h0s:>15s} {hc:>4s} {hrc:>4s}  {best:34s} {cost:>9s} {hrcost:>9s} {r['secs']:5.0f}")
    P("")
    for r in rows:
        if r.get("H"):
            st = r["H"]["status"]
            el = sum(1 for q in r["H"]["qp"] if q and q != "hard")
            P(f"{r['case']}/{r['kind']}: {len(st)} rounds, elastic {el}, PF failed {st.count('PF failed')}, "
              f"QP infeasible {st.count('QP infeasible')}; statuses {', '.join(st)}")
    return "\n".join(L) + "\n"


def dc_angles(ppc, mu, pg_dc, vg):
    from pypower.api import ppoption, rundcpf
    from pypower.idx_bus import VA, VM
    from infra_dcopf.aclin import with_dispatch
    d, _ = rundcpf(with_dispatch(scaled(ppc, mu), mu * pg_dc, vg), ppoption(VERBOSE=0, OUT_ALL=0))
    w = {"bus": ppc["bus"].copy()}
    w["bus"][:, VA], w["bus"][:, VM] = d["bus"][:, VA], 1.0
    return w


def continuation(ppc, pg, vg):
    """DC-angle load-scaling continuation of dispatch pg at setpoints vg. Returns (mu*, last result, #PFs, step)."""
    r = vlin.run_point(scaled(ppc, 0.0), 0.0 * pg, vg, dc_angles(ppc, 0.0, pg, vg))
    npf, mu, step = 1, 0.0, STEP0
    while r is not None and mu < 1.0 and step >= STEP_MIN:
        nxt = min(1.0, mu + step)
        t = vlin.run_point(scaled(ppc, nxt), nxt * pg, vg, r)
        npf += 1
        if t is None:
            step /= 2
        else:
            mu, r = nxt, t
    return mu, r, npf, step


def run_dcangle(job):
    from pypower.idx_bus import VM
    name, kind = job
    t0 = time.time()
    try:
        ppc, moved = fix_ref(load_m(case_path(name, kind)))
        out = {"case": name, "kind": kind, "nbus": int(ppc["bus"].shape[0]), "ref_moved": moved}
        pg_dc, rule = dc_start(ppc)
        out["start_rule"] = rule
        vf = file_schedule(ppc)
        out["direct"] = [m for m in (0.1, 0.25, 0.5, 0.75, 1.0)
                         if vlin.run_point(scaled(ppc, m), m * pg_dc, vf, dc_angles(ppc, m, pg_dc, vf)) is not None]
        r = vlin.run_point(scaled(ppc, 0.0), 0.0 * pg_dc, vf, dc_angles(ppc, 0.0, pg_dc, vf))
        npf, mu, step, vmin = 1, 0.0, STEP0, {}
        if r is not None:
            vmin["0"] = float(r["bus"][:, VM].min())
            while mu < 1.0 and step >= STEP_MIN:
                nxt = min(1.0, mu + step)
                t = vlin.run_point(scaled(ppc, nxt), nxt * pg_dc, vf, r)
                npf += 1
                if t is None:
                    step /= 2
                else:
                    if mu < 0.5 <= nxt:
                        vmin[f"{nxt:.2f}"] = float(t["bus"][:, VM].min())
                    mu, r = nxt, t
            vmin["mu*"] = float(r["bus"][:, VM].min())
        out.update({"noload_pf": vmin != {}, "mu": mu, "last_step": step, "n_pf": npf, "vmin": vmin})
        # control: the same continuation at the AC optimum's dispatch, where a power flow exists (needs PIPS)
        ac = runopf(ppc, ACOPT)
        out["acopt_mu_fileVG"] = continuation(ppc, ac["gen"][:, PG], vf)[0] if ac["success"] else None
        if r is not None and mu >= 1.0:
            hist = vlin.slp(ppc, pg_dc, vf, rounds=ROUNDS, margin=vlin.MARGIN, analytic=True, solver="clarabel",
                            screen=True, warm=r, warm_check=True)
            b = vlin.best_of(hist, ppc["baseMVA"])
            out["H"] = {"rounds": len(hist), "clean_at": next((x["it"] for x in hist if x.get("clean")), None),
                        "final": strip(b), "status": [x["status"] for x in hist]}
        out["secs"] = time.time() - t0
        return out
    except Exception as e:
        return {"case": name, "kind": kind, "error": f"{type(e).__name__}: {e}", "secs": time.time() - t0}


def summary_dcangle(rows):
    L = []
    P = L.append
    P("Second after-the-run diagnostic (declared in LOG.md; not pre-registered): every cold Newton starts from")
    P("DC power-flow angles (VM 1.0); load-scaling continuation (loads and the DC dispatch scaled by mu) from")
    P("mu = 0, step 0.1 halved on failure to 1/1024, voltage setpoints at the file schedule, Q limits not enforced.")
    P("")
    P(f"{'case':14s} {'kind':4s} {'start':>10s} {'mu=0 PF':>7s} {'mu*':>7s} {'stop step':>9s} {'PFs':>4s} "
      f"{'Vmin@0':>6s} {'Vmin@.5':>7s} {'Vmin@mu*':>8s}  direct from DC angles at mu")
    for r in rows:
        if r.get("error"):
            P(f"{r['case']:14s} {r['kind']:4s}  error: {r['error']}")
            continue
        v = r["vmin"]
        half = next((x for k, x in v.items() if k not in ("0", "mu*")), None)
        f = lambda x: "-" if x is None else f"{x:.3f}"
        P(f"{r['case']:14s} {r['kind']:4s} {str(r['start_rule']):>10s} {'y' if r['noload_pf'] else 'n':>7s} "
          f"{r['mu']:7.4f} {r['last_step']:9.5f} {r['n_pf']:4d} {f(v.get('0')):>6s} {f(half):>7s} {f(v.get('mu*')):>8s}  "
          f"{', '.join(str(m) for m in r['direct']) or 'none'}")
        if r.get("acopt_mu_fileVG") is not None:
            P(f"   control: AC-optimum dispatch at the file setpoints reaches mu* {r['acopt_mu_fileVG']:.4f}")
        if r.get("H"):
            P(f"   H from the mu = 1 point: clean at {r['H']['clean_at']}; statuses {', '.join(r['H']['status'])}")
    return "\n".join(L) + "\n"


def run_case(job):
    name, kind = job
    t0 = time.time()
    try:
        return _run_case(name, kind, t0)
    except Exception as e:
        return {"case": name, "kind": kind, "error": f"{type(e).__name__}: {e}", "secs": time.time() - t0}


def _run_case(name, kind, t0):
    ppc, moved = fix_ref(load_m(case_path(name, kind)))
    out = {"case": name, "kind": kind, "nbus": int(ppc["bus"].shape[0]), "ref_moved": moved}
    if name in ("case1888_rte", "case1951_rte"):
        out["ref"], out["ac"] = "PGLib IPOPT", float(baseline()[(name, kind)][1])
    else:
        ac = runopf(ppc, ACOPT)
        if not ac["success"]:
            out["error"] = "no PIPS AC optimum"
            return out
        out["ref"], out["ac"] = "PIPS", float(ac["f"])
    pg_dc, rule = dc_start(ppc)
    out["start_rule"] = rule
    if pg_dc is None:
        out["error"] = "no DC start"
        return out
    vf = file_schedule(ppc)
    pg_file = ppc["gen"][:, PG].copy()
    lam, r, npf, cold_dc = homotopy(ppc, pg_file, pg_dc, vf)
    out.update({"cold_pf_dc": cold_dc, "file_pf": r is not None, "lam": lam, "n_pf": npf,
                "dispatch_gap_mw": float(np.abs(pg_dc - pg_file).sum()),
                "hom_secs": time.time() - t0})
    if r is None:
        out["secs"] = time.time() - t0
        return out
    start = (1 - lam) * pg_file + lam * pg_dc
    out["H0"] = strip(vlin.check(ppc, start, vf, r))
    t1 = time.time()
    hist = vlin.slp(ppc, start, vf, rounds=ROUNDS, margin=vlin.MARGIN, analytic=True, solver="clarabel",
                    screen=True, warm=r, warm_check=True)
    out["H_secs"] = time.time() - t1
    b = vlin.best_of(hist, ppc["baseMVA"])
    out["H"] = {"rounds": len(hist), "clean_at": next((x["it"] for x in hist if x.get("clean")), None),
                "final": strip(b), "status": [x["status"] for x in hist], "qp": [x.get("qp") for x in hist]}
    out["HR"] = reactive(ppc, b)
    out["secs"] = time.time() - t0
    return out


def pct(c, ref):
    return f"{100 * (c - ref) / ref:+.3f}%"


def summary(rows):
    L = []
    P = L.append
    P("Dispatch-homotopy start (research/grid-linopf, milestone 6 Next (1); plan in LOG.md 2026-11-14).")
    P("PG(lam) = (1-lam) PG_file + lam PG_DC at the file's voltage setpoints; H = frozen J-m-a, 20 rounds, from")
    P("PG(lam*), warm-started power flows; H+R = reactive stage on H's best point. Cost reference: PIPS AC")
    P("optimum (case300) or PGLib's published IPOPT objective (RTE).")
    P("")
    P(f"{'case':14s} {'kind':4s} {'start':>10s} {'coldDC':>6s} {'file':>4s} {'lam*':>7s} {'PFs':>4s} "
      f"{'H0 nOv/ang/V/Q':>15s} {'H':>4s} {'H+R':>4s}  {'H best: nOv maxLd% slkMW nAng V Q':34s} {'cost':>9s} {'H+R cost':>9s} {'s':>5s}")
    for r in rows:
        if r.get("error"):
            P(f"{r['case']:14s} {r['kind']:4s}  error: {r['error']}")
            continue
        h0 = r.get("H0")
        h0s = "-" if not h0 else f"{h0['n_over']}/{h0['n_ang']}/{h0['vviol']}/{h0['qviol']}"
        H = r.get("H")
        f = H["final"] if H else None
        hc = f"@{H['clean_at']}" if H and H["clean_at"] else "no"
        hr = r.get("HR")
        hrc = "y" if (H and H["clean_at"]) or (hr and hr["clean"]) else "-"
        best = ("no checked round" if not f else
                f"{f['n_over']:3d} {f['max_load'] * 100:7.2f} {f['slack_out_mw']:6.1f} {f['n_ang']:4d} {f['vviol']:3d} {f['qviol']:3d}")
        cost = pct(f["cost"], r["ac"]) if f else "-"
        hrcost = pct(hr["cost"], r["ac"]) if hr else "-"
        P(f"{r['case']:14s} {r['kind']:4s} {str(r['start_rule']):>10s} {'y' if r['cold_pf_dc'] else 'n':>6s} "
          f"{'y' if r['file_pf'] else 'n':>4s} {r['lam']:7.4f} {r['n_pf']:4d} {h0s:>15s} {hc:>4s} {hrc:>4s}  "
          f"{best:34s} {cost:>9s} {hrcost:>9s} {r['secs']:5.0f}")
    P("")
    for r in rows:
        if r.get("H"):
            st = r["H"]["status"]
            el = sum(1 for q in r["H"]["qp"] if q and q != "hard")
            P(f"{r['case']}/{r['kind']}: {len(st)} rounds, elastic {el}, PF failed {st.count('PF failed')}, "
              f"QP infeasible {st.count('QP infeasible')}; statuses {', '.join(st)}")
    ok = [r for r in rows if not r.get("error")]
    n = len(ok)
    q1 = sum(r["file_pf"] for r in ok)
    q2 = sum(r["lam"] >= 1.0 for r in ok)
    q3 = sum(bool(r.get("H") and r["H"]["clean_at"]) for r in ok)
    q4 = sum(bool(r.get("H") and (r["H"]["clean_at"] or (r.get("HR") and r["HR"]["clean"]))) for r in ok)
    costs = []
    for r in ok:
        if r.get("H") and r["H"]["clean_at"]:
            costs.append(100 * (r["H"]["final"]["cost"] - r["ac"]) / r["ac"])
        elif r.get("HR") and r["HR"]["clean"]:
            costs.append(100 * (r["HR"]["cost"] - r["ac"]) / r["ac"])
    P("")
    P(f"Scored cases: {n} of {len(rows)}")
    P(f"Q1 file dispatch has a cold PF on all: {q1}/{n} -> {'HELD' if q1 == n == 6 else 'REFUTED'}")
    P(f"Q2 path reaches lam = 1 on >= 3: {q2}/{n} -> {'HELD' if q2 >= 3 else 'REFUTED'}")
    P(f"Q3 H fully clean in 20 rounds on >= 2: {q3}/{n} -> {'HELD' if q3 >= 2 else 'REFUTED'}")
    P(f"Q4 H or H+R fully clean on >= 3: {q4}/{n} -> {'HELD' if q4 >= 3 else 'REFUTED'}")
    if costs:
        P(f"Q5 every clean point within +1 %: costs {', '.join(f'{c:+.3f}%' for c in costs)} -> "
          f"{'HELD' if max(costs) <= 1.0 else 'REFUTED'}")
    else:
        P("Q5 not testable (no clean point)")
    return "\n".join(L) + "\n"


def main():
    load = "--load" in sys.argv
    dca = "--dcangle" in sys.argv
    stem = "results_homotopy_dcangle" if dca else "results_homotopy_load" if load else "results_homotopy"
    jpath = HERE / f"{stem}.json"
    if "--summary" in sys.argv:
        rows = json.loads(jpath.read_text())
    else:
        only = [tuple(a.split("/")) for a in sys.argv[1:] if not a.startswith("--")]
        jobs = only or CASES
        with Pool(min(len(jobs), 6)) as pool:
            rows = []
            for r in pool.imap_unordered(run_dcangle if dca else run_load if load else run_case, jobs):
                print(f"done {r['case']}/{r['kind']} in {r.get('secs', 0):.0f}s: lam* {r.get('lam')} "
                      f"mu* {r.get('mu')} H clean_at {(r.get('H') or {}).get('clean_at')} {r.get('error', '')}", flush=True)
                rows.append(r)
        order = {c: i for i, c in enumerate(CASES)}
        rows.sort(key=lambda r: order.get((r["case"], r["kind"]), 99))
        jpath.write_text(json.dumps(rows, indent=1, default=float))
    text = summary_dcangle(rows) if dca else summary_load(rows) if load else summary(rows)
    (HERE / f"{stem}.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
