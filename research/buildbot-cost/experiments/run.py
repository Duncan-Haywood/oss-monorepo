"""Run: python experiments/run.py > experiments/results.txt  (stdlib only, deterministic, writes results.json)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from buildbot_cost import model as M  # noqa: E402

HERE = Path(__file__).resolve().parent


def main():
    tasks = M.load_tasks()
    res = {}
    print("inputs: carpenter median wage $%.2f/h (BLS OOH, May 2025); G1 $%d, H1 $%d (launch prices, press); NAHB 2024 price $%d, construction $%d"
          % (M.WAGE_CARPENTER, M.PRICE_USD["G1"], M.PRICE_USD["H1"], M.NAHB_PRICE, M.NAHB_CONSTRUCTION))
    print("sweep (4000 draws, seed 1): wage $25-35, burden x1.0-1.6, slowdown 1-10 (log), supervision 0.1-1.0 person-h per robot-h,"
          " success 0.3-1.0, price x1-2, life 2000-10000 h (log), upkeep 5-20%/yr, use 500-2000 h/yr (log)\n")

    print("A. break-even slowdown s* = loaded wage / (rate + supervision x loaded wage); robot-hours per replaced crew-hour")
    print("   (median wage $29.12, burden 1.3, life 6000 h, upkeep 10%/yr, use 1000 h/yr, price x1)")
    w = M.WAGE_CARPENTER * 1.3
    res["breakeven"] = {}
    for robot in ("G1", "H1"):
        rate = M.robot_rate(M.PRICE_USD[robot], 6000, 0.10, 1000)
        row = {f: M.breakeven_slowdown(w, rate, f) for f in (0.0, 0.1, 0.3, 0.5, 1.0)}
        res["breakeven"][robot] = {"rate": rate, **{str(k): v for k, v in row.items()}}
        print("   %s ownership $%.1f/h; s* at supervision 0 / 0.1 / 0.3 / 0.5 / 1.0 = %s" % (robot, rate, " / ".join("%.2f" % v for v in row.values())))

    print("\nB. the ceiling: a free, instant, unsupervised robot (s=0, rate=0) takes every payload-passing hour")
    kC = M.cost_implied_framing_hours(w) / sum(t["crew_hours_mid_A"] for t in tasks if t["trade"] in ("framing", "sheathing", "roof"))
    scen = {"A": 1.0, "B": 1.0, "C": kC}
    print("   cost-implied framing labour of the average NAHB house: %.0f h (at loaded wage $%.2f); taskbook framing+sheathing+roof (A): %.1f h; scale k = %.1f for scenario C"
          % (M.cost_implied_framing_hours(w), w, sum(t["crew_hours_mid_A"] for t in tasks if t["trade"] in ("framing", "sheathing", "roof")), kC))
    res["kC"] = kC
    res["ceiling"] = {}
    for sc in ("A", "B", "C"):
        base = "B" if sc == "B" else "A"
        for robot in ("G1", "H1"):
            h = M.eligible_hours(tasks, robot, base) * scen[sc]
            res["ceiling"][sc + robot] = {"hours": h, "usd": h * w, "share": M.share_of_price(h * w)}
            print("   scenario %s %s: %.1f eligible crew-h of %.1f -> $%.0f = %.2f%% of the $%d average price"
                  % (sc, robot, h, M.total_hours(tasks, base) * scen[sc], h * w, 100 * M.share_of_price(h * w), M.NAHB_PRICE))

    print("\nC. net saving per house over the sweep (dollars; P(>0) = share of draws that save money)")
    res["sim"] = {}
    for sc in ("A", "B", "C"):
        base = "B" if sc == "B" else "A"
        for robot in ("G1", "H1"):
            h = M.eligible_hours(tasks, robot, base) * scen[sc]
            r = M.simulate(h, robot)
            res["sim"][sc + robot] = r
            print("   scenario %s %s: P(>0) %.3f; 5%% %.0f, median %.0f, 95%% %.0f, best draw %.0f  (best = %.2f%% of price)"
                  % (sc, robot, r["p_positive"], r["p5"], r["median"], r["p95"], r["max"], 100 * M.share_of_price(r["max"])))

    print("\nD. per 1,000 payload-passing crew-hours replaced: ceiling vs a plausible robot (s=3, supervision 0.3, success 1)")
    res["per1000"] = {}
    for robot in ("G1", "H1"):
        rate = M.robot_rate(M.PRICE_USD[robot], 6000, 0.10, 1000)
        n = M.net_per_replaced_hour(w, rate, 3.0, 0.3) * 1000
        res["per1000"][robot] = n
        print("   %s: ceiling $%.0f (%.1f%% of price); at s=3, f=0.3: $%.0f" % (robot, w * 1000, 100 * M.share_of_price(w * 1000), n))
    (HERE / "results.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
