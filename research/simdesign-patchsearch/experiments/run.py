"""Does the patch stress measure change the mass price of manufacturability of the L-bracket?

For each process and its no-process-rules twin, find the minimum-mass bracket under three settings:
  A  peak element stress, search mesh h=2.5 mm   (the simdesign-dfm / simdesign-meshmargin setting)
  P  patch stress (rho=3 mm), search mesh h=2.5 mm, same numeric limit
  Q  patch stress (rho=3 mm), search mesh h=1.5 mm, same numeric limit
Every chosen design is re-solved at the check mesh h=0.55 mm and BOTH measures are reported against the limit.
Writes results.json and results.txt.
"""
import json, os, sys, time
from multiprocessing import Pool
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_patchsearch import PROCESSES, FREE, optimise, evaluate

OUT = os.path.dirname(os.path.abspath(__file__))
SEEDS = (0, 1, 2)
CHECK_H = 0.55
FREE_OF = {"FDM": "plastic", "CNC routing": "aluminium plate", "laser cutting": "steel sheet", "casting": "cast aluminium"}
SETTINGS = {"A": ("peak", 2.5), "P": ("patch", 2.5), "Q": ("patch", 1.5)}


def task(t):
    setting, name, kind, seed = t
    measure, h = SETTINGS[setting]
    base = PROCESSES[name] if kind == "rules" else FREE[FREE_OF[name]]
    t0 = time.time()
    r = optimise(base, seed=seed, h=h, measure=measure)
    out = {"setting": setting, "process": name, "kind": kind, "seed": seed, "feasible": r["feasible"], "n_fe": r["n_fe"]}
    if r["feasible"]:
        p = r["params"]
        chk = evaluate(base, p, h=CHECK_H)["fe"]
        out |= {"w": p.w, "r": p.r, "b": p.b, "mass_g": r["mass_g"], "limit": base.material.sigma_allow,
                "peak_check": chk["peak_mpa"], "patch_check": chk["patch_mpa"], "tip_check": chk["tip_deflection_mm"]}
    out["wall_s"] = time.time() - t0
    return out


def main():
    tasks = [(s, n, k, sd) for s in SETTINGS for n in PROCESSES for k in ("rules", "free") for sd in SEEDS]
    with Pool(4) as pool:
        res = pool.map(task, tasks, chunksize=1)
    json.dump(res, open(os.path.join(OUT, "results.json"), "w"), indent=1)
    lines = [f"check mesh h={CHECK_H} mm; seeds {SEEDS}; units mm, g, MPa; ratios are check-mesh stress / limit",
             "setting process | best mass rules (g) | best mass free (g) | price (best/best) | price per seed | peak ratio (rules design) | patch ratio (rules design) | rules masses by seed"]
    for s in SETTINGS:
        for n in PROCESSES:
            sel = lambda k: sorted([r for r in res if r["setting"] == s and r["process"] == n and r["kind"] == k and r["feasible"]], key=lambda r: r["seed"])
            a, f = sel("rules"), sel("free")
            if not a or not f:
                lines.append(f"{s} {n} | infeasible"); continue
            ba, bf = min(a, key=lambda r: r["mass_g"]), min(f, key=lambda r: r["mass_g"])
            per = [ra["mass_g"] / rf["mass_g"] for ra in a for rf in f if ra["seed"] == rf["seed"]]
            lines.append(f"{s} {n} | {ba['mass_g']:.2f} | {bf['mass_g']:.2f} | {ba['mass_g']/bf['mass_g']:.3f} | "
                         + " ".join(f"{x:.3f}" for x in per)
                         + f" | {ba['peak_check']/ba['limit']:.2f} | {ba['patch_check']/ba['limit']:.2f} | "
                         + ", ".join(f"{r['mass_g']:.2f}" for r in a))
    lines.append(f"total wall time of tasks (s): {sum(r['wall_s'] for r in res):.0f}")
    open(os.path.join(OUT, "results.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
