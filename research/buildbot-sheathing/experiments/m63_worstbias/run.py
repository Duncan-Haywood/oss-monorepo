"""Milestone 63: the chain under the worst-direction sensor bias, not six random ones.

Every milestone from 55 on sized the held-or-free margin to the whole 0.2 N error ball (B ||G_j||, G_j the joint's
settle gradient), but tested it on 6 random-direction errors per seed. A constant bias of the bound's size that a
real sensor carries need not be random. Here, per case, the adversary aims the bias at the joint the plan leaves
closest to its friction threshold: from the pose-side plan at the true load (``m55.plan_forces``, both window ends,
no squeeze), j* = argmin_j min_w (| |tau_wj| - tau_f | - B ||G_wj||), and e = +/- B G_w*j* / ||G_w*j*|| (both signs).
To first order that direction moves j* by B ||G_j*||, the most any bias in the ball can, and toward its threshold
for one of the two signs. Cases with no pose-side plan at the true load fall back to +/- B along the load itself.

The chain per balance-envelope case is milestone 61's, unchanged (m59's four-row rule; m60's uniform leg raise;
m61's wider squeeze), with the reference calibration re-made under the same bias (a constant bias is present at
calibration too). Section J is held out: 48 Latin-hypercube loads (seed 63); the same loads also run 6
random-direction errors (seed 63) as the comparison. Hypotheses H244-H246 (LOG.md, registered before the run).
M63_PROCS sets the pool (default 4); M63_N the loads.
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

N = int(os.environ.get("M63_N", "48"))
os.environ["M61_N"] = str(N)
HERE = os.path.dirname(os.path.abspath(__file__))
import numpy as np  # noqa: E402

spec = importlib.util.spec_from_file_location("m61", os.path.join(HERE, "..", "m61_lastfour", "run.py"))
E61 = importlib.util.module_from_spec(spec)
sys.modules["m61"] = E61
spec.loader.exec_module(E61)                     # milestone 61's chain (and so 60's, 59's, ... 38's)

T0 = time.time()
C, E59, E55, E54, E51, M1 = E61.C, E61.E59, E61.E55, E61.E54, E61.E51, E61.M1
SPEC, AX, EPS, B = E61.SPEC, E61.AX, E61.EPS, E61.B
SEED = 63
E61.SEED = SEED
LOADS = E54.lhs(N, SEED)
RAND = [B * a for a in E55.rand_dirs(6, SEED)]
UNIT = np.eye(3)


def worst_dir(key, f):
    """(unit direction, binding joint name, its margin N m, its gradient norm N m/N, 'grad' or 'load')."""
    f = np.asarray(f, float)
    pf = E55.plan_forces(key, f)
    if pf is None:
        u = f / max(np.linalg.norm(f), 1e-12)
        return u, None, None, None, "load"
    tp = [t for _, _, t in pf]
    G = [np.zeros((len(tp[0]), 3)) for _ in range(2)]
    for c in range(3):
        ts = E55.settled(key, pf, f + B * UNIT[c])
        for w in range(2):
            G[w][:, c] = (ts[w] - tp[w]) / B
    best = None
    for w in range(2):
        gn = np.linalg.norm(G[w], axis=1)
        m = np.abs(np.abs(tp[w]) - M1.TAUF) - B * gn
        m = np.where(gn > 1e-9, m, np.inf)
        j = int(np.argmin(m))
        if best is None or m[j] < best[0]:
            best = (float(m[j]), w, j, float(gn[j]))
    mj, w, j, gn = best
    return G[w][j] / gn, M1.ROB[key[0]][1][j], mj, gn, "grad"


def run_case(k, ref, f, e, er_r, lk, lr, H):
    in51 = lk is not None and H <= lk + EPS and lr is not None and H <= lr + EPS
    row = {"in51": bool(in51), "cal": er_r is not None}
    if not in51 or er_r is None:
        return row
    o = E59.rule_all(k, ref, f, e, er_r)[C.CFG]
    row["out"] = E61.brief(o) or {"how": "none", "bind": o.get("bind")}
    if o["how"] == "none":
        Mu, ou = C.escalate(k, ref, f, e, er_r, None, E61.LEG)
        st = {"bind": o.get("bind"), "Mu": Mu, "u": E61.brief(ou)}
        if Mu is None:
            St, os_ = E61.squeeze(k, ref, f, e, er_r)
            st |= {"S": St, "s": E61.brief(os_)}
        row["esc"] = st
    return row


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
            cal[t] = E55.robust_rule(ref, f_slack, np.asarray(e, float))[2]
        return cal[t]
    rows = []
    for k in keys:
        lk = lim[str(list(k))]
        f = np.asarray(M1.hose_f(k, H, phi), float)
        rec = {"pose": list(k[1:])}
        u, bj, mj, gn, src = worst_dir(k, f)
        rec["adv"] = {"u": [float(x) for x in u], "bind": bj, "m": mj, "gn": gn, "src": src}
        rec["cases"] = {}
        for sgn in (1, -1):
            e = sgn * B * u
            rec["cases"][f"adv{'+' if sgn > 0 else '-'}"] = run_case(k, ref, f, e, er(e), lk, lr, H)
        for ai, e in enumerate(RAND):
            rec["cases"][f"r{ai}"] = run_case(k, ref, f, np.asarray(e, float), er(e), lk, lr, H)
        rows.append(rec)
    return {"robot": n, "j": j, "H": H, "phi": phd, "rows": rows}


def outcome(r):
    """(planned, worst |.| over the four rows in mm or None, flips or None, how)."""
    if "out" not in r:
        return None
    o = r["out"]
    if o.get("y") is not None:
        return True, max(o[a] for a in AX), o["flips"], o["how"]
    e = r.get("esc", {})
    for key, how in (("u", "leg raise"), ("s", "squeeze")):
        if (e.get("Mu") if key == "u" else e.get("S")) is not None and e.get(key):
            x = e[key]
            return True, max(x[a] for a in AX), x["flips"], how
    return False, None, None, "none"


if __name__ == "__main__":
    procs = int(os.environ.get("M63_PROCS", "4"))
    allkeys = sorted(set(k for k in M1.KEYS) | {E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    phis = [p for _, p in LOADS]
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "B": B, "seed": SEED, "loads": LOADS,
           "rand": [list(map(float, e)) for e in RAND], "leg": E61.LEG, "sq": E61.SQ}

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
    print(f"# Milestone 63: the worst-direction bias, held-out section J ({N} loads, seed {SEED}; milestone 61's chain, "
          f"spec {SPEC} mm per row; B = {B:.2f} N)")
    print("random errors (seed 63): " + "; ".join("(" + ", ".join(f"{c:+.3f}" for c in e) + ")" for e in RAND))
    GR = {"adv": ("adv+", "adv-"), "rand": tuple(f"r{i}" for i in range(6))}
    print("\n## A. Coverage and residuals by error set: robot | set | balance-envelope cases | planned | unplanned | "
          "coverage % | over spec | worst |y|, |z|, |y_d|, |z_d| (mm) | cases with a flip | escalated")
    S = {}
    for n in ("g1", "h1"):
        for g, names in GR.items():
            cs = [rec["cases"][c] for x in res if x["robot"] == n for rec in x["rows"] for c in names]
            ins = [r for r in cs if r["in51"] and "out" in r]
            nin = sum(r["in51"] for r in cs)
            oc = [outcome(r) for r in ins]
            pl = [o for o in oc if o and o[0]]
            wa = {a: 0.0 for a in AX}
            for r in ins:
                o = r["out"] if r["out"].get("y") is not None else (r.get("esc", {}).get("u") or
                                                                    r.get("esc", {}).get("s") or {})
                if o.get("y") is not None and outcome(r)[0]:
                    for a in AX:
                        wa[a] = max(wa[a], o[a])
            s = {"in51": nin, "planned": len(pl), "un": nin - len(pl), "cov": 100.0 * len(pl) / max(nin, 1),
                 "over": sum(o[1] > SPEC + 1e-12 for o in pl), "worst": wa, "wmax": max(wa.values()),
                 "flip": sum((o[2] or 0) > 0 for o in pl), "esc": sum(o[3] in ("leg raise", "squeeze") for o in pl)}
            S[f"{n} {g}"] = s
            print(f"  {n} | {g} | {nin} | {s['planned']} | {s['un']} | {s['cov']:.2f} | {s['over']} | "
                  + ", ".join(f"{wa[a]:.4f}" for a in AX) + f" | {s['flip']} | {s['esc']}")
    print("\n## B. The adversary: robot | poses x loads | direction from the gradient | from the load | binding joints "
          "(count) | margin of j* at the true load, median and min (N m) | B ||G_j*||, median and max (N m)")
    AD = {}
    for n in ("g1", "h1"):
        ad = [rec["adv"] for x in res if x["robot"] == n for rec in x["rows"]]
        gr = [a for a in ad if a["src"] == "grad"]
        bc = {}
        for a in gr:
            bc[a["bind"]] = bc.get(a["bind"], 0) + 1
        ms = [a["m"] for a in gr]
        gs = [B * a["gn"] for a in gr]
        AD[n] = {"n": len(ad), "grad": len(gr), "bind": bc,
                 "m_med": float(np.median(ms)), "m_min": float(min(ms)),
                 "g_med": float(np.median(gs)), "g_max": float(max(gs))}
        top = ", ".join(f"{k} {v}" for k, v in sorted(bc.items(), key=lambda kv: -kv[1])[:5])
        print(f"  {n} | {len(ad)} | {len(gr)} | {len(ad) - len(gr)} | {top} | {AD[n]['m_med']:.4f}, "
              f"{AD[n]['m_min']:.4f} | {AD[n]['g_med']:.4f}, {AD[n]['g_max']:.4f}")
    print("\n## C. Same case, adversarial against random: robot | cases planned under both | adversarial worst row "
          "> every random one's | median ratio adversarial/random-worst | planned under every random, not under an "
          "adversarial sign | the reverse")
    PR = {}
    for n in ("g1", "h1"):
        gt = rd = 0
        ratios, lost, won, both = [], 0, 0, 0
        for x in res:
            if x["robot"] != n:
                continue
            for rec in x["rows"]:
                ca = [outcome(rec["cases"][c]) for c in GR["adv"]]
                cr = [outcome(rec["cases"][c]) for c in GR["rand"]]
                if any(o is None for o in ca + cr):
                    continue
                pa, prr = all(o[0] for o in ca), all(o[0] for o in cr)
                lost += prr and not pa
                won += pa and not prr
                if pa and prr:
                    both += 1
                    wa_, wr_ = max(o[1] for o in ca), max(o[1] for o in cr)
                    gt += wa_ > wr_ + 1e-9
                    if wr_ > 0:
                        ratios.append(wa_ / wr_)
        PR[n] = {"both": both, "gt": gt, "ratio": float(np.median(ratios)) if ratios else None, "lost": lost,
                 "won": won}
        rv = "-" if PR[n]["ratio"] is None else f"{PR[n]['ratio']:.3f}"
        print(f"  {n} | {both} | {gt} | {rv} | {lost} | {won}")
    print("\n## D. Each balance-envelope case unplanned under an adversarial sign: robot | pose | H N | phi deg | sign | "
          "binding (rule) | adversary's j* | leg M | squeeze S | planned under every random error")
    for x in res:
        for rec in x["rows"]:
            for c in GR["adv"]:
                r = rec["cases"][c]
                o = outcome(r)
                if o is None or o[0]:
                    continue
                cr = [outcome(rec["cases"][q]) for q in GR["rand"]]
                allr = all(q is not None and q[0] for q in cr)
                e = r.get("esc", {})
                print(f"  {x['robot']} | {rec['pose']} | {x['H']:.2f} | {x['phi']:.1f} | {c} | {e.get('bind')} | "
                      f"{rec['adv']['bind']} | {e.get('Mu')} | {e.get('S')} | {allr}")
    print("\n## E. Hypotheses (registered in LOG.md before this run)")
    D = {}
    ov = sum(S[f"{n} adv"]["over"] for n in ("g1", "h1"))
    fl = sum(S[f"{n} adv"]["flip"] for n in ("g1", "h1"))
    D["H244"] = ov == 0
    print(f"H244 (every press planned under the worst-direction bias is inside {SPEC} mm at both points both ways): "
          f"over spec {ov} (cases with a flip {fl}; worst G1 {S['g1 adv']['wmax']:.4f}, H1 {S['h1 adv']['wmax']:.4f} mm)"
          f" -> {'held' if D['H244'] else 'refuted'}")
    D["H245"] = all(S[f"{n} adv"]["cov"] >= 99.5 for n in ("g1", "h1"))
    print(f"H245 (coverage of the balance envelope under the worst-direction bias is at least 99.5% on each robot): "
          f"G1 {S['g1 adv']['cov']:.2f}%, H1 {S['h1 adv']['cov']:.2f}% -> {'held' if D['H245'] else 'refuted'}")
    D["H246"] = all(S[f"{n} adv"]["wmax"] > S[f"{n} rand"]["wmax"] for n in ("g1", "h1"))
    print(f"H246 (the worst residual under the adversarial bias exceeds the worst under 6 random directions on each "
          f"robot): G1 {S['g1 adv']['wmax']:.4f} vs {S['g1 rand']['wmax']:.4f}, H1 {S['h1 adv']['wmax']:.4f} vs "
          f"{S['h1 rand']['wmax']:.4f} mm -> {'held' if D['H246'] else 'refuted'}")
    out["S"], out["AD"], out["PR"], out["D"] = S, AD, PR, D
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")
