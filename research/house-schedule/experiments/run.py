"""Levers against a baseline build, same random numbers for every scenario."""
import statistics as st
import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from house_schedule import Params, critical_path, run_many  # noqa: E402

N = 4000
B = Params()
SCEN = [
    ("baseline", B),
    ("fewer handoffs (gap 2.0 -> 0.5 d)", replace(B, gap_mean=0.5)),
    ("faster inspections (wait 3 -> 1 d, fail 15 -> 5%)", replace(B, insp_wait=1.0, insp_fail=0.05)),
    ("rough-in trades in parallel", replace(B, parallel_rough=True)),
    ("order all materials at day 0", replace(B, order_early=True)),
    ("factory shell (wall+roof panels)", replace(B, prefab_shell=True)),
    ("factory shell, ordered at day 0", replace(B, prefab_shell=True, order_early=True)),
    ("all of the above", replace(B, gap_mean=0.5, insp_wait=1.0, insp_fail=0.05,
                                 parallel_rough=True, order_early=True, prefab_shell=True)),
]


def q(xs, f):
    xs = sorted(xs)
    return xs[int(f * (len(xs) - 1))]


def main():
    print(f"N = {N} builds per scenario, common random numbers; working days (260 per year)")
    print(f"zero-noise critical path, baseline: {critical_path(B):.1f} d\n")
    base_T, base_I = run_many(B, N)
    mb, ib = st.mean(base_T), st.mean(base_I)
    print(f"{'scenario':52s} {'mean':>6s} {'p10':>6s} {'p90':>6s} {'d mean':>7s} {'interest %price':>16s} {'saved':>6s}")
    for name, p in SCEN:
        T, I = run_many(p, N)
        diffs = [a - b for a, b in zip(base_T, T)]
        se = st.stdev(diffs) / len(diffs) ** 0.5 if name != "baseline" else 0
        print(f"{name:52s} {st.mean(T):6.1f} {q(T, .1):6.1f} {q(T, .9):6.1f} "
              f"{st.mean(T) - mb:+7.1f} {st.mean(I):16.2f} {ib - st.mean(I):6.2f}   (se of d {se:.2f})")
    print("\nWeather sensitivity (baseline vs factory shell), mean days")
    for w in (0.0, 0.15, 0.30):
        a = st.mean(run_many(replace(B, weather_loss=w), N)[0])
        b = st.mean(run_many(replace(B, weather_loss=w, prefab_shell=True, order_early=True), N)[0])
        print(f"  weather_loss {w:.2f}: site-built {a:6.1f}  shell {b:6.1f}  shell saves {a - b:5.1f}")
    print("\nInterest rate sensitivity of the all-levers saving, % of price")
    for r in (0.04, 0.08, 0.12):
        a = st.mean(run_many(replace(B, rate=r), N)[1])
        b = st.mean(run_many(replace(SCEN[-1][1], rate=r), N)[1])
        print(f"  rate {r:.2f}: baseline {a:5.2f}  all levers {b:5.2f}  saved {a - b:5.2f}")


main()
