"""Price of manufacturability: minimum-mass bracket under each process's rules vs the same material with no process rules.

Writes results.txt, results.json, profiles.png, bracket_fdm.stl and one DXF per cut process. About 15 minutes on 4 cores.
"""
import json, os, sys, time
from dataclasses import replace
from multiprocessing import Pool
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from simdesign_dfm import (PROCESSES, FREE, optimise, evaluate, build_polygon, analysis_params, write_dxf,
                           write_extruded_stl, Params)

OUT = os.path.dirname(os.path.abspath(__file__))
SEEDS = (0, 1, 2)
FREE_OF = {"FDM": "plastic", "CNC routing": "aluminium plate", "laser cutting": "steel sheet", "casting": "cast aluminium"}
CNC_RADII = (0.5, 1.5, 3.175, 5.0, 7.0, 9.0)
DRAFTS = (0.0, 1.5, 3.0, 5.0, 10.0)
RATIOS = (2.0, 3.0, 5.0, 0.0)  # 0 = rule off


def task(t):
    kind, key, seed, proc = t
    t0 = time.time()
    r = optimise(proc, seed=seed)
    r["wall_s"] = time.time() - t0
    return kind, key, seed, r


def fine(proc, p, h):
    e = evaluate(proc, p, h=h)
    return e["fe"]["max_vm_mpa"], e["fe"]["tip_deflection_mm"]


def pack(r):
    if not r["feasible"]:
        return {"feasible": False}
    p = r["params"]
    return {"feasible": True, "w": p.w, "r": p.r, "b": p.b, "mass_g": r["mass_g"], "stress_mpa": r["stress_mpa"],
            "tip_mm": r["tip_mm"], "n_fe": r["n_fe"]}


def main():
    tasks = []
    for name, proc in PROCESSES.items():
        for s in SEEDS:
            tasks.append(("main", name, s, proc))
            tasks.append(("free", name, s, FREE[FREE_OF[name]]))
    cnc = PROCESSES["CNC routing"]
    for rr in CNC_RADII:
        tasks.append(("cnc_radius", rr, 0, replace(cnc, r_min=rr)))
    cast = PROCESSES["casting"]
    for d in DRAFTS:
        tasks.append(("draft", d, 0, replace(cast, draft_deg=d)))
    for q in RATIOS:
        tasks.append(("ratio", q, 0, replace(cast, wall_ratio_max=q)))
    with Pool(4) as pool:
        res = pool.map(task, tasks, chunksize=1)
    R = {"main": {}, "free": {}, "cnc_radius": {}, "draft": {}, "ratio": {}}
    for kind, key, seed, r in res:
        R[kind].setdefault(str(key), []).append(pack(r) | {"seed": seed})

    def best(lst):
        ok = [x for x in lst if x["feasible"]]
        return min(ok, key=lambda x: x["mass_g"]) if ok else None

    lines = []
    A = lines.append
    A("Minimum-mass bracket under process rules (h = 2.5 mm mesh in the search; best of 3 seeds; units mm, g, MPa)")
    A(f"{'process':<14}{'w':>7}{'r':>7}{'b':>7}{'mass':>8}{'stress':>8}{'tip':>7} | {'free w':>7}{'r':>6}{'b':>6}{'mass':>8} | {'price x':>8} | seeds (mass)")
    summary = {}
    designs = {}
    for name in PROCESSES:
        m, f = best(R["main"][name]), best(R["free"][name])
        sm = ", ".join(f"{x['mass_g']:.2f}" if x["feasible"] else "inf" for x in R["main"][name])
        sf = ", ".join(f"{x['mass_g']:.2f}" if x["feasible"] else "inf" for x in R["free"][name])
        A(f"{name:<14}{m['w']:7.2f}{m['r']:7.2f}{m['b']:7.2f}{m['mass_g']:8.2f}{m['stress_mpa']:8.1f}{m['tip_mm']:7.2f} | "
          f"{f['w']:7.2f}{f['r']:6.2f}{f['b']:6.2f}{f['mass_g']:8.2f} | {m['mass_g'] / f['mass_g']:8.3f} | rules [{sm}] free [{sf}]")
        summary[name] = {"dfm": m, "free": f, "price": m["mass_g"] / f["mass_g"]}
        designs[name] = (m, f)
    A("")
    A("Fine-mesh recheck of the chosen designs (h = 0.7 mm): peak von Mises stress vs the working stress")
    A(f"{'case':<28}{'search h2.5':>12}{'fine h0.7':>11}{'allow':>8}{'over by':>9}")
    for name, (m, f) in designs.items():
        for tag, d, proc in (("rules", m, PROCESSES[name]), ("free", f, FREE[FREE_OF[name]])):
            p = Params(w=d["w"], r=d["r"], b=d["b"])
            s_fine, _ = fine(proc, p, 0.7)
            allow = proc.material.sigma_allow
            A(f"{name + ' (' + tag + ')':<28}{d['stress_mpa']:12.1f}{s_fine:11.1f}{allow:8.0f}{(s_fine / allow - 1) * 100:8.0f}%")
            d["stress_fine_mpa"] = s_fine
    for title, kind, label in (("CNC routing: smallest inner radius the tool leaves (tool radius, mm)", "cnc_radius", "tool radius"),
                               ("Casting: draft angle (deg)", "draft", "draft"),
                               ("Casting: max wall-thickness ratio (0 = rule off)", "ratio", "ratio")):
        A("")
        A(title)
        A(f"{label:>12}{'w':>7}{'r':>7}{'b':>7}{'mass':>8}")
        for k, lst in R[kind].items():
            x = best(lst)
            A(f"{float(k):12.3f}" + (f"{x['w']:7.2f}{x['r']:7.2f}{x['b']:7.2f}{x['mass_g']:8.2f}" if x else "   infeasible"))
    A("")
    A("FE evaluations per optimisation (mean over seeds): " + ", ".join(
        f"{n} {np.mean([x['n_fe'] for x in R['main'][n]]):.0f}" for n in PROCESSES))
    open(os.path.join(OUT, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump({"R": R, "summary": summary}, open(os.path.join(OUT, "results.json"), "w"), indent=1)
    print("\n".join(lines))

    # manufacturing files for the chosen designs
    for name, (m, _) in designs.items():
        p = Params(w=m["w"], r=m["r"], b=m["b"])
        poly = build_polygon(p, 48)
        slug = name.replace(" ", "_")
        if name == "FDM":
            write_extruded_stl(os.path.join(OUT, "bracket_fdm.stl"), build_polygon(p, 96), p.b, "bracket_fdm")
        else:
            write_dxf(os.path.join(OUT, f"profile_{slug}.dxf"), poly)
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 4, figsize=(13, 3.6))
    for a, (name, (m, f)) in zip(ax, designs.items()):
        for d, ls, lab in ((f, "--", "no process rules"), (m, "-", "process rules")):
            poly = build_polygon(Params(w=d["w"], r=d["r"], b=d["b"]), 48)
            a.plot(*np.vstack([poly, poly[:1]]).T, ls, label=f"{lab}: {d['mass_g']:.1f} g, b {d['b']:.1f}")
        a.set_aspect("equal"); a.set_title(name); a.legend(fontsize=6, loc="upper right")
    fig.tight_layout(); fig.savefig(os.path.join(OUT, "profiles.png"), dpi=130)


if __name__ == "__main__":
    main()
