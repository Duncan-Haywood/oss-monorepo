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

# (task, (low, high) mass kg, hand height m, reach m, source). A task with a range passes only if the
# robot holds the high end, fails if it cannot hold the low end, and "depends" in between.
# Lumber: NDS specific gravity 0.42 for SPF (oven-dry basis) at 15% moisture, through the Wood
# Handbook (FPL-GTR-282) relation G_m = G0 / (1 + 0.265 a G0), a = (30 - MC) / 30, gives 28.5 lb/ft3.
SPF_PCF = 0.42 / (1 + 0.265 * 0.5 * 0.42) * 62.4 * 1.15
STUD_KG = 1.5 * 3.5 * 96 / 1728 * SPF_PCF * LB
TWO_BY_SIX_KG = 1.5 * 5.5 * 96 / 1728 * SPF_PCF * LB
OSB_KG = (1.4 * 32 * LB, 1.6 * 32 * LB)      # 45-51 lb a 4x8 sheet of 7/16 in OSB (retail listings; no mill data)
DRYWALL_KG = 1.6 * 32 * LB                    # 1/2 in regular gypsum board, 1.6 lb/ft2 (USG product comparison)
TASKS = [
    ("carry an 8 ft 2x4 stud", (STUD_KG, STUD_KG), 0.6, 0.3, "SPF at 28.5 lb/ft3 from NDS G = 0.42"),
    ("carry an 8 ft 2x6", (TWO_BY_SIX_KG, TWO_BY_SIX_KG), 0.6, 0.3, "as above"),
    ("hold a framing nailer at stud height", (7.5 * LB, 7.5 * LB), 1.0, 0.4, "Metabo HPT NR90AES1, 7.5 lb (maker's listing)"),
    ("carry a 4x8 OSB sheet alone", OSB_KG, 0.6, 0.3, "7/16 in OSB, 1.4-1.6 lb/ft2"),
    ("carry one end of a 4x8 OSB sheet with a person", tuple(k / 2 for k in OSB_KG), 0.6, 0.3, "half the sheet"),
    ("set a lightweight concrete block on the 3rd course", (26 * LB, 26 * LB), 0.6, 0.4,
     "8x8x16 in lightweight CMU, average 26 lb (TMS journal survey)"),
    ("set a normal-weight concrete block on the 3rd course", (37 * LB, 37 * LB), 0.6, 0.4,
     "8x8x16 in normal-weight CMU, average 37 lb (same survey)"),
    ("lift a 60 lb bag of concrete mix", (60 * LB, 60 * LB), 0.4, 0.3, "labelled bag mass"),
    ("hold one end of a 1/2 in drywall sheet at wall mid-height with a person", (DRYWALL_KG / 2, DRYWALL_KG / 2), 1.2, 0.3,
     "4x8 sheet at 1.6 lb/ft2 (51 lb); half of it"),
    ("hold a drywall sheet up to an 8 ft ceiling with a person", (DRYWALL_KG / 2, DRYWALL_KG / 2), 2.3, 0.2,
     "as above; hands near 2.3 m"),
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
    for task, (lo, hi), z, x, src in TASKS:
        row = {"task": task, "kg": [round(lo, 2), round(hi, 2)], "z": z, "x": x, "source": src}
        cells = []
        for n, grip in CASES:
            cap, worst = M.max_payload(robots[n], d0[n], (x, z), grip)
            verdict = ("out of reach" if cap is None else "yes" if cap >= hi
                       else "no" if cap < lo else "depends")
            row[f"{n}-{grip}"] = {"cap": cap, "limit": worst, "verdict": verdict}
            cells.append(f"{n}-{grip} {verdict} ({'-' if cap is None else format(cap, '.1f')} kg, {worst})")
        out["tasks"].append(row)
        kg = f"{lo:.1f}" if hi - lo < 0.05 else f"{lo:.1f}-{hi:.1f}"
        print(f"   {task}: {kg} kg at z {z} m, x {x} m [{src}]")
        print("      " + "; ".join(cells))
    Path(__file__).with_name("results.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
