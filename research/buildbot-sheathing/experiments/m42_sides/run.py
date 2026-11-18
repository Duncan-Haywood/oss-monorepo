"""Milestone 42: is the G1's 1.3-point stack loss in milestone 41 the zero-press lean or the controller's new sides?

Milestone 41 re-leaned 12 poses so they stand at zero press and rebuilt milestone 38's setup on the new pose set.
Two things changed at once: the poses' leans and, for the G1, the 'hold-min' controller's chosen sides
(``choose_signs`` picks them by the worst LP margin over the whole pose set). Here milestone 41's run is imported
(so both setups, M0 on milestone 32's leans and M1 on the re-leans, are the same objects it built) and the no-hose
clean-sheet stack ('braked' waist, as milestone 41 section C) is computed in a 2 x 2:
leans {milestone 32's, re-leaned} x sides {milestone 38's, milestone 41's}. The two crossed cells re-run milestone
38's ``torques`` with the other setup's sides. A. Which sides flipped. B. Per pose, the four cells. C. Worst pose
and the split into lean, sides and interaction. D. Hypotheses H161-H164 (registered in LOG.md before the run).

M42_SMOKE=1 runs a fast code check (numbers not results); M42_PROCS sets the pool (default 4).
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import importlib.util
import json
import os
import platform
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SMOKE = bool(os.environ.get("M42_SMOKE"))
if SMOKE:
    os.environ["M41_SMOKE"] = "1"
T0 = time.time()
spec = importlib.util.spec_from_file_location("m41", os.path.join(HERE, "..", "m41_stance0", "run.py"))
A = importlib.util.module_from_spec(spec)
sys.modules["m41"] = A
spec.loader.exec_module(A)                       # builds M0 (milestone 32's leans); its __main__ block does not run
M0 = A.M0
A.part_A()                                       # fills A.LEAN with the re-leaned poses, as milestone 41 did
print("(milestone 38's setup, imported again on the re-leaned poses:)")
M1 = A.load("m38z", A.releaned)
print()
from buildbot_sheathing import waist as WA  # noqa: E402

LEANS = {"m32": M0, "zero": M1}
SIDES = {"m38": M0.SIGNS, "m41": M1.SIGNS}
CELLS = [(l, s) for l in LEANS for s in SIDES]
WORST_POSE = (1.2, 0.0)                          # the G1's worst pose in milestones 40 and 41


def gaps(M, n):
    names = M.ROB[n][1]
    wi = [j for j in range(len(names)) if M.kind(n, j) == "waist"]
    return WA.case_gaps(names, wi, M.GAP * M.AM, "braked")


def task(args):
    """No-hose stack at one pose in one cell, or None if 'hold-min' has no solution with those sides."""
    lean, side, key = args
    M = LEANS[lean]
    n = key[0]
    t = M.torques(n, key, SIDES[side][n])
    if t is None:
        return {"lean": lean, "sides": side, "robot": n, "pose": list(key[1:]), "stack": None}
    gapr = gaps(M, n)
    held = M.B.held(t[0], t[1], M.TAUF)
    jp, jr = M.POSE[key].rows[:2]
    v = M.stack(M.B.from_rows(jp, jr, M.B.joint_sigmas(M.T.quant_sigma(12), gapr, ~held), M.L0))
    return {"lean": lean, "sides": side, "robot": n, "pose": list(key[1:]), "stack": float(v),
            "n_held": int(np.sum(held))}


if __name__ == "__main__":
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M0.mujoco.__version__}, "worst_pose": list(WORST_POSE)}
    print("# Milestone 42: the zero-press lean or the controller's sides?")
    print("## A. 'hold-min' sides (light leg joints): robot | joint | milestone 38 | milestone 41")
    flips = {}
    for n in ("g1", "h1"):
        names = M0.ROB[n][1]
        flips[n] = []
        for k, j in enumerate(M0.light(n)):
            a, b = M0.SIGNS[n][k], M1.SIGNS[n][k]
            mark = "  <- flipped" if a != b else ""
            if a != b:
                flips[n].append(names[j])
            print(f"  {n} {names[j]:28s} {a:+.0f} {b:+.0f}{mark}")
    out["flipped"] = flips
    print()

    jobs = []
    for lean, M in LEANS.items():
        for side in SIDES:
            for key in sorted(M.POSE):
                if SMOKE and key[0] == "h1":
                    continue
                if SMOKE and key not in M.KEYS:
                    continue
                jobs.append((lean, side, key))
    procs = int(os.environ.get("M42_PROCS", "4"))
    with M1.mp.get_context("fork").Pool(procs) as pool:
        res = pool.map(task, jobs, chunksize=1)
    out["cells"] = res
    S = {(r["lean"], r["sides"], r["robot"], tuple(r["pose"])): r["stack"] for r in res}

    print("## B. No-hose clean-sheet stack, 'braked': robot | pose | m32 lean + m38 sides (milestone 40) | "
          "zero lean + m38 sides | m32 lean + m41 sides | zero lean + m41 sides (milestone 41) | re-leaned")
    f = lambda v: "   -  " if v is None else f"{v:.4f}"  # noqa: E731
    for n in ("g1", "h1"):
        for key in sorted({k[2:] for k in S if k[2] == n}):
            p = key[1]
            row = [S.get((l, s, n, p)) for l, s in (("m32", "m38"), ("zero", "m38"), ("m32", "m41"), ("zero", "m41"))]
            print(f"  {n} {list(p)} | " + " | ".join(f(v) for v in row) + (" | yes" if (n,) + p in A.LEAN else ""))
    print()

    print("## C. Worst pose over the set, and the split at the G1's worst pose (points of clean sheets)")
    W = {}
    ROBOTS = ("g1",) if SMOKE else ("g1", "h1")
    for n in ROBOTS:
        for l, s in CELLS:
            vals = [(v, k[3]) for k, v in S.items() if k[:3] == (l, s, n) and v is not None]
            nnone = sum(1 for k, v in S.items() if k[:3] == (l, s, n) and v is None)
            v, at = min(vals)
            W[(n, l, s)] = v
            print(f"  {n} lean {l:4s} sides {s}: worst {v:.4f} at {list(at)}; poses {len(vals)}"
                  + (f" ({nnone} with no 'hold-min' solution)" if nnone else ""))
    out["worst"] = [{"robot": k[0], "lean": k[1], "sides": k[2], "stack": v} for k, v in W.items()]
    split = {}
    for n in ROBOTS:
        p = WORST_POSE
        oo, zo, on, zn = (S.get((l, s, n, p)) for l, s in (("m32", "m38"), ("zero", "m38"), ("m32", "m41"),
                                                            ("zero", "m41")))
        if None in (oo, zo, on, zn):
            print(f"  {n} {list(p)}: a cell has no solution, no split")
            continue
        both, lean, side = 100 * (oo - zn), 100 * (oo - zo), 100 * (oo - on)
        split[n] = {"both": both, "lean": lean, "sides": side, "interaction": both - lean - side}
        print(f"  {n} at {list(p)}: loss both {both:+.2f} = lean {lean:+.2f} + sides {side:+.2f} "
              f"+ interaction {both - lean - side:+.2f}")
        wl = 100 * (W[(n, 'm32', 'm38')] - W[(n, 'zero', 'm38')])
        ws = 100 * (W[(n, 'm32', 'm38')] - W[(n, 'm32', 'm41')])
        wb = 100 * (W[(n, 'm32', 'm38')] - W[(n, 'zero', 'm41')])
        split[n].update({"worst_lean": wl, "worst_sides": ws, "worst_both": wb})
        print(f"  {n} worst over the set: loss both {wb:+.2f}, lean only {wl:+.2f}, sides only {ws:+.2f}")
    out["split"] = split
    m41 = json.load(open(os.path.join(HERE, "..", "m41_stance0", "results.json")))
    for n in ROBOTS:
        old = {tuple(r["pose"]): r["stack"] for r in m41["C"] if r["robot"] == n}
        d = max(abs(S[("zero", "m41", n, k)] - v) for k, v in old.items() if S.get(("zero", "m41", n, k)) is not None)
        print(f"check: zero lean + milestone 41 sides reproduce milestone 41's {n} stacks to {d:.1e} (expect 0)")
        out.setdefault("check_m41", {})[n] = d
    m40 = json.load(open(os.path.join(HERE, "..", "m40_liftoff", "results.json")))
    for n in ROBOTS:
        old = {tuple(r["pose"]): r["uniform"] for r in m40["D"] if r["case"] == "braked" and r["robot"] == n}
        d = max(abs(S[("m32", "m38", n, k)] - v) for k, v in old.items() if S.get(("m32", "m38", n, k)) is not None)
        print(f"check: m32 lean + milestone 38 sides reproduce milestone 40's {n} stacks to {d:.1e} (expect 0)")
        out.setdefault("check_m40", {})[n] = d
    print()

    print("## D. Hypotheses (registered in LOG.md before this run)")
    E = {}
    g = split.get("g1", {})
    E["H161"] = g.get("lean", -1) >= 0.65
    print(f"H161 (old sides kept: the re-lean alone costs the G1's worst pose at least 0.65 points): "
          f"{g.get('lean', float('nan')):+.2f} -> {'held' if E['H161'] else 'refuted'}")
    E["H162"] = abs(g.get("worst_sides", 99)) <= 0.5
    print(f"H162 (milestone 32's leans: the new sides move the G1's worst-pose stack by at most 0.5 points): "
          f"{g.get('worst_sides', float('nan')):+.2f} -> {'held' if E['H162'] else 'refuted'}")
    E["H163"] = abs(g.get("interaction", 99)) <= 0.3
    print(f"H163 (|interaction| at the G1's worst pose at most 0.3 points): {g.get('interaction', float('nan')):+.2f}"
          f" -> {'held' if E['H163'] else 'refuted'}")
    lost = [list(k[3]) for k, v in S.items() if k[:3] == ("zero", "m38", "g1") and v is None and k[3:] and
            ("g1",) + k[3] in A.LEAN]
    E["H164"] = not lost
    print(f"H164 (milestone 38's G1 sides keep a 'hold-min' solution at all six re-leaned G1 poses): "
          + (f"lost at {lost}" if lost else "all six") + f" -> {'held' if E['H164'] else 'refuted'}")
    out["E"] = E
    if not SMOKE:
        json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M0.mujoco.__version__})")
