"""Run: python experiments/run.py > experiments/results.txt  (stdlib only, deterministic, writes results.json)."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from buildbot_grounded import model as M  # noqa: E402

C = M.C
WAGE = C.WAGE_CARPENTER * 1.3


def main():
    carry, fasten, tasks = M.load(M.CARRY), M.load(M.FASTEN), C.load_tasks()
    by = {t["id"]: t for t in tasks}
    res = {}
    print("loaded wage $%.2f/h (BLS median $%.2f x 1.3); ownership at launch price, life 6000 h, upkeep 10%%/yr, use 1000 h/yr\n" % (WAGE, C.WAGE_CARPENTER))

    print("A. simulated carry slowdown (robot-h per labourer-h), buildbot-carry grid: step time 0.4-0.8 s, haul 5/15/30 m, handling 10/20/40 s,")
    print("   labourer walking 1.1 m/s carrying one stud or a bundle of four. Break-even s* at supervision 0.1 / 0.3 / 0.5.")
    res["carry"] = {}
    for robot in ("H1", "G1"):
        sd = M.carry_slowdowns(carry, robot.lower())
        rate = C.robot_rate(C.PRICE_USD[robot], 6000, 0.10, 1000)
        sstar = {f: C.breakeven_slowdown(WAGE, rate, f) for f in (0.1, 0.3, 0.5)}
        res["carry"][robot] = {"s_star": {str(k): v for k, v in sstar.items()}}
        print("  %s ownership $%.1f/h; s* = %s" % (robot, rate, " / ".join("%.2f" % v for v in sstar.values())))
        for b, name in (("1", "vs a one-stud labourer"), ("4", "vs a four-stud labourer")):
            xs = sd[b]
            if not xs:
                print("    %s: no carrying cell" % name)
                continue
            win = {f: sum(x < s for x in xs) / len(xs) for f, s in sstar.items()}
            res["carry"][robot][b] = {"n": len(xs), "min": xs[0], "median": M.quantile(xs, .5), "max": xs[-1],
                                       "share_below_sstar": {str(k): v for k, v in win.items()}}
            print("    %s: %d cells, slowdown min %.2f, median %.2f, max %.2f; share of cells below s* = %s"
                  % (name, len(xs), xs[0], M.quantile(xs, .5), xs[-1], " / ".join("%.0f%%" % (100 * v) for v in win.values())))
    print("  The taskbook's carry rate (F2, %.1f min a piece) is %.1f pieces/min: between the one-stud (0.5-3.5/min) and bundle (2-14/min) labourer rates."
          % (by["F2"]["minutes_per_unit_mid"], 1 / by["F2"]["minutes_per_unit_mid"]))
    print("  Taskbook mass: mean piece %.2f kg. The carry model's G1 limit is 3.8 kg (one stud) and 0 pieces at two studs: the G1 cannot take F2 as booked.\n" % by["F2"]["mass_kg_low"])

    print("B. nails of a 62-nail sheet reachable from one stance (buildbot-fasten coverage), push needed 20 / 100 N, mu 0.6")
    res["nails"] = {}
    for robot in ("G1", "H1"):
        a, b = M.nail_share(fasten, robot, need="20"), M.nail_share(fasten, robot, need="100")
        res["nails"][robot] = {"need20": a, "need100": b}
        print("  %s: %.0f%% (%d of %d) / %.0f%%" % (robot, 100 * a, round(a * fasten["nails"]), fasten["nails"], 100 * b))
    print()

    print("C. what the simulation rules in, per house on the taskbook's hours (scenario A, supervision 0.3, wage $%.2f)" % WAGE)
    print("   rows: task, crew-hours, robot, share of the hours the robot can reach, slowdown at which the task breaks even")
    res["tasks"] = []
    rows = [("F2", "H1", 1.0), ("F5", "H1", res["nails"]["H1"]["need20"]), ("F5", "G1", res["nails"]["G1"]["need20"]),
            ("S4", "H1", res["nails"]["H1"]["need20"]), ("S4", "G1", res["nails"]["G1"]["need20"])]
    for tid, robot, share in rows:
        t = by[tid]
        rate = C.robot_rate(C.PRICE_USD[robot], 6000, 0.10, 1000)
        sstar = C.breakeven_slowdown(WAGE, rate, 0.3)
        ceil = t["crew_hours_mid_A"] * share * WAGE
        # the best saving that a slowdown of 1 (a human-speed robot) gives, and what a slowdown of 3 gives
        at1 = M.net_per_house(t["crew_hours_mid_A"], share, 1.0, WAGE, rate, 0.3)
        at3 = M.net_per_house(t["crew_hours_mid_A"], share, 3.0, WAGE, rate, 0.3)
        res["tasks"].append({"id": tid, "robot": robot, "hours": t["crew_hours_mid_A"], "share": share, "s_star": sstar,
                             "ceiling_usd": ceil, "at_s1": at1, "at_s3": at3})
        print("  %s %-8s %-3s %5.2f h, reachable %3.0f%%: s* %.2f; ceiling $%.0f (%.3f%% of price); at s=1 $%.0f, at s=3 $%.0f"
              % (tid, t["verb"], robot, t["crew_hours_mid_A"], 100 * share, sstar, ceil, 100 * C.share_of_price(ceil), at1, at3))
    (HERE / "results.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
