"""Milestone 47: per-pose hold sides at every pose of both robots.

Milestone 46 found milestone 32's per-robot hold sides (``SIGNS``) wrong at H1 (1.4 m, -0.15 m) and, in its
section A1, disagreeing with the torque-minimising side at four other H1 poses. Here every pose of both robots in
milestone 41's set gets its own hold sides S*: the combination (16 for the H1, 64 for the G1) with the largest
common leg margin at zero hose force and an exact sensor (the smaller of the two window ends; ties keep the
per-robot side). A pose whose S* margin reaches 0.1/beta plans with the spec's own 0.1 N m leg preload (milestone
45's tier dropped); otherwise it keeps milestone 46's sides and plan. Everything else is milestone 46's object.
A. Sides and margins per pose (and S* at the two H1 poses milestone 38 skipped, a diagnostic). B. Spec stack at
every pose whose sides change. C. Each robot's worst spec stack. D. Each robot's worst residual along the wall.
E. Hypotheses H187-H192.

M47_SMOKE=1 runs a fast code check (numbers not results); M47_PROCS sets the pool (default 4).
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
if _os.environ.get("M47_SMOKE"):
    _os.environ["M46_SMOKE"] = "1"
import importlib.util
import itertools
import json
import os
import platform
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SMOKE = bool(os.environ.get("M47_SMOKE"))
T0 = time.time()
spec = importlib.util.spec_from_file_location("m46", os.path.join(HERE, "..", "m46_holdside", "run.py"))
R46 = importlib.util.module_from_spec(spec)
sys.modules["m46"] = R46
spec.loader.exec_module(R46)                     # milestone 46's object (and so 45's, 44's, ... 38's)
R45, R44, R43 = R46.R45, R46.R44, R46.R43
M1 = R46.M1
GQ0 = R46.GQ0
GOAL = R45.M_SPEC / R45.BETA
SKIPPED = [("h1", 0.4, -0.15), ("h1", 1.6, -0.15)]
SIDE = {}                                        # key -> S* (only where it differs from the per-robot sides)


class PoseSideGQ:
    """``grf_qp`` with the hold sides S* at the pose ``plan`` is running for."""
    def __getattr__(self, a):
        return getattr(GQ0, a)

    def solve(self, c, kind, legs, signs=None, tau_f=0.2, hold_idx=None):
        k = R45.CUR[0]
        if kind == "hold" and k in SIDE:
            signs = SIDE[k]
        return GQ0.solve(c, kind, legs, signs, tau_f, hold_idx)


R46.FLIP[0] = False                              # milestone 46's single flip is replaced by the per-pose rule
M1.GQ = PoseSideGQ()


def margin(key, signs):
    """Smallest common leg margin over the two window ends, zero hose force, exact sensor (None: no plan)."""
    r, names, legs = M1.ROB[key[0]]
    q = M1.POSE[key].qpos
    ts = []
    for F in (M1.F_HI / 2, M1.F_HI):
        cm = M1.contact(r, q, F, M1.TOOL_KG, np.zeros(3))
        fn, _ = GQ0.solve(cm, "hold", legs, signs, M1.TAUF, hold_idx=list(M1.light(key[0])))
        if fn is None:
            return None
        rows, kap, d = M1.PL.margin_rows(cm.tau(fn), legs, M1.TAUF)
        t, _ = M1.PL.margin_lp(cm, rows, kap, d)
        if t is None:
            return None
        ts.append(t)
    return min(ts)


def a1_sides(key):
    """Milestone 46 section A1's rule: the 'torque' side where it agrees at both ends, else the per-robot side."""
    r, names, legs = M1.ROB[key[0]]
    q = M1.POSE[key].qpos
    hold = list(M1.light(key[0]))
    s = np.asarray(M1.SIGNS[key[0]], float).copy()
    ends = []
    for F in (M1.F_HI / 2, M1.F_HI):
        cm = M1.contact(r, q, F, M1.TOOL_KG, np.zeros(3))
        fn, _ = GQ0.solve(cm, "torque", legs)
        if fn is None:
            return s
        ends.append(np.sign(cm.tau(fn)[hold]))
    ag = ends[0] == ends[1]
    s[ag] = ends[0][ag]
    return s


def best_sides(key):
    """(S*, its margin, per-robot margin, combinations with a plan)."""
    s0 = np.asarray(M1.SIGNS[key[0]], float)
    m0 = margin(key, s0)
    best, bm, n_ok = s0, (-np.inf if m0 is None else m0), 0
    for combo in itertools.product((-1.0, 1.0), repeat=len(s0)):
        s = np.array(combo)
        if np.array_equal(s, s0):
            n_ok += m0 is not None
            continue
        m = margin(key, s)
        if m is None:
            continue
        n_ok += 1
        if m > bm + 1e-9:
            best, bm = s, m
    return best, (None if bm == -np.inf else bm), m0, n_ok


def side_task(key):
    s, m, m0, n = best_sides(key)
    sa = a1_sides(key)
    ma = margin(key, sa)
    return key, s, m, m0, n, sa, ma


