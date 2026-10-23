"""Time-step check: the same schedules at 3600, 900 and 300 s, and the supply-demand gap.   PYTHONPATH=src python experiments/step_check.py > experiments/results_step.txt"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from infra_pumpsched.sched import cost, simulate, tariff, total_kwh  # noqa: E402

WINDOWS = (("shipped", (1, 14)), ("flat-best", (1, 21)), ("evening x3 best", (21, 21)), ("a wrapped window", (21, 19)), ("a short window", (6, 8)))


def main():
    pr = tariff("evening", 3)
    print("window | step s | kWh | pump 335 kWh | cost (evening x3) | supply - demand m3 | tank drift m3 | min tank margin m")
    for lab, w in WINDOWS:
        for st in (3600, 900, 300):
            r = simulate(*w, step=st)
            print(f"{lab} {w[0]:02d}:00 {w[1]} h | {st} | {total_kwh(r):,.0f} | {r['kwh']['335'].sum():,.0f} | {cost(r, pr):,.0f} | "
                  f"{r['supply_m3'] - r['demand_m3']:.0f} | {r['drift_m3']:.0f} | {r['tank_min_margin']:.2f}")


if __name__ == "__main__":
    main()
