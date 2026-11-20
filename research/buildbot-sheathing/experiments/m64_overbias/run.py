"""Milestone 64: how far past its 0.2 N design bound can the sensor bias go before a planned press leaves 0.03 mm?

Milestone 63 aimed a bias of the bound's own size (B = 0.2 N) at the joint the plan leaves closest to its friction
threshold and found every planned press inside 0.03 mm (worst 0.0203 mm). Here the planner and every margin stay
sized to B, but the true bias is beta * B along the same adversarial direction (``m63.worst_dir``: the settle gradient
of the joint nearest its threshold, both signs; along the load where no pose-side plan exists at the true load), for
beta in BETAS. Milestone 61's chain runs per balance-envelope case unchanged (m59's four-row rule; m60's uniform leg
raise; m61's wider squeeze), with the reference calibration re-made under the same bias.

Section K is held out: 48 Latin-hypercube loads (seed 64). Hypotheses H247-H249 (LOG.md, registered before the run).
M64_PROCS sets the pool (default 4); M64_N the loads.
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import importlib.util
import json
import math
import os
import platform
import sys
import time

N = int(os.environ.get("M64_N", "48"))
os.environ["M63_N"] = str(N)
HERE = os.path.dirname(os.path.abspath(__file__))
import numpy as np  # noqa: E402

spec = importlib.util.spec_from_file_location("m63", os.path.join(HERE, "..", "m63_worstbias", "run.py"))
E63 = importlib.util.module_from_spec(spec)
sys.modules["m63"] = E63
spec.loader.exec_module(E63)                     # milestone 63's adversary (and 61's chain, 60's, ... 38's)

T0 = time.time()
E61, C, E54, E51, M1 = E63.E61, E63.C, E63.E54, E63.E51, E63.M1
SPEC, AX, B = E63.SPEC, E63.AX, E63.B
SEED = 64
E61.SEED = SEED
LOADS = E54.lhs(N, SEED)
BETAS = (1.5, 2.0, 3.0, 5.0)
NAMES = [f"b{b:g}{s}" for b in BETAS for s in "+-"]


def task(args):
    n, j, lim = args
    H, phd = LOADS[j]
    phi = math.radians(phd)
    C.setup(n)
    keys = sorted(k for k in M1.KEYS if k[0] == n)
    ref = E51.ref_key(n)
    f_slack = M1.hose_f(ref, 0.0, 0.0)
    lr = lim[str(list(ref))]
    cal = {}

    def er(e):
        t = tuple(np.round(e, 12))
        if t not in cal:
            cal[t] = E63.E55.robust_rule(ref, f_slack, np.asarray(e, float))[2]
        return cal[t]
    rows = []
    for k in keys:
        lk = lim[str(list(k))]
        f = np.asarray(M1.hose_f(k, H, phi), float)
        u, bj, mj, gn, src = E63.worst_dir(k, f)
        rec = {"pose": list(k[1:]), "adv": {"u": [float(x) for x in u], "bind": bj, "m": mj, "gn": gn, "src": src},
               "cases": {}}
        for beta in BETAS:
            for sgn, sc in ((1, "+"), (-1, "-")):
                e = sgn * beta * B * u
                rec["cases"][f"b{beta:g}{sc}"] = E63.run_case(k, ref, f, e, er(e), lk, lr, H)
        rows.append(rec)
    return {"robot": n, "j": j, "H": H, "phi": phd, "rows": rows}


def resid_of(r):
    o = r["out"] if r["out"].get("y") is not None else (r.get("esc", {}).get("u") or r.get("esc", {}).get("s") or {})
    return o


if __name__ == "__main__":
    procs = int(os.environ.get("M64_PROCS", "4"))
    allkeys = sorted(set(k for k in M1.KEYS) | {E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    phis = [p for _, p in LOADS]
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "B": B, "seed": SEED, "loads": LOADS,
           "betas": BETAS}

    def tl(args):
        key, ph = args
        C.setup(key[0])
        return key, [E54.limit(key, math.radians(p)) for p in ph]
    with ctx.Pool(procs) as pool:
        L = pool.map(tl, [(k, phis) for k in allkeys], chunksize=1)
        lims = {str(list(k)): v for k, v in L}
        jobs = [(n, j, {kk: v[j] for kk, v in lims.items()}) for n in ("g1", "h1") for j in range(N)]
        res = pool.map(task, jobs, chunksize=1)
    out["limits"], out["runs"] = lims, res
    print(f"# Milestone 64: bias past the design bound, held-out section K ({N} loads, seed {SEED}; milestone 61's "
          f"chain sized to B = {B:.2f} N, spec {SPEC} mm per row; true bias beta*B along milestone 63's adversary)")
    print("\n## A. By robot and beta: robot | beta | bias N | balance-envelope cases | calibration failed | planned | "
          "coverage % | over spec | over spec with no flip | worst |y|, |z|, |y_d|, |z_d| (mm) | planned with a flip | "
          "escalated")
    S, OV = {}, []
    for n in ("g1", "h1"):
        for beta in BETAS:
            names = [f"b{beta:g}+", f"b{beta:g}-"]
            cs = [(x, rec, c, rec["cases"][c]) for x in res if x["robot"] == n for rec in x["rows"] for c in names]
            nin = sum(r["in51"] for *_, r in cs)
            ncal = sum(r["in51"] and not r["cal"] for *_, r in cs)
            pl, wa, over, ovnf, flip, esc = 0, {a: 0.0 for a in AX}, 0, 0, 0, 0
            for x, rec, c, r in cs:
                oc = E63.outcome(r)
                if not oc or not oc[0]:
                    continue
                pl += 1
                o = resid_of(r)
                for a in AX:
                    wa[a] = max(wa[a], o[a])
                fl = oc[2] or 0
                flip += fl > 0
                esc += oc[3] in ("leg raise", "squeeze")
                if oc[1] > SPEC + 1e-12:
                    over += 1
                    ovnf += fl == 0
                    OV.append({"robot": n, "beta": beta, "case": c, "pose": rec["pose"], "H": x["H"],
                               "phi": x["phi"], "worst": oc[1], "flips": fl, "how": oc[3],
                               "bind": rec["adv"]["bind"], "src": rec["adv"]["src"]})
            s = {"in51": nin, "calfail": ncal, "planned": pl, "cov": 100.0 * pl / max(nin, 1), "over": over,
                 "over_noflip": ovnf, "worst": wa, "wmax": max(wa.values()), "flip": flip, "esc": esc}
            S[f"{n} {beta:g}"] = s
            print(f"  {n} | {beta:g} | {beta * B:.2f} | {nin} | {ncal} | {pl} | {s['cov']:.2f} | {over} | {ovnf} | "
                  + ", ".join(f"{wa[a]:.4f}" for a in AX) + f" | {flip} | {esc}")
    print("\n## B. Worst residual as a fraction of the spec, by beta (robot: beta -> worst/spec)")
    for n in ("g1", "h1"):
        print(f"  {n}: " + "; ".join(f"{b:g} -> {S[f'{n} {b:g}']['wmax'] / SPEC:.2f}" for b in BETAS))
    print("\n## C. Planned presses over spec (first 30, by beta then worst): robot | beta | case | pose | H N | phi deg | "
          "worst row mm | flips | how | adversary's j* (source)")
    for o in sorted(OV, key=lambda d: (d["beta"], -d["worst"]))[:30]:
        print(f"  {o['robot']} | {o['beta']:g} | {o['case']} | {o['pose']} | {o['H']:.2f} | {o['phi']:.1f} | "
              f"{o['worst']:.4f} | {o['flips']} | {o['how']} | {o['bind']} ({o['src']})")
    print(f"  (total over spec: {len(OV)})")
    print("\n## D. Hypotheses (registered in LOG.md before this run)")
    D = {}
    o15 = sum(S[f"{n} 1.5"]["over"] for n in ("g1", "h1"))
    D["H247"] = o15 == 0
    print(f"H247 (at beta 1.5, 0.3 N, every planned press inside {SPEC} mm on both robots): over spec G1 "
          f"{S['g1 1.5']['over']}, H1 {S['h1 1.5']['over']} (worst G1 {S['g1 1.5']['wmax']:.4f}, H1 "
          f"{S['h1 1.5']['wmax']:.4f} mm) -> {'held' if D['H247'] else 'refuted'}")
    D["H248"] = all(S[f"{n} 5"]["over"] > 0 for n in ("g1", "h1"))
    print(f"H248 (at beta 5, 1.0 N, at least one planned press over spec on each robot): G1 {S['g1 5']['over']}, H1 "
          f"{S['h1 5']['over']} -> {'held' if D['H248'] else 'refuted'}")
    nf = sum(o["flips"] == 0 for o in OV)
    D["H249"] = None if not OV else nf == 0
    print(f"H249 (every over-spec planned press has a flip): {len(OV)} over spec, {nf} with no flip -> "
          f"{'untestable' if D['H249'] is None else ('held' if D['H249'] else 'refuted')}")
    out["S"], out["OV"], out["D"] = S, OV, D
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")