SET45 = R46.SET45


def set_tier(on):
    SET45(on)
    for k in SIDE:
        R45.TIER.pop(k, None)                    # a pose on S* plans with the spec's own 0.1 N m
    M1.PLANS.clear()


R45.set_tier = set_tier


def stack_task(args):
    set_tier(True)
    return R43.task(args)


if __name__ == "__main__":
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "goal": GOAL}
    procs = int(os.environ.get("M47_PROCS", "4"))
    keys = sorted(M1.KEYS)
    if SMOKE:
        keys = [k for k in keys if k[0] == "h1"][-4:]
    print(f"# Milestone 47: per-pose hold sides S* (largest common leg margin), goal margin {GOAL:.4f} N m")
    with M1.mp.get_context("fork").Pool(procs) as pool:
        resA = pool.map(side_task, keys + SKIPPED, chunksize=1)
    print(f"(section A {time.time() - T0:.0f} s)")
    print("## A. robot | pose | per-robot sides | S* | margin per-robot -> S* (N m) | A1 rule sides, margin | "
          "combinations with a plan")
    out["A"] = []
    fmt = lambda s: "".join("+" if x > 0 else "-" for x in s)  # noqa: E731
    fm = lambda m: "none" if m is None else f"{m:.4f}"  # noqa: E731
    for k, s, m, m0, n, sa, ma in resA:
        s0 = np.asarray(M1.SIGNS[k[0]], float)
        ch = not np.array_equal(s, s0)
        sk = k in SKIPPED
        if ch and not sk and m is not None and m >= GOAL:
            SIDE[k] = s
        print(f"  {k[0]} {list(k[1:])}{' (skipped by m38)' if sk else ''} | {fmt(s0)} | {fmt(s)}{' *' if ch else ''} | "
              f"{fm(m0)} -> {fm(m)} | {fmt(sa)}, {fm(ma)} | {n}")
        out["A"].append({"robot": k[0], "pose": list(k[1:]), "skipped": sk, "signs": [float(x) for x in s0],
                         "sstar": [float(x) for x in s], "m_robot": m0, "m_star": m, "a1": [float(x) for x in sa],
                         "m_a1": ma, "n_ok": n, "changed": ch})
    for n in M1.ROB:
        print(f"  {n}: poses on S* {sum(1 for k in SIDE if k[0] == n)} of {sum(1 for k in keys if k[0] == n)}")
    out["changed"] = [[k[0]] + list(k[1:]) for k in sorted(SIDE)]
    print()

    m43 = json.load(open(os.path.join(HERE, "..", "m43_specstack", "results.json")))
    S43 = {(r["case"], r["robot"], tuple(r["pose"])): r["spec"] for r in m43["rows"] if r["lean"] == "zero"}
    m45 = json.load(open(os.path.join(HERE, "..", "m45_tiered", "results.json")))
    for r in m45["B"]:
        S43[(r["case"], r["robot"], tuple(r["pose"]))] = r["spec"]
    m46 = json.load(open(os.path.join(HERE, "..", "m46_holdside", "results.json")))
    for r in m46["B"]:
        S43[(r["case"], "h1", tuple(m46["pose"][1:]))] = r["spec"]
    jobs = [("zero", c, k) for k in sorted(SIDE) for c in R44.CASES]
    with M1.mp.get_context("fork").Pool(procs) as pool:
        resB = pool.map(stack_task, jobs, chunksize=1)
    print(f"(section B {time.time() - T0:.0f} s)")
    print("## B. Spec stack at the poses on S*: robot | pose | case | S* | squeeze (N) | milestone 46 | change (points)")
    out["B"] = []
    NEW = {}
    for (lean, c, k), r in zip(jobs, resB):
        v, o = r["spec"], S43.get((c, k[0], k[1:]))
        NEW[(c, k)] = v
        out["B"].append({"robot": k[0], "pose": list(k[1:]), "case": c, "spec": v, "squeeze": r.get("squeeze"),
                         "m46": o})
        print(f"  {k[0]} {list(k[1:])} | {c:6s} | " + ("   -  " if v is None else f"{v:.4f}") + " | "
              + ("-" if r.get("squeeze") is None else f"{r['squeeze']:+.2f}") + " | " + fm(o) + " | "
              + ("-" if v is None or o is None else f"{100 * (v - o):+.2f}"))
    print()

    print("## C. Worst spec stack over each robot's poses: robot | case | S* worst | at | poses with a plan | "
          "milestone 46 worst | poses with a plan")
    out["C"] = {}
    for n in M1.ROB:
        for c in R44.CASES:
            new, old = [], []
            for k in keys:
                if k[0] != n:
                    continue
                o = S43.get((c, n, k[1:]))
                v = NEW.get((c, k), o) if k in SIDE else o
                if v is not None:
                    new.append((v, k[1:]))
                if o is not None:
                    old.append((o, k[1:]))
            (v, at), (o, ato) = min(new), min(old)
            out["C"][f"{n} {c}"] = {"new": v, "at": list(at), "n": len(new), "m46": o, "n46": len(old)}
            print(f"  {n} | {c:6s} | {v:.4f} | {list(at)} | {len(new)} | {o:.4f} | {len(old)}")
    print()

    HB = R45.HB
    with M1.mp.get_context("fork").Pool(procs) as pool:
        resD = pool.map(R45.task_D, [(n, H) for n in ("h1", "g1") for H in HB], chunksize=1)
    out["D"] = resD
    m41 = json.load(open(os.path.join(HERE, "..", "m41_stance0", "results.json")))
    W41 = {(x["robot"], x["H"]): x["worst"]["all"]["y"] for x in m41["B"]}
    W46 = {x["H"]: x for x in m46["D"]}
    print("(section D tasks: " + ", ".join(f"{x['robot']} H {x['H']:g} {x['s']:.0f} s" for x in resD) + ")")
    print(f"## D. Worst residual along the wall (mm), 'braked', |e| {R45.B_E} N, S {R45.S_STAR:g} N: robot | H | all "
          "poses (at, phi) | milestone 46 (H1) / 41 (G1) | (1.4, -0.15) | (1.6, 0) | cases at m44's two poses with no "
          "plan (milestone 46)")
    WD = {}
    s14, s16 = str([1.4, -0.15]), str([1.6, 0.0])
    for x in resD:
        a = x["worst"]["all"]
        WD[(x["robot"], x["H"])] = a["y"]
        if x["robot"] == "h1":
            ref = W46[x["H"]]["worst"]["all"]["y"]
            cells = " | ".join("-" if x["worst"].get(s) is None else f"{x['worst'][s]['y']:.3f}" for s in (s14, s16))
            miss = f"{x['miss']} of {x['cases']} ({W46[x['H']]['miss']})"
        else:
            ref = W41[("g1", x["H"])]
            cells, miss = "- | -", "-"
        print(f"  {x['robot']} | {x['H']:5.1f} | {a['y']:.3f} ({a['at']}, phi {a['phi']}) | {ref:.3f} | {cells} | {miss}")
    print()

    print("## E. Hypotheses (registered in LOG.md before this run)")
    E = {}
    sw = [x for x in out["A"] if not x["skipped"]]
    low = [(x["robot"], x["pose"], x["m_star"]) for x in sw if x["m_star"] is None or x["m_star"] < GOAL]
    E["H187"] = not low
    print(f"H187 (every pose's S* margin at least {GOAL:.4f}): smallest "
          f"{min(x['m_star'] for x in sw if x['m_star'] is not None):.4f}, below: {low} -> "
          f"{'held' if E['H187'] else 'refuted'}")
    sk = [x for x in out["A"] if x["skipped"]]
    E["H188"] = all(x["m_star"] is not None and x["m_star"] >= GOAL for x in sk)
    print("H188 (both skipped H1 poses have S* margin at least the goal): "
          + ", ".join(f"{x['pose']} {fm(x['m_star'])}" for x in sk) + f" -> {'held' if E['H188'] else 'refuted'}")
    v = [WD.get(("h1", H)) for H in HB]
    lim = [W46[H]["worst"]["all"]["y"] + 0.005 for H in HB]
    E["H189"] = all(a is not None and a <= b + 1e-9 for a, b in zip(v, lim))
    print("H189 (H1 worst at most milestone 46's + 0.005 mm): " + ", ".join(f"{a:.3f} (<= {b:.3f})" for a, b in zip(v, lim))
          + f" -> {'held' if E['H189'] else 'refuted'}")
    v = [WD.get(("g1", H)) for H in HB]
    lim = [W41[("g1", H)] + 0.005 for H in HB]
    E["H190"] = all(a is not None and a <= b + 1e-9 for a, b in zip(v, lim))
    print("H190 (G1 worst at most milestone 41's + 0.005 mm): " + ", ".join(f"{a:.3f} (<= {b:.3f})" for a, b in zip(v, lim))
          + f" -> {'held' if E['H190'] else 'refuted'}")
    cb = {n: out["C"][f"{n} braked"] for n in M1.ROB}
    E["H191"] = all(x["new"] >= x["m46"] - 0.001 - 1e-9 for x in cb.values())
    print("H191 ('braked' worst stack at least milestone 46's minus 0.1 points): "
          + ", ".join(f"{n} {x['new']:.4f} ({x['m46']:.4f})" for n, x in cb.items())
          + f" -> {'held' if E['H191'] else 'refuted'}")
    miss = sum(x["miss"] for x in resD if x["robot"] == "h1")
    E["H192"] = miss <= 23
    print(f"H192 (H1 cases at m44's two poses with no plan at most milestone 46's 23): {miss} of "
          f"{sum(x['cases'] for x in resD if x['robot'] == 'h1')} -> {'held' if E['H192'] else 'refuted'}")
    out["E"] = E
    if not SMOKE:
        json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")
