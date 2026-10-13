"""Is the shrinking laser-cutting price scatter under the patch stress due to the near-sharp fillet?

Laser cutting (steel sheet) only. The inner-fillet floor r_min is varied: 0.2 mm (the simdesign-dfm value),
1.0 mm and 3.175 mm (the CNC tool radius). For each floor and each stress measure (peak, patch rho=3 mm; search mesh
h=2.5 mm, same numeric limit) the minimum-mass bracket is searched with 5 seeds, together with the no-rules steel-sheet
twin under the same measure. Price per seed = rules mass / free mass for the same seed.
Every design is re-solved at the check mesh h=0.55 mm. Writes results.json and results.txt.
"""
import json, os, sys, time
from dataclasses import replace
from multiprocessing import Pool
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_filletfloor import PROCESSES, FREE, optimise, evaluate

OUT = os.path.dirname(os.path.abspath(__file__))
SEEDS = (0, 1, 2, 3, 4)
CHECK_H = 0.55
FLOORS = (0.2, 1.0, 3.175)
MEASURES = ("peak", "patch")


def task(t):
    measure, floor, seed = t
    base = FREE["steel sheet"] if floor is None else replace(PROCESSES["laser cutting"], r_min=floor)
    t0 = time.time()
    r = optimise(base, seed=seed, h=2.5, measure=measure)
    out = {"measure": measure, "floor": floor, "seed": seed, "feasible": r["feasible"], "n_fe": r["n_fe"]}
    if r["feasible"]:
        p = r["params"]
        chk = evaluate(base, p, h=CHECK_H)["fe"]
        out |= {"w": p.w, "r": p.r, "b": p.b, "mass_g": r["mass_g"], "limit": base.material.sigma_allow,
                "peak_check": chk["peak_mpa"], "patch_check": chk["patch_mpa"]}
    out["wall_s"] = time.time() - t0
    return out


def summarise(res):
    import statistics as st
    lines = [f"laser cutting, check mesh h={CHECK_H} mm; seeds {SEEDS}; mm, g, MPa",
             "measure floor | prices by seed | mean | sd | range | rules masses by seed | free masses by seed | fillet r of rules designs (mm)"]
    for m in MEASURES:
        free = {r["seed"]: r for r in res if r["measure"] == m and r["floor"] is None and r["feasible"]}
        for fl in FLOORS:
            ru = {r["seed"]: r for r in res if r["measure"] == m and r["floor"] == fl and r["feasible"]}
            ss = sorted(set(ru) & set(free))
            pr = [ru[s]["mass_g"] / free[s]["mass_g"] for s in ss]
            if len(pr) < 2:
                lines.append(f"{m} {fl} | too few feasible"); continue
            lines.append(f"{m} {fl} | " + " ".join(f"{x:.3f}" for x in pr)
                         + f" | {st.mean(pr):.3f} | {st.stdev(pr):.3f} | {max(pr)-min(pr):.3f} | "
                         + ", ".join(f"{ru[s]['mass_g']:.2f}" for s in ss) + " | "
                         + ", ".join(f"{free[s]['mass_g']:.2f}" for s in ss) + " | "
                         + ", ".join(f"{ru[s]['r']:.2f}" for s in ss))
        lines.append(f"{m} free twin fillet r by seed: " + ", ".join(f"{free[s]['r']:.2f}" for s in sorted(free)))
    lines.append(f"total wall time of tasks (s): {sum(r['wall_s'] for r in res):.0f}")
    return lines


def main():
    tasks = [(m, fl, sd) for m in MEASURES for fl in (*FLOORS, None) for sd in SEEDS]
    with Pool(4) as pool:
        res = pool.map(task, tasks, chunksize=1)
    json.dump(res, open(os.path.join(OUT, "results.json"), "w"), indent=1)
    lines = summarise(res)
    open(os.path.join(OUT, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
