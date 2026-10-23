"""Run: python experiments/run.py > experiments/results.txt  (stdlib only, deterministic, writes results.json)."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
sys.path.insert(0, str(HERE.parents[1] / "buildbot-cost" / "src"))
from buildbot_shift import model as S  # noqa: E402
from buildbot_cost import model as C  # noqa: E402

DAYS = 250   # working days a year (assumed: 5 days x 50 weeks)


def main():
    res = {}
    run_h = S.PACK_WH * 0.9 / S.implied_power_w()
    ch_h = S.PACK_WH * 0.9 / (S.CHARGER_W * 0.9)
    print("inputs: pack %.1f Wh (9000 mAh x 46.8 V), charger %.0f W (54 V x 5 A), vendor runtime 2 h -> %.0f W average draw; usable 90%%, charger efficiency 90%%, swap 5 min"
          % (S.PACK_WH, S.CHARGER_W, S.implied_power_w()))
    print("   -> run %.2f h per pack, recharge %.2f h per pack on one charger\n" % (run_h, ch_h))

    print("A. hours worked in an 8 h shift, packs x chargers (draw %.0f W)" % S.implied_power_w())
    res["A"] = {}
    for k in (1, 2, 3, 4):
        row = [S.worked_hours(8.0, k, c) for c in (1, 2)]
        res["A"][k] = row
        print("   %d pack(s): 1 charger %.2f h, 2 chargers %.2f h" % (k, *row))

    print("\nB. sensitivity, 8 h shift, 2 packs, 1 charger: hours worked by average draw (W) and swap time (min)")
    res["B"] = {}
    print("   draw W  " + "  ".join("swap %2d" % s for s in (2, 5, 10)))
    for p in (150, 210.6, 300, 400):
        row = [S.worked_hours(8.0, 2, 1, power_w=p, swap_min=s) for s in (2, 5, 10)]
        res["B"][str(p)] = row
        print("   %6.1f  " % p + "  ".join("%7.2f" % v for v in row))
    print("   packs needed for >= 7.0 h worked, by draw (1 charger, swap 5 min):")
    res["B_packs"] = {}
    for p in (150, 210.6, 300, 400):
        need = next((k for k in range(1, 9) if S.worked_hours(8.0, k, 1, power_w=p) >= 7.0), None)
        need2 = next((k for k in range(1, 9) if S.worked_hours(8.0, k, 2, power_w=p) >= 7.0), None)
        res["B_packs"][str(p)] = [need, need2]
        print("   %6.1f W: %s pack(s) with 1 charger, %s with 2" % (p, need, need2))

    print("\nC. what it does to buildbot-cost's G1 break-even slowdown (wage $%.2f x 1.3, supervision 0.3, life 6,000 h, upkeep 10%%/yr, price $%d)"
          % (C.WAGE_CARPENTER, C.PRICE_USD["G1"]))
    w = C.WAGE_CARPENTER * 1.3
    base = C.robot_rate(C.PRICE_USD["G1"], 6000, 0.10, 1000)
    res["C"] = {"base_rate": base, "base_breakeven": C.breakeven_slowdown(w, base, 0.3)}
    print("   buildbot-cost default (1,000 h/yr, no battery cost): rate $%.2f/h, break-even %.2f" % (base, res["C"]["base_breakeven"]))
    print("   packs  chargers  worked h/shift  h/yr  rate $/h (pack wear at 300 / 1000 cycles)  break-even slowdown (300 / 1000)")
    res["C"]["rows"] = []
    for k, c in ((1, 1), (2, 1), (3, 1), (3, 2)):
        wk = S.worked_hours(8.0, k, c)
        yr = wk * DAYS
        base_r = C.robot_rate(C.PRICE_USD["G1"], 6000, 0.10, yr)
        rates, bes = [], []
        for cyc in (300, 1000):
            # pack wear plus the capital of the extra packs spread over the same working hours
            r = base_r + S.pack_rate(S.PACK_USD, cyc, run_h) + (k - 1) * S.PACK_USD / 6000
            rates.append(r)
            bes.append(C.breakeven_slowdown(w, r, 0.3))
        res["C"]["rows"].append({"packs": k, "chargers": c, "worked": wk, "per_year": yr, "rates": rates, "breakeven": bes})
        print("   %d      %d         %.2f            %4.0f  %.2f / %.2f                                  %.2f / %.2f"
              % (k, c, wk, yr, rates[0], rates[1], bes[0], bes[1]))
    (HERE / "results.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
