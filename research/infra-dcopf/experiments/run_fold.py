"""Past the loading limit (research/grid-linopf; plan in LOG.md 2026-11-14, committed before this ran).

Fold test (F): the DC-angle load-scaling continuation of run_homotopy (same rules: loads and dispatch
scaled by mu, cold Newton at mu = 0 from DC power-flow angles, step 0.1 halved on failure to 1/1024,
file voltage setpoints), recording the smallest singular value of the Newton Jacobian at every accepted
point, plus the fold fit sigma^2 = a (mu_f - mu) on the last 0.1 of the path. Control: case300 TYP's
AC-optimum dispatch.

Load-continuation repair (M): stage k runs the frozen J-m-a step rules (vlin.slp, 10 rounds) on the case
with loads scaled by mu_k, warm-started at the path's last solution; the stage's best point (P_k, V_k)
is then continued in load (P_k * mu / mu_k clipped to [PMIN, PMAX], setpoints V_k). At mu = 1 the final
stage is the frozen 20-round J-m-a. At most 8 stages; a stage that gains < 0.005 in mu ends the run.
M+R = the reactive stage on the final best point if it is not fully clean.
Writes results_fold.json and results_fold.txt. Usage: run_fold.py [--summary] [--fallback] [case/kind ...]
--fallback (declared after the planned run, LOG.md): when a stage's best point has no power flow warm-started
at the path's last solution, try a cold Newton from the file's voltages, then from DC angles. Writes
results_fold_fallback.*.
OMP_NUM_THREADS=1 recommended.
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
from pypower.idx_bus import VM
from pypower.idx_gen import PG, PMAX, PMIN

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
from infra_dcopf import vlin  # noqa: E402
from infra_dcopf.fold import fold_fit, newton_jacobian, sigma_min  # noqa: E402
from infra_dcopf.pglib import baseline, case_path, fix_ref, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule  # noqa: E402
from run_heldout import reactive  # noqa: E402
from run_homotopy import CASES, STEP0, STEP_MIN, dc_angles, dc_start, scaled  # noqa: E402
from run_perturb import strip  # noqa: E402
from run_pglib import ACOPT  # noqa: E402

FALLBACK = "--fallback" in sys.argv
STAGE_ROUNDS, FINAL_ROUNDS, MAX_STAGES, MIN_GAIN = 10, 20, 8, 0.005


def path(ppc, pg_of, vg, mu0=0.0, r0=None):
    """Continuation in mu from (mu0, r0) (r0 None: cold Newton at mu0 from DC angles) with dispatch
    pg_of(mu). Returns the accepted points [(mu, result)] and the last step size."""
    r = r0 if r0 is not None else vlin.run_point(scaled(ppc, mu0), pg_of(mu0), vg,
                                                  dc_angles(ppc, mu0, pg_of(1.0), vg))
    if r is None:
        return [], STEP0
    pts, mu, step = [(mu0, r)], mu0, STEP0
    while mu < 1.0 and step >= STEP_MIN:
        nxt = min(1.0, mu + step)
        t = vlin.run_point(scaled(ppc, nxt), pg_of(nxt), vg, r)
        if t is None:
            step /= 2
        else:
            mu, r = nxt, t
            pts.append((mu, r))
    return pts, step


def sigma_path(pts):
    return [{"mu": float(m), "sigma": sigma_min(newton_jacobian(r)), "vmin": float(r["bus"][:, VM].min())}
            for m, r in pts]


def fold_summary(sp):
    if not sp:
        return None
    f = fold_fit([x["mu"] for x in sp], [x["sigma"] for x in sp])
    out = {"mu_star": sp[-1]["mu"], "s0": sp[0]["sigma"], "s_star": sp[-1]["sigma"],
           "ratio": sp[-1]["sigma"] / sp[0]["sigma"] if sp[0]["sigma"] > 0 else None}
    if f:
        out.update({"mu_f": f[0], "a": f[1], "r2": f[2], "n_fit": f[3]})
    return out


def repair_stage(ppc_mu, pg, vg, warm, rounds):
    hist = vlin.slp(ppc_mu, pg, vg, rounds=rounds, margin=vlin.MARGIN, analytic=True, solver="clarabel",
                    screen=True, warm=warm, warm_check=True)
    return hist, vlin.best_of(hist, ppc_mu["baseMVA"])


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
        ac = None
    else:
        ac = runopf(ppc, ACOPT)
        out["ref"], out["ac"] = "PIPS", float(ac["f"])
    pg_dc, rule = dc_start(ppc)
    out["start_rule"] = rule
    vf = file_schedule(ppc)
    g = ppc["gen"]

    # F: fold test on the DC dispatch's path
    pts, step = path(ppc, lambda m: m * pg_dc, vf)
    sp = sigma_path(pts)
    out["F"] = {"path": sp, "last_step": step, **(fold_summary(sp) or {})}
    if ac is not None and ac["success"]:
        cp, _ = path(ppc, lambda m: m * ac["gen"][:, PG], vf)
        csp = sigma_path(cp)
        out["F_control"] = {"path": csp, **(fold_summary(csp) or {})}
    out["F_secs"] = time.time() - t0

    # M: load-continuation repair
    stages = []
    if not pts:
        out["M"] = {"stages": stages, "mu_end": 0.0}
        out["secs"] = time.time() - t0
        return out
    mu, r = pts[-1]
    pg, vg = mu * pg_dc, vf.copy()
    final = None
    for k in range(1, MAX_STAGES + 1):
        last = mu >= 1.0
        rounds = FINAL_ROUNDS if last else STAGE_ROUNDS
        pm = scaled(ppc, mu)
        hist, b = repair_stage(pm, pg, vg, r, rounds)
        st = {"k": k, "mu": float(mu), "rounds": len(hist), "status": [x["status"] for x in hist],
              "clean_at": next((x["it"] for x in hist if x.get("clean")), None), "best": strip(b) if b else None}
        stages.append(st)
        if last:
            final = (pm, b, hist)
            break
        if b is None:
            st["stop"] = "no checked round"
            break
        pk, vk, muk = b["pg"].copy(), b["vg"].copy(), mu
        rk = vlin.run_point(pm, pk, vk, r)
        if rk is None and FALLBACK:  # declared after the run (LOG.md): cold Newton from file voltages, then DC angles
            rk = vlin.run_point(pm, pk, vk) or vlin.run_point(pm, pk, vk, dc_angles(pm, 1.0, pk, vk))
            st["fallback"] = rk is not None
        if rk is None:
            st["stop"] = "best point has no warm power flow"
            break
        pg_of = lambda m, pk=pk, muk=muk: np.clip(pk * m / muk, g[:, PMIN], g[:, PMAX])
        cont, _ = path(ppc, pg_of, vk, muk, rk)
        mu_new, r_new = cont[-1]
        st["mu_next"] = float(mu_new)
        if mu_new - muk < MIN_GAIN and mu_new < 1.0:
            st["stop"] = "stall"
            break
        mu, r, pg, vg = mu_new, r_new, pg_of(mu_new), vk
    out["M"] = {"stages": stages, "mu_end": float(stages[-1].get("mu_next", stages[-1]["mu"]))}
    if final is not None:
        pm, b, hist = final
        out["M"]["clean_at"] = next((x["it"] for x in hist if x.get("clean")), None)
        out["M"]["final"] = strip(b) if b else None
        if b is not None and not b["clean"]:
            out["MR"] = reactive(ppc, b)
    out["secs"] = time.time() - t0
    return out


def pct(c, ref):
    return 100 * (c - ref) / ref


def summary(rows):
    L = []
    P = L.append
    P("Past the loading limit (research/grid-linopf; plan in LOG.md 2026-11-14). F: smallest singular value of")
    P("the Newton Jacobian (per unit) along the DC-angle load continuation of the DC dispatch; fold fit")
    P("sigma^2 = a (mu_f - mu) over the last 0.1 in mu. M: repair at mu*, continue in load, repeat.")
    P("")
    P(f"{'case':14s} {'kind':4s} {'mu*':>7s} {'sig(0)':>9s} {'sig(mu*)':>9s} {'ratio':>8s} {'mu_f':>7s} "
      f"{'mu_f-mu*':>9s} {'R2':>6s} {'n':>3s}  control ratio")
    for r in rows:
        if r.get("error"):
            P(f"{r['case']:14s} {r['kind']:4s}  error: {r['error']}")
            continue
        F = r["F"]
        c = r.get("F_control")
        cs = f"{c['ratio']:.3f} (mu* {c['mu_star']:.4f})" if c and c.get("ratio") is not None else "-"
        mf = F.get("mu_f")
        P(f"{r['case']:14s} {r['kind']:4s} {F['mu_star']:7.4f} {F['s0']:9.3e} {F['s_star']:9.3e} {F['ratio']:8.4f} "
          f"""{(f'{mf:7.4f}' if mf is not None else '      -')} {(f'{mf - F["mu_star"]:9.4f}' if mf is not None else '        -')} """
          f"""{(f'{F["r2"]:6.3f}' if mf is not None else '     -')} {F.get('n_fit', 0):3d}  {cs}""")
    P("")
    P("M stages (mu at the stage -> mu reached by the continuation after it; clean round or 'no'):")
    for r in rows:
        if r.get("error"):
            continue
        M = r["M"]
        s = "; ".join(f"{x['mu']:.4f}{(' -> ' + format(x['mu_next'], '.4f')) if 'mu_next' in x else ''}"
                      f" [{('@' + str(x['clean_at'])) if x['clean_at'] else 'no'}]{(' ' + x['stop']) if x.get('stop') else ''}"
                      for x in M["stages"])
        P(f"{r['case']}/{r['kind']}: {s}")
    P("")
    P(f"{'case':14s} {'kind':4s} {'mu_end':>7s} {'M':>4s} {'M+R':>4s}  {'final: nOv maxLd% slkMW nAng V Q':34s} "
      f"{'cost':>8s} {'M+R cost':>9s} {'s':>5s}")
    for r in rows:
        if r.get("error"):
            continue
        M = r["M"]
        f = M.get("final")
        mr = r.get("MR")
        mc = f"@{M['clean_at']}" if M.get("clean_at") else ("no" if "final" in M else "-")
        mrc = "y" if M.get("clean_at") or (mr and mr["clean"]) else "-"
        best = ("-" if not f else
                f"{f['n_over']:3d} {f['max_load'] * 100:7.2f} {f['slack_out_mw']:6.1f} {f['n_ang']:4d} {f['vviol']:3d} {f['qviol']:3d}")
        cost = f"{pct(f['cost'], r['ac']):+.3f}%" if f else "-"
        mrcost = f"{pct(mr['cost'], r['ac']):+.3f}%" if mr else "-"
        P(f"{r['case']:14s} {r['kind']:4s} {M['mu_end']:7.4f} {mc:>4s} {mrc:>4s}  {best:34s} {cost:>8s} {mrcost:>9s} {r['secs']:5.0f}")
    ok = [r for r in rows if not r.get("error")]
    n = len(ok)
    f1 = sum(1 for r in ok if r["F"].get("ratio") is not None and r["F"]["ratio"] <= 0.1)
    f2 = sum(1 for r in ok if r["F"].get("mu_f") is not None and r["F"]["r2"] >= 0.9
             and 0.0 <= r["F"]["mu_f"] - r["F"]["mu_star"] <= 0.01)
    ctl = [r["F_control"] for r in ok if r.get("F_control") and r["F_control"].get("ratio") is not None
           and r["case"] == "case300_ieee" and r["kind"] == "typ"]
    m1 = sum(1 for r in ok if r["M"]["mu_end"] >= 1.0)
    m2 = sum(1 for r in ok if r["M"].get("clean_at"))
    m3 = sum(1 for r in ok if r["M"].get("clean_at") or (r.get("MR") and r["MR"]["clean"]))
    costs = []
    for r in ok:
        if r["M"].get("clean_at"):
            costs.append(pct(r["M"]["final"]["cost"], r["ac"]))
        elif r.get("MR") and r["MR"]["clean"]:
            costs.append(pct(r["MR"]["cost"], r["ac"]))
    pre = [x for r in ok for x in r["M"]["stages"] if x["mu"] < 1.0]
    gained = sum(1 for x in pre if x.get("mu_next") is not None and x["mu_next"] - x["mu"] >= MIN_GAIN)
    P("")
    P(f"Scored cases: {n} of {len(rows)}")
    P(f"F1 sigma(mu*) <= 0.1 sigma(0) on >= 5: {f1}/{n} -> {'HELD' if f1 >= 5 else 'REFUTED'}")
    P(f"F2 fit R2 >= 0.9 and 0 <= mu_f - mu* <= 0.01 on >= 5: {f2}/{n} -> {'HELD' if f2 >= 5 else 'REFUTED'}")
    if ctl:
        P(f"F3 control ratio > 0.1: {ctl[0]['ratio']:.3f} -> {'HELD' if ctl[0]['ratio'] > 0.1 else 'REFUTED'}")
    else:
        P("F3 not testable")
    P(f"M1 path reaches mu = 1 on >= 3: {m1}/{n} -> {'HELD' if m1 >= 3 else 'REFUTED'}")
    P(f"M2 M fully clean on >= 2: {m2}/{n} -> {'HELD' if m2 >= 2 else 'REFUTED'}")
    P(f"M3 M or M+R fully clean on >= 3: {m3}/{n} -> {'HELD' if m3 >= 3 else 'REFUTED'}")
    if costs:
        P(f"M4 every clean point within +1 %: {', '.join(f'{c:+.3f}%' for c in costs)} -> "
          f"{'HELD' if max(costs) <= 1.0 else 'REFUTED'}")
    else:
        P("M4 not testable (no clean point)")
    if pre:
        P(f"M5 stages before the last that gain >= {MIN_GAIN}: {gained}/{len(pre)} = {gained / len(pre):.2f} -> "
          f"{'HELD' if gained / len(pre) >= 0.8 else 'REFUTED'}")
    else:
        P("M5 not testable")
    return "\n".join(L) + "\n"


def main():
    stem = "results_fold_fallback" if FALLBACK else "results_fold"
    jpath = HERE / f"{stem}.json"
    if "--summary" in sys.argv:
        rows = json.loads(jpath.read_text())
    else:
        only = [tuple(a.split("/")) for a in sys.argv[1:] if not a.startswith("--")]
        jobs = only or CASES
        with Pool(min(len(jobs), 6)) as pool:
            rows = []
            for r in pool.imap_unordered(run_case, jobs):
                print(f"done {r['case']}/{r['kind']} in {r.get('secs', 0):.0f}s {r.get('error', '')}", flush=True)
                rows.append(r)
        order = {c: i for i, c in enumerate(CASES)}
        rows.sort(key=lambda r: order.get((r["case"], r["kind"]), 99))
        jpath.write_text(json.dumps(rows, indent=1, default=float))
    text = summary(rows)
    (HERE / f"{stem}.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
