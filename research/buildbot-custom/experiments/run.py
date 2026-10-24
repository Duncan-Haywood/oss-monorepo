"""Run: python experiments/run.py > experiments/results.txt  (stdlib only, deterministic, writes results.json)."""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
sys.path.insert(0, str(HERE.parents[1] / "buildbot-cost" / "src"))
from buildbot_custom import model as M  # noqa: E402
from buildbot_cost import model as C  # noqa: E402

HUMAN_S_PER_NAIL = 0.1 * 60      # buildbot-taskbook minutes per nail (the taskbook author's estimate, not a time study)


def main():
    nails = M.schedule()
    tasks = M.load_tasks()
    hrs = M.nailing_hours(tasks)
    res = {}
    print("62-nail schedule of one 4x8 sheet (buildbot-fasten layout); hand nailing at the taskbook's 0.1 min/nail = %.0f s a sheet\n" % (62 * HUMAN_S_PER_NAIL))

    print("A. machine time per sheet (s) = travel + 62 x fire time; stop-and-fire, serpentine order (best of rows/greedy), no scan or load")
    print("   fire time per nail: 0.125 s is the tool's 8 nails/s ceiling (Senco listing), longer values include settling")
    print("   %-12s %-8s | fire 0.125 s   0.3 s   0.6 s   1.0 s" % ("v (m/s)", "a (m/s2)"))
    res["cycle"] = []
    for v, a in ((0.5, 1.0), (1.0, 3.0), (2.0, 6.0), (3.0, 10.0), (5.0, 20.0)):
        row = []
        for tf in (0.125, 0.3, 0.6, 1.0):
            t = min(M.sheet_cycle(nails, v, a, tf, m)[0] for m in ("rows", "greedy"))
            row.append(t)
            res["cycle"].append({"v": v, "a": a, "t_fire": tf, "s": t})
        print("   %-12.1f %-8.1f | %s" % (v, a, "  ".join("%7.1f" % x for x in row)))
    base = min(M.sheet_cycle(nails, 1.0, 3.0, 0.5, m)[0] for m in ("rows", "greedy"))
    bm = min(("rows", "greedy"), key=lambda m: M.sheet_cycle(nails, 1.0, 3.0, 0.5, m)[0])
    trav = M.sheet_cycle(nails, 1.0, 3.0, 0.5, bm)
    print("   baseline design (1 m/s, 3 m/s2, 0.5 s a nail): %.1f s a sheet, of which travel %.1f s (%s order) and firing %.1f s" % (base, trav[1], bm, trav[2]))
    print("   -> %.1fx faster than hand nailing at the taskbook's minutes" % (62 * HUMAN_S_PER_NAIL / base))
    print("   travel is %.0f%% of the sheet time at the baseline; doubling axis speed and acceleration saves %.0f s, halving the fire time saves %.0f s"
          % (100 * trav[1] / base, base - min(M.sheet_cycle(nails, 2.0, 6.0, 0.5, m)[0] for m in ("rows", "greedy")),
             base - min(M.sheet_cycle(nails, 1.0, 3.0, 0.25, m)[0] for m in ("rows", "greedy"))))
    res["baseline_s"] = base

    print("\nB. what a sheet costs the line: nailing + scan to find studs + sheet loaded and squared (both swept; no source)")
    for scan, load in ((10, 30), (20, 60), (30, 120), (60, 180)):
        tot = base + scan + load
        print("   scan %3d s, load %3d s -> %.0f s a sheet (%.0f sheets/h); machine hours per house (78 sheets) %.1f"
              % (scan, load, tot, 3600 / tot, 78 * tot / 3600))
    mh = 78 * (base + 20 + 60) / 3600
    res["machine_hours_per_house"] = mh

    print("\nC. positioning budget (95%% of sheets with every nail inside its window): total tip scatter <= %.2f mm" % (M.required_sigma(nails) * 1000))
    sig = M.required_sigma(nails)
    res["sigma_mm"] = sig * 1000
    for axis in (0.05, 0.1, 0.25, 0.5, 1.0):
        rem = sig ** 2 - (axis / 1000) ** 2
        v = math.sqrt(rem) * 1000 if rem > 0 else float("nan")
        print("   axis repeatability %.2f mm (1 sigma) leaves a stud-finding (vision + frame) scatter of %s" % (axis, "%.2f mm" % v if rem > 0 else "none"))
    for s in (0.5, 1.0, 1.5, 2.0, 3.0):
        print("   total scatter %.1f mm -> %.1f%% of sheets all in window" % (s, 100 * M.sheet_success(nails, s / 1000)))

    print("\nD. what the gantry saves: hand nailing hours of the taskbook (A); wall sheathing S4 rescaled to 62 nails a sheet, roof deck R3 as booked")
    print("   wall %.2f h (%d sheets), roof %.2f h (%d sheets); roof counts only if roofs are sheathed as flat cassettes on the table" % (hrs["wall"], round(hrs["wall_sheets"]), hrs["roof"], round(hrs["roof_sheets"])))
    loaded = M.WAGE * 1.3
    print("   at the loaded hour $%.2f the wall nailing is worth $%.0f a house, wall + roof $%.0f" % (loaded, hrs["wall"] * loaded, (hrs["wall"] + hrs["roof"]) * loaded))
    res["hours"] = hrs
    print("\n   houses a year needed to break even (0 interest, 10 y, upkeep 5%, operator keeps 0.2 of the hours), by machine price")
    res["breakeven"] = {}
    for scope, h in (("wall", hrs["wall"]), ("wall+roof", hrs["wall"] + hrs["roof"])):
        row = []
        for price in (50e3, 100e3, 200e3, 400e3):
            b = M.breakeven_houses(price, 10, 0.0, 0.05, h, loaded, 0.2 * h)
            row.append(b)
            res["breakeven"]["%s@%d" % (scope, price)] = b
        print("   %-10s %s" % (scope, "   ".join("$%dk: %5.0f" % (p, b) for p, b in zip((50, 100, 200, 400), row))))
    print("   one machine nails ~%.0f houses a year at 2,000 machine-hours (%.1f h a house): volume, not capacity, is the limit" % (2000 / mh, mh))

    print("\nE. sweep (4000 draws, seed 1): price $40k-600k (log), life 7-20 y, interest 4-10%, upkeep 3-12%, wage $25-35, burden 1.0-1.6, operator keeps 0-50% of the hours")
    res["sweep"] = {}
    for scope, h in (("wall", hrs["wall"]), ("wall+roof", hrs["wall"] + hrs["roof"])):
        q = M.simulate(h)
        res["sweep"][scope] = q
        print("   %-10s houses a year to break even: 5%% %.0f, median %.0f, 95%% %.0f" % (scope, *q))

    print("\nF. the stock humanoids on the same wall-nailing hours (buildbot-cost model, 4000 draws; H1 passes the payload test for S4, G1 does not)")
    res["humanoid"] = {}
    for robot in ("H1", "G1"):
        s = C.simulate(hrs["wall"] if robot == "H1" else 0.0, robot)
        res["humanoid"][robot] = s
        print("   %s: eligible %.2f h, P(saves money) %.3f, median $%.0f a house, best draw $%.0f" % (robot, hrs["wall"] if robot == "H1" else 0.0, s["p_positive"], s["median"], s["max"]))
    print("   (the roof deck is out of reach of both robots, so the gantry is the only option for it)")
    Path(HERE / "results.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
