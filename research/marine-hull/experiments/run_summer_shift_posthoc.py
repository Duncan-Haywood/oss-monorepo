"""Milestone 6zzn post hoc (written after run_summer_shift.py had run; no predictions): how far must lag 3's local
summer be brightened before it matches the best year, and does brightening the whole year do the same?

The pre-registered run found the opposite of the reading under test: brightening a learned summer raises km in
every series and lag 3 gains as it brightens (+3%: 32 of 168). This extends lag 3's summer shift to +4 .. +10% and
adds the same shifts applied to all twelve months, same cells and scoring as run_summer_shift.py.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_summer_shift_posthoc.py > experiments/results_summer_shift_posthoc.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_learned_season as ls  # noqa: E402
import run_summer_shift as ss  # noqa: E402

DP = (3.0, 4.0, 5.0, 6.0, 8.0, 10.0)
ss.SPEC = [(3, "summer", d) for d in DP] + [(3, "year", d) for d in DP] + [(2, "year", d) for d in (-3.0, 3.0)]
ss.RULES = ("AT_90",) + tuple(ss.name(*s) for s in ss.SPEC)
_months = ss.dg.season_months
ss.dg.season_months = lambda p, s: tuple(range(1, 13)) if s == "year" else _months(p, s)


def main():
    hi = ls.high_amp_points()
    cells = ss.evaluate(hi)
    t168 = ss.pooled(cells, hi, ss.SHAPES)
    pp = ss.per_point(cells, hi)
    print("Milestone 6zzn post hoc: larger brightening of lag 3, local summer (s) and whole year (y), "
          "high-amplitude points (no predictions)")
    print(f"  {'rule':10s}  hi168  pp72   km-only  dark-only  both")
    for g in ss.RULES:
        k, dk, b = ss.failure_modes(cells, hi, g)
        print(f"  {g:10s}  {t168[g]:5d}  {pp[g]:4d}   {k:7d}  {dk:9d}  {b:4d}")


if __name__ == "__main__":
    main()
