"""Order timing against build time, interest and the cost of holding material. Deterministic."""
import statistics as st
import sys
from dataclasses import replace
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src"), str(HERE.parent.parent / "house-schedule" / "src")]
from house_schedule import Params  # noqa: E402
from house_orderlead import Carry, plan_begins, run_many_ordered  # noqa: E402

N = 3000
P = Params()
PLAN = plan_begins(P)
KS = (0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 20.0)


def row(label, T, I, C, base=None):
    tot = st.mean(I) + st.mean(C)
    d = "" if base is None else f"{st.mean(T) - base:+7.1f}"
    print(f"{label:34s} {st.mean(T):7.1f} {d:>7s} {st.mean(I):9.2f} {st.mean(C):9.3f} {tot:9.3f}")
    return tot


def table(carry, title):
    print(f"\n{title}")
    print(f"{'policy':34s} {'days':>7s} {'vs rule':>7s} {'interest':>9s} {'carrying':>9s} {'total':>9s}   (% of price)")
    T, I, C = run_many_ordered(P, N, baseline=True, carry=carry)
    b = st.mean(T)
    best = {"baseline rule (task before starts)": row("baseline rule (task before starts)", T, I, C)}
    for k in KS:
        T, I, C = run_many_ordered(P, N, k=k, plan=PLAN, carry=carry)
        lab = f"order {k:g} lead times before plan" + (" (~day 0)" if k == 20 else "")
        best[k] = row(lab, T, I, C, b)
    k = min((x for x in best if not isinstance(x, str)), key=best.get)
    print(f"  cheapest total: k = {k:g}")
    return k


def main():
    print(f"N = {N} builds per row, common random numbers; plan = mean start in 400 other baseline builds")
    table(Carry(), "A. default carrying costs (deposit 20%, storage 12%/yr, damage 20%/yr, rate 8%)")
    table(Carry(storage_rate=0.0, damage_rate=0.0, deposit=0.0), "B. free to hold (house-schedule's assumption)")
    table(Carry(storage_rate=0.5, damage_rate=1.0, deposit=0.5), "C. expensive to hold (storage 50%/yr, damage 100%/yr, deposit 50%)")
    print("\nD. cheapest k as holding cost scales (storage+damage per year, deposit 20%)")
    for h in (0.0, 0.32, 1.0, 2.0, 4.0, 8.0):
        best = None
        for k in KS:
            T, I, C = run_many_ordered(P, 1500, k=k, plan=PLAN, carry=Carry(storage_rate=h / 2, damage_rate=h / 2))
            tot = st.mean(I) + st.mean(C)
            if best is None or tot < best[1]:
                best = (k, tot, st.mean(T))
        print(f"  holding {h*100:4.0f}%/yr: cheapest k = {best[0]:g}  total {best[1]:.3f}% of price  days {best[2]:.1f}")


main()
