"""Milestone 6zzo post hoc (written after run_summer_tilt.py had run; no predictions): which direction of lag 3's
per-cell summer level error carries the level repair?

The pre-registered run found that setting lag 3's local-summer level to OC's in every (point, half, shape) cell
recovers 0.54 of the summer repair (R3_L 49 of 168), while tilt and curvature together recover 0.03 (R3_TK 4).
6zzn's uniform shifts move every cell's summer the same way; lag 3's per-cell level errors against OC run about
+/-3% with both signs (mean +0.0035), so a uniform shift cannot repair them. This splits R3_L by sign:
  R3_Ldn  repair the level only where lag 3's summer is brighter than OC's (L3 > L_OC: the repair darkens it).
  R3_Lup  repair the level only where lag 3's summer is darker than OC's (the repair brightens it).
  R3_LupTK  R3_Lup plus OC's tilt and curvature everywhere.
Same cells and scoring as run_summer_tilt.py.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_summer_tilt_posthoc.py > experiments/results_summer_tilt_posthoc.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_learned_season as ls  # noqa: E402
import run_summer_shift as ss  # noqa: E402
import run_summer_tilt as tl  # noqa: E402

RULES = ("AT_90", "LC_3", "R3_S", "R3_L", "R3_Ldn", "R3_Lup", "R3_LupTK")
_base = tl.corrections


def corrections(p, hn, shape):
    c = _base(p, hn, shape)
    c3, oc = c["LC_3"], c["OC"]
    ms = tl.summer_order(p)
    bright = tl.components(c3, ms)[0] > tl.components(oc, ms)[0]
    c["R3_Ldn"] = c["R3_L"] if bright else c3
    c["R3_Lup"] = c3 if bright else c["R3_L"]
    c["R3_LupTK"] = tl.mix(c["R3_Lup"], oc, ms, "TK")
    return {g: c[g] for g in RULES if g != "AT_90"}


tl.corrections = corrections
tl.RULES = RULES


def main():
    ss.RULES = RULES
    hi = ls.high_amp_points()
    cells = tl.evaluate(hi)
    t168 = ss.pooled(cells, hi, ss.SHAPES)
    pp = ss.per_point(cells, hi)
    n_bright = sum(tl.components(c := tl.ly.learned(p, tl.su.years_of(hn, (3,)), sh)[0], tl.summer_order(p))[0]
                   > tl.components(tl.ly.learned(p, tl.HALVES[hn], sh)[0], tl.summer_order(p))[0]
                   for p in hi for hn in tl.HALVES for sh in ss.SHAPES)
    print("Milestone 6zzo post hoc: lag 3's summer level repaired by sign of its error, high-amplitude points "
          "(no predictions)")
    print(f"(point, half, shape) cells where lag 3's summer level is brighter than OC's: {n_bright} of "
          f"{len(hi) * 2 * len(ss.SHAPES)}")
    print(f"  {'rule':10s}  hi168  pp72   km-only  dark-only  both")
    for g in RULES:
        k, dk, b = ss.failure_modes(cells, hi, g)
        print(f"  {g:10s}  {t168[g]:5d}  {pp[g]:4d}   {k:7d}  {dk:9d}  {b:4d}")


if __name__ == "__main__":
    main()
