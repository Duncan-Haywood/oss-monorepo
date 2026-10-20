"""Start month against build time and interest, two assumed climates, with and without early ordering."""
import statistics as st
import sys
from dataclasses import replace
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src"), str(HERE.parent.parent / "house-schedule" / "src")]
from house_schedule import Params, run_many  # noqa: E402
from house_season import CLIMATES, MONTHS, run_many_seasonal  # noqa: E402

N = 3000
B = Params()
E = replace(B, order_early=True)


def main():
    print(f"N = {N} builds per cell, common random numbers; working days; start on the 1st of the month")
    fT, fI = run_many(B, N)
    print(f"house-schedule flat 15% weather, baseline: mean {st.mean(fT):.1f} d, interest {st.mean(fI):.2f}% of price")
    eT, _ = run_many(E, N)
    print(f"house-schedule flat 15% weather, order at day 0: mean {st.mean(eT):.1f} d\n")
    for cname in ("cold", "mild"):
        c = CLIMATES[cname]
        print(f"climate: {c.name}; mean exterior loss {st.mean(c.loss):.3f}")
        print(f"{'start':5s} {'baseline d':>11s} {'p90':>6s} {'interest %':>11s} {'d vs flat':>10s} {'early d':>8s} {'early gain':>11s}")
        rows = []
        for m in range(12):
            T, I = run_many_seasonal(B, m, c, N)
            Te, _ = run_many_seasonal(E, m, c, N)
            rows.append((m, st.mean(T), st.mean(Te)))
            p90 = sorted(T)[int(0.9 * (N - 1))]
            print(f"{MONTHS[m]:5s} {st.mean(T):11.1f} {p90:6.1f} {st.mean(I):11.2f} {st.mean(T) - st.mean(fT):+10.1f} "
                  f"{st.mean(Te):8.1f} {st.mean(T) - st.mean(Te):11.1f}")
        best = min(rows, key=lambda r: r[1]); worst = max(rows, key=lambda r: r[1])
        bestE = min(rows, key=lambda r: r[2]); worstE = max(rows, key=lambda r: r[2])
        print(f"best start {MONTHS[best[0]]} {best[1]:.1f} d, worst {MONTHS[worst[0]]} {worst[1]:.1f} d, swing {worst[1] - best[1]:.1f} d")
        print(f"with early ordering: best {MONTHS[bestE[0]]} {bestE[2]:.1f} d, worst {MONTHS[worstE[0]]} {worstE[2]:.1f} d, swing {worstE[2] - bestE[2]:.1f} d\n")


main()
