"""Milestone 7 of research/grid-linopf: why the repair finishes, or stalls (H4).

Plan and predictions P7a to P7f in LOG.md (2026-11-13, "Why does the repair finish, or not?",
committed before this ran). For each PGLib-OPF v23.07 TYP, API and SAD case with an AC optimum, the
frozen J-m-a repair (vlin.MARGIN, analytic sensitivities, Clarabel) from run_vlin's start (plain DC
dispatch, case-file setpoints), traced by converge.traced_slp with a 30-round budget.
Reproduction gate: the first 10 rounds' statuses equal results_vlin_margin_analytic_clarabel.json.
Writes results_converge.json (per case: trace) and results_converge.txt (summary(); also runnable
alone with --summary). Usage: run_converge.py [--summary] [case ...]; OMP_NUM_THREADS=1 (4 processes).
"""
import copy
import json
import math
import sys
import time
import warnings
from multiprocessing import Pool
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np
from pypower.api import rundcopf, runopf
from pypower.idx_brch import ANGMAX, ANGMIN
from pypower.idx_gen import PG

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
from infra_dcopf import converge  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule  # noqa: E402
from run_pglib import ACOPT, CASES, DCOPT  # noqa: E402

KINDS = ["typ", "api", "sad"]
ROUNDS = 30
NOMINAL = HERE / "results_vlin_margin_analytic_clarabel.json"
OUT = HERE / "results_converge"


def run_case(job):
    name, kind = job
    ppc = load_m(case_path(name, kind))
    t0 = time.time()
    out = {"case": name, "kind": kind}
    ac = runopf(ppc, ACOPT)
    out["ac_ok"] = bool(ac["success"])
    if not ac["success"]:
        return out
    out["ac"] = float(ac["f"])
    dc = rundcopf(ppc, DCOPT)
    if not dc["success"]:
        free = copy.deepcopy(ppc)
        free["branch"][:, ANGMIN], free["branch"][:, ANGMAX] = -360.0, 360.0
        dc = rundcopf(free, DCOPT)
        if not dc["success"]:
            out["no_start"] = True
            return out
    start, vf = dc["gen"][:, PG].copy(), file_schedule(ppc)
    t1 = time.time()
    hist, trace = converge.traced_slp(ppc, start, vf, rounds=ROUNDS)
    out["J_secs"] = time.time() - t1
    out["statuses"] = [x["status"] + ("/" + x["qp"] if "qp" in x else "") for x in hist]
    out["clean_at"] = next((x["it"] for x in hist if x.get("clean")), None)
    # added after the first run (reporting only, declared in LOG.md): cost of the clean point
    out["clean_cost"] = next((x["cost"] for x in hist if x.get("clean")), None)
    out["trace"] = trace
    out["secs"] = time.time() - t0
    return out


def fin(x):
    return x is not None and isinstance(x, float) and math.isfinite(x)


