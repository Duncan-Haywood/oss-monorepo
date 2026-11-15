"""Raise the voltages first (research/grid-linopf; plan in LOG.md 2026-11-14, committed before this ran).

Arm V (reactive pre-stage, iterated): the fold step's DC-angle continuation of the DC dispatch at the
file schedule to mu_1 = mu*. Stage k: vsched.reactive_stage (PIPS AC OPF over V and Q, non-slack P
pinned to mu_k * P_DC) on the case scaled by mu_k gives setpoints V_k; continue in load with
mu * P_DC at V_k, warm from the reactive solution, to mu_{k+1}. Stop at mu = 1, after 8 stages, on a
gain < 0.005, or when the reactive stage has no solution. At mu = 1 the frozen 20-round J-m-a from
(P_DC, V_last); V+R = the reactive stage on its best point if not fully clean.

Arm W (reduced-load AC OPF schedule): the full AC OPF (PIPS) on the case scaled by mu* (else mu*/2);
its generator-bus voltages are V_W; the continuation of the DC dispatch from mu = 0 at V_W; at mu = 1
the frozen 20-round J-m-a and W+R.

Writes results_vfirst.json and results_vfirst.txt. Usage: run_vfirst.py [--summary] [--ipopt] [case/kind ...]
--ipopt (declared after the planned run, LOG.md): every AC OPF (the reactive stages, arm W's OPF, the +R
stages and case300's reference) solved by IPOPT under PYPOWER's unchanged model (ipopt_nlp.use_ipopt), since
PIPS fails numerically on the RTE networks at any load. Writes results_vfirst_ipopt.*.
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

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
from infra_dcopf import ipopt_nlp  # noqa: E402
from infra_dcopf.fold import newton_jacobian, sigma_min  # noqa: E402
from infra_dcopf.pglib import baseline, case_path, fix_ref, load_m  # noqa: E402
from infra_dcopf.vsched import ACOPT, file_schedule, opt_schedule, reactive_stage  # noqa: E402
from run_fold import MIN_GAIN, MAX_STAGES, FINAL_ROUNDS, path, repair_stage  # noqa: E402
from run_heldout import reactive  # noqa: E402
from run_homotopy import CASES, dc_start, scaled  # noqa: E402
from run_perturb import strip  # noqa: E402


def at(r, mu):
    return {"mu": float(mu), "sigma": sigma_min(newton_jacobian(r)), "vmin": float(r["bus"][:, VM].min())}


def dv(v, vf):
    d = np.abs(np.asarray(v) - vf)
    return {"mean_dv": float(d.mean()), "max_dv": float(d.max()), "mean_v": float(np.mean(v))}


def final_stage(ppc, pg, vg, r, out, key):
    hist, b = repair_stage(ppc, pg, vg, r, FINAL_ROUNDS)
    out[key + "_clean_at"] = next((x["it"] for x in hist if x.get("clean")), None)
    out[key + "_final"] = strip(b) if b else None
    out[key + "_status"] = [x["status"] for x in hist]
    if b is not None and not b["clean"]:
        out[key + "R"] = reactive(ppc, b)


IPOPT = "--ipopt" in sys.argv


def run_case(job):
    name, kind = job
    t0 = time.time()
    try:
        if IPOPT:
            with ipopt_nlp.use_ipopt():
                return _run_case(name, kind, t0)
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
        out["ref"], out["ac"] = "PIPS", float(ac["f"])
    pg_dc, rule = dc_start(ppc)
    out["start_rule"] = rule
    vf = file_schedule(ppc)
    of = lambda m: m * pg_dc  # noqa: E731

    pts, _ = path(ppc, of, vf)
    if not pts:
        out["error"] = "no power flow at mu = 0"
        return out
    mu_star, r = pts[-1]
    out["mu_star"] = float(mu_star)

    # Arm V
    stages, mu, vg = [], mu_star, vf.copy()
    reached = mu >= 1.0
    for k in range(1, MAX_STAGES + 1):
        if mu >= 1.0:
            reached = True
            break
        st = {"k": k, "mu": float(mu), "at": at(r, mu)}
        stages.append(st)
        ts = time.time()
        rs = reactive_stage(scaled(ppc, mu), of(mu))
        st["rs_secs"] = time.time() - ts
        print(f"  {name}/{kind} V stage {k} at mu {mu:.4f}: reactive {'ok' if rs else 'none'} "
              f"({st['rs_secs']:.0f}s, {time.time() - t0:.0f}s total)", flush=True)
        if rs is None:
            st["stop"] = "reactive stage has no solution"
            break
        vk, rr = rs[1], rs[2]
        st.update(dv(vk, vf))
        cont, _ = path(ppc, of, vk, mu, None if rr is None else rr)
        if not cont:
            st["stop"] = "no power flow at V_k"
            break
        mu_new, r_new = cont[-1]
        st["mu_next"] = float(mu_new)
        st["at_next"] = at(r_new, mu_new)
        vg = vk
        if mu_new - mu < MIN_GAIN and mu_new < 1.0:
            st["stop"] = "stall"
            mu, r = mu_new, r_new
            break
        mu, r = mu_new, r_new
    reached = reached or mu >= 1.0
    out["V"] = {"stages": stages, "mu_end": float(mu), "reached": bool(reached)}
    if reached:
        final_stage(ppc, pg_dc, vg, r, out["V"], "V")
    out["V_secs"] = time.time() - t0

    # Arm W
    t1 = time.time()
    W = {}
    for frac in (1.0, 0.5):
        m = mu_star * frac
        a = runopf(scaled(ppc, m), ACOPT)
        if a["success"]:
            W["mu_opf"], W["frac"] = float(m), frac
            vw = opt_schedule(ppc, a)
            W.update(dv(vw, vf))
            break
    else:
        W["stop"] = "no reduced-load AC optimum"
    if "mu_opf" in W:
        wp, _ = path(ppc, of, vw)
        if not wp:
            W["stop"] = "no power flow at mu = 0"
        else:
            mw, rw = wp[-1]
            W["mu_star_w"] = float(mw)
            W["at"] = at(rw, mw)
            if mw >= 1.0:
                final_stage(ppc, pg_dc, vw, rw, W, "W")
    out["W"] = W
    out["W_secs"] = time.time() - t1
    out["secs"] = time.time() - t0
    return out


def pct(c, ref):
    return 100 * (c - ref) / ref


def clean_cost(arm, key, ac):
    if arm.get(key + "_clean_at"):
        return pct(arm[key + "_final"]["cost"], ac)
    rr = arm.get(key + "R")
    if rr and rr["clean"]:
        return pct(rr["cost"], ac)
    return None


def fin(f):
    return ("-" if not f else f"{f['n_over']:3d} {f['max_load'] * 100:7.2f} {f['slack_out_mw']:6.1f} "
            f"{f['n_ang']:4d} {f['vviol']:3d} {f['qviol']:3d}")


def summary(rows):
    L = []
    P = L.append
    P("Raise the voltages first (research/grid-linopf; plan in LOG.md 2026-11-14). V: reactive stage (V, Q")
    P("with P pinned) at each stall, then continue the DC dispatch in load at its setpoints. W: the AC OPF's")
    P("voltage schedule at reduced load (mu*, else mu*/2), then the DC dispatch's continuation from mu = 0.")
    P("")
    P("Arm V stages: mu -> mu reached [sigma_min, lowest V at the stall before; mean/max |dV| of V_k vs file]")
    for r in rows:
        if r.get("error"):
            P(f"{r['case']}/{r['kind']}: error: {r['error']}")
            continue
        parts = []
        for x in r["V"]["stages"]:
            s = f"{x['mu']:.4f}"
            if "mu_next" in x:
                s += f" -> {x['mu_next']:.4f}"
            s += f" [sig {x['at']['sigma']:.2e}, Vmin {x['at']['vmin']:.3f}"
            if "mean_dv" in x:
                s += f", dV {x['mean_dv']:.3f}/{x['max_dv']:.3f}"
            s += f", rs {x['rs_secs']:.0f}s]"
            if x.get("stop"):
                s += " " + x["stop"]
            parts.append(s)
        P(f"{r['case']}/{r['kind']} (mu* {r['mu_star']:.4f}): " + ("; ".join(parts) or "already at mu = 1"))
    P("")
    hdr = f"{'case':14s} {'kind':4s} {'arm':3s} {'mu_end':>7s} {'clean':>5s} {'+R':>3s}  {'final: nOv maxLd% slkMW nAng V Q':34s} {'cost':>8s} {'+R cost':>8s}"
    P(hdr)
    for r in rows:
        if r.get("error"):
            continue
        for key, arm, mu_end in (("V", r["V"], r["V"]["mu_end"]), ("W", r["W"], r["W"].get("mu_star_w"))):
            f = arm.get(key + "_final")
            rr = arm.get(key + "R")
            c = f"@{arm[key + '_clean_at']}" if arm.get(key + "_clean_at") else ("no" if (key + "_final") in arm else "-")
            rc = "y" if rr and rr["clean"] else ("n" if rr else "-")
            cost = f"{pct(f['cost'], r['ac']):+.3f}%" if f else "-"
            rcost = f"{pct(rr['cost'], r['ac']):+.3f}%" if rr else "-"
            me = f"{mu_end:7.4f}" if mu_end is not None else "      -"
            P(f"{r['case']:14s} {r['kind']:4s} {key:3s} {me} {c:>5s} {rc:>3s}  {fin(f):34s} {cost:>8s} {rcost:>8s}")
    P("")
    P("Arm W: reduced-load AC OPF")
    for r in rows:
        if r.get("error"):
            continue
        W = r["W"]
        if "mu_opf" not in W:
            P(f"{r['case']}/{r['kind']}: {W.get('stop')}")
            continue
        s = (f"{r['case']}/{r['kind']}: AC OPF at mu {W['mu_opf']:.4f} (frac {W['frac']}), dV {W['mean_dv']:.3f}/"
             f"{W['max_dv']:.3f}, mean V {W['mean_v']:.3f}; mu*_W ")
        s += (f"{W['mu_star_w']:.4f} vs mu* {r['mu_star']:.4f} [sig {W['at']['sigma']:.2e}, Vmin {W['at']['vmin']:.3f}]"
              if "mu_star_w" in W else W.get("stop", "-"))
        P(s)
    ok = [r for r in rows if not r.get("error")]
    n = len(ok)
    s1 = [r["V"]["stages"][0] for r in ok if r["V"]["stages"]]
    v1 = sum(1 for x in s1 if "mean_dv" in x)
    v2n = [x for x in s1 if "mean_dv" in x]
    v2 = sum(1 for x in v2n if x.get("mu_next") is not None and x["mu_next"] - x["mu"] >= 0.05)
    v3 = sum(1 for r in ok if r["V"]["reached"])
    vc = [(r, clean_cost(r["V"], "V", r["ac"])) for r in ok]
    v4 = sum(1 for _, c in vc if c is not None)
    w1 = sum(1 for r in ok if "mu_opf" in r["W"])
    w2n = [r for r in ok if "mu_star_w" in r["W"]]
    w2 = sum(1 for r in w2n if r["W"]["mu_star_w"] > r["mu_star"])
    w3 = sum(1 for r in ok if r["W"].get("mu_star_w", 0) >= 1.0)
    wc = [(r, clean_cost(r["W"], "W", r["ac"])) for r in ok]
    costs = [c for _, c in vc + wc if c is not None]
    P("")
    P(f"Scored cases: {n} of {len(rows)}")
    P(f"V1 stage-1 reactive stage solves on >= 4: {v1}/{n} -> {'HELD' if v1 >= 4 else 'REFUTED'}")
    if v2n:
        P(f"V2 stage-1 gain >= 0.05 on >= 75 % of those: {v2}/{len(v2n)} -> {'HELD' if v2 / len(v2n) >= 0.75 else 'REFUTED'}")
    else:
        P("V2 not testable")
    P(f"V3 V reaches mu = 1 on >= 3: {v3}/{n} -> {'HELD' if v3 >= 3 else 'REFUTED'}")
    P(f"V4 V or V+R fully clean on >= 2: {v4}/{n} -> {'HELD' if v4 >= 2 else 'REFUTED'}")
    if costs:
        P(f"V5 every clean point within +1 %: {', '.join(f'{c:+.3f}%' for c in costs)} -> "
          f"{'HELD' if max(costs) <= 1.0 else 'REFUTED'}")
    else:
        P("V5 not testable (no clean point)")
    P(f"W1 reduced-load AC OPF solves on >= 4: {w1}/{n} -> {'HELD' if w1 >= 4 else 'REFUTED'}")
    if w2n:
        P(f"W2 mu*_W > mu* on every case with a schedule: {w2}/{len(w2n)} -> {'HELD' if w2 == len(w2n) and w2n else 'REFUTED'}")
    else:
        P("W2 not testable")
    P(f"W3 W reaches mu = 1 on >= 2: {w3}/{n} -> {'HELD' if w3 >= 2 else 'REFUTED'}")
    P("Wall time (s): " + ", ".join(f"{r['case']}/{r['kind']} {r.get('secs', 0):.0f}" for r in rows))
    return "\n".join(L) + "\n"


def main():
    stem = "results_vfirst_ipopt" if IPOPT else "results_vfirst"
    jpath = HERE / f"{stem}.json"
    only = [tuple(a.split("/")) for a in sys.argv[1:] if not a.startswith("--")]
    parts = HERE / f"{stem}_parts"
    if "--summary" in sys.argv:
        rows = json.loads(jpath.read_text())
    elif "--merge" in sys.argv:  # combine the per-case files written by --part runs
        rows = [json.loads((parts / f"{c}_{k}.json").read_text()) if (parts / f"{c}_{k}.json").exists()
                else {"case": c, "kind": k, "error": "not finished (still running when the results were merged)"}
                for c, k in CASES]
        jpath.write_text(json.dumps(rows, indent=1, default=float))
    elif "--part" in sys.argv:  # one case per process, written as soon as it finishes (a run can outlive a job limit)
        parts.mkdir(exist_ok=True)
        for job in only:
            r = run_case(job)
            (parts / f"{job[0]}_{job[1]}.json").write_text(json.dumps(r, indent=1, default=float))
            print(f"done {r['case']}/{r['kind']} in {r.get('secs', 0):.0f}s {r.get('error', '')}", flush=True)
        return
    else:
        jobs = only or CASES
        with Pool(min(len(jobs), 4)) as pool:
            rows = []
            for r in pool.imap_unordered(run_case, jobs):
                print(f"done {r['case']}/{r['kind']} in {r.get('secs', 0):.0f}s {r.get('error', '')}", flush=True)
                rows.append(r)
        order = {c: i for i, c in enumerate(CASES)}
        rows.sort(key=lambda r: order.get((r["case"], r["kind"]), 99))
        if only:  # smoke tests do not overwrite the planned run's files
            print(summary(rows))
            return
        jpath.write_text(json.dumps(rows, indent=1, default=float))
    text = summary(rows)
    (HERE / f"{stem}.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
