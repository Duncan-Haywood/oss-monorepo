"""Posture search for the G1 hold poses of buildbot-payload / buildbot-holdheat. Deterministic, a few minutes."""
import json
import multiprocessing as mp
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = HERE.parents[1]
sys.path.insert(0, str(R / "buildbot-payload" / "src"))
sys.path.insert(0, str(R / "buildbot-holdheat" / "src"))
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(R / "buildbot-payload" / "experiments"))
from buildbot_payload import fetch, model as M  # noqa: E402
from buildbot_holdheat import hold_time  # noqa: E402
from buildbot_holdpose import TOE_EDGE, cop_x, search  # noqa: E402
import run as P  # noqa: E402  (buildbot-payload's task list)

RHO = [0.25, 0.33, 0.4, 0.5, 0.6]
SEEDS = [0, 1, 2]
DX = 0.06          # CoP 3 cm inside the toe edge
STUD = (0.3, 0.6)


_G = {}


def _job(args):
    """One search; the robot is loaded once per worker process."""
    key, xz, kg, dx, seed = args
    if "r" not in _G:
        _G["r"] = M.load("g1")
        _G["d0"] = M.standing(_G["r"])
    b = search(_G["r"], _G["d0"], xz, kg, dx, seed=seed)
    return key, {"u": b["u"], "joint": b["joint"], "u_default": b["u_default"], "joint_default": b["joint_default"]}


def best(res, key):
    rs = res[key]
    b = min(rs, key=lambda x: x["u"])
    return b, [x["u"] for x in rs]


def h(u):
    return {str(rho): (None if hold_time(u, rho) == float("inf") else hold_time(u, rho)) for rho in RHO}


def fmt(hd):
    return "  ".join(f"{k}:{'inf' if v is None else format(v, '.2f')}" for k, v in hd.items())


def sustain(sw):
    """Heaviest swept load whose searched u_max is at most rho. The search is noisy (u is not monotone in the
    load across the sweep), so no interpolation: a swept value, or None when even empty hands exceed rho."""
    print("D. Sustainable load at the stud carry pose: the heaviest swept load with searched u_max <= rho; kg")
    out = {}
    for rho in RHO:
        ok = [r["kg"] for r in sw if r["u_search"] <= rho]
        out[str(rho)] = max(ok) if ok else None
        print(f"   rho {rho}: {'none (the empty-handed searched pose is already above it)' if not ok else str(out[str(rho)]) + (' (top of the sweep)' if out[str(rho)] == sw[-1]['kg'] else '')}")
    return out


def main():
    fetch.model_path("g1")
    jobs = []
    for dx in [0.0, 0.03, 0.06, 0.09]:
        jobs += [(("cop", dx), STUD, 3.8, dx, sd) for sd in SEEDS]
    tasks = [t for t in P.TASKS if t[0].split()[0] in ("carry", "hold", "set") and "normal" not in t[0] and "bag" not in t[0] and "ceiling" not in t[0]]
    tasks = [t for t in tasks if "stud" not in t[0]]
    for task, (lo, hi), z, x, src in tasks:
        jobs += [(("task", task), (x, z), hi, DX, sd) for sd in SEEDS]
    MASSES = [0, 1, 2, 3, 4.5, 6, 8, 10]
    for kg in MASSES:
        jobs += [(("kg", kg), STUD, kg, DX, sd) for sd in SEEDS]
    with mp.Pool(4) as pool:
        done = pool.map(_job, jobs, chunksize=1)
    res = {}
    for key, v in done:
        res.setdefault(key, []).append(v)
    out = {"menagerie_commit": fetch.COMMIT, "rho": RHO, "seeds": SEEDS, "dx": DX, "toe_edge": TOE_EDGE}
    print("buildbot-holdpose: searched arm and waist posture for the G1 hold poses, joint torque as a fraction u of peak")
    print(f"Menagerie {fetch.COMMIT[:12]}; 60 random restarts + 160 evolution-strategy steps per search, seeds {SEEDS}, best kept; "
          f"foot toe edge {TOE_EDGE} m ahead of the sole point")
    print()
    print("A. CoP position at the stud carry pose (3.8 kg, z 0.6, x 0.3): default balanced pose against the searched posture")
    out["cop"] = []
    for dx in [0.0, 0.03, 0.06, 0.09]:
        b, us = best(res, ("cop", dx))
        out["cop"].append({"dx": dx, "u_default": b["u_default"], "joint_default": b["joint_default"], "u_search": b["u"],
                           "joint_search": b["joint"], "seed_u": us})
        print(f"   CoP {dx:.2f} m ahead of the sole point ({TOE_EDGE - dx:.2f} m from the toe edge): default {b['u_default']:.3f} ({b['joint_default']}); "
              f"searched {b['u']:.3f} ({b['joint']}); per seed {', '.join(f'{u:.3f}' for u in us)}")
    print()
    print(f"B. Other tasks at CoP {DX} m, loaded at the top of the mass range: u_max default -> searched, hold/tau by rho")
    out["tasks"] = []
    for task, (lo, hi), z, x, src in tasks:
        b, us = best(res, ("task", task))
        row = {"task": task, "kg": hi, "z": z, "x": x, "u_default": b["u_default"], "u_search": b["u"], "joint_search": b["joint"],
               "seed_u": us, "hold_default": h(b["u_default"]), "hold_search": h(b["u"])}
        out["tasks"].append(row)
        print(f"   {task}: {hi:.1f} kg z {z} x {x}: {b['u_default']:.2f} -> {b['u']:.2f} ({b['joint']}); per seed {', '.join(f'{u:.2f}' for u in us)}; "
              f"hold/tau default {fmt(row['hold_default'])} | searched {fmt(row['hold_search'])}")
    print()
    print(f"C. Load sweep at the stud carry pose, CoP {DX} m: kg, u_max default -> searched, binding joint, hold/tau (searched)")
    out["sweep"] = []
    for kg in MASSES:
        b, us = best(res, ("kg", kg))
        out["sweep"].append({"kg": kg, "u_default": b["u_default"], "u_search": b["u"], "joint": b["joint"], "seed_u": us, "hold": h(b["u"])})
        print(f"   {kg:>4} kg  {b['u_default']:.2f} -> {b['u']:.2f} ({b['joint']})  {fmt(h(b['u']))}")
    print()
    out["sustain"] = sustain(out["sweep"])
    (HERE / "results.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    if "--report" in sys.argv:  # re-print section D from results.json without the search
        d = json.loads((HERE / "results.json").read_text())
        d["sustain"] = sustain(d["sweep"])
        (HERE / "results.json").write_text(json.dumps(d, indent=1))
    else:
        main()