def summary(rows):
    nom = {(r["case"], r["kind"]): r for r in json.loads(NOMINAL.read_text())}
    L = []
    P = L.append
    P("Milestone 7 (research/grid-linopf): convergence diagnostics of the frozen J-m-a repair, 30-round budget.")
    P("Plan and predictions: LOG.md 2026-11-13 (committed before this ran). Per round: QP kind, merit phi,")
    P("step 2-norm ||d|| (pu), rho = largest row remainder / margin (signed towards the bound), kappa =")
    P("max |remainder|/margin / ||d||^2, sigma_min of the Newton power-flow Jacobian at the base point.")
    P("")
    # reproduction gate
    gate_bad = []
    for r in rows:
        n = nom.get((r["case"], r["kind"]))
        if n is None or not n.get("ac_ok") or "statuses" not in r:
            continue
        a, b = r["statuses"][:10], (n["J"] or {}).get("statuses")
        if b is not None and a != b:
            gate_bad.append(f"{r['case']}/{r['kind']}")
    P(f"Reproduction gate (first 10 rounds = the nominal run): {'PASS' if not gate_bad else 'FAIL ' + ', '.join(gate_bad)}")
    P("")
    scored = [r for r in rows if r.get("ac_ok") and "trace" in r]
    P(f"{'case':18s} {'kind':4s} {'clean@':>6s} {'acc':>3s} {'rej':>3s} {'ela':>3s} {'curv':>4s} {'oth':>3s} "
      f"{'smin_min':>9s} {'kap_lo':>8s} {'kap_hi':>8s} {'phi0':>9s} {'phi_end':>9s} {'B':>7s}")
    cls_tot = {"elastic": 0, "curvature": 0, "other": 0}
    cls_10 = {"elastic": 0, "curvature": 0, "other": 0}
    others = []
    rho_ok_not_clean = []
    kap_ratio = []
    bound_rows = []
    stalled = []
    fam_count = {}
    for r in scored:
        tr = r["trace"]
        cls = [converge.classify(t) for t in tr]
        for t, c in zip(tr, cls):
            if c:
                cls_tot[c] += 1
                if t["it"] <= 10:
                    cls_10[c] += 1
            if c == "other":
                others.append(f"{r['case']}/{r['kind']} round {t['it']}: " +
                              ", ".join(f"{b['fam']} {b['r']:.2f}" for b in t["broken"]) or "no broken tracked row")
            if c == "curvature":
                for b in t["broken"]:
                    fam_count[b["fam"]] = fam_count.get(b["fam"], 0) + 1
            if t.get("qp") == "hard" and t.get("status") == "not clean" and t["rho"] <= 1.0:
                rho_ok_not_clean.append(f"{r['case']}/{r['kind']} round {t['it']} rho {t['rho']:.3f}")
        acc = sum(1 for t in tr if t.get("accepted"))
        rej = sum(1 for t in tr if t.get("status") in ("not clean", "QP infeasible", "PF failed") and not t.get("accepted"))
        kaps = [t["kappa"] for t in tr if t.get("qp") == "hard" and t.get("dnorm", 0) >= 1e-4 and fin(t.get("kappa"))]
        if len(kaps) >= 3:
            kap_ratio.append((r, max(kaps) / min(kaps)))
        smins = [t["smin"] for t in tr if fin(t.get("smin"))]
        phi0 = tr[0]["phi"] if tr else None
        # point merit after each round (the accepted point's merit)
        phis = []
        cur = phi0
        for t in tr:
            if t.get("accepted"):
                cur = t["phi_trial"]
            phis.append(cur)
        Bv = None
        if r["clean_at"] and fin(phi0):
            allk = [t["kappa"] for t in tr if fin(t.get("kappa")) and t.get("dnorm", 0) > 0]
            d1 = next((t["dnorm"] for t in tr if fin(t.get("dnorm"))), None)
            kmax = max(allk) if allk else None
            kstar = max(0, math.ceil(math.log2(d1 * math.sqrt(kmax)))) if (kmax and d1) else 0
            decs = [tr[i]["phi"] - t["phi_trial"] for i, t in enumerate(tr) if t.get("accepted") and fin(tr[i]["phi"])]
            dmin = min(decs) if decs else None
            Bv = 1 + kstar + (phi0 / dmin if dmin and dmin > 0 else 0.0)
            bound_rows.append((r, Bv, r["clean_at"], kstar, dmin))
        if not r["clean_at"] and len(tr) >= ROUNDS:
            cond_ok = len(smins) == len([t for t in tr if "smin" in t]) and smins and min(smins) >= 1e-3
            p20, p30 = phis[19], phis[-1]
            stall = fin(p20) and fin(p30) and (p20 <= 0 or (p20 - p30) / p20 < 0.01)
            stalled.append((r, cond_ok, stall, p20, p30, acc, rej))
        P(f"{r['case']:18s} {r['kind']:4s} {str(r['clean_at'] or '-'):>6s} {acc:3d} {rej:3d} "
          f"{cls.count('elastic'):3d} {cls.count('curvature'):4d} {cls.count('other'):3d} "
          f"{(min(smins) if smins else float('nan')):9.2e} {(min(kaps) if kaps else float('nan')):8.2e} "
          f"{(max(kaps) if kaps else float('nan')):8.2e} {(phi0 if fin(phi0) else float('nan')):9.3e} "
          f"{(phis[-1] if phis and fin(phis[-1]) else float('nan')):9.3e} {(Bv if Bv is not None else float('nan')):7.1f}")
    P("")
    n10 = sum(1 for r in scored if r["clean_at"] and r["clean_at"] <= 10)
    n30 = sum(1 for r in scored if r["clean_at"])
    nsc = len([r for r in scored if (r["case"], r["kind"]) in nom and nom[(r["case"], r["kind"])].get("ac_ok")])
    P(f"Cases with an AC optimum: {nsc}. Fully clean within 10 rounds: {n10}; within 30: {n30}.")
    P(f"P7f (30 rounds add at most 3 clean cases): {'held' if n30 - n10 <= 3 else 'refuted'} (+{n30 - n10}).")
    P("Clean by round k (cumulative): " + ", ".join(
        f"{k}: {sum(1 for r in scored if r['clean_at'] and r['clean_at'] <= k)}" for k in (1, 3, 5, 8, 10, 12, 15, 20, 30)))
    early = [r for r in scored if r["clean_at"] and r["clean_at"] <= 10 and r.get("clean_cost") and r.get("ac")]
    late = [r for r in scored if r["clean_at"] and r["clean_at"] > 10 and r.get("clean_cost") and r.get("ac")]
    for lab, sel in (("rounds 1-10", early), ("rounds 11-30", late)):
        if sel:
            g = [100 * (r["clean_cost"] / r["ac"] - 1) for r in sel]
            P(f"Cost of clean points finished in {lab} over the AC optimum: mean {np.mean(g):+.3f} %, "
              f"median {np.median(g):+.3f} %, max {max(g):+.3f} % ({len(sel)} cases)")
    for r in late:
        P(f"  late finisher {r['case']}/{r['kind']}: clean at {r['clean_at']}, cost {100 * (r['clean_cost'] / r['ac'] - 1):+.3f} %, "
          f"repair {r.get('J_secs', float('nan')):.0f} s")
    P("")
    t10 = sum(cls_10.values())
    P(f"Not-clean trials, rounds 1-10: {t10} ({cls_10}); all 30 rounds: {sum(cls_tot.values())} ({cls_tot}).")
    P(f"P7a (curvature >= half of rounds 1-10's not-clean trials): {'held' if t10 and cls_10['curvature'] >= t10 / 2 else 'refuted'} "
      f"({cls_10['curvature']}/{t10}).")
    hard_nc = cls_tot["curvature"] + cls_tot["other"]
    P(f"P7b (Proposition 1: 'other' at most 2 % of hard not-clean trials, and no hard not-clean trial with rho <= 1): "
      f"{'held' if hard_nc and cls_tot['other'] <= 0.02 * hard_nc and not rho_ok_not_clean else 'refuted'} "
      f"(other {cls_tot['other']}/{hard_nc}; rho <= 1 yet not clean: {len(rho_ok_not_clean)}).")
    for o in others:
        P(f"  other: {o}")
    for o in rho_ok_not_clean:
        P(f"  rho<=1 not clean: {o}")
    P(f"Broken rows in curvature failures, by family: {fam_count}")
    P("")
    nk = sum(1 for _, x in kap_ratio if x < 10)
    P(f"P7c (kappa within 10x across a case's hard rounds, >= 75 % of {len(kap_ratio)} cases with 3+ rounds): "
      f"{'held' if kap_ratio and nk >= 0.75 * len(kap_ratio) else 'refuted'} ({nk}/{len(kap_ratio)}); ratios: "
      + ", ".join(f"{r['case']}/{r['kind']} {x:.1f}" for r, x in kap_ratio))
    nb = sum(1 for _, B, k, _, _ in bound_rows if B / k <= 10)
    P(f"P7d (B within 10x of observed on >= 75 % of {len(bound_rows)} finishers): "
      f"{'held' if bound_rows and nb >= 0.75 * len(bound_rows) else 'refuted'} ({nb}/{len(bound_rows)}). B/observed: "
      + ", ".join(f"{r['case']}/{r['kind']} {B:.0f}/{k} (k* {ks}, dmin {d if d is None else f'{d:.1e}'})"
                  for r, B, k, ks, d in bound_rows))
    hits = [(r, p20, p30, a, j) for r, c, s, p20, p30, a, j in stalled if c and s]
    P(f"P7e (a non-finisher with sigma_min >= 1e-3 on every round and merit down < 1 % over rounds 21-30): "
      f"{'held: H4 as written is refuted' if hits else 'refuted'} ({len(hits)} of {len(stalled)} non-finishers).")
    for r, c, s, p20, p30, a, j in stalled:
        P(f"  {r['case']}/{r['kind']}: condition {'holds' if c else 'fails'}, stalled {s}, phi@20 {p20:.3e} phi@30 {p30:.3e}, "
          f"accepted {a}, rejected {j}")
    return "\n".join(L) + "\n"


def jsonable(o):
    if isinstance(o, dict):
        return {k: jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [jsonable(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return float(o) if math.isfinite(o) else None
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    return o


def main():
    if "--summary" in sys.argv:
        rows = json.loads(OUT.with_suffix(".json").read_text())
    else:
        pick = [a for a in sys.argv[1:] if not a.startswith("--")]
        jobs = [(c, k) for k in KINDS for c in CASES if not pick or c in pick]
        jobs.sort(key=lambda j: -CASES.index(j[0]))
        rows = []
        with Pool(4) as pool:
            for r in pool.imap_unordered(run_case, jobs):
                print(r["case"], r["kind"], r.get("clean_at"), f"{r.get('secs', 0):.0f}s", flush=True)
                rows.append(jsonable(r))
        rows.sort(key=lambda r: (KINDS.index(r["kind"]), CASES.index(r["case"])))
        if not pick:
            OUT.with_suffix(".json").write_text(json.dumps(rows))
    text = summary(rows)
    if not any(a for a in sys.argv[1:] if not a.startswith("--")):
        OUT.with_suffix(".txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
