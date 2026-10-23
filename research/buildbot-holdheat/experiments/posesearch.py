"""Pose search for the lowest waist fraction while holding the 3.8 kg stud. Deterministic grid."""
import itertools
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "buildbot-payload" / "src"))
sys.path.insert(0, str(HERE.parent / "src"))
import mujoco  # noqa: E402
import numpy as np  # noqa: E402
from buildbot_payload import fetch, model as M  # noqa: E402
from buildbot_holdheat import hold_time  # noqa: E402

KG = 3.8
X = [0.15, 0.2, 0.25, 0.3, 0.35]       # hands ahead of the feet centre (m)
Z = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9]     # hand height (m)
DX = [-0.02, 0.0, 0.02, 0.04, 0.06]    # balanced CoM ahead of the feet centre (m)
RHO = [0.4, 0.5, 0.6]


def collisions(m, qpos):
    """Pairs of bodies whose collision geoms interpenetrate by more than 5 mm (MuJoCo skips parent-child pairs)."""
    d = mujoco.MjData(m)
    d.qpos[:] = qpos
    mujoco.mj_forward(m, d)
    out = set()
    for c in d.contact[: d.ncon]:
        if c.dist < -0.005:
            b = sorted(mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_BODY, m.geom_bodyid[g]) for g in c.geom)
            if not any("ankle" in n or "foot" in n for n in b) or b[0] != b[1]:
                out.add(tuple(b))
    return sorted(out)


def main():
    fetch.model_path("g1")
    r = M.load("g1")
    d0 = M.standing(r)
    r.half_width = 0.03  # positive control: hands almost touching must register collisions
    ctl = collisions(r.model, M.pose(r, d0, (0.1, 0.7), KG).qpos)
    r.half_width = 0.18
    print(f"collision check control (hands 0.06 m apart, x 0.1, z 0.7): {len(ctl)} body pairs flagged, e.g. {ctl[:2]}")
    rows = []
    for x, z, dx in itertools.product(X, Z, DX):
        p = M.pose(r, d0, (x, z), KG, com_dx=dx)
        if not p.ok:
            continue
        s = M.torques(r, p.qpos, KG)
        s0 = M.torques(r, p.qpos, 0.0)
        hit = collisions(r.model, p.qpos)
        rows.append({"hit": [" / ".join(h) for h in hit], "x": x, "z": z, "com_dx": dx, "umax": float(s.ratio.max()), "joint": s.worst,
                     "umax_empty": float(s0.ratio.max()), "foot_fz_min": float(min(s.foot_fz))})
    rows = [w for w in rows if w["foot_fz_min"] > 0]
    n_hit = sum(1 for w in rows if w["hit"])
    free = [w for w in rows if not w["hit"]]
    print(f"{n_hit} of {len(rows)} poses have a self-collision deeper than 5 mm; the tables below use only the other {len(free)}")
    for w in sorted((w for w in rows if w["hit"]), key=lambda w: w["umax"])[:3]:
        print(f"   dropped e.g. x {w['x']} z {w['z']} com_dx {w['com_dx']:+.2f} u_max {w['umax']:.3f}: {w['hit'][:2]}")
    rows = free
    rows.sort(key=lambda w: w["umax"])
    base = next((w for w in rows if (w["x"], w["z"], w["com_dx"]) == (0.3, 0.6, 0.0)), None)
    print(f"buildbot-holdheat pose search: {KG} kg stud, {len(X)*len(Z)*len(DX)} grid poses, {len(rows)} reachable with both feet loaded")
    print("baseline (x 0.3, z 0.6, com_dx 0): " + (f"u_max {base['umax']:.3f} ({base['joint']})" if base else "not reachable"))
    print("best 8: x, z, com_dx, u_max, joint, u_max empty")
    for w in rows[:8]:
        print(f"   {w['x']:.2f} {w['z']:.1f} {w['com_dx']:+.2f}  {w['umax']:.3f} {w['joint']}  {w['umax_empty']:.3f}")
    print("best by com_dx (min u_max over x, z):")
    for dx in DX:
        sub = [w for w in rows if w["com_dx"] == dx]
        if sub:
            w = sub[0]
            print(f"   com_dx {dx:+.2f}: {w['umax']:.3f} at x {w['x']} z {w['z']} ({w['joint']})")
    print("best by z (min u_max over x, com_dx):")
    for z in Z:
        sub = [w for w in rows if w["z"] == z]
        if sub:
            w = sub[0]
            print(f"   z {z}: {w['umax']:.3f} at x {w['x']} com_dx {w['com_dx']:+.2f} ({w['joint']})")
    best = rows[0]
    print("hold time in thermal time constants, baseline vs best:")
    for rho in RHO:
        def f(u):
            t = hold_time(u, rho)
            return "inf" if t == float("inf") else f"{t:.2f}"
        print(f"   rho {rho}: baseline {f(base['umax']) if base else 'n/a'}, best {f(best['umax'])}")
    (HERE / "posesearch.json").write_text(json.dumps({"kg": KG, "baseline": base, "rows": rows}, indent=1))


if __name__ == "__main__":
    main()
