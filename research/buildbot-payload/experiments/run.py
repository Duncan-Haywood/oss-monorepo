"""Static two-handed payload envelopes of Unitree G1 and H1, and residential tasks against them.

Writes results.json and prints results.txt. Deterministic. About 5 minutes on one CPU.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from buildbot_payload import fetch, model as M  # noqa: E402

LB = 0.45359237
NIOSH_KG = 51 * LB  # load constant of the revised NIOSH lifting equation (Waters et al. 1993)
REACH = [0.2, 0.3, 0.4, 0.5, 0.6]
HEIGHT = {"g1": [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4], "h1": [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0]}
CASES = [("g1", "palm"), ("g1", "cradle"), ("h1", "palm")]

# (task, mass kg, hand height m, reach m, where the mass comes from)
TASKS = [
    ("carry an 8 ft 2x4 stud", 3.7, 0.6, 0.3, "1.5x3.5 in x 96 in at 28 lb/ft3 (house-framing's SPF density)"),
    ("carry an 8 ft 2x6", 5.8, 0.6, 0.3, "1.5x5.5 in x 96 in at 28 lb/ft3"),
    ("hold a framing nailer at stud height", 3.6, 1.0, 0.4, "about 8 lb, my assumption"),
    ("carry a 4x8 OSB sheet alone", 20.3, 0.6, 0.3, "7/16 in OSB at 1.4 lb/ft2 (house-panellift)"),
    ("carry one end of a 4x8 OSB sheet with a person", 10.2, 0.6, 0.3, "half the sheet"),
    ("set a concrete block on the 3rd course", 15.9, 0.6, 0.4, "8x8x16 in CMU about 35 lb, my assumption"),
    ("lift a 60 lb bag of concrete mix", 27.2, 0.4, 0.3, "labelled bag mass"),
    ("hold one end of a 1/2 in drywall sheet at wall mid-height with a person", 11.6, 1.2, 0.3,
     "4x8 sheet about 1.6 lb/ft2 (51 lb), my assumption; half of it"),
    ("hold a drywall sheet up to an 8 ft ceiling with a person", 11.6, 2.3, 0.2, "as above; hands near 2.3 m"),
]


def envelope(robot, d0, grip):
    rows = []
    for z in HEIGHT[robot.name]:
        for x in REACH:
            kg, worst = M.max_payload(robot, d0, (x, z), grip)
            rows.append({"z": z, "x": x, "kg": kg, "limit": worst})
    return rows


def main():
    for n in fetch.ROBOTS:
        fetch.model_path(n)
    robots = {n: M.load(n) for n in fetch.ROBOTS}
    d0 = {n: M.standing(r) for n, r in robots.items()}
    out = {"menagerie_commit": fetch.COMMIT, "mass_kg": {n: float(r.model.body_subtreemass[1]) for n, r in robots.items()},
           "envelope": {}, "tasks": []}
    print("buildbot-payload: static two-handed payload, whole body, feet fixed, CoM balanced, peak joint torque limits")
    print(f"Menagerie {fetch.COMMIT[:12]}; robot mass g1 {out['mass_kg']['g1']:.1f} kg, h1 {out['mass_kg']['h1']:.1f} kg")
    print()
    for n, grip in CASES:
        rows = envelope(robots[n], d0[n], grip)
        out["envelope"][f"{n}-{grip}"] = rows
        print(f"A. {n} {grip}: max load (kg) by hand height (rows, m) and reach forward of the feet (cols, m); '-' unreachable")
        print("   z \\ x " + "".join(f"{x:>8.1f}" for x in REACH))
        for z in HEIGHT[n]:
            cells = [r for r in rows if r["z"] == z]
            print(f"   {z:>5.1f} " + "".join(f"{'-' if r['kg'] is None else format(r['kg'], '.1f'):>8}" for r in cells))
        lim = {}
        for r in rows:
            if r["kg"] is not None:
                lim[r["limit"]] = lim.get(r["limit"], 0) + 1
        print("   binding joint (cells): " + ", ".join(f"{k} {v}" for k, v in sorted(lim.items(), key=lambda t: -t[1])))
        reach = [r["kg"] for r in rows if r["kg"] is not None]
        print(f"   reachable cells {len(reach)}/{len(rows)}; median {sorted(reach)[len(reach) // 2]:.1f} kg, "
              f"min {min(reach):.1f}, max {max(reach):.1f}")
        print()
    print(f"B. Tasks (robot carries the stated mass; human reference: NIOSH load constant {NIOSH_KG:.1f} kg)")
    for task, kg, z, x, src in TASKS:
        row = {"task": task, "kg": kg, "z": z, "x": x, "source": src}
        cells = []
        for n, grip in CASES:
            cap, worst = M.max_payload(robots[n], d0[n], (x, z), grip)
            verdict = "out of reach" if cap is None else ("yes" if cap >= kg else "no")
            row[f"{n}-{grip}"] = {"cap": cap, "limit": worst, "verdict": verdict}
            cells.append(f"{n}-{grip} {verdict} ({'-' if cap is None else format(cap, '.1f')} kg, {worst})")
        out["tasks"].append(row)
        print(f"   {task}: {kg} kg at z {z} m, x {x} m [{src}]")
        print("      " + "; ".join(cells))
    Path(__file__).with_name("results.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
