"""Mesh-aware stress margin vs the mass price of manufacturability.

For each process and its no-process-rules twin, find the minimum-mass bracket under three search settings:
  A  search mesh h=2.5 mm, stress limit as is (the setting of simdesign-dfm)
  B  search mesh h=2.5 mm, stress limit divided by MARGIN (a knock-down for the coarse mesh)
  C  search mesh h=1.5 mm, stress limit as is
Every chosen design is re-solved at the check mesh h=0.7 mm and its stress compared with the limit.
Writes results.json and results.txt. About 20 minutes on 4 cores.
"""
import json, os, sys, time
from dataclasses import replace
from multiprocessing import Pool
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_meshmargin import PROCESSES, FREE, optimise, evaluate

OUT = os.path.dirname(os.path.abspath(__file__))
SEEDS = (0, 1)
MARGIN = 1.3
CHECK_H = 0.7
FREE_OF = {"FDM": "plastic", "CNC routing": "aluminium plate", "laser cutting": "steel sheet", "casting": "cast aluminium"}
SETTINGS = {"A": (2.5, 1.0), "B": (2.5, MARGIN), "C": (1.5, 1.0)}


def with_margin(proc, margin):
    m = proc.material
    return replace(proc, material=replace(m, sigma_allow=m.sigma_allow / margin))


def task(t):
    setting, name, kind, seed = t
    h, margin = SETTINGS[setting]
    base = PROCESSES[name] if kind == "rules" else FREE[FREE_OF[name]]
    proc = with_margin(base, margin)
    t0 = time.time()
    r = optimise(proc, seed=seed, h=h)
    out = {"setting": setting, "process": name, "kind": kind, "seed": seed, "feasible": r["feasible"], "n_fe": r["n_fe"]}
    if r["feasible"]:
        p = r["params"]
        chk = evaluate(base, p, h=CHECK_H)["fe"]  # check against the ORIGINAL limit
        out |= {"w": p.w, "r": p.r, "b": p.b, "mass_g": r["mass_g"], "stress_search": r["stress_mpa"],
                "stress_check": chk["max_vm_mpa"], "limit": base.material.sigma_allow,
                "tip_check": chk["tip_deflection_mm"]}
    out["wall_s"] = time.time() - t0
    return out


def main():
    tasks = [(s, n, k, sd) for s in SETTINGS for n in PROCESSES for k in ("rules", "free") for sd in SEEDS]
    with Pool(4) as pool:
        res = pool.map(task, tasks, chunksize=1)
    json.dump(res, open(os.path.join(OUT, "results.json"), "w"), indent=1)
    lines = [f"margin={MARGIN} check mesh h={CHECK_H} mm; seeds {SEEDS}; units mm, g, MPa",
             "setting process | best mass rules (g) | best mass free (g) | price | check stress / limit (rules design) | check stress / limit (free design) | seeds' rules mass"]
    for s in SETTINGS:
        for n in PROCESSES:
            sel = lambda k: [r for r in res if r["setting"] == s and r["process"] == n and r["kind"] == k and r["feasible"]]
            a, f = sel("rules"), sel("free")
            if not a or not f:
                lines.append(f"{s} {n} | infeasible"); continue
            ba, bf = min(a, key=lambda r: r["mass_g"]), min(f, key=lambda r: r["mass_g"])
            lines.append(f"{s} {n} | {ba['mass_g']:.2f} | {bf['mass_g']:.2f} | {ba['mass_g']/bf['mass_g']:.3f} | "
                         f"{ba['stress_check']/ba['limit']:.2f} | {bf['stress_check']/bf['limit']:.2f} | "
                         + ", ".join(f"{r['mass_g']:.2f}" for r in a))
    lines.append(f"total wall time of tasks (s): {sum(r['wall_s'] for r in res):.0f}")
    open(os.path.join(OUT, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
